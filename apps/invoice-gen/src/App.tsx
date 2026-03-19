import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { Layout, Card, Button, Input, trackEvent } from '@micro-apps/shared';
import {
  InvoiceData,
  LineItem,
  CURRENCIES,
  generateId,
  formatCurrency,
  getLineTotal,
  getSubtotal,
  getTax,
  getTotal,
  createEmptyInvoice,
  saveDraft,
  loadDraft,
} from './invoice';
import styles from './App.module.css';

export default function App() {
  const [invoice, setInvoice] = useState<InvoiceData>(() => {
    const draft = loadDraft();
    return draft ?? createEmptyInvoice();
  });
  const [saved, setSaved] = useState(false);
  const [isPrintView, setIsPrintView] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  // Auto-save draft on changes
  useEffect(() => {
    const timer = setTimeout(() => saveDraft(invoice), 500);
    return () => clearTimeout(timer);
  }, [invoice]);

  const subtotal = useMemo(() => getSubtotal(invoice.items), [invoice.items]);
  const tax = useMemo(() => getTax(subtotal, invoice.taxRate), [subtotal, invoice.taxRate]);
  const total = useMemo(() => getTotal(subtotal, tax), [subtotal, tax]);

  const fmt = useCallback(
    (amount: number) => formatCurrency(amount, invoice.currency),
    [invoice.currency],
  );

  const updateField = useCallback(<K extends keyof InvoiceData>(key: K, value: InvoiceData[K]) => {
    setInvoice((prev) => ({ ...prev, [key]: value }));
  }, []);

  const updateItem = useCallback((id: string, updates: Partial<LineItem>) => {
    setInvoice((prev) => ({
      ...prev,
      items: prev.items.map((item) => (item.id === id ? { ...item, ...updates } : item)),
    }));
  }, []);

  const addItem = useCallback(() => {
    setInvoice((prev) => ({
      ...prev,
      items: [...prev.items, { id: generateId(), description: '', quantity: 1, unitPrice: 0 }],
    }));
    trackEvent('invoice_add_item');
  }, []);

  const removeItem = useCallback((id: string) => {
    setInvoice((prev) => {
      if (prev.items.length <= 1) return prev;
      return { ...prev, items: prev.items.filter((item) => item.id !== id) };
    });
    trackEvent('invoice_remove_item');
  }, []);

  const handleLogoUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 500000) return; // 500KB max
    const reader = new FileReader();
    reader.onload = () => {
      updateField('businessLogo', reader.result as string);
      trackEvent('invoice_logo_upload');
    };
    reader.readAsDataURL(file);
  }, [updateField]);

  const handleSaveDraft = useCallback(() => {
    saveDraft(invoice);
    setSaved(true);
    trackEvent('invoice_save_draft');
    setTimeout(() => setSaved(false), 1500);
  }, [invoice]);

  const handleNewInvoice = useCallback(() => {
    setInvoice(createEmptyInvoice());
    trackEvent('invoice_new');
  }, []);

  const handlePrint = useCallback(() => {
    setIsPrintView(true);
    trackEvent('invoice_download_pdf');
    setTimeout(() => {
      window.print();
      setIsPrintView(false);
    }, 100);
  }, []);

  const currencySymbol = CURRENCIES.find((c) => c.code === invoice.currency)?.symbol ?? '$';

  if (isPrintView) {
    return (
      <div className={styles.printInvoice}>
        <div className={styles.printHeader}>
          <div className={styles.printBusiness}>
            {invoice.businessLogo && (
              <img src={invoice.businessLogo} alt="Logo" className={styles.printLogo} />
            )}
            <div>
              <div className={styles.printBusinessName}>{invoice.businessName || 'Your Business'}</div>
              <div className={styles.printAddress}>{invoice.businessAddress}</div>
            </div>
          </div>
          <div className={styles.printInvoiceInfo}>
            <div className={styles.printInvoiceTitle}>INVOICE</div>
            <div className={styles.printMeta}>
              <span>{invoice.invoiceNumber}</span>
              <span>Issued: {invoice.issueDate}</span>
              <span>Due: {invoice.dueDate}</span>
            </div>
          </div>
        </div>

        <div className={styles.printBillTo}>
          <div className={styles.printLabel}>Bill To</div>
          <div className={styles.printClientName}>{invoice.clientName || 'Client Name'}</div>
          <div className={styles.printAddress}>{invoice.clientAddress}</div>
          {invoice.clientEmail && <div className={styles.printAddress}>{invoice.clientEmail}</div>}
        </div>

        <table className={styles.printTable}>
          <thead>
            <tr>
              <th>Description</th>
              <th>Qty</th>
              <th>Unit Price</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {invoice.items.map((item) => (
              <tr key={item.id}>
                <td>{item.description || '-'}</td>
                <td>{item.quantity}</td>
                <td>{fmt(item.unitPrice)}</td>
                <td>{fmt(getLineTotal(item))}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className={styles.printTotals}>
          <div className={styles.printTotalRow}>
            <span>Subtotal</span>
            <span>{fmt(subtotal)}</span>
          </div>
          {invoice.taxRate > 0 && (
            <div className={styles.printTotalRow}>
              <span>Tax ({invoice.taxRate}%)</span>
              <span>{fmt(tax)}</span>
            </div>
          )}
          <div className={`${styles.printTotalRow} ${styles.printGrandTotal}`}>
            <span>Total ({invoice.currency})</span>
            <span>{fmt(total)}</span>
          </div>
        </div>

        {invoice.notes && (
          <div className={styles.printNotes}>
            <div className={styles.printLabel}>Notes</div>
            <div>{invoice.notes}</div>
          </div>
        )}
      </div>
    );
  }

  return (
    <Layout title="Invoice Generator">
      <div className={styles.container}>
        {/* Invoice Header */}
        <Card variant="glass">
          <div className={styles.invoiceHeader}>
            <div className={styles.invoiceNumber}>
              <span className={styles.sectionLabel}>Invoice</span>
              <input
                type="text"
                className={styles.invoiceNumInput}
                value={invoice.invoiceNumber}
                onChange={(e) => updateField('invoiceNumber', e.target.value)}
              />
            </div>
            <div className={styles.headerFields}>
              <div className={styles.dateField}>
                <label className={styles.fieldLabel}>Issue Date</label>
                <input
                  type="date"
                  className={styles.dateInput}
                  value={invoice.issueDate}
                  onChange={(e) => updateField('issueDate', e.target.value)}
                />
              </div>
              <div className={styles.dateField}>
                <label className={styles.fieldLabel}>Due Date</label>
                <input
                  type="date"
                  className={styles.dateInput}
                  value={invoice.dueDate}
                  onChange={(e) => updateField('dueDate', e.target.value)}
                />
              </div>
              <div className={styles.dateField}>
                <label className={styles.fieldLabel}>Currency</label>
                <select
                  className={styles.currencySelect}
                  value={invoice.currency}
                  onChange={(e) => updateField('currency', e.target.value)}
                >
                  {CURRENCIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.symbol} {c.code}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </Card>

        {/* Business Info */}
        <Card>
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <span className={styles.sectionLabel}>From (Your Business)</span>
              {invoice.businessLogo ? (
                <button className={styles.logoRemoveBtn} onClick={() => updateField('businessLogo', '')}>
                  Remove Logo
                </button>
              ) : (
                <button className={styles.logoUploadBtn} onClick={() => logoInputRef.current?.click()}>
                  + Logo
                </button>
              )}
              <input
                ref={logoInputRef}
                type="file"
                accept="image/*"
                className={styles.hiddenInput}
                onChange={handleLogoUpload}
              />
            </div>
            {invoice.businessLogo && (
              <div className={styles.logoPreview}>
                <img src={invoice.businessLogo} alt="Business logo" className={styles.logoImage} />
              </div>
            )}
            <Input
              label="Business Name"
              value={invoice.businessName}
              onChange={(e) => updateField('businessName', e.target.value)}
              placeholder="Your Company Name"
            />
            <div className={styles.textareaField}>
              <label className={styles.fieldLabel}>Address</label>
              <textarea
                className={styles.textarea}
                value={invoice.businessAddress}
                onChange={(e) => updateField('businessAddress', e.target.value)}
                placeholder="123 Business St, City, State ZIP"
                rows={2}
              />
            </div>
          </div>
        </Card>

        {/* Client Info */}
        <Card>
          <div className={styles.section}>
            <span className={styles.sectionLabel}>Bill To (Client)</span>
            <Input
              label="Client Name"
              value={invoice.clientName}
              onChange={(e) => updateField('clientName', e.target.value)}
              placeholder="Client or Company Name"
            />
            <div className={styles.textareaField}>
              <label className={styles.fieldLabel}>Address</label>
              <textarea
                className={styles.textarea}
                value={invoice.clientAddress}
                onChange={(e) => updateField('clientAddress', e.target.value)}
                placeholder="Client address"
                rows={2}
              />
            </div>
            <Input
              label="Email"
              type="email"
              value={invoice.clientEmail}
              onChange={(e) => updateField('clientEmail', e.target.value)}
              placeholder="client@example.com"
            />
          </div>
        </Card>

        {/* Line Items */}
        <Card>
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <span className={styles.sectionLabel}>Line Items</span>
              <button className={styles.addItemBtn} onClick={addItem}>
                + Add Item
              </button>
            </div>

            {/* Table Header */}
            <div className={styles.itemsHeader}>
              <span className={styles.itemHeaderDesc}>Description</span>
              <span className={styles.itemHeaderNum}>Qty</span>
              <span className={styles.itemHeaderNum}>Price</span>
              <span className={styles.itemHeaderNum}>Total</span>
              <span className={styles.itemHeaderAction} />
            </div>

            {/* Item Rows */}
            {invoice.items.map((item) => (
              <div key={item.id} className={styles.itemRow}>
                <input
                  type="text"
                  className={styles.itemDesc}
                  value={item.description}
                  onChange={(e) => updateItem(item.id, { description: e.target.value })}
                  placeholder="Item description"
                />
                <input
                  type="number"
                  className={styles.itemNum}
                  value={item.quantity || ''}
                  onChange={(e) => updateItem(item.id, { quantity: Number(e.target.value) || 0 })}
                  min={0}
                />
                <div className={styles.priceInputWrap}>
                  <span className={styles.priceSymbol}>{currencySymbol}</span>
                  <input
                    type="number"
                    className={styles.itemPrice}
                    value={item.unitPrice || ''}
                    onChange={(e) => updateItem(item.id, { unitPrice: Number(e.target.value) || 0 })}
                    min={0}
                    step="0.01"
                  />
                </div>
                <span className={styles.itemTotal}>{fmt(getLineTotal(item))}</span>
                <button
                  className={styles.removeItemBtn}
                  onClick={() => removeItem(item.id)}
                  disabled={invoice.items.length <= 1}
                  title="Remove item"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </Card>

        {/* Totals */}
        <Card variant="glass">
          <div className={styles.totalsSection}>
            <div className={styles.totalRow}>
              <span className={styles.totalLabel}>Subtotal</span>
              <span className={styles.totalValue}>{fmt(subtotal)}</span>
            </div>
            <div className={styles.taxRow}>
              <span className={styles.totalLabel}>Tax Rate</span>
              <div className={styles.taxInputWrap}>
                <input
                  type="number"
                  className={styles.taxInput}
                  value={invoice.taxRate || ''}
                  onChange={(e) => updateField('taxRate', Number(e.target.value) || 0)}
                  min={0}
                  max={100}
                  step="0.1"
                />
                <span className={styles.taxPercent}>%</span>
              </div>
            </div>
            {invoice.taxRate > 0 && (
              <div className={styles.totalRow}>
                <span className={styles.totalLabel}>Tax</span>
                <span className={styles.totalValue}>{fmt(tax)}</span>
              </div>
            )}
            <div className={styles.grandTotalRow}>
              <span className={styles.grandTotalLabel}>Total</span>
              <span className={styles.grandTotalValue}>{fmt(total)}</span>
            </div>
          </div>
        </Card>

        {/* Notes */}
        <Card>
          <div className={styles.section}>
            <span className={styles.sectionLabel}>Notes</span>
            <textarea
              className={styles.textarea}
              value={invoice.notes}
              onChange={(e) => updateField('notes', e.target.value)}
              placeholder="Payment terms, thank you message, etc."
              rows={3}
            />
          </div>
        </Card>

        {/* Actions */}
        <div className={styles.actions}>
          <Button variant="gradient" onClick={handlePrint} haptic>
            Download PDF
          </Button>
          <div className={styles.actionsRow}>
            <Button variant="secondary" onClick={handleSaveDraft} haptic style={{ flex: 1 }}>
              {saved ? '✓ Saved!' : 'Save Draft'}
            </Button>
            <Button variant="secondary" onClick={handleNewInvoice} haptic style={{ flex: 1 }}>
              New Invoice
            </Button>
          </div>
        </div>
      </div>
    </Layout>
  );
}
