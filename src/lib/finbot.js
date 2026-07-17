// FinBot client — issues income documents via the `finbot-issue-income` Edge
// Function (which holds the API key server-side). The key NEVER touches this
// browser code.
//
// ─────────────────────────────────────────────────────────────────────────────
//  ⚠️  FIELD MAP — CONFIRM AGAINST YOUR FINBOT "API להפקת הכנסות" DOCS  ⚠️
//  The exact field names / document-type codes below are based on FinBot's
//  documented behavior (customer{save}, linkedDocument, response {status,data})
//  but the precise keys must be verified from the docs page and adjusted in
//  `buildFinbotPayload()` only. Everything else stays the same.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from './supabase';

// FinBot document types (Hebrew label → code). CONFIRM the codes from the docs.
export const FINBOT_DOC_TYPES = [
  { key: 'invoice',          label: 'חשבונית מס',        code: 305 },
  { key: 'invoice_receipt',  label: 'חשבונית מס/קבלה',   code: 320 },
  { key: 'receipt',          label: 'קבלה',              code: 400 },
  { key: 'credit_invoice',   label: 'חשבונית זיכוי',     code: 330 },
  { key: 'quote',            label: 'הצעת מחיר',         code: 300 },
];

export function docTypeCode(key) {
  return (FINBOT_DOC_TYPES.find(d => d.key === key) || FINBOT_DOC_TYPES[0]).code;
}

// Build the FinBot request payload from our sales-invoice shape.
// `invoice`: { doc_type, currency, customer, lines: [{description, qty, unit_price, vat_rate}] }
// `customer`: { name, tax_id, email, phone, address, save }
export function buildFinbotPayload(invoice) {
  const lines = (invoice.lines || []).map(l => ({
    // CONFIRM these item field names against the docs:
    description: l.description || '',
    quantity: Number(l.qty) || 1,
    price: Number(l.unit_price) || 0,   // unit price, before VAT
    vatRate: l.vat_rate != null ? Number(l.vat_rate) : 18,
  }));

  const c = invoice.customer || {};
  const payload = {
    documentType: docTypeCode(invoice.doc_type || 'invoice'),
    currency: invoice.currency || 'ILS',
    customer: {
      name: c.name || 'לקוח מזדמן',
      taxId: c.tax_id || undefined,
      email: c.email || undefined,
      phone: c.phone || undefined,
      address: c.address || undefined,
      save: !!c.save,               // true = save customer, false = one-off
    },
    items: lines,
    sendEmail: !!invoice.send_email,
  };

  // For credit invoices, FinBot requires linking to the original document.
  if (invoice.linked_document) payload.linkedDocument = invoice.linked_document;

  return payload;
}

// Issue an income document. Returns:
//   { ok: true, documentUrl, externalId, raw }             on success (status === 1)
//   { ok: false, configured: false, message }              when the proxy isn't set up
//   { ok: false, message, raw }                            on FinBot / network error
export async function issueFinbotDocument(invoice) {
  const payload = buildFinbotPayload(invoice);

  const { data, error } = await supabase.functions.invoke('finbot-issue-income', { body: payload });

  if (error) {
    // Peel back the real error body (supabase-js hides non-2xx details).
    let message = error.message || 'שגיאה בפנייה לפינבוט';
    let configured = true;
    try {
      const ctx = error.context;
      if (ctx && typeof ctx.json === 'function') {
        const body = await ctx.json();
        if (body?.error) message = body.error;
        if (body?.configured === false) configured = false;
      }
    } catch { /* keep generic */ }
    return { ok: false, configured, message };
  }

  // FinBot: status === 1 → success, `data` holds the document link.
  if (data && Number(data.status) === 1) {
    return {
      ok: true,
      documentUrl: data.data?.url || data.data?.link || data.data || null,
      externalId: data.data?.id || data.data?.documentNumber || data.documentNumber || null,
      raw: data,
    };
  }

  return {
    ok: false,
    message: data?.message || data?.error || 'פינבוט החזירה שגיאה',
    raw: data,
  };
}
