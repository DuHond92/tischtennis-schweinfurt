// Supabase Edge Function: send-push
//
// Sendet APNs-Push-Nachrichten an iOS-Geräte via HTTP/2.
// Aufruf ausschließlich via pg_net aus DB-Triggern mit x-webhook-secret.
// Android (FCM) ist vorbereitet (platform-Check) und kann später ergänzt werden.
//
// Benötigte Supabase Secrets:
//   PUSH_HOOK_SECRET    — gemeinsames Geheimnis für DB-Trigger
//   APNS_KEY_P8         — Inhalt der .p8-Datei (Apple Push Auth Key)
//   APNS_KEY_ID         — 10-stellige Key-ID aus Apple Developer
//   APNS_TEAM_ID        — 10-stellige Team-ID aus Apple Developer
//   APNS_BUNDLE_ID      — de.plattentreff.app
//   APNS_ENV            — 'sandbox' (Dev/TestFlight) | 'production'

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")            ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const HOOK_SECRET  = Deno.env.get("PUSH_HOOK_SECRET")         ?? "";
const APNS_KEY_P8  = Deno.env.get("APNS_KEY_P8")              ?? "";
const APNS_KEY_ID  = Deno.env.get("APNS_KEY_ID")              ?? "";
const APNS_TEAM_ID = Deno.env.get("APNS_TEAM_ID")             ?? "";
const APNS_BUNDLE  = Deno.env.get("APNS_BUNDLE_ID")           ?? "de.plattentreff.app";
const APNS_SANDBOX = Deno.env.get("APNS_ENV") !== "production";

const DB_HEADERS = {
  apikey:        SERVICE_ROLE,
  Authorization: `Bearer ${SERVICE_ROLE}`,
  "Content-Type": "application/json",
};

// ── APNs-JWT-Cache (1 h gültig, 5 min Sicherheitspuffer) ────────────────────
let _apnsJwt       = "";
let _apnsJwtExpiry = 0;
let _apnsKey: CryptoKey | null = null;

async function importApnsKey(): Promise<CryptoKey> {
  if (_apnsKey) return _apnsKey;
  const pem = APNS_KEY_P8
    .replace(/-----BEGIN EC PRIVATE KEY-----/g, "")
    .replace(/-----END EC PRIVATE KEY-----/g, "")
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s/g, "");
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  _apnsKey = await crypto.subtle.importKey(
    "pkcs8", der,
    { name: "ECDSA", namedCurve: "P-256" },
    false, ["sign"]
  );
  return _apnsKey;
}

function b64url(data: Uint8Array | string): string {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

async function getApnsJwt(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (_apnsJwt && now < _apnsJwtExpiry) return _apnsJwt;
  const key    = await importApnsKey();
  const header = b64url(JSON.stringify({ alg: "ES256", kid: APNS_KEY_ID }));
  const claims = b64url(JSON.stringify({ iss: APNS_TEAM_ID, iat: now }));
  const msg    = `${header}.${claims}`;
  const sig    = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(msg)
  );
  _apnsJwt       = `${msg}.${b64url(new Uint8Array(sig))}`;
  _apnsJwtExpiry = now + 3300; // 55 min (APNs akzeptiert max. 60 min)
  return _apnsJwt;
}

// ── APNs-Versand ─────────────────────────────────────────────────────────────
interface SendResult { ok: boolean; expired: boolean }

async function sendApns(
  token: string,
  title: string,
  body: string,
  data: Record<string, string>
): Promise<SendResult> {
  const host = APNS_SANDBOX ? "api.sandbox.push.apple.com" : "api.push.apple.com";
  try {
    const jwt = await getApnsJwt();
    const res = await fetch(`https://${host}/3/device/${token}`, {
      method: "POST",
      headers: {
        Authorization:     `Bearer ${jwt}`,
        "apns-topic":      APNS_BUNDLE,
        "apns-push-type":  "alert",
        "apns-priority":   "10",
        "apns-expiration": "0",
        "Content-Type":    "application/json",
      },
      body: JSON.stringify({
        aps: {
          alert:              { title, body },
          sound:              "default",
          badge:              1,
          "mutable-content":  1,
          "content-available": 1,
        },
        ...data,
      }),
    });
    // 410 = ungültiger Token (dauerhaft), 400 mit BadDeviceToken = Sandbox/Prod-Mismatch
    const expired = res.status === 410 || (res.status === 400 && (await res.text()).includes("BadDeviceToken"));
    return { ok: res.status === 200, expired };
  } catch (err) {
    console.warn("APNs fetch error:", err);
    return { ok: false, expired: false };
  }
}

// ── Datenbank-Abfragen ────────────────────────────────────────────────────────
async function getTokensForUser(userId: string) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/push_tokens?user_id=eq.${userId}&select=id,token,platform`,
    { headers: DB_HEADERS }
  );
  if (!res.ok) return [] as Array<{ id: string; token: string; platform: string }>;
  return res.json() as Promise<Array<{ id: string; token: string; platform: string }>>;
}

async function checkPref(userId: string, prefKey: string): Promise<boolean> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/notification_preferences?user_id=eq.${userId}&select=push_enabled,${prefKey}`,
    { headers: DB_HEADERS }
  );
  if (!res.ok) return true;
  const rows = await res.json() as Array<Record<string, boolean>>;
  if (!rows.length) return true; // kein Eintrag = alles aktiv
  return rows[0].push_enabled !== false && rows[0][prefKey] !== false;
}

async function deleteExpiredToken(tokenId: string) {
  await fetch(
    `${SUPABASE_URL}/rest/v1/push_tokens?id=eq.${tokenId}`,
    { method: "DELETE", headers: DB_HEADERS }
  ).catch(() => {});
}

// ── Request-Handler ───────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const secret = req.headers.get("x-webhook-secret");
  if (!HOOK_SECRET || secret !== HOOK_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  let body: {
    recipient_ids:   string[];
    exclude_user_id?: string;
    title:           string;
    body:            string;
    data:            Record<string, string>;
    pref_key:        string;
  };

  try {
    body = await req.json();
  } catch {
    return new Response("Bad Request", { status: 400 });
  }

  if (!body.recipient_ids?.length || !body.title || !body.pref_key) {
    return new Response(JSON.stringify({ sent: 0 }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // APNs-Credentials prüfen
  if (!APNS_KEY_P8 || !APNS_KEY_ID || !APNS_TEAM_ID) {
    console.warn("send-push: APNs-Credentials fehlen — bitte Secrets setzen");
    return new Response(JSON.stringify({ sent: 0, warn: "apns_not_configured" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  let sent = 0;

  await Promise.all(
    body.recipient_ids.map(async (userId) => {
      if (userId === body.exclude_user_id) return;

      const allowed = await checkPref(userId, body.pref_key);
      if (!allowed) return;

      const tokens = await getTokensForUser(userId);
      await Promise.all(
        tokens.map(async (t) => {
          if (t.platform === "ios") {
            const result = await sendApns(t.token, body.title, body.body, body.data ?? {});
            if (result.ok) sent++;
            else if (result.expired) await deleteExpiredToken(t.id);
          }
          // platform === 'android': FCM hier ergänzen wenn nötig
        })
      );
    })
  );

  return new Response(JSON.stringify({ sent }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
