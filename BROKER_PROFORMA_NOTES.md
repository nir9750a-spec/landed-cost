# Broker / Forwarder Proforma — Research Notes

Working notes for the "broker view" feature: when a proforma / commercial
invoice comes in, Importly breaks it down into a clean Hebrew sheet the
**freight forwarder / carrier (מוביל / משלח בינלאומי)** can act on. This is
the logistics counterpart to the existing accountant export (`AccountantExport.js`).

> Positioning guardrail (locked 2026-05-30): Importly is a *decision-support*
> tool for the importer. This report makes the importer's life easier when
> talking to the forwarder — it does NOT replace the forwarder's own booking
> system or the customs broker's declaration.

---

## 1. What a *proper* proforma invoice must contain

A proforma is the supplier's pre-shipment quote. To be usable by a forwarder
and (later) customs, it must carry:

**Parties**
- Seller / supplier: full legal name **+ full address** (street, city, country)
- Buyer: name + address (the Israeli importer)
- Contact details; VAT / company no. where relevant

**Document**
- Proforma number + issue date
- Expected ship date / validity of the quote

**Goods (per line)**
- Description (clear, customs-meaningful — not just "samples")
- Item / model / SKU number
- Quantity + unit
- Unit price + line total
- **Country of origin**
- Ideally the **HS / HTS code** (helps the customs broker; not the forwarder's job)

**Logistics**
- **Incoterm 2020 + named place** (e.g. `FOB Ningbo`, `CIF Ashdod`) — this is the
  single most important field: it defines who pays/risks what, and where the
  forwarder picks up.
- Mode of transport (sea / air)
- **Total CBM (volume)** and **total gross weight (kg)** — what the forwarder
  needs to book space and quote freight. For air, volumetric/chargeable weight.
- Number of packages / cartons
- Port of loading (POL) and, if known, port of discharge (POD)

**Commercial / payment**
- Currency (ISO code, not just a symbol)
- Total value
- Payment terms (T/T, L/C, deposit %)

**Authorization**
- Signature and/or company stamp

> Note: a proforma is **not** a final commercial invoice and **not** a customs
> document. The commercial invoice + packing list + B/L are what clear customs.
> But a complete proforma feeds straight into all of them.

---

## 2. Incoterms 2020 — there are **11**, not 12 or 13

The ICC standard ("Global Customs" / customs-software term sets) defines 11
rules. The "12" / "13" you sometimes hear are old editions (Incoterms 2000 had
13, including DAF/DES/DEQ/DDU, which were retired).

**Any mode of transport (incl. road / air / multimodal):**
| Code | Hebrew gloss | Risk passes to buyer at… |
|------|--------------|--------------------------|
| EXW  | מהמפעל | seller's premises |
| FCA  | מסירה למוביל | named place / carrier |
| CPT  | תובלה משולמת עד | handed to first carrier |
| CIP  | תובלה+ביטוח משולמים עד | handed to first carrier (seller insures) |
| DAP  | מסירה ביעד | named destination, not unloaded |
| DPU  | מסירה+פריקה ביעד | named destination, unloaded |
| DDP  | מסירה משולמת מס | destination, duties paid by seller |

**Sea / inland waterway only:**
| Code | Hebrew gloss | Risk passes to buyer at… |
|------|--------------|--------------------------|
| FAS  | לצד האנייה | alongside vessel at POL |
| FOB  | על האנייה | on board at POL |
| CFR  | עלות+הובלה | on board at POL (seller pays freight) |
| CIF  | עלות+ביטוח+הובלה | on board at POL (seller pays freight+insurance) |

For our China→Israel sea flow, **FOB Ningbo / FOB Shanghai** and **CIF Ashdod**
are by far the most common. App already normalizes incoterms to this 11-set in
`aiExtract.js` (`INCOTERMS` array).

---

## 3. What the forwarder needs FROM Nir (to give a proper quote/booking)

This is the checklist the report footer reproduces in Hebrew so Nir always has
it ready:

1. Incoterm + named place (so they know pickup point and who pays what)
2. Total CBM + total gross weight (and carton count) — for space + freight
3. Goods description + commodity type (dangerous goods? batteries? wood?)
4. POL (port/airport of loading) + supplier address for pickup if FCA/EXW
5. Ready date (when cargo is available at supplier)
6. Target POD (Ashdod / Haifa) and final delivery address in Israel
7. Commercial value (for insurance) + whether insurance is needed
8. Any Israeli compliance flags (SII standard / תקן ישראלי) that affect release

> The forwarder does **not** need: landed cost, customs %, margin, sell price,
> or profit. The report deliberately hides all of these (same rule as the
> worktree guest-portal `FORWARDER_FIELDS` whitelist).

---

## 4. What Importly already has vs. the gap

| Field | Source in app | Status |
|-------|---------------|--------|
| Supplier name | `projects.supplier` | ✅ have |
| Supplier address | — | ⚠️ added: extraction field + `projects.supplier_address` migration |
| Product name / item_no | `products.name` / `item_no` | ✅ have |
| Quantity | `products.qty` | ✅ have |
| CBM (per line + total) | `calcProducts` → `_productCbm`, `totals.totalCbm` | ✅ have |
| Gross weight | `products.gross_weight_kg` (per unit) | ✅ have (packing-list extraction fills it) |
| Incoterm | `settings.incoterms` | ✅ have |
| Origin port | `settings.origin_port` | ✅ have |

The only missing field was **supplier address**. We:
- added `supplier_address` to the proforma extraction prompt;
- added a nullable `projects.supplier_address` column (migration
  `20260604_supplier_address.sql` — run it in the Supabase SQL editor);
- made the report's supplier name + address **editable inline** so it works
  even before the migration runs, and the importer can correct it before
  sending.

---

## 5. Next steps (not done in this draft)
- After ~20 customer calls, confirm forwarders actually want this sheet (vs.
  just the supplier's original proforma).
- Consider per-line carton count + dangerous-goods flag (battery/wood) — common
  forwarder questions not yet modeled.
- If the token guest-portal branch (`funny-bouman-0def2d`) is merged, this same
  report can become the forwarder's read-only `/share` view.

_Sources: ICC Incoterms® 2020; Shipping Solutions & IncoDocs proforma/commercial
invoice field guides; WeFreight "pro forma invoice for customs"._
