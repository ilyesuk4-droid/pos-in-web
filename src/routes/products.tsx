import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import {
  AlertCircle, AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Package,
  PackageOpen, Pencil, Plus, Trash2, Upload, Sparkles, Camera
} from "lucide-react";
import { CameraScannerModal } from "@/components/CameraScanner";
import { toast } from "sonner";
import { categoriesRepo, productsRepo, useData, type Product } from "@/data";
import { useI18n } from "@/lib/i18n";
import {
  Badge, Button, Card, Field, Input, Modal, PageHeader, Select, Table, Td,
  readFileAsDataURL,
} from "@/components/ui-kit";

export const Route = createFileRoute("/products")({
  head: () => ({
    meta: [
      { title: "المنتجات — نقطة البيع" },
      { name: "description", content: "Manage phones and accessories, prices, stock and imports." },
      { property: "og:title", content: "المنتجات — نقطة البيع" },
      { property: "og:description", content: "Manage phones and accessories, prices, stock and imports." },
    ],
  }),
  component: Products,
});

const empty = (): Product => ({
  name: "",
  barcode: "",
  brand: "",
  purchasePrice: 0,
  retailPrice: 0,
  wholesalePrice: 0,
  stock: 0,
  minStock: 2,
  notes: "",
  createdAt: 0,
});

interface ImportRow {
  rowNum: number;
  name: string;
  barcode: string;
  categoryName?: string | undefined;
  brand: string;
  purchasePrice: number;
  retailPrice: number;
  wholesalePrice: number;
  stock: number;
  minStock: number;
  notes: string;
  errors: string[];
}

function Products() {
  const { t, money } = useI18n();
  const products = useData(() => productsRepo.list(), []) ?? [];
  const categories = useData(() => categoriesRepo.list(), []) ?? [];
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [low, setLow] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [adjusting, setAdjusting] = useState<Product | null>(null);
  const [importRows, setImportRows] = useState<ImportRow[] | null>(null);
  const [listScannerOpen, setListScannerOpen] = useState(false);
  const [duplicateConflict, setDuplicateConflict] = useState<{
    existing: Product;
    pendingProduct: Product;
  } | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const catName = (id?: number) => categories.find((c) => c.id === id)?.name ?? "—";

  const list = useMemo(
    () =>
      products.filter((p) => {
        const s = q.toLowerCase();
        if (
          s &&
          !(
            p.name.toLowerCase().includes(s) ||
            p.barcode.includes(s) ||
            p.brand.toLowerCase().includes(s)
          )
        )
          return false;
        if (cat && String(p.categoryId) !== cat) return false;
        if (low && p.stock > p.minStock) return false;
        return true;
      }),
    [products, q, cat, low]
  );

  // Generate and download .xlsx template
  async function downloadTemplate() {
    try {
      const XLSX = await import("xlsx");
      const headers = [
        [
          "name",
          "barcode",
          "category",
          "brand",
          "purchase price",
          "retail price",
          "wholesale price",
          "quantity",
          "min stock",
          "notes",
        ],
        [
          "Samsung Galaxy A15 128GB",
          "8806091234567",
          "هواتف ذكية",
          "Samsung",
          23000,
          26500,
          25000,
          8,
          2,
          "Dual SIM",
        ],
        [
          "Chargeur Type-C 25W Original",
          "6932101234567",
          "شواحن وكوابل",
          "Samsung",
          1200,
          2200,
          1700,
          20,
          5,
          "Super Fast Charging",
        ],
        [
          "Verre Trempé 9D Privacy",
          "6901443654321",
          "حماية وشاشات",
          "Generic",
          180,
          500,
          300,
          50,
          10,
          "Anti-espion",
        ],
      ];
      const ws = XLSX.utils.aoa_to_sheet(headers);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Template");
      XLSX.writeFile(wb, "products_template.xlsx");
    } catch {
      toast.error("Error creating template");
    }
  }

  // Parse Excel file and prepare validation preview
  async function handleFileSelect(file: File) {
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await file.arrayBuffer());
      const sheetName = wb.SheetNames[0];
      if (!sheetName) throw new Error("No sheet found");
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[sheetName]!);

      const pick = (r: Record<string, unknown>, keys: string[]) => {
        for (const k of Object.keys(r)) {
          if (keys.includes(k.trim().toLowerCase())) return r[k];
        }
        return undefined;
      };
      const num = (v: unknown) => Number(String(v ?? 0).replace(/[^\d.-]/g, "")) || 0;

      const validated: ImportRow[] = rows.map((r, index) => {
        const name = String(pick(r, ["name", "nom", "الاسم", "المنتج", "article"]) ?? "").trim();
        const barcode = String(
          pick(r, ["barcode", "code", "code-barres", "الباركود", "ean"]) ?? ""
        ).trim();
        const categoryName =
          String(pick(r, ["category", "catégorie", "categorie", "الصنف", "famille"]) ?? "").trim() ||
          undefined;
        const brand = String(pick(r, ["brand", "marque", "العلامة"]) ?? "").trim();
        const purchasePrice = num(
          pick(r, ["purchase", "purchase price", "achat", "prix d'achat", "سعر الشراء"])
        );
        const retailPrice = num(
          pick(r, [
            "retail",
            "retail price",
            "price",
            "prix",
            "détail",
            "prix détail",
            "سعر التجزئة",
            "السعر",
          ])
        );
        const wholesalePrice = num(
          pick(r, ["wholesale", "wholesale price", "gros", "prix gros", "سعر الجملة"])
        );
        const stock = num(
          pick(r, ["stock", "qty", "quantity", "quantité", "الكمية", "المخزون", "qte"])
        );
        const minStock = num(pick(r, ["min", "minstock", "seuil", "حد التنبيه"])) || 2;
        const notes = String(pick(r, ["notes", "imei", "ملاحظات", "description"]) ?? "").trim();

        const errors: string[] = [];
        if (!name) errors.push("اسم المنتج مطلوب (Name required)");
        if (retailPrice < 0) errors.push("سعر التجزئة غير صالح");
        if (stock < 0) errors.push("الكمية لا يمكن أن تكون سالبة");

        return {
          rowNum: index + 2, // Accounting for header row
          name,
          barcode,
          categoryName,
          brand,
          purchasePrice,
          retailPrice,
          wholesalePrice,
          stock,
          minStock,
          notes,
          errors,
        };
      });

      setImportRows(validated);
    } catch {
      toast.error("Error reading Excel file");
    }
  }

  async function confirmImport() {
    if (!importRows) return;
    const validOnes = importRows.filter((r) => r.errors.length === 0);
    if (!validOnes.length) {
      toast.error("لا توجد أسطر صالحة للاستيراد");
      return;
    }

    const payload = validOnes.map(({ errors: _e, rowNum: _rn, ...rest }) => rest);
    const n = await productsRepo.bulkImport(payload);
    toast.success(`${t("imported")}: ${n}`);
    setImportRows(null);
  }

  // Pre-save check for duplicate barcode
  async function handleProductSaveRequest(product: Product) {
    if (product.barcode && product.barcode.trim()) {
      const code = product.barcode.trim();
      const existing = products.find(
        (p) => p.barcode && p.barcode.trim() === code && p.id !== product.id
      );
      if (existing) {
        // Trigger duplicate barcode modal with option to increase stock
        setDuplicateConflict({ existing, pendingProduct: product });
        return;
      }
    }

    // Save directly if no conflict
    await productsRepo.save(product);
    toast.success(t("saved"));
    setEditing(null);
  }

  return (
    <>
      <PageHeader title={t("products")}>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.xlsx,.xls"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFileSelect(f);
            e.target.value = "";
          }}
        />
        <Button
          variant="outline"
          onClick={downloadTemplate}
          title={t("downloadTemplate")}
        >
          <Download className="h-4 w-4" />
          {t("downloadTemplate")}
        </Button>
        <Button
          variant="outline"
          onClick={() => fileRef.current?.click()}
          title={t("importHelp")}
        >
          <Upload className="h-4 w-4" />
          {t("import")}
        </Button>
        <Button onClick={() => setEditing(empty())}>
          <Plus className="h-4 w-4" />
          {t("add")}
        </Button>
      </PageHeader>

      {/* When no products exist at all: Friendly Welcome Empty State */}
      {products.length === 0 ? (
        <Card className="mx-auto max-w-2xl p-10 text-center">
          <div className="mx-auto mb-4 grid h-20 w-20 place-items-center rounded-2xl bg-primary/10 text-primary">
            <Package className="h-10 w-10" />
          </div>
          <h2 className="mb-2 font-display text-2xl font-bold">{t("welcomeProductsTitle")}</h2>
          <p className="mx-auto mb-8 max-w-lg text-sm text-muted-foreground">
            {t("welcomeProductsDesc")}
          </p>

          <div className="mb-8 flex flex-wrap justify-center gap-4">
            <Button size="lg" className="h-14 px-8 text-base shadow-md" onClick={() => setEditing(empty())}>
              <Plus className="h-5 w-5" />
              {t("addFirstProduct")}
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="h-14 px-8 text-base"
              onClick={() => fileRef.current?.click()}
            >
              <FileSpreadsheet className="h-5 w-5 text-success" />
              {t("importFromExcel")}
            </Button>
          </div>

          <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-start text-xs leading-relaxed text-muted-foreground">
            {t("productsEmptyTip")}
          </div>
        </Card>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap gap-3">
            <div className="flex flex-1 max-w-sm gap-2">
              <Input
                className="flex-1"
                placeholder={t("search")}
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="shrink-0"
                title={t("scanWithCamera")}
                onClick={() => setListScannerOpen(true)}
              >
                <Camera className="h-4 w-4 text-primary" />
              </Button>
            </div>
            <Select
              className="max-w-xs"
              value={cat}
              onChange={(e) => setCat(e.target.value)}
            >
              <option value="">{t("all")}</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
            <Button
              variant={low ? "accent" : "outline"}
              onClick={() => setLow(!low)}
            >
              {t("lowOnly")}
            </Button>
          </div>

          <Table
            head={[
              "",
              t("name"),
              t("barcode"),
              t("category"),
              t("purchasePrice"),
              t("retailPrice"),
              t("wholesalePrice"),
              t("stock"),
              t("actions"),
            ]}
          >
            {list.map((p) => (
              <tr key={p.id} className="hover:bg-muted/50">
                <Td>
                  {p.image ? (
                    <img
                      src={p.image}
                      alt=""
                      className="h-10 w-10 rounded-lg object-cover shadow-xs"
                    />
                  ) : (
                    <div className="grid h-10 w-10 place-items-center rounded-lg bg-muted text-muted-foreground">
                      <Package className="h-5 w-5 opacity-40" />
                    </div>
                  )}
                </Td>
                <Td>
                  <div className="font-semibold">{p.name}</div>
                  <div className="text-xs text-muted-foreground">{p.brand}</div>
                </Td>
                <Td className="font-mono text-xs">{p.barcode || "—"}</Td>
                <Td>{catName(p.categoryId)}</Td>
                <Td className="tabular-nums">{money(p.purchasePrice)}</Td>
                <Td className="tabular-nums font-semibold">{money(p.retailPrice)}</Td>
                <Td className="tabular-nums">{money(p.wholesalePrice)}</Td>
                <Td>
                  <Badge
                    tone={
                      p.stock <= 0
                        ? "danger"
                        : p.stock <= p.minStock
                        ? "warning"
                        : "success"
                    }
                  >
                    {p.stock}
                  </Badge>
                </Td>
                <Td>
                  <div className="flex gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      title={t("adjust")}
                      onClick={() => setAdjusting(p)}
                    >
                      <PackageOpen className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setEditing(p)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() =>
                        confirm(t("confirmDelete")) && productsRepo.remove(p.id!)
                      }
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </Td>
              </tr>
            ))}
            {list.length === 0 && (
              <tr>
                <Td className="py-10 text-center text-muted-foreground" colSpan={9 as never}>
                  {t("noProducts")}
                </Td>
              </tr>
            )}
          </Table>
        </>
      )}

      {/* Add / Edit Product Modal */}
      {editing && (
        <ProductForm
          product={editing}
          onClose={() => setEditing(null)}
          onSave={handleProductSaveRequest}
        />
      )}

      {/* Stock Adjustment Modal */}
      {adjusting && (
        <AdjustModal product={adjusting} onClose={() => setAdjusting(null)} />
      )}

      {/* Duplicate Barcode Conflict Modal */}
      {duplicateConflict && (
        <DuplicateBarcodeModal
          existing={duplicateConflict.existing}
          pendingStock={duplicateConflict.pendingProduct.stock}
          onClose={() => setDuplicateConflict(null)}
          onStockIncreased={() => {
            setDuplicateConflict(null);
            setEditing(null);
          }}
        />
      )}

      {/* Excel Import Preview Modal */}
      {importRows && (
        <ImportPreviewModal
          rows={importRows}
          onClose={() => setImportRows(null)}
          onConfirm={confirmImport}
        />
      )}

      {/* List Barcode Scanner Modal */}
      <CameraScannerModal
        open={listScannerOpen}
        onClose={() => setListScannerOpen(false)}
        title={t("search")}
        continuous={false}
        onScan={(res) => {
          setQ(res.code);
          setListScannerOpen(false);
          toast.success(`${t("search")}: ${res.code}`);
        }}
      />
    </>
  );
}

function ProductForm({
  product,
  onClose,
  onSave,
}: {
  product: Product;
  onClose: () => void;
  onSave: (p: Product) => void;
}) {
  const { t } = useI18n();
  const categories = useData(() => categoriesRepo.list(), []) ?? [];
  const [p, setP] = useState<Product>(product);
  const [formScannerOpen, setFormScannerOpen] = useState(false);
  const set = <K extends keyof Product>(k: K, v: Product[K]) =>
    setP((x) => ({ ...x, [k]: v }));
  const num = (k: keyof Product) => ({
    type: "number",
    value: (p[k] as number) || "",
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      set(k, Number(e.target.value) as never),
  });

  return (
    <Modal open onClose={onClose} title={p.id ? t("edit") : t("add")} wide>
      <form
        className="grid grid-cols-2 gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!p.name.trim()) return;
          onSave(p);
        }}
      >
        <Field label={t("name")} className="col-span-2">
          <Input
            autoFocus
            value={p.name}
            onChange={(e) => set("name", e.target.value)}
          />
        </Field>
        <Field label={t("barcode")}>
          <div className="flex gap-2">
            <Input
              value={p.barcode}
              placeholder="مسح أو إدخال يدوي"
              onChange={(e) => set("barcode", e.target.value)}
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="shrink-0"
              title={t("scanWithCamera")}
              onClick={() => setFormScannerOpen(true)}
            >
              <Camera className="h-4 w-4 text-primary" />
            </Button>
          </div>
        </Field>
        <Field label={t("brand")}>
          <Input
            value={p.brand}
            onChange={(e) => set("brand", e.target.value)}
          />
        </Field>
        <Field label={t("category")}>
          <Select
            value={p.categoryId ?? ""}
            onChange={(e) =>
              set("categoryId", e.target.value ? Number(e.target.value) : undefined)
            }
          >
            <option value="">—</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("purchasePrice")}>
          <Input {...num("purchasePrice")} />
        </Field>
        <Field label={t("retailPrice")}>
          <Input {...num("retailPrice")} />
        </Field>
        <Field label={t("wholesalePrice")}>
          <Input {...num("wholesalePrice")} />
        </Field>
        <Field label={t("stock")}>
          <Input {...num("stock")} disabled={!!p.id} />
        </Field>
        <Field label={t("minStock")}>
          <Input {...num("minStock")} />
        </Field>
        <Field label={t("notes")} className="col-span-2">
          <textarea
            className="min-h-20 rounded-lg border border-input bg-card p-3"
            value={p.notes}
            onChange={(e) => set("notes", e.target.value)}
          />
        </Field>
        <Field label={t("image")} className="col-span-2">
          <div className="flex items-center gap-3">
            {p.image && (
              <img
                src={p.image}
                alt=""
                className="h-16 w-16 rounded object-cover"
              />
            )}
            <input
              type="file"
              accept="image/*"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f) set("image", await readFileAsDataURL(f));
              }}
            />
            {p.image && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => set("image", undefined)}
              >
                {t("delete")}
              </Button>
            )}
          </div>
        </Field>
        <div className="col-span-2 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button type="submit">{t("save")}</Button>
        </div>
      </form>

      <CameraScannerModal
        open={formScannerOpen}
        onClose={() => setFormScannerOpen(false)}
        title={t("scanWithCamera")}
        continuous={false}
        onScan={(res) => {
          set("barcode", res.code);
          setFormScannerOpen(false);
          toast.success(`${t("barcode")}: ${res.code}`);
        }}
      />
    </Modal>
  );
}

function AdjustModal({
  product,
  onClose,
}: {
  product: Product;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [v, setV] = useState(product.stock);
  const [note, setNote] = useState("");

  return (
    <Modal
      open
      onClose={onClose}
      title={`${t("adjust")} — ${product.name}`}
    >
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          await productsRepo.adjustStock(product.id!, v, note);
          onClose();
        }}
      >
        <Field label={t("newStock")}>
          <Input
            type="number"
            autoFocus
            value={v}
            onChange={(e) => setV(Number(e.target.value))}
          />
        </Field>
        <Field label={t("note")}>
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <Button type="submit" className="w-full">
          {t("save")}
        </Button>
      </form>
    </Modal>
  );
}

// Duplicate barcode dialog
function DuplicateBarcodeModal({
  existing,
  pendingStock,
  onClose,
  onStockIncreased,
}: {
  existing: Product;
  pendingStock: number;
  onClose: () => void;
  onStockIncreased: () => void;
}) {
  const { t } = useI18n();
  const [addQty, setAddQty] = useState(pendingStock > 0 ? pendingStock : 1);
  const [updating, setUpdating] = useState(false);

  async function handleIncreaseStock() {
    setUpdating(true);
    try {
      await productsRepo.adjustStock(
        existing.id!,
        existing.stock + addQty,
        `إضافة عبر مسح الباركود (${addQty}+)`
      );
      toast.success(t("stockUpdated"));
      onStockIncreased();
    } catch {
      toast.error("Error updating stock");
    } finally {
      setUpdating(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={t("duplicateBarcodeTitle")}>
      <div className="space-y-5">
        <div className="flex items-start gap-3 rounded-xl border border-warning/30 bg-warning/10 p-4">
          <AlertTriangle className="h-5 w-5 shrink-0 text-warning" />
          <div className="text-sm">
            <p className="font-semibold text-warning-foreground">
              {t("duplicateBarcodeDesc")}
            </p>
            <div className="mt-1 font-bold text-foreground">
              {existing.name} {existing.brand ? `(${existing.brand})` : ""}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {t("existingStock")}: <span className="font-bold text-foreground">{existing.stock}</span>
            </div>
          </div>
        </div>

        <Field label={t("qtyToAdd")}>
          <Input
            type="number"
            min={1}
            autoFocus
            value={addQty}
            onChange={(e) => setAddQty(Math.max(1, Number(e.target.value)))}
          />
        </Field>

        <div className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">
          المخزون الجديد بعد الزيادة سيكون:{" "}
          <span className="font-bold text-foreground">{existing.stock + addQty}</span> قطعة.
        </div>

        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button
            className="flex-1"
            disabled={updating}
            onClick={handleIncreaseStock}
          >
            {t("increaseStock")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// Excel Import Preview Modal with Validation
function ImportPreviewModal({
  rows,
  onClose,
  onConfirm,
}: {
  rows: ImportRow[];
  onClose: () => void;
  onConfirm: () => void;
}) {
  const { t, money } = useI18n();
  const validCount = rows.filter((r) => r.errors.length === 0).length;
  const invalidCount = rows.length - validCount;

  return (
    <Modal open onClose={onClose} title={t("importPreview")} wide>
      <div className="space-y-4">
        {/* Summary badges */}
        <div className="flex flex-wrap items-center gap-3 border-b border-border pb-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <span>{t("totalRows")}:</span>
            <span className="tabular-nums">{rows.length}</span>
          </div>
          <div className="flex items-center gap-1.5 rounded-lg bg-success/15 px-3 py-1 text-xs font-bold text-success">
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span>{t("validRows")}: {validCount}</span>
          </div>
          {invalidCount > 0 && (
            <div className="flex items-center gap-1.5 rounded-lg bg-destructive/15 px-3 py-1 text-xs font-bold text-destructive">
              <AlertCircle className="h-3.5 w-3.5" />
              <span>{t("invalidRows")}: {invalidCount}</span>
            </div>
          )}
        </div>

        {/* Rows table preview */}
        <div className="max-h-96 overflow-auto rounded-xl border border-border">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-muted text-muted-foreground">
              <tr>
                <th className="p-2 text-start">#</th>
                <th className="p-2 text-start">{t("name")}</th>
                <th className="p-2 text-start">{t("barcode")}</th>
                <th className="p-2 text-start">{t("category")}</th>
                <th className="p-2 text-end">{t("purchasePrice")}</th>
                <th className="p-2 text-end">{t("retailPrice")}</th>
                <th className="p-2 text-center">{t("stock")}</th>
                <th className="p-2 text-center">{t("rowStatus")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.slice(0, 50).map((r) => {
                const isValid = r.errors.length === 0;
                return (
                  <tr
                    key={r.rowNum}
                    className={isValid ? "hover:bg-muted/40" : "bg-destructive/10"}
                  >
                    <td className="p-2 font-mono text-muted-foreground">{r.rowNum}</td>
                    <td className="p-2">
                      <div className="font-semibold">{r.name || "—"}</div>
                      {r.errors.length > 0 && (
                        <div className="text-[11px] font-bold text-destructive">
                          {r.errors.join(", ")}
                        </div>
                      )}
                    </td>
                    <td className="p-2 font-mono">{r.barcode || "—"}</td>
                    <td className="p-2">{r.categoryName || "—"}</td>
                    <td className="p-2 text-end tabular-nums">{money(r.purchasePrice)}</td>
                    <td className="p-2 text-end font-semibold tabular-nums">
                      {money(r.retailPrice)}
                    </td>
                    <td className="p-2 text-center tabular-nums">{r.stock}</td>
                    <td className="p-2 text-center">
                      {isValid ? (
                        <Badge tone="success">{t("valid")}</Badge>
                      ) : (
                        <Badge tone="danger">{t("invalid")}</Badge>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {rows.length > 50 && (
            <div className="p-2 text-center text-xs text-muted-foreground bg-muted/30">
              يتم عرض أول 50 سطراً فقط من أصل {rows.length}.
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button
            variant="success"
            disabled={validCount === 0}
            onClick={onConfirm}
          >
            <CheckCircle2 className="h-4 w-4" />
            {t("confirmImport")} ({validCount})
          </Button>
        </div>
      </div>
    </Modal>
  );
}
