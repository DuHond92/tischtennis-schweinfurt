// Supabase Edge Function: send-welcome-email
//
// Ausschließlich durch den DB-Trigger (_notify_welcome_email) via pg_net aufrufbar.
// Kein Bearer-Token-Pfad. Jeder Request ohne korrektes x-webhook-secret wird mit 401 abgewiesen.
//
// Status-Ablauf in email_deliveries: pending → sending → sent | failed
// Retry bei status='failed'. Kein Retry bei status='sent'.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// ── Konfiguration ─────────────────────────────────────────────────────────────

const SUPABASE_URL   = Deno.env.get("SUPABASE_URL")   ?? "";
const SERVICE_ROLE   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const HOOK_SECRET    = Deno.env.get("WELCOME_HOOK_SECRET") ?? "";

const FROM_EMAIL = "Plattentreff <willkommen@plattentreff.app>";
const APP_URL    = "https://plattentreff.app";

// UUID v4-Format (verhindert Injection in URL-Pfade)
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ── Typen ─────────────────────────────────────────────────────────────────────

interface AuthUser {
  id:            string;
  email?:        string;
  app_metadata:  { provider?: string; providers?: string[] };
  user_metadata: { name?: string; full_name?: string };
}

// ── DB-Hilfsfunktionen (Service Role) ────────────────────────────────────────

function serviceHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${SERVICE_ROLE}`,
    "apikey": SERVICE_ROLE,
  };
}

async function getAuthUser(userId: string): Promise<AuthUser | null> {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
    headers: serviceHeaders(),
  });
  if (!r.ok) return null;
  return r.json();
}

// Ruft die atomische Claim-Funktion auf.
// Gibt die Delivery-ID zurück wenn dieser Aufruf den Versand übernehmen darf,
// sonst null (bereits versendet oder anderer Prozess aktiv).
async function attemptDelivery(
  userId: string,
  provider: string
): Promise<string | null> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/attempt_email_delivery`, {
    method: "POST",
    headers: serviceHeaders(),
    body: JSON.stringify({
      p_user_id:    userId,
      p_email_type: "welcome_email",
      p_provider:   provider,
    }),
  });
  if (!r.ok) return null;
  const val = await r.json();
  return typeof val === "string" ? val : null;
}

async function markSent(userId: string, msgId: string | null): Promise<void> {
  const now = new Date().toISOString();
  await Promise.all([
    fetch(
      `${SUPABASE_URL}/rest/v1/email_deliveries` +
      `?user_id=eq.${userId}&email_type=eq.welcome_email`,
      {
        method: "PATCH",
        headers: serviceHeaders(),
        body: JSON.stringify({
          status:               "sent",
          sent_at:              now,
          provider_message_id:  msgId,
          last_error:           null,
        }),
      }
    ),
    fetch(
      `${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}`,
      {
        method: "PATCH",
        headers: serviceHeaders(),
        body: JSON.stringify({ welcome_email_sent_at: now }),
      }
    ),
  ]);
}

async function markFailed(userId: string, lastError: string): Promise<void> {
  await fetch(
    `${SUPABASE_URL}/rest/v1/email_deliveries` +
    `?user_id=eq.${userId}&email_type=eq.welcome_email`,
    {
      method: "PATCH",
      headers: serviceHeaders(),
      body: JSON.stringify({ status: "failed", last_error: lastError }),
    }
  );
}

// ── E-Mail-Template ───────────────────────────────────────────────────────────

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

function buildWelcomeEmail(name: string): string {
  const safeName = escapeHtml(name);
  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Willkommen bei Plattentreff</title>
</head>
<body style="margin:0;padding:0;background:#f2f5f3;font-family:'Helvetica Neue',Arial,sans-serif;">
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"
       style="background:#f2f5f3;">
  <tr><td align="center" style="padding:40px 16px;">
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="560"
           style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;
                  box-shadow:0 2px 12px rgba(0,0,0,0.07);">
      <tr>
        <td style="background:#0F8A55;padding:32px 40px;text-align:center;">
          <p style="margin:0;font-size:26px;font-weight:700;color:#ffffff;letter-spacing:-0.4px;">
            🏓 Plattentreff
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding:40px 40px 32px;">
          <h1 style="margin:0 0 16px;font-size:26px;font-weight:700;color:#111827;line-height:1.25;">
            Willkommen, ${safeName}!
          </h1>
          <p style="margin:0 0 16px;font-size:16px;line-height:1.65;color:#374151;">
            Schön, dass du bei Plattentreff dabei bist. Dein Konto wurde erfolgreich
            erstellt – du kannst direkt loslegen.
          </p>
          <p style="margin:0 0 32px;font-size:16px;line-height:1.65;color:#374151;">
            Finde Tischtennisplatten in deiner Nähe, verabrede dich zum Spielen
            und lerne neue Mitspielerinnen und Mitspieler kennen.
          </p>
          <table role="presentation" cellspacing="0" cellpadding="0" border="0">
            <tr>
              <td style="border-radius:100px;background:#FF5A36;">
                <a href="${APP_URL}" target="_blank"
                   style="display:inline-block;padding:14px 32px;font-size:16px;
                          font-weight:600;color:#ffffff;text-decoration:none;
                          border-radius:100px;letter-spacing:0.1px;">
                  Plattentreff öffnen
                </a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td style="padding:20px 40px 32px;border-top:1px solid #e5e7eb;">
          <p style="margin:0;font-size:13px;color:#9ca3af;line-height:1.6;">
            Du erhältst diese Mail, weil du dich bei Plattentreff registriert hast.<br>
            Fragen?
            <a href="mailto:kontakt@plattentreff.app"
               style="color:#0F8A55;text-decoration:none;">kontakt@plattentreff.app</a>
          </p>
        </td>
      </tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

// ── Kern-Handler (exportiert für Tests) ──────────────────────────────────────

export async function handler(req: Request): Promise<Response> {
  // 1. Methode
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  // 2. Webhook-Secret — einzige akzeptierte Authentifizierungsform
  const incomingSecret = req.headers.get("x-webhook-secret") ?? "";
  if (!HOOK_SECRET || incomingSecret !== HOOK_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  // 3. Payload parsen
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new Response("Bad Request: invalid JSON", { status: 400 });
  }

  // 4. user_id validieren (UUID-Format)
  const userId = typeof body.user_id === "string" ? body.user_id.trim() : "";
  if (!UUID_RE.test(userId)) {
    return new Response("Bad Request: invalid user_id", { status: 400 });
  }

  // 5. Nutzerdaten aus auth.users holen — E-Mail-Adresse IMMER serverseitig ermitteln
  const authUser = await getAuthUser(userId);
  if (!authUser) {
    console.error(`[send-welcome-email] User not found: ${userId}`);
    return new Response("Not Found", { status: 404 });
  }

  const email    = authUser.email ?? "";
  const provider = authUser.app_metadata?.provider ?? "email";

  // 6. E-Mail/Passwort-Nutzer überspringen (Supabase sendet Bestätigungsmail)
  if (provider === "email") {
    console.log(`[send-welcome-email] Skip: email/password user ${userId}`);
    return new Response("Skipped", { status: 200 });
  }

  if (!email) {
    console.warn(`[send-welcome-email] Skip: no email for user ${userId}`);
    return new Response("Skipped: no email", { status: 200 });
  }

  // 7. Anzeigename aus auth-Metadaten (nicht aus Request-Body)
  const displayName =
    authUser.user_metadata?.name ??
    authUser.user_metadata?.full_name ??
    email.split("@")[0] ??
    "Spieler";

  // 8. Atomischer Claim via PL/pgSQL-Funktion
  const deliveryId = await attemptDelivery(userId, provider);
  if (!deliveryId) {
    console.log(`[send-welcome-email] Skip: already claimed for ${userId}`);
    return new Response("Already processed", { status: 200 });
  }

  // 9. Resend-API (RESEND_API_KEY bleibt serverseitig, nie im Frontend)
  try {
    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from:    FROM_EMAIL,
        to:      [email],           // Adresse ausschließlich aus auth.users
        subject: "Willkommen bei Plattentreff 🏓",
        html:    buildWelcomeEmail(displayName),
      }),
    });

    if (resendRes.ok) {
      const { id: msgId = null } = await resendRes.json();
      await markSent(userId, msgId);
      console.log(
        `[send-welcome-email] ✅ Sent to ${email} (${provider}) — Resend: ${msgId}`
      );
    } else {
      const errText = await resendRes.text();
      console.error(`[send-welcome-email] Resend error for ${userId}:`, errText);
      await markFailed(userId, errText);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[send-welcome-email] Unexpected error for ${userId}:`, msg);
    await markFailed(userId, msg);
    // Kein 5xx — pg_net soll nicht unnötig wiederholen
  }

  return new Response("OK", { status: 200 });
}

serve(handler);
