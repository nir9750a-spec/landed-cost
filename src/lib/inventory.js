// Inventory module — stock levels valued at landed cost.
//
// Current quantity and weighted-average landed cost are derived from stock_moves
// (migration 20260712_inventory.sql), aggregated here in the app.

import { supabase } from './supabase';

export const MOVE_KINDS = [
  { key: 'inbound',    label: 'כניסה (משלוח)',  sign: +1 },
  { key: 'sale',       label: 'מכירה',          sign: -1 },
  { key: 'adjustment', label: 'התאמת ספירה',    sign: +1 },
  { key: 'return',     label: 'החזרה',          sign: +1 },
];

export const MOVE_LABEL = Object.fromEntries(MOVE_KINDS.map(k => [k.key, k.label]));

// ── Items ────────────────────────────────────────────────────────────────────
export async function loadItems() {
  const { data, error } = await supabase
    .from('inventory_items').select('*').order('name', { ascending: true });
  if (error) return [];
  return data || [];
}

export async function addItem(item) {
  const { data, error } = await supabase
    .from('inventory_items').insert([item]).select().single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteItem(id) {
  const { error } = await supabase.from('inventory_items').delete().eq('id', id);
  if (error) throw new Error(error.message);
  return true;
}

// ── Moves ────────────────────────────────────────────────────────────────────
export async function loadMoves(itemId) {
  let q = supabase.from('stock_moves').select('*').order('moved_at', { ascending: false });
  if (itemId) q = q.eq('item_id', itemId);
  const { data, error } = await q;
  if (error) return [];
  return data || [];
}

export async function addMove(move) {
  const { data, error } = await supabase
    .from('stock_moves').insert([move]).select().single();
  if (error) throw new Error(error.message);
  return data;
}

// ── Aggregation ──────────────────────────────────────────────────────────────
// Weighted-average landed cost: only inbound moves with a positive qty and a
// cost contribute to the average; the on-hand quantity nets all moves.
export function itemStats(item, moves) {
  const mine = moves.filter(m => m.item_id === item.id);
  let onHand = 0;
  let inboundQty = 0;
  let inboundCost = 0;
  for (const m of mine) {
    const q = Number(m.qty) || 0;
    onHand += q;
    if (m.kind === 'inbound' && q > 0 && m.unit_landed_cost != null) {
      inboundQty += q;
      inboundCost += q * Number(m.unit_landed_cost);
    }
  }
  const avgCost = inboundQty > 0 ? inboundCost / inboundQty : 0;
  const value = onHand * avgCost;
  const reorder = Number(item.reorder_point) || 0;
  const low = reorder > 0 && onHand <= reorder;
  return { onHand, avgCost, value, low, reorder, moveCount: mine.length };
}

export function inventoryTotals(items, moves) {
  let totalValue = 0;
  let totalUnits = 0;
  let lowCount = 0;
  for (const it of items) {
    const s = itemStats(it, moves);
    totalValue += s.value;
    totalUnits += s.onHand;
    if (s.low) lowCount += 1;
  }
  return { totalValue, totalUnits, lowCount, itemCount: items.length };
}

// Find an existing item by name/sku (case-insensitive) or create it.
export async function findOrCreateItem(items, { name, sku }) {
  const nl = (name || '').trim().toLowerCase();
  const existing = items.find(i =>
    (i.name || '').trim().toLowerCase() === nl ||
    (sku && (i.sku || '').trim().toLowerCase() === sku.trim().toLowerCase())
  );
  if (existing) return { item: existing, created: false };
  const item = await addItem({ name: name?.trim() || 'מוצר', sku: sku || null });
  return { item, created: true };
}
