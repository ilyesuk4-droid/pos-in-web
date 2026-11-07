import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Smartphone, Wifi, CheckCircle2, Send, History, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { CameraScanner, type ScanResult } from "@/components/CameraScanner";
import { Button, Card, Badge } from "@/components/ui-kit";

export const Route = createFileRoute("/remote-scanner")({
  head: () => ({
    meta: [
      { title: "قارئ الباركود اللاسلكي — الهاتف" },
      { name: "description", content: "Mobile wireless camera barcode scanner for POS." },
    ],
  }),
  component: RemoteScannerPage,
});

function RemoteScannerPage() {
  const [session, setSession] = useState<string>("");
  const [sending, setSending] = useState(false);
  const [lastSentCode, setLastSentCode] = useState<string | null>(null);
  const [scanHistory, setScanHistory] = useState<Array<{ code: string; time: string; format?: string | undefined }>>([]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const urlParams = new URLSearchParams(window.location.search);
      const s = urlParams.get("session") || "default-session";
      setSession(s);
    }
  }, []);

  async function handleScan(result: ScanResult) {
    const code = result.code.trim();
    if (!code || !session) return;

    setSending(true);
    setLastSentCode(code);

    try {
      const res = await fetch("/api/relay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session,
          code,
          format: result.format || "auto",
        }),
      });

      if (res.ok) {
        toast.success(`تم إرسال الكود للكمبيوتر: ${code}`, { icon: "⚡" });
        setScanHistory((prev) => [
          { code, time: new Date().toLocaleTimeString(), format: result.format },
          ...prev.slice(0, 15),
        ]);
      } else {
        toast.error("فشل الاتصال بخادم الربط");
      }
    } catch {
      toast.error("تعذر إرسال الكود للكمبيوتر، تحقق من الاتصال");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-white">
      {/* Header Bar */}
      <header className="flex items-center justify-between border-b border-white/10 bg-slate-900/90 px-4 py-3 backdrop-blur-md sticky top-0 z-20">
        <div className="flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-primary/20 text-primary">
            <Smartphone className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-sm font-bold">قارئ الباركود اللاسلكي</h1>
            <p className="text-[11px] text-white/60">
              الجلسة: <span className="font-mono text-primary font-bold">{session}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 rounded-full bg-success/20 px-3 py-1 text-xs font-semibold text-success">
          <span className="h-2 w-2 rounded-full bg-success animate-pulse" />
          <span>متصل</span>
        </div>
      </header>

      {/* Main Viewfinder */}
      <div className="relative flex-1 p-3 flex flex-col justify-center">
        <CameraScanner
          className="h-[360px] sm:h-[420px] w-full max-w-md mx-auto shadow-2xl"
          continuous
          cooldownMs={1200}
          onScan={handleScan}
        />

        {/* Live Feedback Banner */}
        {lastSentCode && (
          <div className="mx-auto mt-3 max-w-md w-full rounded-xl border border-success/40 bg-success/15 p-3 text-center text-xs font-semibold text-success backdrop-blur-md">
            ✓ تم إرسال: <span className="font-mono text-sm font-bold text-white">{lastSentCode}</span> للكمبيوتر فوراً
          </div>
        )}
      </div>

      {/* Scanned History Drawer */}
      {scanHistory.length > 0 && (
        <div className="border-t border-white/10 bg-slate-900/80 p-3 max-h-48 overflow-auto">
          <div className="mb-2 flex items-center justify-between text-xs text-white/70">
            <span className="flex items-center gap-1 font-semibold">
              <History className="h-3.5 w-3.5" />
              آخر المواد المرسلة ({scanHistory.length}):
            </span>
          </div>
          <div className="space-y-1.5">
            {scanHistory.map((item, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-1.5 text-xs"
              >
                <span className="font-mono font-bold text-white">{item.code}</span>
                <span className="text-[10px] text-white/50">{item.time}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
