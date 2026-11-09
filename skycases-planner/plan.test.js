const test = require('node:test'); const assert = require('node:assert');
const fs = require('node:fs'); const { plan } = require('./plan.js');
const rows = (() => { const [h, ...l] = fs.readFileSync(__dirname + '/sample-stock.csv', 'utf8').trim().split('\n'); const k = h.split(','); return l.map((x) => Object.fromEntries(x.split(',').map((v, i) => [k[i], v]))); })();
const out = plan(rows);
const prop = (s) => out.proposals.find((p) => p.sku === s);

test('stock-out days are excluded from demand', () => { assert.equal(plan([{ ...rows[1], inbound: 0 }]).proposals[0].daily, +(150 / 8 * 1.2).toFixed(2)); });
test('reorder qty rounds up to carton multiple', () => { const q = prop('SC-CAB-BLK').qty; assert.equal(q % 6, 0); assert.ok(q >= 10 * 1.2 * (70 + 14 + 60) - 120); });
test('well-stocked SKU gets no proposal', () => assert.equal(prop('SC-MED-BLK'), undefined));
test('low stock with late inbound alerts', () => assert.ok(out.alerts.some((a) => a.sku === 'SC-CAB-NVY' && a.type === 'low_stock')));
test('invoice cost over tolerance alerts, within tolerance does not', () => {
  assert.ok(out.alerts.some((a) => a.sku === 'SC-CAB-NVY' && a.type === 'cost_increase'));
  assert.ok(!out.alerts.some((a) => a.sku === 'SC-LRG-GRN' && a.type === 'cost_increase'));
});
test('data rules: duplicate EAN, missing EAN, negative stock', () => {
  const m = out.dataIssues.map((d) => d.msg).join('|');
  assert.match(m, /Same EAN 8719000000042/); assert.match(m, /Missing EAN/); assert.match(m, /negative: on_hand/);
});
