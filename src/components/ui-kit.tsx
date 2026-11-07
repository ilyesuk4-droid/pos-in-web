import { useEffect, type ButtonHTMLAttributes, type ComponentProps, type CSSProperties, type ReactNode, type SelectHTMLAttributes } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

const btn = {
  primary: "bg-primary text-primary-foreground hover:brightness-110 shadow-soft",
  accent: "bg-accent text-accent-foreground hover:brightness-105 shadow-soft",
  outline: "border border-border bg-card text-foreground hover:bg-muted",
  ghost: "text-foreground hover:bg-muted",
  danger: "bg-destructive text-destructive-foreground hover:brightness-110",
  success: "bg-success text-success-foreground hover:brightness-110 shadow-soft",
};
const sizes = { sm: "h-9 px-3 text-sm", md: "h-11 px-4", lg: "h-14 px-6 text-lg", icon: "h-9 w-9" };

export function Button({ variant = "primary", size = "md", className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof btn; size?: keyof typeof sizes }) {
  return <button {...p} className={cn("inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition disabled:opacity-50 disabled:pointer-events-none", btn[variant], sizes[size], className)} />;
}
export function Input({ className, ...p }: ComponentProps<"input">) {
  return <input {...p} className={cn("h-11 w-full rounded-lg border border-input bg-card px-3 outline-none focus:ring-2 focus:ring-ring", className)} />;
}
export function Select({ className, ...p }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...p} className={cn("h-11 w-full rounded-lg border border-input bg-card px-3 outline-none focus:ring-2 focus:ring-ring", className)} />;
}
export function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return <label className={cn("flex flex-col gap-1.5 text-sm font-medium text-muted-foreground", className)}><span>{label}</span>{children}</label>;
}
export function Card({ className, children, style, onClick }: { className?: string; children: ReactNode; style?: CSSProperties; onClick?: () => void }) {
  return <div style={style} onClick={onClick} className={cn("rounded-xl border border-border bg-card p-5 shadow-soft", className)}>{children}</div>;
}
export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return <div className="mb-6 flex flex-wrap items-center justify-between gap-3"><h1 className="font-display text-2xl font-bold">{title}</h1><div className="flex flex-wrap gap-2">{children}</div></div>;
}
export function Stat({ label, value, tone = "default", icon }: { label: string; value: ReactNode; tone?: "default" | "success" | "warning" | "danger"; icon?: ReactNode }) {
  const toneCls = { default: "bg-primary/10 text-primary", success: "bg-success/15 text-success", warning: "bg-warning/20 text-warning-foreground", danger: "bg-destructive/10 text-destructive" }[tone];
  return (
    <Card className="flex items-center gap-4">
      {icon && <div className={cn("grid h-12 w-12 place-items-center rounded-xl", toneCls)}>{icon}</div>}
      <div><div className="text-sm text-muted-foreground">{label}</div><div className="font-display text-2xl font-bold tabular-nums">{value}</div></div>
    </Card>
  );
}
export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 p-4" onMouseDown={onClose}>
      <div className={cn("max-h-[92vh] w-full overflow-auto rounded-2xl bg-card p-6 shadow-xl", wide ? "max-w-3xl" : "max-w-lg")} onMouseDown={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between"><h2 className="font-display text-xl font-bold">{title}</h2><Button variant="ghost" size="icon" onClick={onClose}><X className="h-5 w-5" /></Button></div>
        {children}
      </div>
    </div>
  );
}
export function Table({ head, children }: { head: ReactNode[]; children: ReactNode }) {
  return (
    <div className="overflow-auto rounded-xl border border-border bg-card">
      <table className="w-full text-sm">
        <thead className="bg-muted text-muted-foreground"><tr>{head.map((h, i) => <th key={i} className="px-3 py-3 text-start font-semibold">{h}</th>)}</tr></thead>
        <tbody className="divide-y divide-border">{children}</tbody>
      </table>
    </div>
  );
}
export const Td = ({ children, className, colSpan }: { children?: ReactNode; className?: string; colSpan?: number }) => <td colSpan={colSpan} className={cn("px-3 py-2.5", className)}>{children}</td>;
export function Badge({ children, tone = "default", className }: { children: ReactNode; tone?: "default" | "success" | "warning" | "danger" | "info"; className?: string }) {
  const c = { default: "bg-muted text-foreground", info: "bg-primary/15 text-primary", success: "bg-success/15 text-success", warning: "bg-warning/25 text-warning-foreground", danger: "bg-destructive/10 text-destructive" }[tone];
  return <span className={cn("inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold", c, className)}>{children}</span>;
}

export function readFileAsDataURL(file: File, maxSize = 400): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = reject;
    r.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = img.width * scale; c.height = img.height * scale;
        c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL("image/png"));
      };
      img.src = r.result as string;
    };
    r.readAsDataURL(file);
  });
}
export const dayStart = (s: string) => new Date(s + "T00:00:00").getTime();
export const dayEnd = (s: string) => new Date(s + "T23:59:59.999").getTime();
export const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
