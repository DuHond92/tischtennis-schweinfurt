// auth-handoff: Überbrückt den OAuth-Session-Transfer zwischen Safari und installierter iOS-PWA.
//
// iOS 16.4+: Safari und homescreen-installierte PWA haben ISOLIERTEN localStorage — auch bei
// gleicher Origin. Tokens, die in der Safari-Callback-Seite gespeichert werden, sind in der PWA
// nicht sichtbar. Dieser Handoff löst das:
//
// 1. PWA generiert handoff_key vor OAuth, speichert ihn im eigenen localStorage
// 2. Callback-Seite (Safari) speichert Tokens via POST /auth-handoff {action:'create', ...}
// 3. PWA löst handoff_key nach Rückkehr via POST /auth-handoff {action:'redeem', ...} ein
//
// Kein JWT erforderlich (verify_jwt = false in config.toml).
// Zugriffsschutz: create validiert access_token gegen Supabase Auth; redeem braucht handoff_key.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const SUPABASE_URL  = Deno.env.get("SUPABASE_URL")  ?? "";
const SERVICE_ROLE  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY      = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

const CORS = {
  "Access-Control-Allow-Origin":  "https://plattentreff.app",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function dbHeaders() {
  return {
    "Content-Type":  "application/json",
    "apikey":        SERVICE_ROLE,
    "Authorization": `Bearer ${SERVICE_ROLE}`,
    "Prefer":        "return=representation",
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST")   return new Response("Method Not Allowed", { status: 405, headers: CORS });

  let body: Record<string, string>;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const { action, handoff_key, access_token, refresh_token } = body;

  // handoff_key muss ein UUID sein
  if (!handoff_key || !UUID_RE.test(handoff_key)) {
    return json({ error: "Invalid handoff_key" }, 400);
  }

  // ── CREATE: Callback-Seite speichert Tokens für die PWA ─────────────────────
  if (action === "create") {
    if (!access_token || !refresh_token) return json({ error: "Missing tokens" }, 400);

    // access_token gegen Supabase Auth verifizieren
    const verifyResp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { "apikey": ANON_KEY, "Authorization": `Bearer ${access_token}` },
    });
    if (!verifyResp.ok) return json({ error: "Invalid access_token" }, 401);
    const authUser = await verifyResp.json();
    const userId   = authUser?.id;
    if (!userId || !UUID_RE.test(userId)) return json({ error: "Cannot determine user_id" }, 401);

    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    // Upsert in auth_handoffs
    const upsertResp = await fetch(
      `${SUPABASE_URL}/rest/v1/auth_handoffs?on_conflict=handoff_key`,
      {
        method: "POST",
        headers: dbHeaders(),
        body: JSON.stringify({
          handoff_key,
          access_token,
          refresh_token,
          user_id:     userId,
          expires_at:  expiresAt,
          redeemed_at: null,
        }),
      }
    );
    if (!upsertResp.ok) {
      const err = await upsertResp.text();
      console.error("auth_handoffs upsert failed:", err);
      return json({ error: "Storage failed" }, 500);
    }

    return json({ ok: true });
  }

  // ── REDEEM: PWA löst handoff_key ein und erhält die Tokens ──────────────────
  if (action === "redeem") {
    const selectResp = await fetch(
      `${SUPABASE_URL}/rest/v1/auth_handoffs?handoff_key=eq.${encodeURIComponent(handoff_key)}&select=id,access_token,refresh_token,expires_at,redeemed_at&limit=1`,
      { headers: dbHeaders() }
    );
    if (!selectResp.ok) return json({ error: "DB error" }, 500);

    const rows: Array<{
      id: string;
      access_token: string;
      refresh_token: string;
      expires_at: string;
      redeemed_at: string | null;
    }> = await selectResp.json();

    if (!rows || rows.length === 0) return json({ error: "Not found" }, 404);

    const row = rows[0];

    if (row.redeemed_at)                         return json({ error: "Already redeemed" }, 410);
    if (new Date(row.expires_at) < new Date())   return json({ error: "Expired" }, 410);

    // Als eingelöst markieren
    await fetch(
      `${SUPABASE_URL}/rest/v1/auth_handoffs?id=eq.${encodeURIComponent(row.id)}`,
      {
        method: "PATCH",
        headers: dbHeaders(),
        body: JSON.stringify({ redeemed_at: new Date().toISOString() }),
      }
    );

    return json({
      access_token:  row.access_token,
      refresh_token: row.refresh_token,
    });
  }

  return json({ error: "Unknown action" }, 400);
});
