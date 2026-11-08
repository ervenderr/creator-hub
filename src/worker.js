// Handles /api/subscribe and /api/contact; everything else is served as static assets.
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;
const TOPICS = ["Brand partnership / sponsorship", "Podcast / press / speaking", "AI build for my company", "Something else"];
const LIMIT = 5; // shortcut: per-IP D1 counter, upgrade to Turnstile if spam appears
const WINDOW_SEC = 3600;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

async function sha256(s) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function rateLimited(env, req) {
  const ip = await sha256(req.headers.get("cf-connecting-ip") || "unknown");
  const now = Math.floor(Date.now() / 1000);
  const since = now - WINDOW_SEC;
  await env.DB.prepare("DELETE FROM hits WHERE ts < ?").bind(since).run();
  const { n } = await env.DB.prepare("SELECT COUNT(*) AS n FROM hits WHERE ip_hash = ? AND ts >= ?").bind(ip, since).first();
  if (n >= LIMIT) return true;
  await env.DB.prepare("INSERT INTO hits (ip_hash, ts) VALUES (?, ?)").bind(ip, now).run();
  return false;
}

const str = (v, max) => (typeof v === "string" ? v.trim() : "").slice(0, max);

// Cloudflare Turnstile: fail closed if the secret is missing or the token is absent/invalid.
async function isHuman(env, req, body) {
  const token = str(body["cf-turnstile-response"], 2048);
  if (!env.TURNSTILE_SECRET) { console.error("TURNSTILE_SECRET is not set"); return false; }
  if (!token) return false;
  const form = new FormData();
  form.append("secret", env.TURNSTILE_SECRET);
  form.append("response", token);
  const ip = req.headers.get("cf-connecting-ip");
  if (ip) form.append("remoteip", ip);
  const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form });
  return r.ok && (await r.json()).success === true;
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
    const origin = req.headers.get("origin");
    if (origin && new URL(origin).host !== url.host) return json({ error: "Forbidden" }, 403);

    let body;
    try { body = await req.json(); } catch { return json({ error: "Invalid request" }, 400); }

    const email = str(body.email, 254).toLowerCase();
    if (!EMAIL.test(email)) return json({ error: "Please enter a valid email." }, 400);

    try {
      if (!(await isHuman(env, req, body))) return json({ error: "Please complete the spam check and try again." }, 400);
      if (url.pathname === "/api/subscribe") {
        if (await rateLimited(env, req)) return json({ error: "Too many requests. Try again later." }, 429);
        await env.DB.prepare("INSERT OR IGNORE INTO subscribers (email) VALUES (?)").bind(email).run();
        return json({ ok: true });
      }
      if (url.pathname === "/api/contact") {
        const name = str(body.name, 100), message = str(body.message, 2000), topic = str(body.topic, 100);
        if (!name || !message || !TOPICS.includes(topic)) return json({ error: "Please fill in every field." }, 400);
        if (await rateLimited(env, req)) return json({ error: "Too many requests. Try again later." }, 429);
        await env.DB.prepare("INSERT INTO messages (name, email, topic, message) VALUES (?, ?, ?, ?)").bind(name, email, topic, message).run();
        return json({ ok: true });
      }
      return json({ error: "Not found" }, 404);
    } catch (err) {
      console.error("api error", url.pathname, err);
      return json({ error: "Something went wrong." }, 500);
    }
  },
};
