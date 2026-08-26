const form = document.getElementById("chat-form");
const modelSelect = document.getElementById("model");
const contentInput = document.getElementById("content");
const submitBtn = document.getElementById("submit-btn");
const statusEl = document.getElementById("status");
const responseEl = document.getElementById("response");

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

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const model = modelSelect.value;
  const content = contentInput.value.trim();

  if (!content) {
    setStatus("Enter a prompt before submitting.", true);
    return;
  }

  submitBtn.disabled = true;
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

    setStatus("");
    setResponse(text, false);
  } catch (error) {
    setStatus(error.message || "Request failed.", true);
    setResponse("Waiting for a response.", true);
  } finally {
    submitBtn.disabled = false;
  }
});
