import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Link, createRootRouteWithContext, useRouter, HeadContent, Scripts, ClientOnly, type ErrorComponentProps,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { Toaster } from "sonner";

import appCss from "../styles.css?url";
import { I18nProvider } from "@/lib/i18n";
import { PrintProvider } from "@/components/print";
import { AppShell } from "@/components/AppShell";
import { backupRepo } from "@/data";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <div className="mt-6">
          <Link to="/" className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">الرئيسية</Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold text-foreground">حدث خطأ</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error instanceof Error ? error.message : String(error)}</p>
        <button onClick={() => { router.invalidate(); reset(); }} className="mt-6 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">إعادة المحاولة</button>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "نقطة البيع — متجر الهواتف" },
      { name: "author", content: "Ilyes Badreddin" },
      { name: "description", content: "Local-first POS and inventory for phone & accessories shops." },
      { property: "og:title", content: "نقطة البيع — متجر الهواتف" },
      { property: "og:description", content: "Local-first POS and inventory for phone & accessories shops." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "theme-color", content: "#0f172a" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
      { rel: "manifest", href: "/manifest.webmanifest" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <head><HeadContent /></head>
      <body>{children}<Scripts /></body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  useEffect(() => {
    if (typeof navigator !== "undefined" && navigator.storage?.persist) {
      navigator.storage.persist().catch(() => {});
    }

    // Register PWA service worker for browser (disabled in Electron)
    if (
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      !window.electronAPI?.isElectron
    ) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }

    if (typeof window === "undefined" || !window.electronAPI?.isElectron) return;

    const performBackup = async () => {
      try {
        const data = await backupRepo.exportAll();
        await window.electronAPI?.backupNow(JSON.stringify(data));
        localStorage.setItem("lastAutoBackup", Date.now().toString());
      } catch (err) {
        console.error("Auto-backup failed:", err);
      }
    };

    const lastAutoBackup = localStorage.getItem("lastAutoBackup");
    const lastTime = lastAutoBackup ? parseInt(lastAutoBackup, 10) : 0;
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;

    if (!lastTime || now - lastTime > oneDay) {
      void performBackup();
    }

    const onBeforeUnload = () => {
      void performBackup();
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ClientOnly fallback={<div className="grid min-h-screen place-items-center text-muted-foreground">…</div>}>
        <I18nProvider>
          <PrintProvider>
            <AppShell />
            <Toaster position="top-center" richColors />
          </PrintProvider>
        </I18nProvider>
      </ClientOnly>
    </QueryClientProvider>
  );
}
