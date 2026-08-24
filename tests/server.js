const express = require('express');
const http = require('http');
const path = require('path');

const PORT = 3456;
const app = express();

/* token -> worker port. Test workers bind their per-page mock handlers
   here so /exec can proxy API bodies to the right worker process. */
const routes = new Map();

app.use(express.json({ type: '*/*' }));
app.use(express.static(path.resolve(__dirname, '..')));

app.post('/__mock/bind', (req, res) => {
  const { token, port } = req.body || {};
  if (!token || !port) return res.status(400).json({ ok: false });
  routes.set(String(token), Number(port));
  res.json({ ok: true });
});

app.all('/exec', (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', '*');
  const url = new URL(req.url, 'http://x');
  const token = url.searchParams.get('t') || '';
  const port = routes.get(token);
  if (!port) return res.status(404).json({ ok: false, message: 'No API mock bound for token.' });
  const proxied = http.request({
    host: '127.0.0.1',
    port,
    path: '/?t=' + encodeURIComponent(token),
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, pr => {
    res.status(pr.statusCode);
    res.set(pr.headers);
    pr.pipe(res);
  });
  proxied.on('error', () => {
    try { res.json({ ok: false, message: 'Mock worker unreachable.' }); } catch (e) {}
  });
  proxied.end(JSON.stringify(req.body || {}));
});

app.listen(PORT);
