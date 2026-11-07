import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Sparkles, Trash2, Wand2, Info, ExternalLink, Instagram,
  Printer, HardDrive, FolderOpen, Monitor, RefreshCw, Camera
} from "lucide-react";
import { CameraScannerModal } from "@/components/CameraScanner";
import { toast } from "sonner";
import pkg from "../../package.json";
import { backupRepo, demoRepo, settingsRepo, useData, type Settings } from "@/data";
import { useI18n } from "@/lib/i18n";
import { Button, Card, Field, Input, PageHeader, Select, readFileAsDataURL, Badge } from "@/components/ui-kit";
import { SetupWizard } from "@/components/SetupWizard";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "الإعدادات — نقطة البيع" },
      { name: "description", content: "Shop details, receipt and language settings." },
      { property: "og:title", content: "الإعدادات — نقطة البيع" },
      { property: "og:description", content: "Shop details, receipt and language settings." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { t, lang, fmtDate } = useI18n();
  const loaded = useData(() => settingsRepo.get(), []);
  const [s, setS] = useState<Settings | null>(null);
  const [hasDemo, setHasDemo] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [loadingDemo, setLoadingDemo] = useState(false);
  const [testScannerOpen, setTestScannerOpen] = useState(false);
  const [scannedTestResult, setScannedTestResult] = useState<{ code: string; format?: string | undefined; time: string } | null>(null);

  // Desktop / Electron integration state
  const isElectron = typeof window !== "undefined" && !!window.electronAPI?.isElectron;
  const [printers, setPrinters] = useState<{ name: string; displayName?: string; isDefault?: boolean }[]>([]);
  const [backupInfo, setBackupInfo] = useState<{ folder: string; files: string[] } | null>(null);
  const [autoLaunch, setAutoLaunch] = useState(false);
  const [testingPrint, setTestingPrint] = useState(false);
  const [backingUp, setBackingUp] = useState(false);

  useEffect(() => {
    if (loaded && !s) {
      setS(loaded);
      if (loaded.autoLaunch !== undefined) {
        setAutoLaunch(loaded.autoLaunch);
      }
    }
    setHasDemo(demoRepo.hasDemoData());
  }, [loaded, s]);

  useEffect(() => {
    if (isElectron && window.electronAPI) {
      window.electronAPI.getPrinters().then(setPrinters).catch(() => {});
      window.electronAPI.getBackupInfo().then(setBackupInfo).catch(() => {});
      if (window.electronAPI.getAutoLaunch) {
        window.electronAPI.getAutoLaunch().then(setAutoLaunch).catch(() => {});
      }
    }
  }, [isElectron]);

  if (!s) return null;
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setS({ ...s, [k]: v });

  async function handleLoadDemo() {
    setLoadingDemo(true);
    try {
      await demoRepo.loadDemoData();
      setHasDemo(true);
      toast.success(t("demoLoaded"));
    } catch {
      toast.error("Error loading demo data");
    } finally {
      setLoadingDemo(false);
    }
  }

  async function handleClearDemo() {
    if (!confirm(t("confirmDelete") + " (" + t("clearDemo") + ")")) return;
    setLoadingDemo(true);
    try {
      await demoRepo.clearDemoData();
      setHasDemo(false);
      toast.success(t("demoCleared"));
    } catch {
      toast.error("Error clearing demo data");
    } finally {
      setLoadingDemo(false);
    }
  }

  async function handlePrintTestPage() {
    if (!window.electronAPI?.printTestPage || !s) return;
    setTestingPrint(true);
    try {
      const res = await window.electronAPI.printTestPage({
        deviceName: s.printerName || "",
        silent: !!s.silentPrint,
      });
      if (res.success) {
        toast.success(t("testPageSuccess"));
      } else {
        toast.error(t("testPageError") + (res.error ? `: ${res.error}` : ""));
      }
    } catch {
      toast.error(t("testPageError"));
    } finally {
      setTestingPrint(false);
    }
  }

  async function handleBackupNow() {
    if (!window.electronAPI?.backupNow) return;
    setBackingUp(true);
    try {
      const data = await backupRepo.exportAll();
      const res = await window.electronAPI.backupNow(JSON.stringify(data));
      if (res.success) {
        toast.success(t("backupSuccess"));
        const info = await window.electronAPI.getBackupInfo();
        setBackupInfo(info);
      } else {
        toast.error("فشل النسخ: " + (res.error || ""));
      }
    } catch {
      toast.error("حدث خطأ أثناء النسخ");
    } finally {
      setBackingUp(false);
    }
  }

  async function handleChooseBackupFolder() {
    if (!window.electronAPI?.chooseBackupFolder) return;
    try {
      const chosen = await window.electronAPI.chooseBackupFolder();
      if (chosen) {
        const info = await window.electronAPI.getBackupInfo();
        setBackupInfo(info);
        toast.success(t("saved"));
      }
    } catch {
      toast.error("تعذر تغيير المجلد");
    }
  }

  async function handleOpenBackupFolder() {
    if (window.electronAPI?.openBackupFolder) {
      await window.electronAPI.openBackupFolder();
    } else if (window.electronAPI?.openDataFolder) {
      await window.electronAPI.openDataFolder();
    }
  }

  async function handleToggleAutoLaunch(enabled: boolean) {
    setAutoLaunch(enabled);
    set("autoLaunch", enabled);
    if (window.electronAPI?.setAutoLaunch) {
      const res = await window.electronAPI.setAutoLaunch(enabled);
      setAutoLaunch(res);
      if (s) {
        await settingsRepo.save({ ...s, autoLaunch: res });
      }
      toast.success(enabled ? "تم تفعيل بدء التشغيل التلقائي مع ويندوز" : "تم إلغاء بدء التشغيل مع ويندوز");
    }
  }

  return (
    <>
      <PageHeader title={t("settings")} />

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        {/* Main Column: Main Settings Form + Desktop App Settings */}
        <div className="space-y-6">
          <Card>
            <form
              className="grid grid-cols-2 gap-4"
              onSubmit={async (e) => {
                e.preventDefault();
                await settingsRepo.save(s);
                toast.success(t("saved"));
              }}
            >
              <Field label={t("shopName")} className="col-span-2">
                <Input
                  value={s.shopName}
                  onChange={(e) => set("shopName", e.target.value)}
                />
              </Field>
              <Field label={t("phone")}>
                <Input
                  value={s.phone}
                  onChange={(e) => set("phone", e.target.value)}
                />
              </Field>
              <Field label={t("address")}>
                <Input
                  value={s.address}
                  onChange={(e) => set("address", e.target.value)}
                />
              </Field>
              <Field label={t("receiptFooter")} className="col-span-2">
                <Input
                  value={s.receiptFooter}
                  onChange={(e) => set("receiptFooter", e.target.value)}
                />
              </Field>
              <Field label={t("paperWidth")}>
                <Select
                  value={s.paperWidth}
                  onChange={(e) => set("paperWidth", Number(e.target.value) as 58 | 80)}
                >
                  <option value={80}>80mm</option>
                  <option value={58}>58mm</option>
                </Select>
              </Field>
              <Field label={t("language")}>
                <Select
                  value={s.language}
                  onChange={(e) => set("language", e.target.value as "ar" | "fr")}
                >
                  <option value="ar">العربية</option>
                  <option value="fr">Français</option>
                </Select>
              </Field>

              <Field label={t("logo")} className="col-span-2">
                <div className="flex items-center gap-3">
                  {s.logo && (
                    <img
                      src={s.logo}
                      alt=""
                      className="h-16 w-16 rounded-xl object-contain shadow-xs border border-border"
                    />
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (f) set("logo", await readFileAsDataURL(f, 300));
                    }}
                  />
                  {s.logo && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => set("logo", undefined)}
                    >
                      {t("delete")}
                    </Button>
                  )}
                </div>
              </Field>

              {/* Receipt credit setting toggle */}
              <div className="col-span-2 flex items-center gap-3 pt-2 border-t border-border/60">
                <input
                  type="checkbox"
                  id="showReceiptCredit"
                  checked={!!s.showReceiptCredit}
                  onChange={(e) => set("showReceiptCredit", e.target.checked)}
                  className="h-4 w-4 rounded border-border text-primary focus:ring-ring cursor-pointer"
                />
                <label htmlFor="showReceiptCredit" className="text-sm font-medium text-foreground cursor-pointer select-none">
                  {t("showReceiptCreditSetting")}
                </label>
              </div>

              <div className="col-span-2 pt-2">
                <Button type="submit" size="lg" className="w-full sm:w-auto">
                  {t("save")}
                </Button>
              </div>
            </form>
          </Card>

          {/* Electron / Desktop Features Card (Only in Electron desktop app) */}
          {isElectron && (
            <Card className="space-y-5 border-primary/30 shadow-sm">
              <div className="flex items-center justify-between border-b border-border/70 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary">
                    <Monitor className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="font-display text-base font-bold text-foreground">
                      {t("desktopSettings")}
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      {t("desktopSettingsDesc")}
                    </p>
                  </div>
                </div>
                <Badge tone="info">Windows</Badge>
              </div>

              {/* Printing settings section */}
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <Printer className="h-4 w-4 text-primary" />
                  <span>{t("print")}</span>
                </h3>

                <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-muted/20 p-3">
                  <input
                    type="checkbox"
                    id="silentPrintToggle"
                    checked={!!s.silentPrint}
                    onChange={async (e) => {
                      const val = e.target.checked;
                      set("silentPrint", val);
                      await settingsRepo.save({ ...s, silentPrint: val });
                      toast.success(t("saved"));
                    }}
                    className="h-4 w-4 rounded border-border text-primary focus:ring-ring cursor-pointer"
                  />
                  <div>
                    <label htmlFor="silentPrintToggle" className="text-sm font-semibold text-foreground cursor-pointer block">
                      {t("silentPrintToggle")}
                    </label>
                    <span className="text-xs text-muted-foreground">
                      {t("silentPrintSetting")}
                    </span>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 items-end">
                  <Field label={t("choosePrinter")}>
                    <Select
                      value={s.printerName || ""}
                      onChange={async (e) => {
                        const val = e.target.value;
                        set("printerName", val);
                        await settingsRepo.save({ ...s, printerName: val });
                        toast.success(t("saved"));
                      }}
                    >
                      <option value="">{t("defaultPrinter")}</option>
                      {printers.map((p) => (
                        <option key={p.name} value={p.name}>
                          {p.displayName || p.name} {p.isDefault ? "(افتراضية)" : ""}
                        </option>
                      ))}
                    </Select>
                  </Field>

                  <Button
                    type="button"
                    variant="outline"
                    disabled={testingPrint}
                    onClick={handlePrintTestPage}
                    className="h-10"
                  >
                    <Printer className="h-4 w-4" />
                    <span>{testingPrint ? t("testPagePrinting") : t("printTestPage")}</span>
                  </Button>
                </div>
              </div>

              {/* Windows Auto-Launch section */}
              <div className="pt-2 border-t border-border/60">
                <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-muted/20 p-3">
                  <input
                    type="checkbox"
                    id="autoLaunchCheckbox"
                    checked={autoLaunch}
                    onChange={(e) => void handleToggleAutoLaunch(e.target.checked)}
                    className="h-4 w-4 rounded border-border text-primary focus:ring-ring cursor-pointer"
                  />
                  <div>
                    <label htmlFor="autoLaunchCheckbox" className="text-sm font-semibold text-foreground cursor-pointer block">
                      {t("startWithWindows")}
                    </label>
                    <span className="text-xs text-muted-foreground">
                      {t("startWithWindowsDesc")}
                    </span>
                  </div>
                </div>
              </div>

              {/* Local Auto-Backup section */}
              <div className="space-y-3 pt-2 border-t border-border/60">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                    <HardDrive className="h-4 w-4 text-primary" />
                    <span>{t("desktopBackup")}</span>
                  </h3>
                  {backupInfo && (
                    <span className="text-xs text-muted-foreground font-mono">
                      {t("backupCount")}: {backupInfo.files.length}
                    </span>
                  )}
                </div>

                <div className="rounded-xl border border-border/60 bg-muted/20 p-3 text-xs space-y-1.5">
                  <div className="text-muted-foreground">{t("backupFolder")}:</div>
                  <div className="font-mono text-foreground font-semibold break-all bg-background/80 p-2 rounded-lg border border-border/60">
                    {backupInfo?.folder || "C:\\Users\\...\\Documents\\MobileShopBackups"}
                  </div>
                  {s.lastBackup && (
                    <div className="text-muted-foreground pt-1">
                      {t("lastBackup")}: <span className="font-semibold text-foreground">{fmtDate(s.lastBackup)}</span>
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleOpenBackupFolder}
                  >
                    <FolderOpen className="h-4 w-4" />
                    <span>{t("openBackupFolder")}</span>
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleChooseBackupFolder}
                  >
                    <span>{t("chooseBackupFolder")}</span>
                  </Button>

                  <Button
                    type="button"
                    size="sm"
                    disabled={backingUp}
                    onClick={handleBackupNow}
                    className="ms-auto"
                  >
                    <RefreshCw className={`h-4 w-4 ${backingUp ? "animate-spin" : ""}`} />
                    <span>{t("desktopBackupNow")}</span>
                  </Button>
                </div>
              </div>
            </Card>
          )}


            {/* Camera Barcode Scanner Settings Card */}
            <Card className="space-y-4">
              <div className="flex items-center justify-between border-b border-border/70 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary">
                    <Camera className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="font-display text-base font-bold text-foreground">
                      {t("cameraScanner")}
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      {t("cameraScannerDesc")}
                    </p>
                  </div>
                </div>
                <Badge tone={s.cameraScannerEnabled !== false ? "success" : "default"}>
                  {s.cameraScannerEnabled !== false ? t("active") : t("disabled")}
                </Badge>
              </div>

              {/* Scanner Enable/Disable */}
              <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-muted/20 p-3">
                <input
                  type="checkbox"
                  id="cameraScannerEnabledToggle"
                  checked={s.cameraScannerEnabled !== false}
                  onChange={async (e) => {
                    const val = e.target.checked;
                    set("cameraScannerEnabled", val);
                    await settingsRepo.save({ ...s, cameraScannerEnabled: val });
                    toast.success(t("saved"));
                  }}
                  className="h-4 w-4 rounded border-border text-primary focus:ring-ring cursor-pointer"
                />
                <div>
                  <label htmlFor="cameraScannerEnabledToggle" className="text-sm font-semibold text-foreground cursor-pointer block">
                    {t("cameraScanner")}
                  </label>
                  <span className="text-xs text-muted-foreground">
                    {t("cameraScannerDesc")}
                  </span>
                </div>
              </div>

              {/* Preferred Camera & Feedback toggles */}
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={t("cameraFacing")}>
                  <Select
                    value={s.preferredCamera || "environment"}
                    onChange={async (e) => {
                      const val = e.target.value as "environment" | "user";
                      set("preferredCamera", val);
                      await settingsRepo.save({ ...s, preferredCamera: val });
                      toast.success(t("saved"));
                    }}
                  >
                    <option value="environment">{t("rearCamera")}</option>
                    <option value="user">{t("frontCamera")}</option>
                  </Select>
                </Field>

                <div className="flex flex-col gap-2 justify-center">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="scannerBeepToggle"
                      checked={s.cameraScannerBeep !== false}
                      onChange={async (e) => {
                        const val = e.target.checked;
                        set("cameraScannerBeep", val);
                        await settingsRepo.save({ ...s, cameraScannerBeep: val });
                        toast.success(t("saved"));
                      }}
                      className="h-4 w-4 rounded border-border text-primary focus:ring-ring cursor-pointer"
                    />
                    <label htmlFor="scannerBeepToggle" className="text-xs font-medium text-foreground cursor-pointer">
                      {t("scannerBeep")}
                    </label>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="scannerVibrateToggle"
                      checked={s.cameraScannerVibrate !== false}
                      onChange={async (e) => {
                        const val = e.target.checked;
                        set("cameraScannerVibrate", val);
                        await settingsRepo.save({ ...s, cameraScannerVibrate: val });
                        toast.success(t("saved"));
                      }}
                      className="h-4 w-4 rounded border-border text-primary focus:ring-ring cursor-pointer"
                    />
                    <label htmlFor="scannerVibrateToggle" className="text-xs font-medium text-foreground cursor-pointer">
                      {t("scannerVibrate")}
                    </label>
                  </div>
                </div>
              </div>

              {/* Scanner Test Trigger */}
              <div className="pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setTestScannerOpen(true)}
                  className="w-full gap-2"
                >
                  <Camera className="h-4 w-4 text-primary" />
                  <span>{t("testScanner")}</span>
                </Button>
              </div>

              {scannedTestResult && (
                <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 text-xs space-y-1">
                  <div className="flex justify-between font-semibold">
                    <span className="text-muted-foreground">{t("lastScanned")}:</span>
                    <span className="font-mono text-primary text-sm font-bold">{scannedTestResult.code}</span>
                  </div>
                  {scannedTestResult.format && (
                    <div className="flex justify-between text-muted-foreground">
                      <span>{t("barcodeFormat")}:</span>
                      <span className="font-mono">{scannedTestResult.format}</span>
                    </div>
                  )}
                  <div className="text-[10px] text-muted-foreground text-end">{scannedTestResult.time}</div>
                </div>
              )}
            </Card>

        </div>

        {/* Side panels: About, Demo Data & Wizard */}
        <div className="space-y-6">
          {/* About System & Developer Card */}
          <Card className="space-y-4">
            <div className="flex items-center justify-between border-b border-border/70 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary">
                  <Info className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="font-display text-base font-bold text-foreground">
                    {t("aboutSystem")}
                  </h2>
                  <span className="text-[11px] text-muted-foreground font-mono">{pkg.name}</span>
                </div>
              </div>
              <Badge tone="info">v{pkg.version || "1.0.0"}</Badge>
            </div>

            <div className="space-y-3 text-xs">
              <div className="rounded-xl border border-border/60 bg-muted/30 p-3.5 space-y-2">
                <p className="font-medium text-foreground leading-relaxed">
                  {lang === "fr" ? "Développé par Ilyes Badreddin" : "تم تطوير هذا النظام بواسطة إلياس بدر الدين"}
                </p>
                <div>
                  <a
                    href="https://ilyas-portfolio.carrd.co/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 font-bold text-primary hover:underline"
                  >
                    <span>{t("portfolioLink")}</span>
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </div>
              </div>

              <a
                href="https://www.instagram.com/ilyas_rah/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 via-pink-600 to-amber-500 font-bold text-white shadow-sm transition hover:opacity-95 active:scale-95"
              >
                <Instagram className="h-4 w-4" />
                <span>{t("contactDeveloper")}</span>
              </a>
            </div>
          </Card>

          {/* Demo Data Management Card */}
          <Card className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-bold flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-accent" />
                <span>{t("loadDemo")}</span>
              </h2>
              <Badge tone={hasDemo ? "success" : "default"}>
                {hasDemo ? t("demoActive") : t("demoInactive")}
              </Badge>
            </div>

            <p className="text-xs leading-relaxed text-muted-foreground">
              {t("demoDataDesc")}
            </p>

            <div className="flex flex-col gap-2 pt-1">
              <Button
                variant={hasDemo ? "outline" : "accent"}
                disabled={loadingDemo}
                onClick={handleLoadDemo}
                className="w-full justify-center"
              >
                <Sparkles className="h-4 w-4" />
                {t("loadDemo")}
              </Button>

              {hasDemo && (
                <Button
                  variant="danger"
                  disabled={loadingDemo}
                  onClick={handleClearDemo}
                  className="w-full justify-center"
                >
                  <Trash2 className="h-4 w-4" />
                  {t("clearDemo")}
                </Button>
              )}
            </div>
          </Card>

          {/* First-run Setup Wizard Card */}
          <Card className="space-y-3">
            <h2 className="font-display text-lg font-bold flex items-center gap-2">
              <Wand2 className="h-5 w-5 text-primary" />
              <span>{t("setupWizard")}</span>
            </h2>
            <p className="text-xs leading-relaxed text-muted-foreground">
              يمكنك إعادة تشغيل معالج الإعداد الأولي في أي وقت لضبط هوية المحل وإعدادات الطابعة وأرصدة الفليكسي خطوة بخطوة.
            </p>
            <Button
              variant="outline"
              className="w-full justify-center"
              onClick={() => setWizardOpen(true)}
            >
              <Wand2 className="h-4 w-4" />
              {t("reopenWizard")}
            </Button>
          </Card>
        </div>
      </div>

      <SetupWizard open={wizardOpen} onClose={() => setWizardOpen(false)} />

      <CameraScannerModal
        open={testScannerOpen}
        onClose={() => setTestScannerOpen(false)}
        title={t("testScanner")}
        subtitle={t("scannerTestDesc")}
        continuous={false}
        onScan={(result) => {
          setScannedTestResult({
            code: result.code,
            format: result.format,
            time: new Date().toLocaleTimeString(),
          });
          toast.success(`${t("lastScanned")}: ${result.code}`);
        }}
      />
    </>
  );
}
