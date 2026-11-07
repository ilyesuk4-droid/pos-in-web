import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  HelpCircle, Keyboard, Minus, Plus, RotateCcw, ScanLine, Trash2, UserPlus, Zap, X, Camera, AlertTriangle, Check, QrCode
} from "lucide-react";
import { QrPairingModal } from "@/components/QrPairingModal";
import { CameraScannerModal, type ScanResult } from "@/components/CameraScanner";
import { toast } from "sonner";
import {
  customersRepo, flexiRepo, productsRepo, salesRepo, settingsRepo, useData,
  type FlexiOperator, type PaymentStatus, type PriceType, type Product,
} from "@/data";
import { useI18n } from "@/lib/i18n";
import { usePrint } from "@/components/print";
import { Receipt } from "@/components/Receipt";
import { ReturnModal } from "@/components/ReturnModal";
import { Button, Card, Field, Input, Modal, Select } from "@/components/ui-kit";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/pos")({
  head: () => ({
    meta: [
      { title: "البيع — نقطة البيع" },
      { name: "description", content: "Fast barcode checkout with cash, partial and credit payments." },
      { property: "og:title", content: "البيع — نقطة البيع" },
      { property: "og:description", content: "Fast barcode checkout with cash, partial and credit payments." },
    ],
  }),
  component: POS,
});

// productId: -1 is used as a sentinel for flexi line items (no stock deduction)
interface CartLine {
  product: Product;
  qty: number;
  priceType: PriceType;
  unitPrice: number;
}

function POS() {
  const { t, money, fmtDate } = useI18n();
  const print = usePrint();
  const products = useData(() => productsRepo.list(), []) ?? [];
  const customers = useData(() => customersRepo.list(), []) ?? [];
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [discount, setDiscount] = useState(0);
  const [status, setStatus] = useState<PaymentStatus>("paid");
  const [paid, setPaid] = useState(0);
  const [customerId, setCustomerId] = useState<number | "">("");
  const [newCust, setNewCust] = useState(false);
  const [flexiModal, setFlexiModal] = useState(false);
  const [returnModal, setReturnModal] = useState(false);
  const [shortcutsHelp, setShortcutsHelp] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [qrPairingOpen, setQrPairingOpen] = useState(false);
  const [unknownBarcode, setUnknownBarcode] = useState<string | null>(null);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickAddBarcode, setQuickAddBarcode] = useState("");
  const [quickName, setQuickName] = useState("");
  const [quickPrice, setQuickPrice] = useState<number | "">("");
  const [quickCost, setQuickCost] = useState<number | "">("");
  const [quickStock, setQuickStock] = useState<number | "">(10);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleCameraScan(res: ScanResult) {
    const code = res.code.trim();
    if (!code) return;
    const p = await productsRepo.getByBarcode(code);
    if (p) {
      add(p);
      toast.success(`${p.name} (+1)`, { icon: "🛒" });
    } else {
      toast.error(`${t("unknownBarcode")}: ${code}`);
      setUnknownBarcode(code);
    }
  }

  async function handleQuickAddSave() {
    if (!quickName.trim()) {
      toast.error(t("name") + " مطلوب");
      return;
    }
    const retailPrice = Number(quickPrice) || 0;
    const purchasePrice = Number(quickCost) || 0;
    const stock = Number(quickStock) || 0;

    const id = await productsRepo.save({
      name: quickName.trim(),
      barcode: quickAddBarcode,
      brand: "",
      purchasePrice,
      retailPrice,
      wholesalePrice: retailPrice,
      stock,
      minStock: 2,
      notes: "",
      createdAt: Date.now(),
    });

    const created = await productsRepo.get(id);
    if (created) {
      add(created);
      toast.success(`${created.name} (${t("saved")})`);
    }
    setQuickAddOpen(false);
    setQuickAddBarcode("");
    setQuickName("");
    setQuickPrice("");
    setQuickCost("");
    setQuickStock(10);
  }

  // Listen to remote barcode scans sent from phone
  useEffect(() => {
    const handleRemoteScan = (e: Event) => {
      const code = (e as CustomEvent).detail;
      if (typeof code === "string" && code.trim()) {
        void handleCameraScan({ code: code.trim() });
      }
    };
    window.addEventListener("remote-barcode-scanned", handleRemoteScan);
    return () => window.removeEventListener("remote-barcode-scanned", handleRemoteScan);
  }, []);

  const subtotal = cart.reduce((s, l) => s + l.qty * l.unitPrice, 0);
  const total = Math.max(0, subtotal - discount);
  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return products
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.barcode.includes(q) ||
          p.brand.toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [query, products]);

  const focus = () => setTimeout(() => inputRef.current?.focus(), 0);

  function add(p: Product) {
    setCart((c) => {
      const i = c.findIndex((l) => l.product.id === p.id);
      if (i >= 0) return c.map((l, j) => (j === i ? { ...l, qty: l.qty + 1 } : l));
      return [...c, { product: p, qty: 1, priceType: "retail", unitPrice: p.retailPrice }];
    });
    if (p.stock <= 0) toast.warning(`${t("stockShort")}: ${p.name}`);
    setQuery("");
    focus();
  }

  async function onEnter() {
    const q = query.trim();
    if (!q) return;
    const p = await productsRepo.getByBarcode(q);
    if (p) return add(p);
    if (
      suggestions.length === 1 ||
      (suggestions[0] && suggestions[0].name.toLowerCase() === q.toLowerCase())
    )
      return add(suggestions[0]!);
    if (!suggestions.length) {
      toast.error(t("notFound"));
      setQuery("");
    }
  }

  const update = (i: number, patch: Partial<CartLine>) =>
    setCart((c) => c.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  function addFlexiLine(op: FlexiOperator, amount: number, salePrice: number) {
    const flexiProduct: Product = {
      id: -1,
      name: `${t("flexiTopup")} ${op.name}`,
      barcode: "",
      brand: "",
      purchasePrice: amount,
      retailPrice: salePrice,
      wholesalePrice: salePrice,
      stock: 999,
      minStock: 0,
      notes: "",
      createdAt: Date.now(),
    };
    setCart((c) => [...c, { product: flexiProduct, qty: 1, priceType: "retail", unitPrice: salePrice }]);
    setFlexiModal(false);
    focus();
  }

  async function checkout() {
    if (!cart.length) return;
    if (status !== "paid" && !customerId) {
      toast.error(t("needCustomer"));
      return;
    }
    const sale = await salesRepo.create({
      items: cart.map((l) => ({
        productId: l.product.id!,
        name: l.product.name,
        qty: l.qty,
        unitPrice: l.unitPrice,
        purchasePrice: l.product.purchasePrice,
        priceType: l.priceType,
      })),
      discount,
      paid,
      status,
      customerId: customerId || undefined,
    });
    const settings = await settingsRepo.get();
    toast.success(t("saleDone"));
    print(<Receipt sale={sale} settings={settings} money={money} fmtDate={fmtDate} t={t as never} />);
    setCart([]);
    setDiscount(0);
    setPaid(0);
    setStatus("paid");
    setCustomerId("");
    focus();
  }

  // Keyboard shortcuts: F2 = pay, F4 = new customer, Esc = clear cart, F1 = help
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // F2 = Pay / Checkout
      if (e.key === "F2") {
        e.preventDefault();
        if (cart.length > 0) {
          void checkout();
        } else {
          toast.info(t("emptyCart"));
        }
      }
      // F4 = New Customer
      if (e.key === "F4") {
        e.preventDefault();
        setNewCust(true);
      }
      // F1 = Shortcuts Help Overlay
      if (e.key === "F1") {
        e.preventDefault();
        setShortcutsHelp((prev) => !prev);
      }
      // Escape = clear cart if query is empty; else clears query
      if (e.key === "Escape") {
        if (query.trim().length > 0) {
          setQuery("");
        } else if (cart.length > 0) {
          e.preventDefault();
          if (confirm(t("confirmDelete") + " (" + t("emptyCart") + ")")) {
            setCart([]);
            setDiscount(0);
            setPaid(0);
            toast.info(t("emptyCart"));
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [cart, customerId, discount, paid, query, status]);

  return (
    <div className="grid h-[calc(100vh-4rem)] gap-6 xl:grid-cols-[1fr_400px]">
      <div className="flex min-h-0 flex-col gap-4">
        {/* Search & Action bar */}
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <ScanLine className="pointer-events-none absolute start-4 top-1/2 h-6 w-6 -translate-y-1/2 text-primary" />
              <Input
                ref={inputRef}
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("scanHint")}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void onEnter();
                  }
                }}
                className="h-16 ps-14 text-xl"
              />
            {suggestions.length > 0 && (
              <div className="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-xl border border-border bg-card shadow-xl">
                {suggestions.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => add(p)}
                    className="flex w-full items-center justify-between px-4 py-3 text-start hover:bg-muted"
                  >
                    <span className="font-medium">
                      {p.name} <span className="text-sm text-muted-foreground">{p.brand}</span>
                    </span>
                    <span className="tabular-nums text-muted-foreground">
                      {money(p.retailPrice)} · {p.stock}
                    </span>
                  </button>
                ))}
              </div>
            )}
            </div>

            <Button
              type="button"
              variant="outline"
              onClick={() => setCameraOpen(true)}
              className="h-16 px-4 gap-2 shrink-0 rounded-xl"
              title={t("scanWithCamera")}
            >
              <Camera className="h-6 w-6 text-primary" />
              <span className="hidden md:inline font-bold">{t("scanWithCamera")}</span>
            </Button>

            <Button
              type="button"
              variant="outline"
              onClick={() => setQrPairingOpen(true)}
              className="h-16 px-4 gap-2 shrink-0 rounded-xl border-primary/30 bg-primary/5 text-primary hover:bg-primary/10"
              title="ربط الهاتف كقارئ باركود لاسلكي عبر كود QR"
            >
              <QrCode className="h-6 w-6" />
              <span className="hidden lg:inline font-bold">ربط الهاتف (QR)</span>
            </Button>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShortcutsHelp(true)}
                title="F1"
                className="text-xs text-muted-foreground"
              >
                <Keyboard className="h-4 w-4" />
                <span>{t("posShortcuts")}</span>
                <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] font-bold">F1</span>
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setReturnModal(true)}>
                <RotateCcw className="h-4 w-4 text-primary" />
                {t("returnExchange")}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setFlexiModal(true)}>
                <Zap className="h-4 w-4 text-warning" />
                {t("flexiTopup")}
              </Button>
            </div>
          </div>
        </div>

        {/* Cart items list */}
        <Card className="min-h-0 flex-1 overflow-auto p-0">
          {cart.length === 0 ? (
            <div className="grid h-full place-items-center p-10 text-center text-lg text-muted-foreground">
              <div>
                <div className="mx-auto mb-3 grid h-16 w-16 place-items-center rounded-2xl bg-muted/60">
                  <ScanLine className="h-8 w-8 text-muted-foreground/60" />
                </div>
                <div className="font-display font-bold text-foreground">{t("emptyCart")}</div>
                <p className="mt-1 text-xs text-muted-foreground">
                  امسح الباركود أو اكتب اسم المنتج للبدء
                </p>
              </div>
            </div>
          ) : (
            <table className="w-full">
              <thead className="sticky top-0 bg-muted text-sm text-muted-foreground">
                <tr>
                  <th className="p-3 text-start">{t("name")}</th>
                  <th className="p-3">{t("price")}</th>
                  <th className="p-3">{t("qty")}</th>
                  <th className="p-3 text-end">{t("total")}</th>
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {cart.map((l, i) => (
                  <tr key={`${l.product.id}-${i}`}>
                    <td className="p-3">
                      <div className="font-semibold">{l.product.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {l.product.barcode} · {t("stock")}: {l.product.id === -1 ? "—" : l.product.stock}
                      </div>
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        {l.product.id !== -1 && (
                          <Select
                            className="h-10 w-24"
                            value={l.priceType}
                            onChange={(e) => {
                              const pt = e.target.value as PriceType;
                              update(i, {
                                priceType: pt,
                                unitPrice:
                                  pt === "retail"
                                    ? l.product.retailPrice
                                    : l.product.wholesalePrice,
                              });
                            }}
                          >
                            <option value="retail">{t("retail")}</option>
                            <option value="wholesale">{t("wholesale")}</option>
                          </Select>
                        )}
                        <Input
                          type="number"
                          className="h-10 w-28"
                          value={l.unitPrice}
                          onChange={(e) => update(i, { unitPrice: Number(e.target.value) })}
                        />
                      </div>
                    </td>
                    <td className="p-3">
                      <div className="flex items-center justify-center gap-1">
                        <Button
                          size="icon"
                          variant="outline"
                          onClick={() => update(i, { qty: Math.max(1, l.qty - 1) })}
                        >
                          <Minus className="h-4 w-4" />
                        </Button>
                        <Input
                          type="number"
                          min={1}
                          className="h-9 w-16 text-center"
                          value={l.qty}
                          onChange={(e) =>
                            update(i, { qty: Math.max(1, Number(e.target.value)) })
                          }
                        />
                        <Button
                          size="icon"
                          variant="outline"
                          onClick={() => update(i, { qty: l.qty + 1 })}
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                    <td className="p-3 text-end font-bold tabular-nums">
                      {money(l.qty * l.unitPrice)}
                    </td>
                    <td className="p-3">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setCart((c) => c.filter((_, j) => j !== i))}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>

      {/* Payment / Checkout Summary Card */}
      <Card className="flex flex-col gap-4">
        <div className="flex justify-between text-muted-foreground">
          <span>{t("subtotal")}</span>
          <span className="tabular-nums">{money(subtotal)}</span>
        </div>
        <Field label={t("discount")}>
          <Input
            type="number"
            min={0}
            value={discount || ""}
            onChange={(e) => setDiscount(Number(e.target.value))}
          />
        </Field>
        <div className="rounded-xl bg-primary p-4 text-primary-foreground shadow-sm">
          <div className="text-sm opacity-80">{t("total")}</div>
          <div className="font-display text-4xl font-extrabold tabular-nums">{money(total)}</div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {(["paid", "partial", "credit"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={cn(
                "h-12 rounded-lg border font-semibold transition",
                status === s
                  ? "border-primary bg-primary/10 text-primary shadow-xs"
                  : "border-border hover:bg-muted"
              )}
            >
              {t(s === "paid" ? "fullyPaid" : s)}
            </button>
          ))}
        </div>
        {status === "partial" && (
          <Field label={t("paid")}>
            <Input
              type="number"
              value={paid || ""}
              onChange={(e) => setPaid(Number(e.target.value))}
            />
          </Field>
        )}
        {status !== "paid" && (
          <Field label={t("customer")}>
            <div className="flex gap-2">
              <Select
                value={customerId}
                onChange={(e) =>
                  setCustomerId(e.target.value ? Number(e.target.value) : "")
                }
              >
                <option value="">{t("selectCustomer")}</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.phone && `(${c.phone})`}
                  </option>
                ))}
              </Select>
              <Button
                variant="outline"
                title="F4"
                onClick={() => setNewCust(true)}
              >
                <UserPlus className="h-5 w-5" />
              </Button>
            </div>
          </Field>
        )}
        {status === "partial" && (
          <div className="flex justify-between font-semibold text-destructive">
            <span>{t("remaining")}</span>
            <span>{money(Math.max(0, total - paid))}</span>
          </div>
        )}
        <div className="flex-1" />
        <Button
          id="checkout-btn"
          variant="success"
          size="lg"
          className="h-16 text-xl shadow-md"
          disabled={!cart.length}
          onClick={checkout}
        >
          {t("checkout")}
        </Button>
      </Card>

      {/* New Customer Modal */}
      <NewCustomerModal
        open={newCust}
        onClose={() => setNewCust(false)}
        onCreated={(id) => setCustomerId(id)}
      />

      {/* Flexi in POS Modal */}
      <FlexiCartModal
        open={flexiModal}
        onClose={() => setFlexiModal(false)}
        onAdd={addFlexiLine}
        t={t}
        money={money}
      />

      {/* Return & Exchange Modal */}
      <ReturnModal
        open={returnModal}
        onClose={() => setReturnModal(false)}
      />

      {/* Shortcuts Help Overlay */}
      <ShortcutsOverlay
        open={shortcutsHelp}
        onClose={() => setShortcutsHelp(false)}
        t={t}
      />

      {/* QR Phone Pairing Modal */}
      <QrPairingModal
        open={qrPairingOpen}
        onClose={() => setQrPairingOpen(false)}
        onScanReceived={(code) => handleCameraScan({ code })}
      />

      {/* Camera Barcode Scanner Modal */}
      <CameraScannerModal
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        title={t("scanWithCamera")}
        subtitle="امسح الباركود لإضافته للسلة فوراً"
        continuous
        onScan={handleCameraScan}
      />

      {/* Unknown Barcode Dialog */}
      <Modal
        open={!!unknownBarcode}
        onClose={() => setUnknownBarcode(null)}
        title={t("unknownBarcode")}
      >
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-xl border border-warning/40 bg-warning/10 p-3.5 text-warning-foreground">
            <AlertTriangle className="h-6 w-6 shrink-0 text-warning" />
            <div>
              <div className="font-bold">{t("unknownBarcode")}</div>
              <div className="font-mono text-xs">{unknownBarcode}</div>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">{t("unknownBarcodeDesc")}</p>
          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button variant="outline" onClick={() => setUnknownBarcode(null)}>
              {t("cancel")}
            </Button>
            <Button
              variant="primary"
              className="gap-1.5"
              onClick={() => {
                const code = unknownBarcode!;
                setUnknownBarcode(null);
                setQuickAddBarcode(code);
                setQuickAddOpen(true);
              }}
            >
              <Plus className="h-4 w-4" />
              <span>{t("addProductWithBarcode")}</span>
            </Button>
          </div>
        </div>
      </Modal>

      {/* Quick Add Product Modal */}
      <Modal
        open={quickAddOpen}
        onClose={() => setQuickAddOpen(false)}
        title={t("quickAddProduct")}
      >
        <div className="space-y-4">
          <div className="text-xs text-muted-foreground flex items-center justify-between border-b border-border pb-2">
            <span>{t("barcode")}:</span>
            <span className="font-mono font-bold text-foreground">{quickAddBarcode}</span>
          </div>

          <Field label={t("name")}>
            <Input
              autoFocus
              value={quickName}
              onChange={(e) => setQuickName(e.target.value)}
              placeholder="مثال: شاحن سريع 20W"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label={t("retailPrice")}>
              <Input
                type="number"
                value={quickPrice}
                onChange={(e) => setQuickPrice(e.target.value ? Number(e.target.value) : "")}
              />
            </Field>
            <Field label={t("purchasePrice")}>
              <Input
                type="number"
                value={quickCost}
                onChange={(e) => setQuickCost(e.target.value ? Number(e.target.value) : "")}
              />
            </Field>
          </div>

          <Field label={t("stock")}>
            <Input
              type="number"
              value={quickStock}
              onChange={(e) => setQuickStock(e.target.value ? Number(e.target.value) : "")}
            />
          </Field>

          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button variant="outline" onClick={() => setQuickAddOpen(false)}>
              {t("cancel")}
            </Button>
            <Button variant="success" onClick={handleQuickAddSave} className="gap-1.5">
              <Check className="h-4 w-4" />
              <span>{t("save")}</span>
            </Button>
          </div>
        </div>
      </Modal>

      {/* Mobile Sticky Bar for Checkout */}
      <div className="fixed bottom-0 inset-x-0 z-30 flex items-center justify-between border-t border-border bg-card/95 p-3 backdrop-blur-md xl:hidden shadow-lg">
        <div>
          <div className="text-xs text-muted-foreground">{t("total")}</div>
          <div className="font-display text-xl font-extrabold text-primary tabular-nums">{money(total)}</div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => setCameraOpen(true)}
          >
            <Camera className="h-4 w-4 text-primary" />
            <span className="hidden sm:inline">{t("scanWithCamera")}</span>
          </Button>
          <Button
            variant="success"
            size="sm"
            className="px-5 font-bold shadow-md"
            disabled={!cart.length}
            onClick={checkout}
          >
            {t("checkout")}
          </Button>
        </div>
      </div>

      {/* Floating Camera Button (Mobile FAB) */}
      <button
        type="button"
        onClick={() => setCameraOpen(true)}
        className="fixed bottom-20 end-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-2xl hover:scale-105 active:scale-95 transition-all xl:hidden"
        title={t("scanWithCamera")}
      >
        <Camera className="h-6 w-6" />
      </button>
    </div>
  );
}

function ShortcutsOverlay({
  open,
  onClose,
  t,
}: {
  open: boolean;
  onClose: () => void;
  t: (k: any) => string;
}) {
  if (!open) return null;

  const shortcuts = [
    { key: "F2", label: t("shortcutF2"), desc: "تأكيد البيع وطباعة الوصل فوراً" },
    { key: "F4", label: t("shortcutF4"), desc: "فتح نافذة تسجيل زبون كريدي جديد" },
    { key: "Esc", label: t("shortcutEsc"), desc: "تفريغ محتويات السلة أو مسح حقل البحث" },
    { key: "Enter", label: t("shortcutEnter"), desc: "إضافة المنتج تلقائياً عند مسح الباركود" },
    { key: "F1", label: t("shortcutF1"), desc: "عرض أو إخفاء هذه اللائحة" },
  ];

  return (
    <Modal open={open} onClose={onClose} title={t("shortcutsHelpTitle")}>
      <div className="space-y-4">
        <div className="divide-y divide-border rounded-xl border border-border">
          {shortcuts.map((s) => (
            <div key={s.key} className="flex items-center justify-between p-3">
              <div>
                <div className="font-semibold">{s.label}</div>
                <div className="text-xs text-muted-foreground">{s.desc}</div>
              </div>
              <kbd className="inline-flex h-8 min-w-10 items-center justify-center rounded-lg border border-border bg-muted px-2.5 font-mono text-sm font-bold shadow-xs">
                {s.key}
              </kbd>
            </div>
          ))}
        </div>
        <Button className="w-full" onClick={onClose}>
          {t("close")}
        </Button>
      </div>
    </Modal>
  );
}

function NewCustomerModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (id: number) => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");

  return (
    <Modal open={open} onClose={onClose} title={t("newCustomer")}>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!name.trim()) return;
          const id = await customersRepo.save({
            name: name.trim(),
            phone,
            balance: 0,
            createdAt: Date.now(),
          });
          onCreated(id as number);
          setName("");
          setPhone("");
          onClose();
        }}
      >
        <Field label={t("name")}>
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field label={t("phone")}>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
        <Button type="submit" className="w-full">
          {t("save")}
        </Button>
      </form>
    </Modal>
  );
}

const QUICK_AMOUNTS = [50, 100, 200, 500, 1000];

function FlexiCartModal({
  open,
  onClose,
  onAdd,
  t,
  money,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (op: FlexiOperator, amount: number, salePrice: number) => void;
  t: (k: any) => string;
  money: (n: number) => string;
}) {
  const operators = useData(() => flexiRepo.listOperators(), []) ?? [];
  const [opId, setOpId] = useState("");
  const [amount, setAmount] = useState(0);
  const [salePrice, setSalePrice] = useState(0);

  const op = operators.find((o) => o.id === Number(opId));

  function applyAmount(a: number) {
    setAmount(a);
    const margin = op?.marginPct ?? 0;
    setSalePrice(Math.round(a * (1 + margin / 100)));
  }

  function handleAdd() {
    if (!op || amount <= 0) return;
    onAdd(op, amount, salePrice);
    setOpId("");
    setAmount(0);
    setSalePrice(0);
  }

  return (
    <Modal open={open} onClose={onClose} title={t("flexiSaleNew")}>
      <div className="grid gap-4">
        <Field label={t("operator")}>
          <div className="flex flex-wrap gap-2">
            {operators.map((o) => (
              <button
                key={o.id}
                onClick={() => {
                  setOpId(String(o.id));
                  setAmount(0);
                  setSalePrice(0);
                }}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg border-2 px-3 py-1.5 text-sm font-bold transition",
                  opId === String(o.id)
                    ? "border-current"
                    : "border-transparent bg-muted opacity-70 hover:opacity-100"
                )}
                style={{
                  color: o.color,
                  borderColor: opId === String(o.id) ? o.color : undefined,
                }}
              >
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: o.color }}
                />
                {o.name}
              </button>
            ))}
          </div>
        </Field>
        {op && (
          <>
            <div className="flex flex-wrap gap-2">
              {QUICK_AMOUNTS.map((a) => (
                <button
                  key={a}
                  onClick={() => applyAmount(a)}
                  className={cn(
                    "h-12 w-20 rounded-lg border-2 font-display text-lg font-bold transition",
                    amount === a
                      ? "border-current text-white"
                      : "border-border bg-card hover:bg-muted"
                  )}
                  style={
                    amount === a
                      ? { borderColor: op.color, backgroundColor: op.color }
                      : {}
                  }
                >
                  {a}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("sendAmount")}>
                <Input
                  type="number"
                  min={0}
                  value={amount || ""}
                  onChange={(e) => applyAmount(+e.target.value)}
                />
              </Field>
              <Field label={t("salePrice")}>
                <Input
                  type="number"
                  min={0}
                  value={salePrice || ""}
                  onChange={(e) => setSalePrice(+e.target.value)}
                />
              </Field>
            </div>
          </>
        )}
        <Button size="lg" disabled={!op || !amount} onClick={handleAdd}>
          <Zap className="h-4 w-4" />
          {t("add")} — {money(salePrice || 0)}
        </Button>
      </div>
    </Modal>
  );
}
