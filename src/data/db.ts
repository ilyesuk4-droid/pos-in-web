import Dexie, { type Table } from "dexie";
import type {
  Category, Customer, CustomerPayment, Expense, FlexiOperator, FlexiRecharge, FlexiSale,
  Movement, Product, Purchase, RepairTicket, Sale, SaleReturn, Settings, Supplier, User,
} from "./types";

// Internal to the data layer. UI code must never import this file.
class PosDB extends Dexie {
  products!: Table<Product, number>;
  categories!: Table<Category, number>;
  customers!: Table<Customer, number>;
  customerPayments!: Table<CustomerPayment, number>;
  sales!: Table<Sale, number>;
  suppliers!: Table<Supplier, number>;
  purchases!: Table<Purchase, number>;
  movements!: Table<Movement, number>;
  expenses!: Table<Expense, number>;
  settings!: Table<Settings, string>;
  repairs!: Table<RepairTicket, number>;
  flexiOperators!: Table<FlexiOperator, number>;
  flexiRecharges!: Table<FlexiRecharge, number>;
  flexiSales!: Table<FlexiSale, number>;
  returns!: Table<SaleReturn, number>;
  users!: Table<User, number>;

  constructor() {
    super("phone-shop-pos");
    this.version(1).stores({
      products: "++id,name,barcode,categoryId,stock",
      categories: "++id,name",
      customers: "++id,name,phone",
      customerPayments: "++id,customerId,date",
      sales: "++id,date,customerId",
      suppliers: "++id,name",
      purchases: "++id,date,supplierId",
      movements: "++id,date,productId,type",
      expenses: "++id,date",
      settings: "key",
    });
    this.version(2).stores({ repairs: "++id,number,createdAt,status,phone,deliveredAt" });
    this.version(3).stores({
      flexiOperators: "++id,name",
      flexiRecharges: "++id,operatorId,date",
      flexiSales: "++id,operatorId,date,customerId",
    });
    this.version(4).stores({
      returns: "++id,date,saleId,customerId",
    });
  }
}

export const db = new PosDB();

// Safe initialization on database open, outside of any liveQuery context
db.on("ready", async () => {
  try {
    const userCount = await db.users.count();
    if (userCount === 0) {
      await db.users.bulkAdd([
        { username: "ilyes", password: "ilyes", name: "Ilyes (المدير)", role: "admin", createdAt: Date.now() },
        { username: "vendeur", password: "1234", name: "بائع المحل", role: "cashier", createdAt: Date.now() },
      ]);
    }

    const count = await db.flexiOperators.count();
    if (count === 0) {
      await db.flexiOperators.bulkAdd([
        { name: "Mobilis", color: "#16a34a", balance: 0, lowBalanceAlert: 500, marginPct: 2 },
        { name: "Djezzy", color: "#dc2626", balance: 0, lowBalanceAlert: 500, marginPct: 2 },
        { name: "Ooredoo", color: "#7c3aed", balance: 0, lowBalanceAlert: 500, marginPct: 2 },
      ]);
    }
  } catch (err) {
    console.error("Failed to seed default flexi operators on db ready:", err);
  }
});

export const ALL_TABLES = [
  "products", "categories", "customers", "customerPayments", "sales",
  "suppliers", "purchases", "movements", "expenses", "settings", "repairs",
  "flexiOperators", "flexiRecharges", "flexiSales", "returns", "users",
] as const;
