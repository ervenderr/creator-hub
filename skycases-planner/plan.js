// Reorder planner: stock rows in, purchase proposals + alerts + data issues out.
const CFG = { windowDays: 28, safetyDays: 14, cycleDays: 60, lowCoverDays: 21, costTolerance: 0.05 };
const NUM = ['on_hand', 'inbound', 'inbound_eta_days', 'sold_28d', 'stockout_days_28d', 'season_factor', 'lead_days', 'carton_qty', 'agreed_cost', 'last_invoice_cost'];

function plan(rows, cfg = CFG) {
  const out = { proposals: [], alerts: [], dataIssues: [] };
  const issue = (sku, msg) => out.dataIssues.push({ sku, msg });
  const eans = {};
  rows.forEach((r) => { if (r.ean) (eans[r.ean] = eans[r.ean] || []).push(r.sku); });
  Object.entries(eans).forEach(([e, s]) => s.length > 1 && issue(s.join(' + '), `Same EAN ${e} on ${s.length} SKUs`));

  for (const r of rows) {
    if (!r.ean) issue(r.sku, 'Missing EAN');
    const bad = NUM.filter((k) => r[k] === '' || r[k] == null || !(Number(r[k]) >= 0));
    if (bad.length) { issue(r.sku, `Missing/negative: ${bad.join(', ')}`); continue; }
    const n = Object.fromEntries(NUM.map((k) => [k, Number(r[k])]));
    const sellable = cfg.windowDays - n.stockout_days_28d;
    if (sellable <= 0 || n.carton_qty === 0) { issue(r.sku, 'No sellable days or carton_qty 0, cannot forecast'); continue; }

    // Real demand = units sold per day the item was actually in stock, not per calendar day.
    const daily = (n.sold_28d / sellable) * n.season_factor;
    const cover = daily ? n.on_hand / daily : Infinity;
    const position = n.on_hand + n.inbound;
    const reorderPoint = daily * (n.lead_days + cfg.safetyDays);
    const base = { sku: r.sku, name: r.name, daily: +daily.toFixed(2), cover_days: Number.isFinite(cover) ? Math.round(cover) : null };

    if (position <= reorderPoint) {
      const need = daily * (n.lead_days + cfg.safetyDays + cfg.cycleDays) - position;
      const qty = Math.ceil(need / n.carton_qty) * n.carton_qty;
      out.proposals.push({ ...base, qty, cost: Math.round(qty * n.agreed_cost), low_confidence: n.stockout_days_28d > cfg.windowDays / 2 });
    }
    if (cover < cfg.lowCoverDays && (n.inbound === 0 || n.inbound_eta_days > cover))
      out.alerts.push({ ...base, type: 'low_stock', msg: `${Math.round(cover)}d of cover, ${n.inbound ? `inbound lands in ${n.inbound_eta_days}d` : 'nothing inbound'}` });
    if (n.last_invoice_cost > n.agreed_cost * (1 + cfg.costTolerance))
      out.alerts.push({ ...base, type: 'cost_increase', msg: `Invoiced ${n.last_invoice_cost} vs agreed ${n.agreed_cost} (+${Math.round((n.last_invoice_cost / n.agreed_cost - 1) * 100)}%)` });
  }
  return out;
}
if (typeof module !== 'undefined') module.exports = { plan, CFG };
