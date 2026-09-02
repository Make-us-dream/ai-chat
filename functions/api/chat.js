const ALLOWED_MODELS = new Set(["claude-opus-5", "claude-opus-5-thinking"]);
const UPSTREAM_URL = "https://api.justwoker.icu/v1/chat/completions";

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function extractTextFromParts(parts) {
  if (!Array.isArray(parts)) {
    return "";
  }

  return parts
    .map((part) => {
      if (typeof part === "string") {
        return part;
      }
      if (!part || typeof part !== "object") {
        return "";
      }
      if (typeof part.text === "string") {
        return part.text;
      }
      if (typeof part.content === "string") {
        return part.content;
      }
      if (typeof part.output_text === "string") {
        return part.output_text;
      }
      if (typeof part.thinking === "string") {
        return "";
      }
      return "";
    })
    .filter(Boolean)
    .join("\n")
    .trim();
}

function extractAssistantContent(data) {
  const message = data?.choices?.[0]?.message;
  const content = message?.content ?? data?.choices?.[0]?.text ?? data?.content;

  if (typeof content === "string" && content.trim()) {
    return content.trim();
  }

  if (Array.isArray(content)) {
    const fromParts = extractTextFromParts(content);
    if (fromParts) {
      return fromParts;
    }
  }

  if (typeof message?.reasoning_content === "string" && message.reasoning_content.trim()) {
    return message.reasoning_content.trim();
  }

  return "";
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

  if (!upstream.ok) {
    const message =
      (typeof data.error === "string" && data.error) ||
      data.error?.message ||
      data.message ||
      `Upstream request failed (${upstream.status})`;
    return json({ error: message, upstream: data }, upstream.status);
  }

  const assistantContent = extractAssistantContent(data);
  if (!assistantContent) {
    return json(
      {
        error: "The API response did not include message content.",
        upstream: data,
      },
      502
    );
  }

  return json({
    ...data,
    content: assistantContent,
    choices: [
      {
        ...(data.choices?.[0] || { index: 0 }),
        message: {
          role: "assistant",
          content: assistantContent,
        },
      },
    ],
  });
}
