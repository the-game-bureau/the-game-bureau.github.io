// anthropic-proxy — server-side proxy to Anthropic Claude API.
//
// Why server-side: keeps ANTHROPIC_API_KEY off the browser. The page
// posts a prompt; this function calls Anthropic with the key from
// Supabase Vault and returns just the text response.
//
// Setup:
//   Project Settings → Edge Functions → Secrets → ANTHROPIC_API_KEY
//   supabase functions deploy anthropic-proxy
//
// Invoke (browser):
//   const res = await fetch(
//     `${SUPABASE_URL}/functions/v1/anthropic-proxy`,
//     {
//       method: "POST",
//       headers: {
//         "Content-Type": "application/json",
//         apikey: SUPABASE_PUBLISHABLE_KEY,
//         Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
//       },
//       body: JSON.stringify({ prompt, model, max_tokens }),
//     },
//   );

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const DEFAULT_MODEL = "claude-haiku-4-5-20251001";
const DEFAULT_MAX_TOKENS = 8000;
const MAX_ALLOWED_TOKENS = 64000;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface ProxyBody {
  prompt?: string;
  model?: string;
  max_tokens?: number;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return json({ error: "POST only" }, 405);
  }
  if (!ANTHROPIC_API_KEY) {
    return json(
      { error: "ANTHROPIC_API_KEY is not set in Supabase secrets." },
      500,
    );
  }

  let body: ProxyBody;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }

  const prompt = String(body.prompt || "").trim();
  if (!prompt) return json({ error: '"prompt" is required.' }, 400);

  const model = String(body.model || DEFAULT_MODEL);
  const maxTokens = Math.min(
    Number(body.max_tokens) || DEFAULT_MAX_TOKENS,
    MAX_ALLOWED_TOKENS,
  );

  let upstream: Response;
  try {
    upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        messages: [{ role: "user", content: prompt }],
      }),
    });
  } catch (err) {
    console.error("[anthropic-proxy] network error", err);
    return json(
      { error: "Network error reaching Anthropic.", detail: String(err) },
      502,
    );
  }

  if (!upstream.ok) {
    const detail = await upstream.text();
    return json(
      {
        error: `Anthropic ${upstream.status}`,
        detail: detail.slice(0, 800),
      },
      upstream.status,
    );
  }

  const data = await upstream.json();
  const text = data?.content?.[0]?.text ?? "";
  const usage = data?.usage ?? null;
  return json({ text, usage, model: data?.model ?? model }, 200);
});

function json(obj: unknown, status: number): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      ...CORS_HEADERS,
      "content-type": "application/json; charset=utf-8",
    },
  });
}
