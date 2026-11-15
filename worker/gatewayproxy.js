const PATHS = ['/v1/chat/completions', '/v1/models'];
const ORIGINS = [
  'http://localhost:8100',
  'https://localhost',
  'capacitor://localhost',
];
const LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
const TUNNEL = /^https:\/\/[a-z0-9.-]+\.(devtunnels\.ms|app\.github\.dev)$/;
const MAX_BODY = 25 * 1024 * 1024;

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
    const originOk = !origin || ORIGINS.includes(origin) || LOCAL.test(origin) || TUNNEL.test(origin);
    const h = origin && originOk ? cors(origin) : {};

    if (!originOk) return fail(403, 'Origin not allowed');
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
    if (!PATHS.includes(url.pathname)) return fail(404, 'Not found', h);
    if (request.method !== 'GET' && request.method !== 'POST') return fail(405, 'Method not allowed', h);

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
        Authorization: `Bearer ${env.GATEWAY_KEY}`,
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
