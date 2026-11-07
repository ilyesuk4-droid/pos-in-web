import { useEffect, useRef, useState, useCallback } from "react";
import { Camera, FlipHorizontal, Flashlight, AlertCircle, X, ShieldAlert, Sparkles } from "lucide-react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";
import { useI18n } from "@/lib/i18n";
import { settingsRepo, useData } from "@/data";
import { playScanBeep, triggerScanVibrate } from "@/lib/scanner-feedback";
import { Button } from "./ui-kit";

export interface ScanResult {
  code: string;
  format?: string | undefined;
}

export interface CameraScannerProps {
  onScan: (result: ScanResult) => void;
  continuous?: boolean | undefined;
  cooldownMs?: number | undefined;
  className?: string | undefined;
  showControls?: boolean | undefined;
  preferredFacing?: "environment" | "user" | undefined;
}

const NATIVE_FORMATS = [
  "ean_13",
  "ean_8",
  "upc_a",
  "upc_e",
  "code_128",
  "code_39",
  "itf",
  "qr_code",
];

export function CameraScanner({
  onScan,
  cooldownMs = 1500,
  className = "",
  showControls = true,
  preferredFacing,
}: CameraScannerProps) {
  const { t } = useI18n();
  const settings = useData(() => settingsRepo.get(), []);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const zxingControlsRef = useRef<{ stop: () => void } | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const lastScanRef = useRef<{ code: string; time: number }>({ code: "", time: 0 });

  const [facingMode, setFacingMode] = useState<"environment" | "user">(
    preferredFacing || settings?.preferredCamera || "environment"
  );
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [errorType, setErrorType] = useState<"insecure" | "denied" | "not-found" | "generic" | null>(null);
  const [engineUsed, setEngineUsed] = useState<"native" | "zxing" | null>(null);
  const [activeCode, setActiveCode] = useState<string | null>(null);

  // Stop camera tracks and decoders
  const stopTracks = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (zxingControlsRef.current) {
      try {
        zxingControlsRef.current.stop();
      } catch {}
      zxingControlsRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {}
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setTorchOn(false);
    setTorchSupported(false);
  }, []);

  const handleDetectedCode = useCallback(
    (code: string, format?: string | undefined) => {
      const clean = code.trim();
      if (!clean) return;

      const now = Date.now();
      if (lastScanRef.current.code === clean && now - lastScanRef.current.time < cooldownMs) {
        return;
      }
      lastScanRef.current = { code: clean, time: now };

      // Sound & vibration feedback
      if (settings?.cameraScannerBeep !== false) {
        playScanBeep();
      }
      if (settings?.cameraScannerVibrate !== false) {
        triggerScanVibrate();
      }

      setActiveCode(clean);
      setTimeout(() => setActiveCode(null), 1000);

      onScan({ code: clean, format });
    },
    [cooldownMs, onScan, settings?.cameraScannerBeep, settings?.cameraScannerVibrate]
  );

  // Initialize camera and scanner
  useEffect(() => {
    let isCancelled = false;

    // Check secure context
    if (
      typeof window !== "undefined" &&
      window.isSecureContext === false &&
      window.location.hostname !== "localhost" &&
      window.location.hostname !== "127.0.0.1"
    ) {
      setErrorType("insecure");
      return;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setErrorType("not-found");
      return;
    }

    async function startCamera() {
      stopTracks();
      setErrorType(null);

      try {
        // Enumerate video devices
        try {
          const devices = await navigator.mediaDevices.enumerateDevices();
          const videoInputs = devices.filter((d) => d.kind === "videoinput");
          setHasMultipleCameras(videoInputs.length > 1);
        } catch {}

        const constraints: MediaStreamConstraints = {
          video: {
            facingMode: { ideal: facingMode },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (isCancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;

        // Check torch capability
        const track = stream.getVideoTracks()[0];
        if (track && typeof track.getCapabilities === "function") {
          const caps = track.getCapabilities() as { torch?: boolean };
          if (caps && caps.torch) {
            setTorchSupported(true);
          }
        }

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }

        // Try native BarcodeDetector API first
        let nativeSuccess = false;
        if (typeof window !== "undefined" && "BarcodeDetector" in window) {
          try {
            const BarcodeDetectorClass = (window as unknown as { BarcodeDetector: any }).BarcodeDetector;
            let formats = NATIVE_FORMATS;
            if (typeof BarcodeDetectorClass.getSupportedFormats === "function") {
              const supported = await BarcodeDetectorClass.getSupportedFormats();
              if (Array.isArray(supported)) {
                formats = NATIVE_FORMATS.filter((f) => supported.includes(f));
              }
            }
            const detector = new BarcodeDetectorClass({ formats });
            setEngineUsed("native");
            nativeSuccess = true;

            let lastRun = 0;
            const detectLoop = async () => {
              if (isCancelled) return;
              const now = Date.now();
              if (videoRef.current && videoRef.current.readyState >= 2 && now - lastRun >= 140) {
                lastRun = now;
                try {
                  const detected = await detector.detect(videoRef.current);
                  if (detected && detected.length > 0) {
                    const first = detected[0];
                    handleDetectedCode(first.rawValue, first.format || "native");
                  }
                } catch {}
              }
              animFrameRef.current = requestAnimationFrame(detectLoop);
            };

            animFrameRef.current = requestAnimationFrame(detectLoop);
          } catch {
            nativeSuccess = false;
          }
        }

        // Fallback to bundled @zxing/browser
        if (!nativeSuccess && videoRef.current) {
          setEngineUsed("zxing");
          const hints = new Map();
          hints.set(DecodeHintType.POSSIBLE_FORMATS, [
            BarcodeFormat.EAN_13,
            BarcodeFormat.EAN_8,
            BarcodeFormat.UPC_A,
            BarcodeFormat.UPC_E,
            BarcodeFormat.CODE_128,
            BarcodeFormat.CODE_39,
            BarcodeFormat.ITF,
            BarcodeFormat.QR_CODE,
          ]);

          const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 200 });
          const controls = await reader.decodeFromVideoElement(videoRef.current, (result) => {
            if (isCancelled) return;
            if (result) {
              const rawFormat = result.getBarcodeFormat();
              const formatStr = rawFormat !== undefined ? BarcodeFormat[rawFormat] : "zxing";
              handleDetectedCode(result.getText(), formatStr);
            }
          });
          zxingControlsRef.current = controls;
        }
      } catch (err: unknown) {
        if (isCancelled) return;
        const e = err as { name?: string };
        if (e.name === "NotAllowedError" || e.name === "PermissionDeniedError") {
          setErrorType("denied");
        } else if (e.name === "NotFoundError" || e.name === "DevicesNotFoundError") {
          setErrorType("not-found");
        } else {
          setErrorType("generic");
        }
      }
    }

    void startCamera();

    return () => {
      isCancelled = true;
      stopTracks();
    };
  }, [facingMode, handleDetectedCode, stopTracks]);

  // Toggle torch
  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      const next = !torchOn;
      await (track as any).applyConstraints({
        advanced: [{ torch: next }],
      });
      setTorchOn(next);
    } catch {}
  }

  // Switch camera between environment and user
  function switchCamera() {
    setFacingMode((prev) => (prev === "environment" ? "user" : "environment"));
  }

  return (
    <div className={`relative flex flex-col items-center justify-center overflow-hidden rounded-2xl bg-black text-white ${className}`}>
      {/* Video Element */}
      <video
        ref={videoRef}
        playsInline
        muted
        className="h-full w-full object-cover"
        style={{ minHeight: "260px" }}
      />

      {/* Aiming Reticle / Viewfinder Overlay */}
      {!errorType && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center p-6">
          <div className="relative h-44 w-64 max-w-[85%] rounded-xl border-2 border-primary/70 shadow-[0_0_0_9999px_rgba(0,0,0,0.55)]">
            {/* Corner brackets */}
            <span className="absolute -top-1 -start-1 h-5 w-5 border-s-4 border-t-4 border-primary rounded-tl" />
            <span className="absolute -top-1 -end-1 h-5 w-5 border-e-4 border-t-4 border-primary rounded-tr" />
            <span className="absolute -bottom-1 -start-1 h-5 w-5 border-s-4 border-b-4 border-primary rounded-bl" />
            <span className="absolute -bottom-1 -end-1 h-5 w-5 border-e-4 border-b-4 border-primary rounded-br" />

            {/* Animated Laser line */}
            <div className="absolute inset-x-2 h-0.5 bg-gradient-to-r from-transparent via-red-500 to-transparent shadow-[0_0_8px_#ef4444] animate-scanner-laser" />

            {activeCode && (
              <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-success/20 backdrop-blur-xs transition">
                <span className="rounded-md bg-success px-3 py-1 text-sm font-bold text-white shadow-md">
                  ✓ {activeCode}
                </span>
              </div>
            )}
          </div>

          <p className="mt-4 rounded-full bg-black/60 px-4 py-1.5 text-center text-xs font-medium text-white/90 backdrop-blur-sm">
            {t("aimBarcode")}
          </p>

          {engineUsed && (
            <span className="mt-1 text-[10px] text-white/50">
              {engineUsed === "native" ? "Native BarcodeDetector" : "Bundled ZXing"}
            </span>
          )}
        </div>
      )}

      {/* Control Buttons (Top or Bottom) */}
      {showControls && !errorType && (
        <div className="absolute top-3 end-3 flex items-center gap-2">
          {torchSupported && (
            <button
              type="button"
              onClick={toggleTorch}
              className={`grid h-10 w-10 place-items-center rounded-full backdrop-blur-md transition ${
                torchOn ? "bg-amber-400 text-black shadow-lg" : "bg-black/50 text-white hover:bg-black/70"
              }`}
              title={t("toggleTorch")}
            >
              <Flashlight className="h-5 w-5" />
            </button>
          )}

          {hasMultipleCameras && (
            <button
              type="button"
              onClick={switchCamera}
              className="grid h-10 w-10 place-items-center rounded-full bg-black/50 text-white backdrop-blur-md hover:bg-black/70 transition"
              title={t("switchCamera")}
            >
              <FlipHorizontal className="h-5 w-5" />
            </button>
          )}
        </div>
      )}

      {/* Friendly Error Screens */}
      {errorType === "insecure" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/95 p-6 text-center text-white">
          <ShieldAlert className="mb-3 h-12 w-12 text-amber-400" />
          <h3 className="text-base font-bold text-white">{t("insecureContextCamera")}</h3>
        </div>
      )}

      {errorType === "denied" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/95 p-6 text-center text-white">
          <AlertCircle className="mb-3 h-12 w-12 text-destructive" />
          <h3 className="text-base font-bold text-white">{t("cameraPermissionDenied")}</h3>
        </div>
      )}

      {errorType === "not-found" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/95 p-6 text-center text-white">
          <Camera className="mb-3 h-12 w-12 text-muted-foreground" />
          <h3 className="text-base font-bold text-white">{t("cameraNotFound")}</h3>
        </div>
      )}

      {errorType === "generic" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/95 p-6 text-center text-white">
          <AlertCircle className="mb-3 h-12 w-12 text-destructive" />
          <h3 className="text-base font-bold text-white">{t("cameraNotFound")}</h3>
        </div>
      )}
    </div>
  );
}

export interface CameraScannerModalProps {
  open: boolean;
  onClose: () => void;
  onScan: (result: ScanResult) => void;
  title?: string | undefined;
  subtitle?: string | undefined;
  continuous?: boolean | undefined;
}

export function CameraScannerModal({
  open,
  onClose,
  onScan,
  title,
  subtitle,
  continuous = true,
}: CameraScannerModalProps) {
  const { t } = useI18n();

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 sm:p-4 backdrop-blur-xs">
      <div className="relative flex max-h-[95vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-card border border-border shadow-2xl">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3 bg-muted/40">
          <div className="flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary">
              <Camera className="h-4 w-4" />
            </div>
            <div>
              <h3 className="font-display text-base font-bold text-foreground">
                {title || t("scanWithCamera")}
              </h3>
              {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full">
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Scanner Body */}
        <div className="p-3 sm:p-4">
          <CameraScanner
            className="h-[360px] sm:h-[400px] w-full"
            continuous={continuous}
            onScan={(res) => {
              onScan(res);
              if (!continuous) {
                onClose();
              }
            }}
          />
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between border-t border-border px-4 py-2.5 bg-muted/20 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            EAN-13, EAN-8, UPC, Code128, QR
          </span>
          <Button variant="outline" size="sm" onClick={onClose}>
            {t("cancel")}
          </Button>
        </div>
      </div>
    </div>
  );
}
