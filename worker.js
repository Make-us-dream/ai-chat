import { onRequestPost } from "./functions/api/chat.js";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/chat" && request.method === "POST") {
      return onRequestPost({ request, env });
    }

    return env.ASSETS.fetch(request);
  },
};
