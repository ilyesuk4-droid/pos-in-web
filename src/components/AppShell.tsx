import { Link, Outlet } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  LayoutDashboard, ShoppingCart, Package, Tags, Users, Truck, History, BarChart3,
  Wallet, Barcode, Settings as Cog, DatabaseBackup, Smartphone, AlertTriangle,
  Wrench, Zap, ChevronLeft, ChevronRight, Download, X, RotateCcw, Code2, ClipboardCheck,
} from "lucide-react";
import { toast } from "sonner";
import { backupRepo, settingsRepo, useData } from "@/data";
import { useI18n, type TKey } from "@/lib/i18n";
import { SetupWizard } from "./SetupWizard";

interface NavItem {
  to: string;
  key: TKey;
  icon: typeof Package;
}

interface NavSection {
  titleKey: TKey;
  items: NavItem[];
}

const navSections: NavSection[] = [
  {
    titleKey: "salesGroup",
    items: [
      { to: "/", key: "dashboard", icon: LayoutDashboard },
      { to: "/pos", key: "pos", icon: ShoppingCart },
      { to: "/returns", key: "returns", icon: RotateCcw },
    ],
  },
  {
    titleKey: "servicesGroup",
    items: [
      { to: "/repairs", key: "repairs", icon: Wrench },
      { to: "/flexi", key: "flexi", icon: Zap },
    ],
  },
  {
    titleKey: "inventoryGroup",
    items: [
      { to: "/products", key: "products", icon: Package },
      { to: "/categories", key: "categories", icon: Tags },
      { to: "/purchases", key: "purchases", icon: Truck },
      { to: "/inventory-count", key: "inventoryCount", icon: ClipboardCheck },
      { to: "/movements", key: "movements", icon: History },
      { to: "/labels", key: "labels", icon: Barcode },
    ],
  },
  {
    titleKey: "customersFinanceGroup",
    items: [
      { to: "/customers", key: "customers", icon: Users },
      { to: "/reports", key: "reports", icon: BarChart3 },
      { to: "/expenses", key: "expenses", icon: Wallet },
    ],
  },
  {
    titleKey: "settingsGroup",
    items: [
      { to: "/settings", key: "settings", icon: Cog },
      { to: "/backup", key: "backup", icon: DatabaseBackup },
    ],
  },
];

export function AppShell() {
  const { t, lang, setLang } = useI18n();
  const settings = useData(() => settingsRepo.get(), []);

  // Collapsible sidebar state
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("pos_sidebar_collapsed") === "true";
  });

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("pos_sidebar_collapsed", String(next));
      return next;
    });
  };

  // Setup Wizard state
  const [wizardOpen, setWizardOpen] = useState(false);
  useEffect(() => {
    if (settings && settings.wizardCompleted !== true) {
      setWizardOpen(true);
    }
  }, [settings]);

  // Backup reminder state (show only if older than 7 days, with dismiss for session)
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const needBackup =
    !bannerDismissed &&
    settings &&
    (!settings.lastBackup || Date.now() - settings.lastBackup > 7 * 86400000);

  // Direct one-click immediate backup
  async function downloadBackupNow() {
    try {
      const data = await backupRepo.exportAll();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `backup-${settings?.shopName || "pos"}-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      await settingsRepo.save({ lastBackup: Date.now() });
      toast.success(t("backupSuccess"));
      setBannerDismissed(true);
    } catch {
      toast.error("Error creating backup");
    }
  }

  return (
    <div className="no-print flex min-h-screen bg-background">
      {/* Sidebar */}
      <aside
        className={`sticky top-0 flex h-screen shrink-0 flex-col border-e border-sidebar-border bg-sidebar text-sidebar-foreground transition-all duration-300 ${
          collapsed ? "w-20" : "w-64"
        }`}
      >
        {/* Header / Brand */}
        <div className="flex h-18 items-center justify-between border-b border-sidebar-accent/50 px-4">
          <div className="flex items-center gap-3 overflow-hidden">
            {settings?.logo ? (
              <img
                src={settings.logo}
                alt=""
                className="h-10 w-10 shrink-0 rounded-xl object-cover shadow-sm"
              />
            ) : (
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground shadow-sm">
                <Smartphone className="h-5 w-5" />
              </div>
            )}
            {!collapsed && (
              <div className="min-w-0">
                <div className="truncate font-display text-base font-bold text-sidebar-foreground">
                  {settings?.shopName}
                </div>
                <div className="truncate text-xs opacity-60">{t("appName")}</div>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={toggleCollapsed}
            title={collapsed ? t("expand") : t("collapse")}
            className="grid h-8 w-8 place-items-center rounded-lg bg-sidebar-accent/50 text-sidebar-foreground opacity-80 transition hover:bg-sidebar-accent hover:opacity-100"
          >
            {collapsed ? (
              lang === "ar" ? (
                <ChevronLeft className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )
            ) : lang === "ar" ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </button>
        </div>

        {/* Navigation list */}
        <nav className="flex-1 space-y-4 overflow-y-auto overflow-x-hidden p-3">
          {navSections.map((section) => (
            <div key={section.titleKey} className="space-y-1">
              {!collapsed ? (
                <div className="px-3 pb-1 pt-2 font-display text-[11px] font-bold uppercase tracking-wider text-sidebar-foreground/45">
                  {t(section.titleKey)}
                </div>
              ) : (
                <div className="mx-auto my-2 h-px w-8 bg-sidebar-accent/60" />
              )}
              {section.items.map((n) => (
                <Link
                  key={n.to}
                  to={n.to}
                  activeOptions={{ exact: n.to === "/" }}
                  title={collapsed ? t(n.key) : undefined}
                  className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                    collapsed ? "justify-center" : ""
                  } text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground hover:opacity-100`}
                  activeProps={{
                    className:
                      "!bg-sidebar-primary !text-sidebar-primary-foreground !opacity-100 font-semibold shadow-sm",
                  }}
                >
                  <n.icon className="h-5 w-5 shrink-0 transition-transform group-hover:scale-105" />
                  {!collapsed && <span className="truncate">{t(n.key)}</span>}
                </Link>
              ))}
            </div>
          ))}
        </nav>

        {/* Language switcher & Footer */}
        <div className="border-t border-sidebar-accent/50 p-3">
          {!collapsed ? (
            <div className="flex gap-2">
              {(["ar", "fr"] as const).map((l) => (
                <button
                  key={l}
                  onClick={() => setLang(l)}
                  className={`flex-1 rounded-lg py-2 text-xs font-bold transition ${
                    lang === l
                      ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                      : "bg-sidebar-accent/60 text-sidebar-foreground/80 hover:bg-sidebar-accent"
                  }`}
                >
                  {l === "ar" ? "العربية" : "Français"}
                </button>
              ))}
            </div>
          ) : (
            <button
              onClick={() => setLang(lang === "ar" ? "fr" : "ar")}
              title={lang === "ar" ? "Français" : "العربية"}
              className="flex h-10 w-full items-center justify-center rounded-lg bg-sidebar-accent text-xs font-bold"
            >
              {lang.toUpperCase()}
            </button>
          )}

          {/* Discreet Developer Credit */}
          {!collapsed ? (
            <div className="mt-2.5 pt-2 border-t border-sidebar-accent/30 text-center">
              <a
                href="https://ilyas-portfolio.carrd.co/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] leading-tight text-sidebar-foreground/50 transition hover:text-sidebar-foreground/90 block hover:underline"
              >
                {lang === "fr" ? "Développé par Ilyes Badreddin" : "تم تطوير هذا النظام بواسطة إلياس بدر الدين"}
              </a>
            </div>
          ) : (
            <div className="mt-2 flex justify-center">
              <a
                href="https://ilyas-portfolio.carrd.co/"
                target="_blank"
                rel="noopener noreferrer"
                title={lang === "fr" ? "Développé par Ilyes Badreddin" : "تم تطوير هذا النظام بواسطة إلياس بدر الدين"}
                className="grid h-8 w-8 place-items-center rounded-lg text-sidebar-foreground/50 transition hover:bg-sidebar-accent hover:text-sidebar-foreground/90"
              >
                <Code2 className="h-4 w-4" />
              </a>
            </div>
          )}
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="min-w-0 flex-1 overflow-x-hidden">
        {/* Backup reminder banner */}
        {needBackup && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-warning/30 bg-warning/15 px-6 py-2.5 text-sm text-warning-foreground shadow-xs">
            <div className="flex items-center gap-2.5 font-medium">
              <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
              <span>{t("backupReminder")}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={downloadBackupNow}
                className="inline-flex items-center gap-1.5 rounded-lg bg-warning px-3 py-1 text-xs font-bold text-white shadow-xs transition hover:brightness-105"
              >
                <Download className="h-3.5 w-3.5" />
                {t("backupNowDirect")}
              </button>
              <button
                type="button"
                onClick={() => setBannerDismissed(true)}
                title={t("dismiss")}
                className="rounded p-1 text-warning-foreground/60 transition hover:bg-warning/20 hover:text-warning-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        <div className="p-6 lg:p-8">
          <Outlet />
        </div>
      </main>

      {/* Setup Wizard Modal for first-run */}
      <SetupWizard open={wizardOpen} onClose={() => setWizardOpen(false)} />
    </div>
  );
}
