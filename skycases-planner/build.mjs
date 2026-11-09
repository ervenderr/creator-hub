// Embeds plan.js into an importable n8n workflow: node build.mjs
import { readFileSync, writeFileSync } from 'node:fs';
const src = readFileSync(new URL('./plan.js', import.meta.url), 'utf8').replace(/^if \(typeof module.*$/m, '');
const code = `${src}
const r = plan($input.all().map((i) => i.json));
const L = (t, a, f) => a.length ? ['', t, ...a.map(f)] : [];
const body = [
  ...L('PURCHASE PROPOSALS (needs founder approval)', r.proposals, (p) => \`- \${p.sku} \${p.name}: order \${p.qty} (~EUR \${p.cost}), \${p.cover_days ?? '-'}d cover\${p.low_confidence ? ' [low confidence: many stock-out days]' : ''}\`),
  ...L('ALERTS', r.alerts, (a) => \`- \${a.sku} [\${a.type}] \${a.msg}\`),
  ...L('DATA ISSUES', r.dataIssues, (d) => \`- \${d.sku}: \${d.msg}\`),
].join('\\n');
return [{ json: { ...r, count: r.proposals.length + r.alerts.length + r.dataIssues.length, subject: \`Supply chain: \${r.proposals.length} to order, \${r.alerts.length} alerts, \${r.dataIssues.length} data issues\`, body } }];`;
const n = (name, type, typeVersion, position, parameters, extra = {}) => ({ id: name.toLowerCase().replace(/\W+/g, '-'), name, type, typeVersion, position, parameters, ...extra });
const wf = {
  name: 'Skycases reorder planner',
  nodes: [
    n('Every morning', 'n8n-nodes-base.scheduleTrigger', 1.2, [0, 200], { rule: { interval: [{ field: 'cronExpression', expression: '0 7 * * 1-5' }] } }),
    n('Read stock sheet', 'n8n-nodes-base.googleSheets', 4.5, [260, 200], { operation: 'getAll', documentId: { __rl: true, mode: 'url', value: '' }, sheetName: { __rl: true, mode: 'name', value: 'stock' } }),
    n('Plan and check data', 'n8n-nodes-base.code', 2, [520, 200], { jsCode: code }),
    n('Anything to report?', 'n8n-nodes-base.if', 1, [780, 200], { conditions: { number: [{ value1: '={{$json.count}}', operation: 'larger', value2: 0 }] } }),
    n('Email founders', 'n8n-nodes-base.emailSend', 2.1, [1040, 100], { fromEmail: '', toEmail: '', subject: '={{$json.subject}}', emailFormat: 'text', text: '={{$json.body}}' }),
  ],
  connections: {
    'Every morning': { main: [[{ node: 'Read stock sheet', type: 'main', index: 0 }]] },
    'Read stock sheet': { main: [[{ node: 'Plan and check data', type: 'main', index: 0 }]] },
    'Plan and check data': { main: [[{ node: 'Anything to report?', type: 'main', index: 0 }]] },
    'Anything to report?': { main: [[{ node: 'Email founders', type: 'main', index: 0 }], []] },
  },
  settings: { executionOrder: 'v1' },
};
writeFileSync(new URL('./workflow.json', import.meta.url), JSON.stringify(wf, null, 1) + '\n');
console.log('workflow.json written');
