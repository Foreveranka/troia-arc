// Troia background service worker: backend'e giden tek nokta (CORS/origin izolasyonu).
// Popup, backend'i doğrudan çağırmaz; buradan proxy'ler.

import { BACKEND_URL } from "./lib/config.js";

async function backend(path, opts = {}) {
  const res = await fetch(BACKEND_URL + path, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
    signal: AbortSignal.timeout(15000),
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  return { ok: res.ok, status: res.status, data };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    try {
      if (msg.type === "troia:quote") {
        const q = new URLSearchParams({ valorDays: String(msg.valorDays) });
        if (msg.grossUSD != null) q.set("grossUSD", String(msg.grossUSD));
        else q.set("grossTL", String(msg.grossTL));
        sendResponse(await backend("/quote?" + q.toString()));
      } else {
        sendResponse({ ok: false, status: 0, data: { error: "unknown" } });
      }
    } catch (e) {
      sendResponse({ ok: false, status: 0, data: { error: e.message } });
    }
  })();
  return true; // async
});
