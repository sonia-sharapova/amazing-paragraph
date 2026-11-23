#!/usr/bin/env node
// Emails a summary of one month's submissions to the editors, with every entry in full
// and the month's submissions attached as JSON.
//
//   node scripts/monthly-summary.js                 # last month (in SITE_TZ), sent to SUBMISSIONS_TO
//   node scripts/monthly-summary.js --month 2026-11 # a specific month
//   node scripts/monthly-summary.js --dry-run       # print the email instead of sending it
//
// env: SUBMISSIONS_TO, SITE_TZ (default UTC), MAIL_FROM, DATA_DIR (default ./data)
const fs = require('fs');
const path = require('path');
const { fmtReceived, oneLine, encodeHeader, sendmail } = require('../lib/mail');
const { toCSV, submissionColumns } = require('../lib/csv');

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const value = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };

const TZ = process.env.SITE_TZ || 'UTC';
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const to = oneLine(value('--to') || process.env.SUBMISSIONS_TO);
const from = oneLine(process.env.MAIL_FROM) || 'The Amazing Paragraph <submissions@amazingparagraph.com>';

// "YYYY-MM" of a date as seen in the editors' time zone
const monthOf = (d) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: TZ, year: 'numeric', month: '2-digit' })
    .formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}`;
};
function lastMonth() {
  const [y, m] = monthOf(new Date()).split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}
const month = value('--month') || lastMonth();
if (!/^\d{4}-\d{2}$/.test(month)) { console.error('--month must look like 2026-11'); process.exit(2); }
const monthName = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
  .format(new Date(`${month}-15T12:00:00Z`));

let all = [];
try { all = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'submissions.json'), 'utf8')).submissions || []; } catch { /* none yet */ }
const entries = all.filter((s) => monthOf(new Date(s.received)) === month)
  .sort((a, b) => a.received.localeCompare(b.received));

const anon = entries.filter((s) => s.anonymous).length;
// entries whose notification never reached the editors' inbox (e.g. mailbox full) — the summary is the safety net
let delivery = {};
try { delivery = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'delivery.json'), 'utf8')); } catch { /* none yet */ }
const missed = entries.filter((s) => {
  const d = delivery[s.editorsMessageId || `<${s.id}@amazingparagraph.com>`];
  return !s.emailed || (d && d.status !== 'delivered');
});
const lines = [
  `Submissions to The Amazing Paragraph — ${monthName}`,
  '',
  entries.length
    ? `${entries.length} submission${entries.length === 1 ? '' : 's'}${anon ? ` (${anon} anonymous)` : ''}. Every entry is below in full, and attached as a spreadsheet (.csv) and as .json.`
    : 'No submissions this month.',
  '',
  ...(missed.length ? [`Note: ${missed.length} of these did not reach the editors' inbox when first sent (marked ✕ below), so this is the first time you're seeing them.`, ''] : []),
];
entries.forEach((s, i) => {
  lines.push('────────────────────────────────────────');
  lines.push(`${i + 1}. ${s.title || 'Untitled'}${missed.includes(s) ? '   ✕ not received when first sent' : ''}`);
  lines.push(`   ${s.anonymous ? 'Anonymous' : s.name}${s.email ? ` <${s.email}>` : ' (no email)'}`);
  lines.push(`   ${fmtReceived(s.received)}`);
  lines.push('');
  lines.push(s.text);
  lines.push('');
});
if (entries.length) lines.push('────────────────────────────────────────', '');
lines.push('All submissions are also in the editor: https://amazingparagraph.com/admin → Submissions');
const text = lines.join('\n');

const boundary = `ap-${Date.now().toString(36)}`;
const b64 = (str) => Buffer.from(str).toString('base64').replace(/.{76}/g, '$&\r\n');
const jsonFile = b64(JSON.stringify({ month, submissions: entries }, null, 2) + '\n');
const csvFile = b64(toCSV(entries, submissionColumns(fmtReceived)));
const subject = `Submissions for ${monthName} (${entries.length})`;
const message = [
  `From: ${from}`,
  `To: ${to || 'editors'}`,
  `Subject: ${encodeHeader(`The Amazing Paragraph — ${subject}`)}`,
  `Date: ${new Date().toUTCString().replace('GMT', '+0000')}`,
  `Message-ID: <summary-${month}-${Date.now()}@amazingparagraph.com>`,
  'MIME-Version: 1.0',
  `Content-Type: multipart/mixed; boundary="${boundary}"`,
  '',
  `--${boundary}`,
  'Content-Type: text/plain; charset=UTF-8',
  'Content-Transfer-Encoding: 8bit',
  '',
  text,
  '',
  `--${boundary}`,
  `Content-Type: text/csv; charset=UTF-8; name="submissions-${month}.csv"`,
  `Content-Disposition: attachment; filename="submissions-${month}.csv"`,
  'Content-Transfer-Encoding: base64',
  '',
  csvFile,
  `--${boundary}`,
  `Content-Type: application/json; name="submissions-${month}.json"`,
  `Content-Disposition: attachment; filename="submissions-${month}.json"`,
  'Content-Transfer-Encoding: base64',
  '',
  jsonFile,
  `--${boundary}--`,
  '',
].join('\r\n');

if (flag('--dry-run')) { console.log(text); console.log(`\n[dry run] ${subject} → ${to || '(SUBMISSIONS_TO not set)'}; attachments submissions-${month}.csv + .json`); process.exit(0); }
if (!to) { console.error('SUBMISSIONS_TO is not set — nowhere to send the summary.'); process.exit(1); }
sendmail(message, process.env.MAIL_RETURN_PATH || 'bounces@amazingparagraph.com')
  .then(() => console.log(`Sent "${subject}" to ${to}`))
  .catch((e) => { console.error('Could not send summary:', e.message); process.exit(1); });
