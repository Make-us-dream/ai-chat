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

function previewBody(text) {
  const cleaned = String(text || "")
    .replace(/^\uFEFF/, "")
    .trim();
  if (!cleaned) {
    return "(empty body)";
  }
  return cleaned.slice(0, 240);
}

function parseUpstreamJson(text) {
  const cleaned = String(text || "")
    .replace(/^\uFEFF/, "")
    .trim();

  if (!cleaned) {
    return { ok: false, error: "empty" };
  }

  // Some gateways prepend SSE-style lines even for non-stream calls.
  if (cleaned.startsWith("data:")) {
    const payloads = cleaned
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .filter((line) => line && line !== "[DONE]");

    for (let i = payloads.length - 1; i >= 0; i -= 1) {
      try {
        return { ok: true, data: JSON.parse(payloads[i]) };
      } catch {
        // try previous payload
      }
    }
  }

  try {
    return { ok: true, data: JSON.parse(cleaned) };
  } catch {
    return { ok: false, error: "invalid-json" };
  }
}

export async function onRequestPost({ request, env }) {
  const apiToken = typeof env.API_TOKEN === "string" ? env.API_TOKEN.trim() : "";
  if (!apiToken) {
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

  let upstream;
  try {
    upstream = await fetch(UPSTREAM_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${apiToken}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: content.trim() }],
      }),
    });
  } catch (error) {
    return json(
      {
        error: `Failed to reach upstream API: ${error?.message || "network error"}`,
      },
      502
    );
  }

  const text = await upstream.text();
  const contentType = upstream.headers.get("content-type") || "";
  const parsed = parseUpstreamJson(text);

  if (!parsed.ok) {
    const looksHtml = /<html|<!doctype/i.test(text);
    return json(
      {
        error: looksHtml
          ? `Upstream returned HTML instead of JSON (HTTP ${upstream.status}). The API host may be blocking Cloudflare Worker requests.`
          : `Upstream returned a non-JSON response (HTTP ${upstream.status}, content-type: ${contentType || "unknown"}).`,
        preview: previewBody(text),
      },
      502
    );
  }

  const data = parsed.data;

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
