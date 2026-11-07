import { db, ALL_TABLES } from "./db";
import { repairsRepo } from "./repairs";
import type {
  Category, Customer, Expense, MovementType, PaymentStatus, Product, PurchaseLine, Sale, SaleLine, Settings, Supplier,
} from "./types";

const now = () => Date.now();

async function logMove(productId: number, productName: string, type: MovementType, qty: number, note = "") {
  await db.movements.add({ date: now(), productId, productName, type, qty, note });
}

/* ---------------- Products ---------------- */
export const productsRepo = {
  list: () => db.products.orderBy("name").toArray(),
  get: (id: number) => db.products.get(id),
  getByBarcode: (code: string) => db.products.where("barcode").equals(code).first(),
  async save(p: Product) {
    if (p.id) { await db.products.put(p); return p.id; }
    return db.products.add({ ...p, createdAt: now() });
  },
  remove: (id: number) => db.products.delete(id),
  async adjustStock(id: number, newStock: number, note: string) {
    await db.transaction("rw", db.products, db.movements, async () => {
      const p = await db.products.get(id);
      if (!p) return;
      const delta = newStock - p.stock;
      if (delta === 0) return;
      await db.products.update(id, { stock: newStock });
      await logMove(id, p.name, "adjust", delta, note);
    });
  },
  async setBarcode(id: number, barcode: string) { await db.products.update(id, { barcode }); },
  async bulkImport(rows: Array<Omit<Product, "id" | "createdAt" | "categoryId"> & { categoryName?: string | undefined }>) {
    let count = 0;
    await db.transaction("rw", db.products, db.categories, async () => {
      const cats = await db.categories.toArray();
      for (const r of rows) {
        if (!r.name) continue;
        let categoryId: number | undefined;
        if (r.categoryName) {
          let c = cats.find((x) => x.name.trim() === r.categoryName!.trim());
          if (!c) { const id = await db.categories.add({ name: r.categoryName.trim() }); c = { id, name: r.categoryName.trim() }; cats.push(c); }
          categoryId = c.id;
        }
        const { categoryName: _c, ...rest } = r;
        const existing = r.barcode ? await db.products.where("barcode").equals(r.barcode).first() : undefined;
        if (existing) await db.products.update(existing.id!, { ...rest, categoryId });
        else await db.products.add({ ...rest, categoryId, createdAt: now() });
        count++;
      }
    });
    return count;
  },
};

/* ---------------- Categories ---------------- */
export const categoriesRepo = {
  list: () => db.categories.orderBy("name").toArray(),
  save: (c: Category) => (c.id ? db.categories.put(c) : db.categories.add(c)),
  remove: (id: number) => db.categories.delete(id),
};

/* ---------------- Customers & credit ---------------- */
export const customersRepo = {
  list: () => db.customers.orderBy("name").toArray(),
  get: (id: number) => db.customers.get(id),
  save: (c: Customer) => (c.id ? db.customers.put(c) : db.customers.add({ ...c, createdAt: now() })),
  remove: (id: number) => db.customers.delete(id),
  payments: (customerId: number) => db.customerPayments.where("customerId").equals(customerId).reverse().sortBy("date"),
  sales: (customerId: number) => db.sales.where("customerId").equals(customerId).reverse().sortBy("date"),
  async addPayment(customerId: number, amount: number, note: string) {
    await db.transaction("rw", db.customers, db.customerPayments, async () => {
      const c = await db.customers.get(customerId);
      if (!c) return;
      await db.customerPayments.add({ customerId, amount, note, date: now() });
      await db.customers.update(customerId, { balance: c.balance - amount });
    });
  },
};

/* ---------------- Sales ---------------- */
export interface NewSale {
  items: SaleLine[];
  discount: number;
  paid: number;
  status: PaymentStatus;
  customerId?: number | undefined;
}
export const salesRepo = {
  list: (from: number, to: number) => db.sales.where("date").between(from, to, true, true).reverse().toArray(),
  async create(input: NewSale): Promise<Sale> {
    const subtotal = input.items.reduce((s, l) => s + l.unitPrice * l.qty, 0);
    const total = Math.max(0, subtotal - input.discount);
    const paid = input.status === "paid" ? total : input.status === "credit" ? 0 : Math.min(input.paid, total);
    const remaining = total - paid;
    let sale!: Sale;
    await db.transaction("rw", [db.sales, db.products, db.movements, db.customers], async () => {
      const customer = input.customerId ? await db.customers.get(input.customerId) : undefined;
      sale = {
        date: now(), items: input.items, subtotal, discount: input.discount, total, paid, remaining,
        status: remaining > 0 ? (paid > 0 ? "partial" : "credit") : "paid",
        customerId: customer?.id, customerName: customer?.name,
      };
      sale.id = await db.sales.add(sale);
      for (const l of input.items) {
        if (l.productId === -1) continue; // flexi sentinel
        const p = await db.products.get(l.productId);
        if (p) await db.products.update(l.productId, { stock: p.stock - l.qty });
        await logMove(l.productId, l.name, "sale", -l.qty, `#${sale.id}`);
      }
      if (customer && remaining > 0) await db.customers.update(customer.id!, { balance: customer.balance + remaining });
    });
    return sale;
  },
};

/* ---------------- Suppliers & purchases ---------------- */
export const suppliersRepo = {
  list: () => db.suppliers.orderBy("name").toArray(),
  save: (s: Supplier) => (s.id ? db.suppliers.put(s) : db.suppliers.add(s)),
  remove: (id: number) => db.suppliers.delete(id),
};
export const purchasesRepo = {
  list: () => db.purchases.orderBy("date").reverse().limit(300).toArray(),
  async create(supplierId: number | undefined, items: PurchaseLine[]) {
    await db.transaction("rw", [db.purchases, db.products, db.movements, db.suppliers], async () => {
      const sup = supplierId ? await db.suppliers.get(supplierId) : undefined;
      const total = items.reduce((s, l) => s + l.qty * l.purchasePrice, 0);
      const id = await db.purchases.add({ date: now(), supplierId: sup?.id, supplierName: sup?.name, items, total });
      for (const l of items) {
        const p = await db.products.get(l.productId);
        if (p) await db.products.update(l.productId, { stock: p.stock + l.qty, purchasePrice: l.purchasePrice });
        await logMove(l.productId, l.name, "purchase", l.qty, `#${id}${sup ? " · " + sup.name : ""}`);
      }
    });
  },
};

/* ---------------- Movements ---------------- */
export const movementsRepo = {
  list: (limit = 500) => db.movements.orderBy("date").reverse().limit(limit).toArray(),
};

/* ---------------- Expenses ---------------- */
export const expensesRepo = {
  list: (from: number, to: number) => db.expenses.where("date").between(from, to, true, true).reverse().toArray(),
  save: (e: Expense) => (e.id ? db.expenses.put(e) : db.expenses.add(e)),
  remove: (id: number) => db.expenses.delete(id),
};

/* ---------------- Settings ---------------- */
export const DEFAULT_SETTINGS: Settings = {
  key: "main", shopName: "متجر الهواتف", phone: "", address: "", receiptFooter: "شكراً لزيارتكم",
  paperWidth: 80, language: "ar", hideAmounts: false, darkMode: false, showReceiptCredit: false,
  cameraScannerEnabled: true, preferredCamera: "environment", cameraScannerBeep: true, cameraScannerVibrate: true,
};
export const settingsRepo = {
  async get(): Promise<Settings> { return { ...DEFAULT_SETTINGS, ...(await db.settings.get("main")) }; },
  async save(patch: Partial<Settings>) {
    const cur = await settingsRepo.get();
    await db.settings.put({ ...cur, ...patch, key: "main" });
  },
};

/* ---------------- Stats ---------------- */
export function saleProfit(s: Sale) {
  const lines = s.items.reduce((sum, l) => sum + (l.unitPrice - l.purchasePrice) * l.qty, 0);
  return lines - s.discount;
}
export const statsRepo = {
  async summary(from: number, to: number) {
    const [sales, expenses] = await Promise.all([salesRepo.list(from, to), expensesRepo.list(from, to)]);
    const revenue = sales.reduce((s, x) => s + x.total, 0);
    const profit = sales.reduce((s, x) => s + saleProfit(x), 0);
    const expenseTotal = expenses.reduce((s, x) => s + x.amount, 0);
    const collected = sales.reduce((s, x) => s + x.paid, 0);
    const repairs = await repairsRepo.summary(from, to);
    return {
      sales, expenses, revenue, profit, expenseTotal, collected,
      repairs: repairs.list, repairIncome: repairs.income, repairProfit: repairs.profit,
      net: profit + repairs.profit - expenseTotal,
    };
  },
  async dashboard() {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const today = await statsRepo.summary(start.getTime(), now());
    const products = await db.products.toArray();
    const customers = await db.customers.toArray();
    const stockValue = products.reduce((s, p) => s + p.purchasePrice * Math.max(0, p.stock), 0);
    const lowStock = products.filter((p) => p.stock <= p.minStock);
    const debts = customers.reduce((s, c) => s + Math.max(0, c.balance), 0);
    const since = now() - 30 * 86400000;
    const recent = await db.sales.where("date").above(since).toArray();
    const map = new Map<number, { name: string; qty: number; revenue: number }>();
    for (const s of recent) for (const l of s.items) {
      const e = map.get(l.productId) ?? { name: l.name, qty: 0, revenue: 0 };
      e.qty += l.qty; e.revenue += l.qty * l.unitPrice; map.set(l.productId, e);
    }
    const best = [...map.values()].sort((a, b) => b.qty - a.qty).slice(0, 8);
    const openRepairs = await repairsRepo.openCount();
    return { today, stockValue, lowStock, debts, best, productCount: products.length, openRepairs };
  },
};

/* ---------------- Backup ---------------- */
export const backupRepo = {
  async exportAll() {
    const data: Record<string, unknown[]> = {};
    for (const t of ALL_TABLES) data[t] = await db.table(t).toArray();
    await settingsRepo.save({ lastBackup: now() });
    return { app: "phone-shop-pos", version: 1, exportedAt: new Date().toISOString(), data };
  },
  async importAll(json: { data?: Record<string, unknown[]> }) {
    if (!json?.data) throw new Error("invalid");
    await db.transaction("rw", ALL_TABLES.map((t) => db.table(t)), async () => {
      for (const t of ALL_TABLES) {
        await db.table(t).clear();
        const rows = json.data![t];
        if (Array.isArray(rows) && rows.length) await db.table(t).bulkPut(rows);
      }
    });
  },
};
