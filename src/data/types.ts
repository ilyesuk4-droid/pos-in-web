export interface Product {
  id?: number | undefined;
  name: string;
  barcode: string;
  categoryId?: number | undefined;
  brand: string;
  purchasePrice: number;
  retailPrice: number;
  wholesalePrice: number;
  stock: number;
  minStock: number;
  notes: string;
  image?: string | undefined;
  createdAt: number;
}
export interface Category { id?: number | undefined; name: string }
export interface Customer { id?: number | undefined; name: string; phone: string; balance: number; createdAt: number }
export interface CustomerPayment { id?: number | undefined; customerId: number; amount: number; date: number; note: string }
export type PriceType = "retail" | "wholesale";
export interface SaleLine {
  productId: number;
  name: string;
  qty: number;
  unitPrice: number;
  purchasePrice: number;
  priceType: PriceType;
}
export type PaymentStatus = "paid" | "partial" | "credit";
export interface Sale {
  id?: number | undefined;
  date: number;
  items: SaleLine[];
  subtotal: number;
  discount: number;
  total: number;
  paid: number;
  remaining: number;
  status: PaymentStatus;
  customerId?: number | undefined;
  customerName?: string | undefined;
}
export interface Supplier { id?: number | undefined; name: string; phone: string }
export interface PurchaseLine { productId: number; name: string; qty: number; purchasePrice: number }
export interface Purchase { id?: number | undefined; date: number; supplierId?: number | undefined; supplierName?: string | undefined; items: PurchaseLine[]; total: number }
export type MovementType = "sale" | "purchase" | "adjust" | "repair" | "return";
export interface Movement { id?: number | undefined; date: number; productId: number; productName: string; type: MovementType; qty: number; note: string }
export interface Expense { id?: number | undefined; date: number; category: string; amount: number; note: string }
export interface Settings {
  key: "main";
  shopName: string;
  logo?: string | undefined;
  phone: string;
  address: string;
  receiptFooter: string;
  paperWidth: 58 | 80;
  language: "ar" | "fr";
  lastBackup?: number | undefined;
  wizardCompleted?: boolean | undefined;
  hideAmounts?: boolean | undefined;
  darkMode?: boolean | undefined;
  showReceiptCredit?: boolean | undefined;
  silentPrint?: boolean | undefined;
  printerName?: string | undefined;
  autoLaunch?: boolean | undefined;
  backupFolder?: string | undefined;
  cameraScannerEnabled?: boolean | undefined;
  preferredCamera?: "environment" | "user" | undefined;
  cameraScannerBeep?: boolean | undefined;
  cameraScannerVibrate?: boolean | undefined;
}

export type RepairStatus = "received" | "in_repair" | "ready" | "delivered" | "cancelled";
export interface RepairPart { productId: number; name: string; qty: number; unitCost: number }
export interface RepairTicket {
  id?: number | undefined;
  number: string;
  createdAt: number;
  customerName: string;
  phone: string;
  device: string;
  imei: string;
  problem: string;
  condition: string;
  lockCode: string;
  price: number;
  laborCost: number;
  deposit: number;
  readyDate?: number | undefined;
  status: RepairStatus;
  history: { status: RepairStatus; date: number }[];
  parts: RepairPart[];
  paidOnDelivery: number;
  remaining: number;
  deliveredAt?: number | undefined;
  customerId?: number | undefined;
}

// ─── Flexi / Mobile Top-up ───────────────────────────────────────────────────
export interface FlexiOperator {
  id?: number | undefined;
  name: string;          // e.g. "Mobilis"
  color: string;         // hex color e.g. "#16a34a"
  balance: number;       // current balance in DZD
  lowBalanceAlert: number; // alert when below this amount
  marginPct: number;     // sale margin % (e.g. 2 means +2% on top of amount)
}
export interface FlexiRecharge {
  id?: number | undefined;
  operatorId: number;
  date: number;
  loaded: number;        // amount of credit loaded (face value)
  cost: number;          // actual amount paid
  note: string;
}
export type FlexiPaymentMode = "paid" | "partial" | "credit";
export interface FlexiSale {
  id?: number | undefined;
  operatorId: number;
  operatorName: string;
  date: number;
  phoneNumber: string;
  amount: number;        // face value sent
  salePrice: number;     // what customer paid (amount + margin)
  profit: number;        // salePrice - amount (we count the face value cost)
  paymentMode: FlexiPaymentMode;
  paidAmount: number;
  remaining: number;
  customerId?: number | undefined;
  customerName?: string | undefined;
}

// ─── Returns & Exchanges (المرتجعات والتبديل) ──────────────────────────────────
export type ReturnAction = "refund_cash" | "deduct_debt" | "exchange";

export interface ReturnLine {
  productId: number;
  name: string;
  qty: number;
  unitPrice: number;        // refund price per unit
  purchasePrice: number;    // cost
  reason: string;           // reason e.g. "عيب مصنعي", "موديل غير مناسب", "طلب الزبون"
}

export interface ExchangeLine {
  productId: number;
  name: string;
  qty: number;
  unitPrice: number;
  purchasePrice: number;
}

export interface SaleReturn {
  id?: number | undefined;
  date: number;
  saleId?: number | undefined;          // optional linked sale receipt id
  items: ReturnLine[];
  totalRefund: number;                 // total refund value of returned items
  action: ReturnAction;
  exchangeItems?: ExchangeLine[] | undefined; // if exchanged for new items
  exchangeTotal?: number | undefined;         // total price of exchange items
  netDiff?: number | undefined;               // exchangeTotal - totalRefund (positive: customer pays, negative: shop refunds)
  customerId?: number | undefined;
  customerName?: string | undefined;
  notes?: string | undefined;
}


export type UserRole = "admin" | "cashier";

export interface User {
  id?: number | undefined;
  username: string;
  password: string;
  name: string;
  role: UserRole;
  createdAt: number;
}
