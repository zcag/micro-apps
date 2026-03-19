export interface LineItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
}

export interface InvoiceData {
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  currency: string;
  businessName: string;
  businessAddress: string;
  businessLogo: string;
  clientName: string;
  clientAddress: string;
  clientEmail: string;
  items: LineItem[];
  taxRate: number;
  notes: string;
}

export const CURRENCIES = [
  { code: 'USD', symbol: '$', name: 'US Dollar' },
  { code: 'EUR', symbol: '\u20ac', name: 'Euro' },
  { code: 'GBP', symbol: '\u00a3', name: 'British Pound' },
  { code: 'JPY', symbol: '\u00a5', name: 'Japanese Yen' },
  { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar' },
  { code: 'AUD', symbol: 'A$', name: 'Australian Dollar' },
  { code: 'CHF', symbol: 'CHF', name: 'Swiss Franc' },
  { code: 'INR', symbol: '\u20b9', name: 'Indian Rupee' },
  { code: 'TRY', symbol: '\u20ba', name: 'Turkish Lira' },
];

export function generateId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function getNextInvoiceNumber(): string {
  const key = 'invoice-gen-number';
  const current = parseInt(localStorage.getItem(key) || '0', 10);
  const next = current + 1;
  localStorage.setItem(key, String(next));
  return `INV-${String(next).padStart(4, '0')}`;
}

export function formatCurrency(amount: number, currencyCode: string): string {
  const currency = CURRENCIES.find((c) => c.code === currencyCode);
  const symbol = currency?.symbol ?? currencyCode;
  if (currencyCode === 'JPY') {
    return `${symbol}${Math.round(amount).toLocaleString()}`;
  }
  return `${symbol}${amount.toFixed(2)}`;
}

export function getLineTotal(item: LineItem): number {
  return item.quantity * item.unitPrice;
}

export function getSubtotal(items: LineItem[]): number {
  return items.reduce((sum, item) => sum + getLineTotal(item), 0);
}

export function getTax(subtotal: number, taxRate: number): number {
  return subtotal * (taxRate / 100);
}

export function getTotal(subtotal: number, tax: number): number {
  return subtotal + tax;
}

export function todayString(): string {
  return new Date().toISOString().split('T')[0];
}

export function defaultDueDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString().split('T')[0];
}

export function createEmptyInvoice(): InvoiceData {
  return {
    invoiceNumber: getNextInvoiceNumber(),
    issueDate: todayString(),
    dueDate: defaultDueDate(),
    currency: 'USD',
    businessName: '',
    businessAddress: '',
    businessLogo: '',
    clientName: '',
    clientAddress: '',
    clientEmail: '',
    items: [{ id: generateId(), description: '', quantity: 1, unitPrice: 0 }],
    taxRate: 0,
    notes: '',
  };
}

const DRAFT_KEY = 'invoice-gen-draft';

export function saveDraft(data: InvoiceData): void {
  localStorage.setItem(DRAFT_KEY, JSON.stringify(data));
}

export function loadDraft(): InvoiceData | null {
  const raw = localStorage.getItem(DRAFT_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as InvoiceData;
  } catch {
    return null;
  }
}

export function clearDraft(): void {
  localStorage.removeItem(DRAFT_KEY);
}
