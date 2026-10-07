// Started by start.bat. Serves this story folder so the film can be watched on this computer
// and on a phone or tablet that is on the same Wi-Fi. Close the window to stop it.
// Options: --no-open (do not open the browser), PORT=8080 (first port to try).
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os'), { exec } = require('child_process');

const ROOT = __dirname;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.srt': 'text/plain; charset=utf-8', '.txt': 'text/plain; charset=utf-8'
};

// IPv4 addresses of this computer on the local network, the most likely Wi-Fi one first
function lanAddresses() {
  const list = [], ni = os.networkInterfaces();
  Object.keys(ni).forEach(name => (ni[name] || []).forEach(a => {
    if ((a.family !== 'IPv4' && a.family !== 4) || a.internal || a.address.startsWith('169.254.')) return;
    let score = 0;
    if (/wi-?fi|wlan|wireless/i.test(name)) score += 4;
    if (/vethernet|virtual|vmware|vbox|wsl|hyper-v|loopback|bluetooth|docker|tailscale|vpn|warp|cloudflare|zerotier|wireguard|tunnel/i.test(name)) score -= 4;
    if (a.address.startsWith('192.168.')) score += 2; else if (a.address.startsWith('10.')) score += 1;
    list.push({ name, address: a.address, score });
  }));
  return list.sort((a, b) => b.score - a.score);
}

function send(res, code, text) { res.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end(text); }

let PORT = parseInt((process.argv.find(a => a.startsWith('--port=')) || '').slice(7), 10) || parseInt(process.env.PORT, 10) || 8080;
const server = http.createServer((req, res) => {
  let p;
  try { p = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch (e) { return send(res, 400, 'Bad request'); }
  if (p.endsWith('/')) p += 'index.html';
  let file = path.join(ROOT, p), asData = false;
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) return send(res, 403, 'Forbidden');
  // "name.clip" is the voice clip "name.mp3" sent as plain data, so download managers do not grab it (see cinematic.js)
  if (file.endsWith('.clip')) { const real = ['.mp3', '.wav', '.m4a', '.ogg'].map(e => file.slice(0, -5) + e).find(f => fs.existsSync(f)); if (real) { file = real; asData = true; } }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, 'Not found');
    const head = { 'Content-Type': asData ? 'application/octet-stream' : (TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream'), 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache' };
    // the page learns the phone link from a small script added to index.html
    if (file === path.join(ROOT, 'index.html')) {
      const urls = lanAddresses().filter(a => a.score >= 0).map(a => 'http://' + a.address + ':' + PORT + '/');
      const html = fs.readFileSync(file, 'utf8').replace('</head>', '<script>window.LAN=' + JSON.stringify(urls) + ';</script>\n</head>');
      head['Content-Length'] = Buffer.byteLength(html); res.writeHead(200, head); return res.end(req.method === 'HEAD' ? undefined : html);
    }
    // byte ranges: phones need them to play and seek audio
    const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
    let start = 0, end = st.size - 1, code = 200;
    if (m && (m[1] || m[2])) {
      if (m[1]) { start = parseInt(m[1], 10); if (m[2]) end = Math.min(end, parseInt(m[2], 10)); } else start = Math.max(0, st.size - parseInt(m[2], 10));
      if (start > end || start >= st.size) { res.writeHead(416, { 'Content-Range': 'bytes */' + st.size }); return res.end(); }
      code = 206; head['Content-Range'] = 'bytes ' + start + '-' + end + '/' + st.size;
    }
    head['Content-Length'] = end - start + 1; res.writeHead(code, head);
    if (req.method === 'HEAD' || st.size === 0) return res.end();
    fs.createReadStream(file, { start, end }).on('error', () => res.destroy()).pipe(res);
  });
});

server.on('error', e => {
  if (e.code === 'EADDRINUSE' && PORT < 8099) { PORT++; server.listen(PORT, '0.0.0.0'); return; }
  console.log('\n  Could not start: ' + e.message + '\n'); process.exit(1);
});
server.on('listening', () => {
  const lan = lanAddresses(), good = lan.filter(a => a.score >= 0), local = 'http://localhost:' + PORT + '/';
  const L = console.log;
  L('');
  L('  ============================================================');
  L('   The film is running.  Keep this window open while you watch.');
  L('  ============================================================');
  L('');
  L('   On this computer :  ' + local);
  L('');
  if (!lan.length) L('   On your phone    :  no network found. Connect this computer to Wi-Fi and start again.');
  else {
    L('   On your phone    :  http://' + (good[0] || lan[0]).address + ':' + PORT + '/');
    (good.length ? good.slice(1) : lan.slice(1)).forEach(a => L('        or          :  http://' + a.address + ':' + PORT + '/   (' + a.name + ')'));
    L('');
    L('   The phone must be on the same Wi-Fi as this computer.');
    L('   Type the link in the phone browser, and hold the phone upright (portrait).');
    L('   If Windows asks about the firewall, choose "Allow".');
  }
  L('');
  L('   To stop: close this window.');
  L('');
  if (process.argv.indexOf('--no-open') < 0) exec('start "" "' + local + '"');
});
server.listen(PORT, '0.0.0.0');
