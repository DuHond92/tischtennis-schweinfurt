// Tests: send-welcome-email Edge Function
// Ausführen: deno test --allow-env --allow-net=none supabase/functions/send-welcome-email/index.test.ts

import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { handler } from "./index.ts";

// ── Test-Hilfsfunktionen ──────────────────────────────────────────────────────

const VALID_SECRET  = "test-secret-abc123";
const VALID_UUID    = "00000000-0000-0000-0000-000000000001";
const GOOGLE_USER   = {
  id:            VALID_UUID,
  email:         "test@example.com",
  app_metadata:  { provider: "google" },
  user_metadata: { name: "Max Muster", full_name: "Max Muster" },
};

function setupEnv(overrides: Record<string, string> = {}) {
  const defaults: Record<string, string> = {
    SUPABASE_URL:              "https://test.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
    RESEND_API_KEY:            "re_test_key",
    WELCOME_HOOK_SECRET:       VALID_SECRET,
    ...overrides,
  };
  for (const [k, v] of Object.entries(defaults)) Deno.env.set(k, v);
}

function makeRequest(
  body: unknown,
  secret: string | null = VALID_SECRET,
  method = "POST"
): Request {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (secret !== null) headers["x-webhook-secret"] = secret;
  return new Request("https://fn/send-welcome-email", {
    method,
    headers,
    body: JSON.stringify(body),
  });
}

// fetch-Mock-Fabrik: gibt eine Map von URL-Patterns → Response zurück
type FetchMock = (url: string, init?: RequestInit) => Promise<Response>;

function mockFetch(responses: Record<string, unknown>): FetchMock {
  return async (url: string) => {
    for (const [pattern, body] of Object.entries(responses)) {
      if (url.includes(pattern)) {
        return new Response(JSON.stringify(body), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

Deno.test("405 für nicht-POST-Methoden", async () => {
  setupEnv();
  const res = await handler(makeRequest({}, VALID_SECRET, "GET"));
  assertEquals(res.status, 405);
});

Deno.test("401 bei fehlendem Webhook-Secret", async () => {
  setupEnv();
  const res = await handler(makeRequest({ user_id: VALID_UUID }, null));
  assertEquals(res.status, 401);
});

Deno.test("401 bei falschem Webhook-Secret", async () => {
  setupEnv();
  const res = await handler(makeRequest({ user_id: VALID_UUID }, "falsches-secret"));
  assertEquals(res.status, 401);
});

Deno.test("400 bei fehlender user_id", async () => {
  setupEnv();
  const res = await handler(makeRequest({}));
  assertEquals(res.status, 400);
});

Deno.test("400 bei ungültigem UUID-Format", async () => {
  setupEnv();
  const res = await handler(makeRequest({ user_id: "nicht-eine-uuid" }));
  assertEquals(res.status, 400);
});

Deno.test("400 bei ungültigem JSON", async () => {
  setupEnv();
  const req = new Request("https://fn/send-welcome-email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-webhook-secret": VALID_SECRET,
    },
    body: "kein-json{{{",
  });
  const res = await handler(req);
  assertEquals(res.status, 400);
});

Deno.test("401 wenn WELCOME_HOOK_SECRET nicht gesetzt", async () => {
  setupEnv({ WELCOME_HOOK_SECRET: "" });
  const res = await handler(makeRequest({ user_id: VALID_UUID }));
  assertEquals(res.status, 401);
});

Deno.test("browserseitiger Direktaufruf mit Bearer-Token wird abgewiesen", async () => {
  setupEnv();
  // Kein x-webhook-secret, aber ein Authorization-Header wie ein Browser ihn senden würde
  const req = new Request("https://fn/send-welcome-email", {
    method: "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": "Bearer some-user-jwt-token",
    },
    body: JSON.stringify({ user_id: VALID_UUID }),
  });
  const res = await handler(req);
  assertEquals(res.status, 401);
});

Deno.test("200 Skipped für email/password-Nutzer", async () => {
  setupEnv();
  const emailUser = {
    ...GOOGLE_USER,
    app_metadata: { provider: "email" },
  };
  const origFetch = globalThis.fetch;
  globalThis.fetch = mockFetch({
    "/auth/v1/admin/users/": emailUser,
  }) as typeof fetch;
  try {
    const res = await handler(makeRequest({ user_id: VALID_UUID }));
    assertEquals(res.status, 200);
    assertEquals(await res.text(), "Skipped");
  } finally {
    globalThis.fetch = origFetch;
  }
});

Deno.test("200 OK bei erfolgreichem Erstversand", async () => {
  setupEnv();
  const deliveryId = "delivery-uuid-1234";
  const resendMsgId = "resend-msg-001";
  const origFetch = globalThis.fetch;
  const calls: string[] = [];

  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    calls.push(url as string);
    if ((url as string).includes("/auth/v1/admin/users/")) {
      return new Response(JSON.stringify(GOOGLE_USER), { status: 200 });
    }
    if ((url as string).includes("/rpc/attempt_email_delivery")) {
      return new Response(JSON.stringify(deliveryId), { status: 200 });
    }
    if ((url as string).includes("api.resend.com")) {
      return new Response(JSON.stringify({ id: resendMsgId }), { status: 200 });
    }
    if ((url as string).includes("/rest/v1/email_deliveries") ||
        (url as string).includes("/rest/v1/profiles")) {
      return new Response("{}", { status: 200 });
    }
    throw new Error(`Unerwarteter fetch: ${url}`);
  }) as typeof fetch;

  try {
    const res = await handler(makeRequest({ user_id: VALID_UUID }));
    assertEquals(res.status, 200);
    // Resend wurde aufgerufen
    assertEquals(calls.some((u) => u.includes("api.resend.com")), true);
    // welcome_email_sent_at wurde auf profiles gesetzt
    assertEquals(calls.some((u) => u.includes("/rest/v1/profiles")), true);
  } finally {
    globalThis.fetch = origFetch;
  }
});

Deno.test("200 und status=failed bei Resend-Fehler (Login nicht unterbrochen)", async () => {
  setupEnv();
  const origFetch = globalThis.fetch;
  const patchBodies: string[] = [];

  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    if ((url as string).includes("/auth/v1/admin/users/")) {
      return new Response(JSON.stringify(GOOGLE_USER), { status: 200 });
    }
    if ((url as string).includes("/rpc/attempt_email_delivery")) {
      return new Response(JSON.stringify("some-delivery-id"), { status: 200 });
    }
    if ((url as string).includes("api.resend.com")) {
      return new Response("Resend API error", { status: 429 });
    }
    if ((url as string).includes("/rest/v1/email_deliveries")) {
      if (init?.method === "PATCH") patchBodies.push(init.body as string);
      return new Response("{}", { status: 200 });
    }
    return new Response("{}", { status: 200 });
  }) as typeof fetch;

  try {
    const res = await handler(makeRequest({ user_id: VALID_UUID }));
    // Trotz Resend-Fehler gibt die Function 200 zurück (Login darf nicht brechen)
    assertEquals(res.status, 200);
    // email_deliveries wurde auf 'failed' gesetzt (status-Wert)
    const failedPatch = patchBodies.find((b) => b.includes('"failed"'));
    assertEquals(failedPatch !== undefined, true);
    // last_error wurde befüllt
    const errorPatch = patchBodies.find((b) => b.includes("last_error"));
    assertEquals(errorPatch !== undefined, true);
    // profiles.welcome_email_sent_at wurde NICHT gesetzt
    const sentAtPatch = patchBodies.find((b) => b.includes("welcome_email_sent_at"));
    assertEquals(sentAtPatch, undefined);
  } finally {
    globalThis.fetch = origFetch;
  }
});

Deno.test("200 Already processed bei zweitem Trigger-Aufruf (kein Duplikat)", async () => {
  setupEnv();
  const origFetch = globalThis.fetch;
  const resenCalls: string[] = [];

  globalThis.fetch = (async (url: string) => {
    if ((url as string).includes("/auth/v1/admin/users/")) {
      return new Response(JSON.stringify(GOOGLE_USER), { status: 200 });
    }
    if ((url as string).includes("/rpc/attempt_email_delivery")) {
      // Simulates: delivery already claimed → returns null
      return new Response("null", { status: 200 });
    }
    if ((url as string).includes("api.resend.com")) {
      resenCalls.push(url as string);
    }
    return new Response("{}", { status: 200 });
  }) as typeof fetch;

  try {
    const res = await handler(makeRequest({ user_id: VALID_UUID }));
    assertEquals(res.status, 200);
    assertEquals(await res.text(), "Already processed");
    assertEquals(resenCalls.length, 0); // Resend wurde nicht aufgerufen
  } finally {
    globalThis.fetch = origFetch;
  }
});

Deno.test("parallele Trigger-Aufrufe senden nur eine Mail", async () => {
  setupEnv();
  // Simuliert zwei gleichzeitige Requests: nur der erste gewinnt den Claim
  let claimCount = 0;
  const origFetch = globalThis.fetch;
  const resendCalls: string[] = [];

  globalThis.fetch = (async (url: string) => {
    if ((url as string).includes("/auth/v1/admin/users/")) {
      return new Response(JSON.stringify(GOOGLE_USER), { status: 200 });
    }
    if ((url as string).includes("/rpc/attempt_email_delivery")) {
      claimCount++;
      // Erster Claim gewinnt, zweiter gibt null zurück
      const val = claimCount === 1 ? "delivery-id-1" : null;
      return new Response(JSON.stringify(val), { status: 200 });
    }
    if ((url as string).includes("api.resend.com")) {
      resendCalls.push(url as string);
      return new Response(JSON.stringify({ id: "msg-1" }), { status: 200 });
    }
    return new Response("{}", { status: 200 });
  }) as typeof fetch;

  try {
    const [res1, res2] = await Promise.all([
      handler(makeRequest({ user_id: VALID_UUID })),
      handler(makeRequest({ user_id: VALID_UUID })),
    ]);
    assertEquals(res1.status, 200);
    assertEquals(res2.status, 200);
    assertEquals(resendCalls.length, 1); // Nur ein Resend-Aufruf
  } finally {
    globalThis.fetch = origFetch;
  }
});

Deno.test("Retry nach failed-Status versendet erneut", async () => {
  setupEnv();
  const origFetch = globalThis.fetch;
  const resendCalls: string[] = [];

  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    if ((url as string).includes("/auth/v1/admin/users/")) {
      return new Response(JSON.stringify(GOOGLE_USER), { status: 200 });
    }
    if ((url as string).includes("/rpc/attempt_email_delivery")) {
      // Claim gelingt (simulate: vorheriger Versuch war failed)
      return new Response(JSON.stringify("retry-delivery-id"), { status: 200 });
    }
    if ((url as string).includes("api.resend.com")) {
      resendCalls.push(url as string);
      return new Response(JSON.stringify({ id: "retry-msg-1" }), { status: 200 });
    }
    return new Response("{}", { status: 200 });
  }) as typeof fetch;

  try {
    const res = await handler(makeRequest({ user_id: VALID_UUID }));
    assertEquals(res.status, 200);
    assertEquals(resendCalls.length, 1);
  } finally {
    globalThis.fetch = origFetch;
  }
});

Deno.test("welcome_email_sent_at wird nur nach erfolgreichem Versand gesetzt", async () => {
  setupEnv();
  const origFetch = globalThis.fetch;
  const profilePatches: string[] = [];

  // Resend schlägt fehl
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    if ((url as string).includes("/auth/v1/admin/users/")) {
      return new Response(JSON.stringify(GOOGLE_USER), { status: 200 });
    }
    if ((url as string).includes("/rpc/attempt_email_delivery")) {
      return new Response(JSON.stringify("some-id"), { status: 200 });
    }
    if ((url as string).includes("api.resend.com")) {
      return new Response("Server Error", { status: 500 });
    }
    if ((url as string).includes("/rest/v1/profiles") && init?.method === "PATCH") {
      profilePatches.push(init.body as string);
    }
    return new Response("{}", { status: 200 });
  }) as typeof fetch;

  try {
    await handler(makeRequest({ user_id: VALID_UUID }));
    // Kein PATCH auf profiles (welcome_email_sent_at nicht gesetzt)
    assertEquals(profilePatches.length, 0);
  } finally {
    globalThis.fetch = origFetch;
  }
});
