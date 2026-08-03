/**
 * A stand-in for Supabase that speaks the same REST dialect the app uses:
 * GoTrue auth + PostgREST for entries and sync_meta.
 *
 * Exists so the sync layer can be exercised end to end without touching a real
 * project. Not a Supabase implementation — only the endpoints the app calls,
 * with the same status codes, headers, and filter syntax.
 *
 *   node tools/mock-supabase.mjs [port]
 */
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";

const PORT = Number(process.argv[2] ?? 8791);
const ANON = "eyJmock.anon.key";

const users = new Map();     // email -> { id, password }
const sessions = new Map();  // access_token -> user_id
const refresh = new Map();   // refresh_token -> user_id
const entries = new Map();   // id -> row
const meta = new Map();      // user_id -> { user_id, salt, created_at }

const json = (res, code, body) => {
  res.writeHead(code, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "apikey,authorization,content-type,prefer,accept",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
    "Access-Control-Expose-Headers": "content-range",
  });
  res.end(body === undefined ? "" : JSON.stringify(body));
};

const read = (req) => new Promise((r) => {
  let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => { try { r(b ? JSON.parse(b) : null); } catch { r(null); } });
});

function issue(userId) {
  const access = "acc_" + randomUUID();
  const refr = "ref_" + randomUUID();
  sessions.set(access, userId);
  refresh.set(refr, userId);
  return { access_token: access, refresh_token: refr, token_type: "bearer", expires_in: 3600 };
}

/** Mirrors PostgREST: 401 unless a live bearer token is present. */
function authUser(req) {
  const h = req.headers.authorization ?? "";
  const tok = h.startsWith("Bearer ") ? h.slice(7) : null;
  return tok && sessions.has(tok) ? sessions.get(tok) : null;
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const p = url.pathname;

  if (req.method === "OPTIONS") return json(res, 204);
  if (req.headers.apikey !== ANON) {
    return json(res, 401, { message: "No API key found in request" });
  }

  /* ── auth ───────────────────────────────────────────────────────── */
  if (p === "/auth/v1/signup") {
    const b = await read(req);
    if (!b?.email || !b?.password) return json(res, 400, { msg: "email and password required" });
    if (users.has(b.email)) return json(res, 422, { msg: "User already registered" });
    if (b.password.length < 6) return json(res, 422, { msg: "Password should be at least 6 characters" });
    const user = { id: randomUUID(), email: b.email };
    users.set(b.email, { ...user, password: b.password });
    return json(res, 200, { ...issue(user.id), user });
  }

  if (p === "/auth/v1/token") {
    const b = await read(req);
    const grant = url.searchParams.get("grant_type");
    if (grant === "refresh_token") {
      const uid = refresh.get(b?.refresh_token);
      if (!uid) return json(res, 400, { msg: "Invalid Refresh Token" });
      refresh.delete(b.refresh_token);                       // real GoTrue rotates
      const u = [...users.values()].find((x) => x.id === uid);
      return json(res, 200, { ...issue(uid), user: { id: uid, email: u?.email } });
    }
    const rec = users.get(b?.email);
    if (!rec || rec.password !== b.password) return json(res, 400, { msg: "Invalid login credentials" });
    return json(res, 200, { ...issue(rec.id), user: { id: rec.id, email: rec.email } });
  }

  /* ── rest ───────────────────────────────────────────────────────── */
  const uid = authUser(req);
  if (p.startsWith("/rest/v1/")) {
    if (!uid) return json(res, 401, { message: "JWT expired" });
    const table = p.slice("/rest/v1/".length);
    const prefer = req.headers.prefer ?? "";
    const minimal = prefer.includes("return=minimal");

    if (table === "sync_meta") {
      if (req.method === "GET") return json(res, 200, meta.has(uid) ? [meta.get(uid)] : []);
      if (req.method === "POST") {
        const b = await read(req);
        if (b.user_id !== uid) return json(res, 403, { message: "row-level security violation" });
        meta.set(uid, { user_id: uid, salt: b.salt, created_at: new Date().toISOString() });
        return minimal ? json(res, 201) : json(res, 201, [meta.get(uid)]);
      }
    }

    if (table === "entries") {
      if (req.method === "GET") {
        let rows = [...entries.values()].filter((r) => r.user_id === uid);
        const gt = url.searchParams.get("updated_at");
        if (gt?.startsWith("gt.")) {
          const since = decodeURIComponent(gt.slice(3));
          rows = rows.filter((r) => r.updated_at > since);
        }
        const limit = url.searchParams.get("limit");
        if (limit) rows = rows.slice(0, Number(limit));
        return json(res, 200, rows);
      }
      if (req.method === "POST") {
        const b = await read(req);
        const list = Array.isArray(b) ? b : [b];
        if (!prefer.includes("resolution=merge-duplicates")) {
          for (const r of list) if (entries.has(r.id)) return json(res, 409, { message: "duplicate key value" });
        }
        for (const r of list) {
          if (r.user_id !== uid) return json(res, 403, { message: "row-level security violation" });
          entries.set(r.id, { ...r });
        }
        return minimal ? json(res, 201) : json(res, 201, list);
      }
    }
    return json(res, 404, { message: `relation "public.${table}" does not exist` });
  }

  return json(res, 404, { message: "not found" });
}).listen(PORT, () => {
  console.log(`mock supabase on http://localhost:${PORT}`);
  console.log(`anon key: ${ANON}`);
});
