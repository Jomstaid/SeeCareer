// Gateway proxy for Cloudflare Workers.
// It adds the secret API key on the server, so the app never carries a key.
//
//   App (no key)  ->  this Worker  ->  your AI gateway
//
// Secrets and variables (Worker > Settings > Variables and Secrets):
//   GATEWAY_KEY    (secret, required)  the real API key of your gateway
//   APP_TOKEN      (secret, optional)  if set, requests must send the same value in an X-App-Token header
//   ALLOWED_MODELS (text, optional)    comma-separated model names; empty = allow all

const PATHS = ['/v1/chat/completions', '/v1/models'];
const ORIGINS = [
  'http://localhost:8100', // ionic serve
  'https://localhost', // Android app
  'capacitor://localhost', // iOS app
  // add your own website address here, for example 'https://seecareer.example.com'
];
const LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/; // any dev server on your own computer
const TUNNEL = /^https:\/\/[a-z0-9.-]+\.(devtunnels\.ms|app\.github\.dev)$/; // VS Code forwarded ports (delete this line if you do not use them)
const MAX_BODY = 25 * 1024 * 1024; // 25 MB (images and PDFs)

const cors = (origin) => ({
  'Access-Control-Allow-Origin': origin,
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type, authorization, x-app-token',
  'Access-Control-Max-Age': '86400',
  Vary: 'Origin',
});

const fail = (status, message, headers = {}) =>
  new Response(JSON.stringify({ error: { message } }), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');
    const originOk = !origin || ORIGINS.includes(origin) || LOCAL.test(origin) || TUNNEL.test(origin); // native apps send no Origin
    const h = origin && originOk ? cors(origin) : {};

    if (!originOk) return fail(403, 'Origin not allowed');
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
    if (!PATHS.includes(url.pathname)) return fail(404, 'Not found', h);
    if (request.method !== 'GET' && request.method !== 'POST') return fail(405, 'Method not allowed', h);

    // optional: only your app knows this token
    if (env.APP_TOKEN && request.headers.get('X-App-Token') !== env.APP_TOKEN) {
      return fail(401, 'Missing or wrong app token', h);
    }
    if (!env.GATEWAY_KEY) return fail(500, 'Server is not configured', h);
    if (Number(request.headers.get('content-length') || 0) > MAX_BODY) return fail(413, 'Request too large', h);

    let body;
    if (request.method === 'POST') {
      try {
        const data = await request.json();
        const allowed = (env.ALLOWED_MODELS || '').split(',').map((s) => s.trim()).filter(Boolean);
        if (allowed.length && !allowed.includes(data.model)) return fail(400, 'Model not allowed', h);
        body = JSON.stringify(data);
      } catch {
        return fail(400, 'Invalid JSON', h);
      }
    }

    const upstream = await fetch(url.toString(), {
      method: request.method,
      headers: {
        Authorization: `Bearer ${env.GATEWAY_KEY}`, // the key never leaves Cloudflare
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body,
    });

    const out = new Response(upstream.body, upstream);
    for (const [k, v] of Object.entries(h)) out.headers.set(k, v);
    out.headers.set('Cache-Control', 'no-store');
    return out;
  },
};
