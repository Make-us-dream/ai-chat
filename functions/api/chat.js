const ALLOWED_MODELS = new Set(["claude-opus-5", "claude-opus-5-thinking"]);
const UPSTREAM_URL = "https://api.justwoker.icu/v1/chat/completions";

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function onRequestPost({ request, env }) {
  if (!env.API_TOKEN) {
    return json({ error: "Server is not configured." }, 500);
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "Request body must be JSON." }, 400);
  }

  const model = payload?.model;
  if (!ALLOWED_MODELS.has(model)) {
    return json({ error: "Unsupported model." }, 400);
  }

  const messages = payload?.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return json({ error: "messages is required." }, 400);
  }

  const content = messages[0]?.content;
  if (typeof content !== "string" || !content.trim()) {
    return json({ error: "content is required." }, 400);
  }

  const upstream = await fetch(UPSTREAM_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.API_TOKEN}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: content.trim() }],
    }),
  });

  const text = await upstream.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return json({ error: "Upstream returned a non-JSON response." }, upstream.status || 502);
  }

  return json(data, upstream.status);
}
