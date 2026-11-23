#!/usr/bin/env node
// Records whether the site's emails actually reached their inbox.
// Installed on the server as /usr/local/lib/ap-mail-status.js (root-owned) and run every
// 2 minutes by ap-mail-status.timer. It reads Postfix's log from the journal and writes
// /srv/amazing-paragraph/data/delivery.json, which the website only reads:
//   { "<message-id>": { "status": "delivered"|"waiting"|"failed", "detail": "...", "at": "...", "to": [...] } }
// Only messages whose Message-ID ends in @amazingparagraph.com are tracked.
const { execFileSync } = require('child_process');
const fs = require('fs');

const OUT = process.argv[2] || '/srv/amazing-paragraph/data/delivery.json';
const DOMAIN = '@amazingparagraph.com>';

const log = execFileSync('journalctl', ['-u', 'postfix', '--since', '-8 days', '-o', 'short-iso', '--no-pager'],
  { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

const queueToMsg = new Map(); // queue id -> message-id (latest use of that queue id)
const msgs = new Map();       // message-id -> { recipients: Map(to -> {status, detail, at}) }

for (const line of log.split('\n')) {
  const m = line.match(/^(\S+)\s.*postfix\/[\w/-]+\[\d+\]: ([0-9A-F]{6,}): (.*)$/);
  if (!m) continue;
  const [, at, qid, rest] = m;
  const mid = rest.match(/^message-id=(<[^>]+>)/);
  if (mid) {
    queueToMsg.set(qid, mid[1]);
    continue;
  }
  const st = rest.match(/^to=<([^>]*)>.*?, status=(sent|deferred|bounced|expired)\s*\((.*)\)\s*$/);
  if (!st) continue;
  const msgId = queueToMsg.get(qid);
  if (!msgId || !msgId.endsWith(DOMAIN)) continue;
  const [, to, status, detail] = st;
  if (!msgs.has(msgId)) msgs.set(msgId, new Map());
  msgs.get(msgId).set(to, { status, detail: detail.slice(0, 300), at });
}

let out = {};
try { out = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch { /* first run */ }

// Only keep records for submissions that still exist, so deleted (e.g. test) entries leave nothing behind.
const wanted = new Set();
try {
  const subs = JSON.parse(fs.readFileSync(require('path').join(require('path').dirname(OUT), 'submissions.json'), 'utf8')).submissions || [];
  for (const x of subs) {
    wanted.add(`<${x.id}@amazingparagraph.com>`).add(`<thanks-${x.id}@amazingparagraph.com>`);
    if (x.editorsMessageId) wanted.add(x.editorsMessageId);
    if (x.thanksMessageId) wanted.add(x.thanksMessageId);
  }
} catch { /* no submissions yet */ }
for (const k of Object.keys(out)) if (!wanted.has(k)) delete out[k];

for (const [msgId, recips] of msgs) {
  if (!wanted.has(msgId)) continue;
  // local deliveries (e.g. discarded bounce copies) don't count; only real inboxes
  const real = [...recips.entries()].filter(([to]) => !/@localhost$|^devnull/.test(to));
  if (!real.length) continue;
  const states = real.map(([, r]) => r.status);
  const status = states.some((s) => s === 'bounced' || s === 'expired') ? 'failed'
    : states.some((s) => s === 'deferred') ? 'waiting'
    : 'delivered';
  const worst = real.find(([, r]) => r.status !== 'sent') || real[real.length - 1];
  out[msgId] = { status, detail: worst[1].status === 'sent' ? '' : worst[1].detail, at: worst[1].at, to: real.map(([to]) => to) };
}

const tmp = OUT + '.tmp';
fs.writeFileSync(tmp, JSON.stringify(out, null, 2) + '\n');
fs.renameSync(tmp, OUT);
try { const { uid, gid } = fs.statSync(require('path').dirname(OUT)); fs.chownSync(OUT, uid, gid); } catch { /* local run */ }
