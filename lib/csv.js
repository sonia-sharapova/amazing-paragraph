// Spreadsheet export as CSV (opens in Excel, Numbers and Google Sheets). No dependencies.
// - UTF-8 BOM so Excel shows accents correctly
// - cells that start with = + - @ are prefixed with ' so a submission can't run as a formula
const cell = (v) => {
  let s = Array.isArray(v) ? v.join(', ') : v === undefined || v === null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
// columns: [[header, row => value], ...]
function toCSV(rows, columns) {
  const lines = [columns.map(([h]) => cell(h)).join(',')];
  for (const r of rows) lines.push(columns.map(([, get]) => cell(get(r))).join(','));
  return '﻿' + lines.join('\r\n') + '\r\n';
}

const submissionColumns = (fmtDate) => [
  ['Received', (s) => fmtDate(s.received)],
  ['Name', (s) => s.name],
  ['Anonymous', (s) => (s.anonymous ? 'yes' : 'no')],
  ['Email', (s) => s.email],
  ['Title', (s) => s.title],
  ['Paragraph', (s) => s.text],
  ['Emailed to editors', (s) => (s.emailed ? 'yes' : 'no')],
  ['Thank-you sent', (s) => (s.autoReplied ? 'yes' : 'no')],
  ['Received (ISO)', (s) => s.received],
];
const paragraphColumns = (label) => [
  ['Number', (p) => p.number],
  ['Label', (p) => label(p)],
  ['Title', (p) => p.title],
  ['Author', (p) => p.author],
  ['Published', (p) => p.published],
  ['Status', (p) => p.status],
  ['Issue', (p) => p.issue],
  ['Series', (p) => p.series],
  ['Tags', (p) => p.tags],
  ['Appeared in', (p) => p.appearedIn],
  ['Paragraph', (p) => p.text],
  ['Private notes', (p) => p.notes],
];

module.exports = { toCSV, submissionColumns, paragraphColumns };
