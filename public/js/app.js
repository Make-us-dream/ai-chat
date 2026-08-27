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
      const message =
        (typeof data.error === "string" && data.error) ||
        data.error?.message ||
        data.message ||
        `Request failed (${res.status})`;
      throw new Error(message);
    }

    const text = data?.choices?.[0]?.message?.content;
    if (typeof text !== "string" || !text) {
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
