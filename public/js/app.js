const form = document.getElementById("chat-form");
const modelSelect = document.getElementById("model");
const contentInput = document.getElementById("content");
const submitBtn = document.getElementById("submit-btn");
const downloadBtn = document.getElementById("download-btn");
const statusEl = document.getElementById("status");
const responseEl = document.getElementById("response");

let lastExchange = null;

function setStatus(message, isError = false) {
  if (!message) {
    statusEl.hidden = true;
    statusEl.textContent = "";
    statusEl.classList.remove("error");
    return;
  }
  statusEl.hidden = false;
  statusEl.textContent = message;
  statusEl.classList.toggle("error", isError);
}

function setResponse(text, empty = false) {
  responseEl.textContent = text;
  responseEl.classList.toggle("empty", empty);
}

function setDownloadEnabled(enabled) {
  downloadBtn.hidden = !enabled;
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
      return "";
    })
    .filter(Boolean)
    .join("\n")
    .trim();
}

function extractAssistantContent(data) {
  if (typeof data?.content === "string" && data.content.trim()) {
    return data.content.trim();
  }

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

function downloadExchange() {
  if (!lastExchange) {
    return;
  }

  const body = `Prompt:\n${lastExchange.prompt}\n\nResponse:\n${lastExchange.response}\n`;
  const blob = new Blob([body], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  link.href = url;
  link.download = `ai-chat-${stamp}.txt`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const model = modelSelect.value;
  const content = contentInput.value.trim();

  if (!content) {
    setStatus("Enter a prompt before submitting.", true);
    return;
  }

  submitBtn.disabled = true;
  lastExchange = null;
  setDownloadEnabled(false);
  setStatus("Sending request…");
  setResponse("Waiting for a response.", true);

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content }],
      }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      let message =
        (typeof data.error === "string" && data.error) ||
        data.error?.message ||
        data.message ||
        `Request failed (${res.status})`;
      if (typeof data.preview === "string" && data.preview) {
        message += ` Preview: ${data.preview}`;
      }
      throw new Error(message);
    }

    const text = extractAssistantContent(data);
    if (!text) {
      throw new Error("The API response did not include message content.");
    }

    lastExchange = { prompt: content, response: text };
    setStatus("");
    setResponse(text, false);
    setDownloadEnabled(true);
  } catch (error) {
    lastExchange = null;
    setDownloadEnabled(false);
    setStatus(error.message || "Request failed.", true);
    setResponse("Waiting for a response.", true);
  } finally {
    submitBtn.disabled = false;
  }
});

downloadBtn.addEventListener("click", downloadExchange);
