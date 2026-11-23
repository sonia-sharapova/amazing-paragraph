// Shared mail helpers: hand messages to the server's Postfix via /usr/sbin/sendmail (no dependencies).
const { spawn } = require('child_process');

// e.g. "Sunday, November 22, 2026, 6:59 PM EST" — SITE_TZ (IANA name) sets the editors' time zone.
function fmtReceived(iso) {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: process.env.SITE_TZ || 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
    }).format(new Date(iso)).replace(' at ', ', ');
  } catch { return iso; }
}
const oneLine = (v) => String(v || '').replace(/[\r\n]+/g, ' ').trim(); // blocks header injection
const encodeHeader = (v) => (/^[\x20-\x7e]*$/.test(v) ? v : `=?UTF-8?B?${Buffer.from(v, 'utf8').toString('base64')}?=`);
function sendmail(message, envelopeFrom) {
  return new Promise((resolve, reject) => {
    const p = spawn('/usr/sbin/sendmail', ['-t', '-oi', '-f', envelopeFrom]);
    let err = '';
    p.stderr.on('data', (d) => { err += d; });
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`sendmail exited ${code}: ${err.slice(0, 200)}`))));
    p.stdin.end(message);
  });
}

module.exports = { fmtReceived, oneLine, encodeHeader, sendmail };
