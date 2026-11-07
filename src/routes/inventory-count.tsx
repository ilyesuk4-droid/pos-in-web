import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import {
  ClipboardCheck,
  Camera,
  Search,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Save,
  Plus,
  Minus,
  Trash2,
  Package,
} from "lucide-react";
import { toast } from "sonner";
import { productsRepo, useData, type Product } from "@/data";
import { useI18n } from "@/lib/i18n";
import { Button, Card, Field, Input, Modal, PageHeader, Table, Td, Badge } from "@/components/ui-kit";
import { CameraScannerModal, type ScanResult } from "@/components/CameraScanner";

export const Route = createFileRoute("/inventory-count")({
  head: () => ({
    meta: [
      { title: "جرد المخزون — متجر الهواتف" },
      { name: "description", content: "Scan and count physical stock and apply inventory adjustments." },
    ],
  }),
  component: InventoryCountPage,
});

function InventoryCountPage() {
  const { t } = useI18n();
  const products = useData(() => productsRepo.list(), []) ?? [];

  // Map of productId -> counted quantity
  const [counts, setCounts] = useState<Record<number, number>>({});
  const [cameraOpen, setCameraOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [isApplying, setIsApplying] = useState(false);

  // Filter suggestions for manual search
  const suggestions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return products
      .filter((p) => p.name.toLowerCase().includes(q) || p.barcode.includes(q))
      .slice(0, 6);
  }, [searchQuery, products]);

  // Handle barcode scanned from camera or manual
  function handleCountItem(product: Product, delta = 1) {
    if (!product.id) return;
    setCounts((prev) => {
      const current = prev[product.id!] ?? 0;
      const next = Math.max(0, current + delta);
      return { ...prev, [product.id!]: next };
    });
    const current = counts[product.id] ?? 0;
    toast.success(`${product.name}: ${current + delta}`, { icon: "📦" });
  }

  function handleScan(result: ScanResult) {
    const clean = result.code.trim();
    const product = products.find((p) => p.barcode === clean);
    if (product) {
      handleCountItem(product, 1);
    } else {
      toast.error(`${t("unknownBarcode")}: ${clean}`);
    }
  }

  function removeProductFromCount(productId: number) {
    setCounts((prev) => {
      const next = { ...prev };
      delete next[productId];
      return next;
    });
  }

  function setCountDirectly(productId: number, val: number) {
    setCounts((prev) => ({
      ...prev,
      [productId]: Math.max(0, val),
    }));
  }

  // Counted items list with details
  const countedItems = useMemo(() => {
    return Object.entries(counts)
      .map(([idStr, countedQty]) => {
        const id = Number(idStr);
        const product = products.find((p) => p.id === id);
        if (!product) return null;
        const systemStock = product.stock;
        const diff = countedQty - systemStock;
        return {
          product,
          countedQty,
          systemStock,
          diff,
        };
      })
      .filter(Boolean) as Array<{
      product: Product;
      countedQty: number;
      systemStock: number;
      diff: number;
    }>;
  }, [counts, products]);

  // Statistics
  const stats = useMemo(() => {
    let matching = 0;
    let surplus = 0;
    let deficit = 0;
    for (const item of countedItems) {
      if (item.diff === 0) matching++;
      else if (item.diff > 0) surplus++;
      else deficit++;
    }
    return { total: countedItems.length, matching, surplus, deficit };
  }, [countedItems]);

  // Items that have a difference and will be adjusted
  const itemsToAdjust = useMemo(() => {
    return countedItems.filter((item) => item.diff !== 0);
  }, [countedItems]);

  // Apply adjustments to database and movements log
  async function applyAdjustments() {
    setIsApplying(true);
    try {
      for (const item of itemsToAdjust) {
        if (!item.product.id) continue;
        await productsRepo.adjustStock(
          item.product.id,
          item.countedQty,
          `${t("inventoryCount")}: ${item.diff > 0 ? "+" : ""}${item.diff}`
        );
      }
      toast.success(t("adjustmentsApplied"));
      setConfirmModalOpen(false);
      setCounts({});
    } catch {
      toast.error("فشل تطبيق تعديلات الجرد");
    } finally {
      setIsApplying(false);
    }
  }

  // Load all products into count session initialized to current system stock
  function loadAllProducts() {
    if (countedItems.length > 0 && !confirm("سيتم استبدال الجرد الحالي بكل المنتجات. هل تريد المتابعة؟")) {
      return;
    }
    const initCounts: Record<number, number> = {};
    for (const p of products) {
      if (p.id) initCounts[p.id] = p.stock;
    }
    setCounts(initCounts);
    toast.info(`تم تحميل ${products.length} منتج`);
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t("inventoryCount")}>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={loadAllProducts}>
            <Package className="h-4 w-4" />
            <span>تحميل كل المنتجات ({products.length})</span>
          </Button>

          {countedItems.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (confirm(t("confirmDelete") + " (" + t("resetCount") + ")")) {
                  setCounts({});
                }
              }}
              className="text-destructive hover:bg-destructive/10"
            >
              <RotateCcw className="h-4 w-4" />
              <span>{t("resetCount")}</span>
            </Button>
          )}

          <Button
            variant="primary"
            size="sm"
            onClick={() => setCameraOpen(true)}
            className="gap-2 shadow-md"
          >
            <Camera className="h-4 w-4" />
            <span>{t("scanWithCamera")}</span>
          </Button>
        </div>
      </PageHeader>

      {/* Stats Summary Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">{t("items")}</div>
          <div className="font-display text-2xl font-bold tabular-nums">{stats.total}</div>
        </Card>
        <Card className="p-4 border-success/30 bg-success/5">
          <div className="text-xs text-success font-medium">{t("matching")}</div>
          <div className="font-display text-2xl font-bold text-success tabular-nums">{stats.matching}</div>
        </Card>
        <Card className="p-4 border-amber-500/30 bg-amber-500/5">
          <div className="text-xs text-amber-500 font-medium">{t("surplus")}</div>
          <div className="font-display text-2xl font-bold text-amber-500 tabular-nums">{stats.surplus}</div>
        </Card>
        <Card className="p-4 border-destructive/30 bg-destructive/5">
          <div className="text-xs text-destructive font-medium">{t("deficit")}</div>
          <div className="font-display text-2xl font-bold text-destructive tabular-nums">{stats.deficit}</div>
        </Card>
      </div>

      {/* Manual Search & Barcode Scan Input Bar */}
      <Card className="p-4 space-y-2">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute start-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("scanOrSearch")}
              className="ps-11 h-12"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (suggestions[0]) {
                    handleCountItem(suggestions[0], 1);
                    setSearchQuery("");
                  }
                }
              }}
            />
            {suggestions.length > 0 && (
              <div className="absolute inset-x-0 top-full z-20 mt-1 max-h-60 overflow-auto rounded-xl border border-border bg-card shadow-xl">
                {suggestions.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      handleCountItem(p, 1);
                      setSearchQuery("");
                    }}
                    className="flex w-full items-center justify-between px-4 py-2.5 text-start hover:bg-muted"
                  >
                    <div>
                      <div className="font-medium">{p.name}</div>
                      <div className="text-xs text-muted-foreground font-mono">{p.barcode || "—"}</div>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {t("stock")}: <span className="font-bold">{p.stock}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <Button
            type="button"
            variant="outline"
            onClick={() => setCameraOpen(true)}
            className="h-12 px-4 gap-2 shrink-0"
          >
            <Camera className="h-5 w-5 text-primary" />
            <span className="hidden sm:inline font-bold">{t("scanWithCamera")}</span>
          </Button>
        </div>
      </Card>

      {/* Counted Items Table */}
      {countedItems.length === 0 ? (
        <Card className="py-16 text-center text-muted-foreground">
          <ClipboardCheck className="mx-auto mb-3 h-12 w-12 opacity-40 text-primary" />
          <p className="font-semibold">{t("noItemsCounted")}</p>
          <p className="mt-1 text-xs">{t("inventoryCountDesc")}</p>
          <div className="mt-4 flex justify-center gap-2">
            <Button variant="primary" size="sm" onClick={() => setCameraOpen(true)}>
              <Camera className="h-4 w-4" />
              <span>{t("scanWithCamera")}</span>
            </Button>
          </div>
        </Card>
      ) : (
        <Card className="p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <Table
              head={[
                t("name"),
                t("barcode"),
                t("systemStock"),
                t("countedStock"),
                t("stockDifference"),
                "",
              ]}
            >
              {countedItems.map((item) => (
                <tr key={item.product.id} className="border-b border-border/60 hover:bg-muted/30">
                  <Td className="font-semibold">
                    <div>{item.product.name}</div>
                    {item.product.brand && (
                      <span className="text-xs text-muted-foreground">{item.product.brand}</span>
                    )}
                  </Td>
                  <Td className="font-mono text-xs text-muted-foreground">
                    {item.product.barcode || "—"}
                  </Td>
                  <Td className="tabular-nums font-medium">{item.systemStock}</Td>
                  <Td>
                    <div className="flex items-center gap-1.5">
                      <Button
                        size="icon"
                        variant="outline"
                        className="h-8 w-8 rounded-lg"
                        onClick={() => handleCountItem(item.product, -1)}
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </Button>
                      <Input
                        type="number"
                        min={0}
                        value={item.countedQty}
                        onChange={(e) => setCountDirectly(item.product.id!, Number(e.target.value))}
                        className="h-8 w-16 text-center font-bold"
                      />
                      <Button
                        size="icon"
                        variant="outline"
                        className="h-8 w-8 rounded-lg"
                        onClick={() => handleCountItem(item.product, 1)}
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </Td>
                  <Td>
                    {item.diff === 0 ? (
                      <Badge tone="success" className="gap-1">
                        <CheckCircle2 className="h-3 w-3" />
                        0 {t("matching")}
                      </Badge>
                    ) : item.diff > 0 ? (
                      <Badge tone="info" className="gap-1 font-bold">
                        +{item.diff} {t("surplus")}
                      </Badge>
                    ) : (
                      <Badge tone="danger" className="gap-1 font-bold">
                        {item.diff} {t("deficit")}
                      </Badge>
                    )}
                  </Td>
                  <Td className="text-end">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => removeProductFromCount(item.product.id!)}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </Td>
                </tr>
              ))}
            </Table>
          </div>

          {/* Action Footer */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border p-4 bg-muted/20">
            <div className="text-sm text-muted-foreground">
              {itemsToAdjust.length > 0 ? (
                <span className="font-semibold text-foreground">
                  سيتم تعديل {itemsToAdjust.length} منتج له فارق مخزون
                </span>
              ) : (
                <span className="text-success font-semibold flex items-center gap-1">
                  <CheckCircle2 className="h-4 w-4" />
                  جميع المواد المجرودة مطابقة تماماً
                </span>
              )}
            </div>

            <Button
              variant="success"
              disabled={itemsToAdjust.length === 0}
              onClick={() => setConfirmModalOpen(true)}
              className="gap-2 shadow-md"
            >
              <Save className="h-4 w-4" />
              <span>{t("applyStockAdjustments")}</span>
            </Button>
          </div>
        </Card>
      )}

      {/* Continuous Camera Scanner Modal */}
      <CameraScannerModal
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        title={t("inventoryCount")}
        subtitle="امسح أي منتج لإضافته للعد تلقائياً (+1)"
        continuous
        onScan={handleScan}
      />

      {/* Confirm Adjustments Modal */}
      <Modal
        open={confirmModalOpen}
        onClose={() => setConfirmModalOpen(false)}
        title={t("applyStockAdjustments")}
      >
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-xl border border-warning/40 bg-warning/10 p-3.5 text-warning-foreground">
            <AlertTriangle className="h-6 w-6 shrink-0 text-warning" />
            <div className="text-sm">
              <div className="font-bold">{t("confirmApplyAdjustments")}</div>
              <p className="mt-1 text-xs opacity-90">
                سيتم حفظ حركات التعديل وتسجيلها في تقرير حركة المخزون.
              </p>
            </div>
          </div>

          <div className="max-h-48 overflow-auto rounded-xl border border-border p-2 space-y-1 text-xs">
            {itemsToAdjust.map((it) => (
              <div key={it.product.id} className="flex justify-between py-1 px-2 hover:bg-muted rounded">
                <span>{it.product.name}</span>
                <span className={`font-mono font-bold ${it.diff > 0 ? "text-primary" : "text-destructive"}`}>
                  {it.systemStock} ➔ {it.countedQty} ({it.diff > 0 ? `+${it.diff}` : it.diff})
                </span>
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button variant="outline" onClick={() => setConfirmModalOpen(false)} disabled={isApplying}>
              {t("cancel")}
            </Button>
            <Button variant="success" onClick={applyAdjustments} disabled={isApplying} className="gap-2">
              <Save className="h-4 w-4" />
              <span>{isApplying ? "جارٍ الحفظ..." : t("applyStockAdjustments")}</span>
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
