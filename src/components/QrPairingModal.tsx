import { useEffect, useState, useRef } from "react";
import QRCode from "qrcode";
import { QrCode, Smartphone, Wifi, CheckCircle2, Copy, ExternalLink, X, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button, Modal } from "./ui-kit";
import { playScanBeep, triggerScanVibrate } from "@/lib/scanner-feedback";

interface QrPairingModalProps {
  open: boolean;
  onClose: () => void;
  onScanReceived: (code: string, format?: string) => void;
}

export function QrPairingModal({ open, onClose, onScanReceived }: QrPairingModalProps) {
  const [sessionId, setSessionId] = useState("");
  const [qrCodeData, setQrCodeData] = useState<string>("");
  const [pairingUrl, setPairingUrl] = useState("");
  const [activeScansCount, setActiveScansCount] = useState(0);
  const [isConnected, setIsConnected] = useState(false);
  const lastScanIdRef = useRef<string | null>(null);

  // Initialize or generate new pairing session
  function generateSession() {
    const id = "pos-" + Math.random().toString(36).substring(2, 8);
    setSessionId(id);
    lastScanIdRef.current = null;
    setActiveScansCount(0);
    setIsConnected(false);

    if (typeof window !== "undefined") {
      const url = `${window.location.origin}/remote-scanner?session=${id}`;
      setPairingUrl(url);

      QRCode.toDataURL(url, {
        width: 320,
        margin: 2,
        color: {
          dark: "#0f172a",
          light: "#ffffff",
        },
      })
        .then((data) => setQrCodeData(data))
        .catch((err) => console.error("QR Code Error:", err));
    }
  }

  useEffect(() => {
    if (open) {
      generateSession();
    }
  }, [open]);

  // Poll relay server for scans from phone
  useEffect(() => {
    if (!open || !sessionId) return;

    let isSubscribed = true;
    const interval = setInterval(async () => {
      try {
        const queryParams = new URLSearchParams({ session: sessionId });
        if (lastScanIdRef.current) {
          queryParams.set("lastScanId", lastScanIdRef.current);
        }

        const res = await fetch(`/api/relay?${queryParams.toString()}`);
        if (!res.ok) return;

        const data = await res.json();
        if (data.success && isSubscribed) {
          if (data.totalCount > 0) {
            setIsConnected(true);
          }

          if (Array.isArray(data.scans) && data.scans.length > 0) {
            setIsConnected(true);
            for (const scan of data.scans) {
              lastScanIdRef.current = scan.id;
              setActiveScansCount((c) => c + 1);

              playScanBeep();
              triggerScanVibrate();
              onScanReceived(scan.code, scan.format);
              toast.success(`تم استلام من الهاتف: ${scan.code}`, { icon: "📱" });
            }
          }
        }
      } catch {
        // network poll error
      }
    }, 700);

    return () => {
      isSubscribed = false;
      clearInterval(interval);
    };
  }, [open, sessionId, onScanReceived]);

  if (!open) return null;

  return (
    <Modal open onClose={onClose} title="ربط الهاتف كقارئ باركود لاسلكي (QR Code)">
      <div className="flex flex-col items-center space-y-4 text-center">
        {/* Status Indicator */}
        <div className="flex items-center gap-2 rounded-full bg-muted/60 px-3.5 py-1 text-xs font-semibold">
          <span className={`h-2.5 w-2.5 rounded-full ${isConnected ? "bg-success animate-pulse" : "bg-amber-400"}`} />
          <span>
            {isConnected
              ? `الهاتف متصل ويتم الاستلام (${activeScansCount} ممسوحة)`
              : "في انتظار مسح الكود من كاميرا الهاتف..."}
          </span>
        </div>

        {/* QR Code Card */}
        <div className="relative overflow-hidden rounded-2xl border-2 border-primary/30 bg-white p-3 shadow-xl">
          {qrCodeData ? (
            <img src={qrCodeData} alt="QR Code" className="h-60 w-60 object-contain sm:h-64 sm:w-64" />
          ) : (
            <div className="grid h-60 w-60 place-items-center text-muted-foreground">
              <RefreshCw className="h-8 w-8 animate-spin" />
            </div>
          )}
        </div>

        {/* Instructions */}
        <div className="space-y-1 text-xs text-muted-foreground max-w-sm">
          <p className="font-bold text-foreground">
            1. افتح كاميرا هاتفك ووجّهها نحو كود QR أعلاه.
          </p>
          <p>
            2. سيفتح الرابط مباشرة على الهاتف ويبدأ بالمسح.
          </p>
          <p className="text-primary font-semibold">
            3. كل باركود تمسحه بهاتفك سيظهر فوراً على شاشة الكمبيوتر!
          </p>
        </div>

        {/* Quick Link & Action buttons */}
        <div className="flex w-full items-center justify-between gap-2 border-t border-border pt-4">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={generateSession}
            className="text-xs gap-1"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>تحديث الكود</span>
          </Button>

          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                if (pairingUrl) {
                  navigator.clipboard.writeText(pairingUrl);
                  toast.success("تم نسخ الرابط");
                }
              }}
              className="text-xs gap-1"
            >
              <Copy className="h-3.5 w-3.5" />
              <span>نسخ الرابط</span>
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                if (pairingUrl) {
                  window.open(pairingUrl, "_blank");
                }
              }}
              className="text-xs gap-1"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              <span>تجربة في نافذة ثانية</span>
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
