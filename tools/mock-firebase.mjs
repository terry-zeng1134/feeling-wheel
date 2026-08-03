/**
 * A stand-in for Firebase that speaks the same REST dialect the app uses:
 * Identity Toolkit for auth, the secure-token endpoint for refresh, and
 * Firestore's typed-document REST API.
 *
 * Exists so the sync layer can be exercised end to end without a real project.
 * Only the endpoints the app calls, with matching status codes and shapes.
 *
 *   node tools/mock-firebase.mjs [port]
 */
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";

const PORT = Number(process.argv[2] ?? 8792);
const API_KEY = "AIzaMockKey";
const PROJECT = "mock-project";

const users = new Map();     // email -> { uid, password }
const idTokens = new Map();  // idToken -> uid
const refreshers = new Map();// refreshToken -> uid
const docs = new Map();      // "users/{uid}/entries/{id}" -> fields

const send = (res, code, body) => {
  res.writeHead(code, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization,content-type",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
  });
  res.end(body === undefined ? "" : JSON.stringify(body));
};
const fail = (res, code, message) => send(res, code, { error: { code, message } });

const read = (req) => new Promise((r) => {
  let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => r(b));
});
const parse = (raw, form) => {
  if (!raw) return null;
  if (form) return Object.fromEntries(new URLSearchParams(raw));
  try { return JSON.parse(raw); } catch { return null; }
};

function issue(uid) {
  const idToken = "id_" + randomUUID();
  const refreshToken = "ref_" + randomUUID();
  idTokens.set(idToken, uid);
  refreshers.set(refreshToken, uid);
  return { idToken, refreshToken, expiresIn: "3600" };
}
const bearer = (req) => {
  const h = req.headers.authorization ?? "";
  const t = h.startsWith("Bearer ") ? h.slice(7) : null;
  return t && idTokens.has(t) ? idTokens.get(t) : null;
};

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const p = url.pathname;
  if (req.method === "OPTIONS") return send(res, 204);

  const raw = await read(req);
  const isForm = (req.headers["content-type"] ?? "").includes("form-urlencoded");
  const body = parse(raw, isForm);

  /* ── identity toolkit ───────────────────────────────────────────── */
  if (p === "/v1/accounts:signUp" || p === "/v1/accounts:signInWithPassword") {
    if (url.searchParams.get("key") !== API_KEY) return fail(res, 400, "API_KEY_INVALID");
    const { email, password } = body ?? {};
    if (!email) return fail(res, 400, "INVALID_EMAIL");
    if (!password) return fail(res, 400, "MISSING_PASSWORD");

    if (p.endsWith("signUp")) {
      if (users.has(email)) return fail(res, 400, "EMAIL_EXISTS");
      if (password.length < 6) return fail(res, 400, "WEAK_PASSWORD : Password should be at least 6 characters");
      const uid = randomUUID();
      users.set(email, { uid, password });
      return send(res, 200, { ...issue(uid), localId: uid, email });
    }
    const rec = users.get(email);
    if (!rec || rec.password !== password) return fail(res, 400, "INVALID_LOGIN_CREDENTIALS");
    return send(res, 200, { ...issue(rec.uid), localId: rec.uid, email });
  }

  if (p === "/v1/token") {
    if (url.searchParams.get("key") !== API_KEY) return fail(res, 400, "API_KEY_INVALID");
    const uid = refreshers.get(body?.refresh_token);
    if (!uid) return fail(res, 400, "INVALID_REFRESH_TOKEN");
    refreshers.delete(body.refresh_token);          // real Firebase rotates
    const t = issue(uid);
    return send(res, 200, { id_token: t.idToken, refresh_token: t.refreshToken, user_id: uid, expires_in: "3600" });
  }

  /* ── firestore ──────────────────────────────────────────────────── */
  const base = `/v1/projects/${PROJECT}/databases/(default)/documents`;
  if (p.startsWith(base)) {
    const uid = bearer(req);
    if (!uid) return fail(res, 401, "Request had invalid authentication credentials.");
    const rest = p.slice(base.length);   // e.g. /users/{uid}/meta/sync

    // Batch commit
    if (rest === ":commit") {
      for (const w of body?.writes ?? []) {
        const name = w.update?.name ?? "";
        const key = name.slice(name.indexOf("/documents/") + "/documents/".length);
        if (!key.startsWith(`users/${uid}/`)) return fail(res, 403, "Missing or insufficient permissions.");
        docs.set(key, w.update.fields);
      }
      return send(res, 200, (body?.writes ?? []).map(() => ({ updateTime: new Date().toISOString() })));
    }

    // Query a collection
    if (rest.endsWith(":runQuery")) {
      // rest is "/users/{uid}:runQuery" — strip the method before reading the owner.
      const owner = rest.replace(/^\//, "").split(":")[0].split("/")[1];
      if (owner !== uid) return fail(res, 403, "Missing or insufficient permissions.");
      const f = body?.structuredQuery?.where?.fieldFilter;
      const since = f?.value?.stringValue ?? "";
      const out = [];
      for (const [key, fields] of docs) {
        if (!key.startsWith(`users/${uid}/entries/`)) continue;
        if (f && !(fields.updatedAt?.stringValue > since)) continue;
        out.push({ document: { name: `projects/${PROJECT}/databases/(default)/documents/${key}`, fields } });
      }
      return send(res, 200, out.length ? out : [{ readTime: new Date().toISOString() }]);
    }

    const key = rest.replace(/^\//, "").split("?")[0];
    const owner = key.split("/")[1];
    if (owner !== uid) return fail(res, 403, "Missing or insufficient permissions.");

    // List a collection (used by the passphrase probe)
    if (key.endsWith("/entries")) {
      const rows = [...docs].filter(([k]) => k.startsWith(`users/${uid}/entries/`))
        .slice(0, Number(url.searchParams.get("pageSize") ?? 20))
        .map(([k, fields]) => ({ name: `projects/${PROJECT}/databases/(default)/documents/${k}`, fields }));
      return send(res, 200, rows.length ? { documents: rows } : {});
    }

    if (req.method === "GET") {
      if (!docs.has(key)) return fail(res, 404, `Document "${key}" not found.`);
      return send(res, 200, { name: `projects/${PROJECT}/databases/(default)/documents/${key}`, fields: docs.get(key) });
    }
    if (req.method === "PATCH") {
      docs.set(key, body?.fields ?? {});
      return send(res, 200, { name: `projects/${PROJECT}/databases/(default)/documents/${key}`, fields: docs.get(key) });
    }
  }

  return fail(res, 404, "not found");
}).listen(PORT, () => {
  console.log(`mock firebase on http://localhost:${PORT}`);
  console.log(`apiKey: ${API_KEY}   projectId: ${PROJECT}`);
});
