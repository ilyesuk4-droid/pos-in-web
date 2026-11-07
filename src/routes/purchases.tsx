import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Trash2, Camera } from "lucide-react";
import { CameraScannerModal, type ScanResult } from "@/components/CameraScanner";
import { toast } from "sonner";
import { productsRepo, purchasesRepo, suppliersRepo, useData, type PurchaseLine } from "@/data";
import { useI18n } from "@/lib/i18n";
import { Button, Card, Field, Input, PageHeader, Select, Table, Td } from "@/components/ui-kit";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/purchases")({
  head: () => ({
    meta: [
      { title: "المشتريات — نقطة البيع" },
      { name: "description", content: "Record incoming stock and manage suppliers." },
      { property: "og:title", content: "المشتريات — نقطة البيع" },
      { property: "og:description", content: "Record incoming stock and manage suppliers." },
    ],
  }),
  component: Purchases,
});

function Purchases() {
  const { t } = useI18n();
  const [tab, setTab] = useState<"new" | "history" | "suppliers">("new");
  return (
    <>
      <PageHeader title={t("purchases")}>
        {(["new", "history", "suppliers"] as const).map((k) => (
          <Button key={k} variant={tab === k ? "primary" : "outline"} onClick={() => setTab(k)}>{t(k === "new" ? "newPurchase" : k)}</Button>
        ))}
      </PageHeader>
      {tab === "new" && <NewPurchase />}
      {tab === "history" && <History />}
      {tab === "suppliers" && <Suppliers />}
    </>
  );
}

function NewPurchase() {
  const { t, money } = useI18n();
  const products = useData(() => productsRepo.list(), []) ?? [];
  const suppliers = useData(() => suppliersRepo.list(), []) ?? [];
  const [supplierId, setSupplierId] = useState<number | "">("");
  const [lines, setLines] = useState<PurchaseLine[]>([]);
  const [q, setQ] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const matches = useMemo(() => q.length < 1 ? [] : products.filter((p) => p.name.toLowerCase().includes(q.toLowerCase()) || p.barcode === q).slice(0, 6), [q, products]);
  const add = (id: number) => {
    const p = products.find((x) => x.id === id)!;
    setLines((l) => l.some((x) => x.productId === id) ? l : [...l, { productId: id, name: p.name, qty: 1, purchasePrice: p.purchasePrice }]);
    setQ("");
  };
  const upd = (i: number, patch: Partial<PurchaseLine>) => setLines((l) => l.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const total = lines.reduce((s, l) => s + l.qty * l.purchasePrice, 0);
  return (
    <Card className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <Field label={t("supplier")}>
          <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value ? Number(e.target.value) : "")}>
            <option value="">—</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </Field>
        <Field label={t("addLine")}>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("search")}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (matches[0]) add(matches[0].id!); } }} />
              {matches.length > 0 && (
                <div className="absolute inset-x-0 top-full z-10 mt-1 rounded-lg border border-border bg-card shadow-xl">
                  {matches.map((p) => <button key={p.id} type="button" onClick={() => add(p.id!)} className="block w-full px-3 py-2 text-start hover:bg-muted">{p.name} <span className="text-xs text-muted-foreground">({p.stock})</span></button>)}
                </div>
              )}
            </div>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="shrink-0"
              title={t("scanWithCamera")}
              onClick={() => setScannerOpen(true)}
            >
              <Camera className="h-4 w-4 text-primary" />
            </Button>
          </div>
        </Field>
      </div>
      <Table head={[t("name"), t("qty"), t("purchasePrice"), t("total"), ""]}>
        {lines.map((l, i) => (
          <tr key={l.productId}>
            <Td className="font-semibold">{l.name}</Td>
            <Td><Input type="number" className="h-10 w-24" value={l.qty} onChange={(e) => upd(i, { qty: Math.max(1, Number(e.target.value)) })} /></Td>
            <Td><Input type="number" className="h-10 w-32" value={l.purchasePrice} onChange={(e) => upd(i, { purchasePrice: Number(e.target.value) })} /></Td>
            <Td className="tabular-nums">{money(l.qty * l.purchasePrice)}</Td>
            <Td><Button size="icon" variant="ghost" onClick={() => setLines((x) => x.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4 text-destructive" /></Button></Td>
          </tr>
        ))}
      </Table>
      <div className="flex items-center justify-between">
        <div className="font-display text-2xl font-bold">{t("total")}: {money(total)}</div>
        <Button size="lg" variant="success" disabled={!lines.length} onClick={async () => { await purchasesRepo.create(supplierId || undefined, lines); setLines([]); toast.success(t("saved")); }}>{t("savePurchase")}</Button>
      </div>

      <CameraScannerModal
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        title={t("scanWithCamera")}
        continuous
        onScan={(res: ScanResult) => {
          const clean = res.code.trim();
          const p = products.find((x) => x.barcode === clean);
          if (p && p.id) {
            setLines((curr) => {
              const idx = curr.findIndex((x) => x.productId === p.id);
              if (idx >= 0) {
                return curr.map((x, j) => (j === idx ? { ...x, qty: x.qty + 1 } : x));
              }
              return [...curr, { productId: p.id!, name: p.name, qty: 1, purchasePrice: p.purchasePrice }];
            });
            toast.success(`${p.name} (+1)`);
          } else {
            toast.error(`${t("unknownBarcode")}: ${clean}`);
          }
        }}
      />
    </Card>
  );
}

function History() {
  const { t, money, fmtDate } = useI18n();
  const list = useData(() => purchasesRepo.list(), []) ?? [];
  return (
    <Table head={[t("date"), t("supplier"), t("items"), t("total")]}>
      {list.map((p) => (
        <tr key={p.id}><Td>{fmtDate(p.date)}</Td><Td>{p.supplierName ?? "—"}</Td><Td className="text-xs">{p.items.map((l) => `${l.name} ×${l.qty}`).join("، ")}</Td><Td className="font-semibold">{money(p.total)}</Td></tr>
      ))}
    </Table>
  );
}

function Suppliers() {
  const { t } = useI18n();
  const list = useData(() => suppliersRepo.list(), []) ?? [];
  const [name, setName] = useState(""); const [phone, setPhone] = useState("");
  return (
    <Card className="max-w-2xl">
      <form className="mb-4 flex gap-2" onSubmit={async (e) => { e.preventDefault(); if (!name.trim()) return; await suppliersRepo.save({ name: name.trim(), phone }); setName(""); setPhone(""); }}>
        <Input placeholder={t("name")} value={name} onChange={(e) => setName(e.target.value)} />
        <Input placeholder={t("phone")} value={phone} onChange={(e) => setPhone(e.target.value)} />
        <Button type="submit">{t("add")}</Button>
      </form>
      <ul className="divide-y divide-border">{list.map((s) => (
        <li key={s.id} className={cn("flex items-center justify-between py-2")}><span><b>{s.name}</b> <span className="text-muted-foreground">{s.phone}</span></span>
          <Button size="icon" variant="ghost" onClick={() => confirm(t("confirmDelete")) && suppliersRepo.remove(s.id!)}><Trash2 className="h-4 w-4 text-destructive" /></Button></li>
      ))}</ul>
    </Card>
  );
}
