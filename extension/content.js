// Troia content script — sayfadaki Troia ödeme intent'ini tanır (fail-closed).
// Anahtar tutmaz, imza atmaz; sadece DOM okur. Ham ödeme adresi OKUMAZ — yalnız merchantId.

(function () {
  "use strict";

  function validateIntent(x) {
    if (!x || typeof x !== "object") return null;
    const { merchantId, orderId, grossTL, valorDays } = x;
    if (typeof merchantId !== "string" || !merchantId) return null;
    if (typeof orderId !== "string" || !orderId) return null;
    if (!Number.isFinite(grossTL) || grossTL <= 0 || grossTL > 1e11) return null;
    const v = Number(valorDays);
    if (!Number.isInteger(v) || v < 1 || v > 365) return null;
    return { merchantId, orderId, grossTL, valorDays: v };
  }

  function readIntent() {
    const el = document.querySelector('script[type="application/troia+json"]');
    if (!el) return null;
    try {
      return validateIntent(JSON.parse(el.textContent || "{}"));
    } catch {
      return null; // parse edilemezse fail-closed
    }
  }

  let current = readIntent();

  // React vb. sonradan render ederse yakala
  const obs = new MutationObserver(() => {
    const next = readIntent();
    if (JSON.stringify(next) !== JSON.stringify(current)) current = next;
  });
  obs.observe(document.documentElement, { childList: true, subtree: true });

  // Popup intent'i ister
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg && msg.type === "troia:getIntent") {
      sendResponse({ intent: current, origin: location.host });
    }
    return true;
  });

  // Storefront "TROIA_PAID" ile sipariş tamamlar (hosted checkout → sayfa)
  window.addEventListener("message", (e) => {
    if (e.source === window && e.data && e.data.type === "TROIA_PAID") {
      document.dispatchEvent(new CustomEvent("troia:paid", { detail: e.data }));
    }
  });
})();
