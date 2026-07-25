// Troia — iyzico PSP adapter (sandbox)
// IYZWSv2 istek imzalama + checkout-form init/retrieve + webhook doğrulama.
// Anahtarlar YALNIZ .env'den okunur; hiçbir yere loglanmaz/commit'lenmez.
//
// IYZWSv2: signature = HMAC_SHA256(secretKey, randomKey + uriPath + requestBody) [hex]
//          header    = "IYZWSv2 " + base64("apiKey:{k}&randomKey:{r}&signature:{s}")

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

function need(name) {
  const v = process.env[name];
  if (!v) throw new Error("Eksik env: " + name);
  return v;
}

/** IYZWSv2 Authorization header'ını üretir. randomKey enjekte edilebilir (deterministik test için). */
export function authHeader(uriPath, bodyStr, { apiKey, secretKey, randomKey } = {}) {
  apiKey = apiKey || need("IYZICO_API_KEY");
  secretKey = secretKey || need("IYZICO_SECRET_KEY");
  randomKey = randomKey || Date.now() + randomBytes(8).toString("hex");
  const payload = randomKey + uriPath + bodyStr;
  const signature = createHmac("sha256", secretKey).update(payload, "utf8").digest("hex");
  const authz = `apiKey:${apiKey}&randomKey:${randomKey}&signature:${signature}`;
  return {
    header: "IYZWSv2 " + Buffer.from(authz, "utf8").toString("base64"),
    randomKey,
    signature,
  };
}

/** İmzalı POST — RawIyzicoResult döner (asla önceden karar verilmiş success değil). */
export async function post(uriPath, body, { fetchImpl = globalThis.fetch } = {}) {
  const base = process.env.IYZICO_BASE_URL || "https://sandbox-api.iyzipay.com";
  const bodyStr = JSON.stringify(body);
  const { header, randomKey } = authHeader(uriPath, bodyStr);
  try {
    const res = await fetchImpl(base + uriPath, {
      method: "POST",
      headers: {
        Authorization: header,
        "x-iyzi-rnd": randomKey,
        "Content-Type": "application/json",
      },
      body: bodyStr,
      signal: AbortSignal.timeout(20_000), // retry YOK — re-POST çift-charge riski
    });
    const text = await res.text();
    if (!res.ok) return { kind: "malformed", reason: "http " + res.status };
    try {
      return { kind: "ok", data: JSON.parse(text) };
    } catch {
      return { kind: "malformed", reason: "unparseable" };
    }
  } catch (e) {
    return { kind: "timeout", reason: e.message }; // downstream UNKNOWN olarak okur
  }
}

/** Checkout form başlatır → paymentPageUrl döner (kart formu iyzico'da; PAN Troia'ya gelmez). */
export async function initializeCheckoutForm({ conversationId, priceTL, buyer, callbackUrl }, opts) {
  const price = formatPrice(priceTL);
  const body = {
    locale: "tr",
    conversationId,
    price,
    paidPrice: price,
    currency: "TRY",
    basketId: conversationId,
    paymentGroup: "PRODUCT",
    callbackUrl,
    enabledInstallments: [1],
    buyer,
    // basketItems vb. üretimde eklenir
  };
  return post("/payment/iyzipos/checkoutform/initialize/auth/ecom", body, opts);
}

/** Ödeme sonucunu SERVER-SIDE yeniden çeker (webhook asla sonucun kanıtı değildir). */
export async function retrieveCheckoutForm({ conversationId, token }, opts) {
  return post("/payment/iyzipos/checkoutform/auth/ecom/detail", { locale: "tr", conversationId, token }, opts);
}

/** Webhook imzasını fail-closed, timing-safe doğrular. */
export function verifyWebhook(rawBody, signatureHeader, secretKey = process.env.IYZICO_SECRET_KEY) {
  if (!secretKey || !signatureHeader || !rawBody) return false;
  const expected = createHmac("sha256", secretKey).update(rawBody, "utf8").digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(String(signatureHeader), "utf8");
  if (a.length !== b.length) return false; // uzunluk oracle'ı vermeden önce eşitle
  return timingSafeEqual(a, b);
}

/** iyzico fiyat formatı (SDK ile aynı) — kanonik olmayan ondalıkta fail-closed. */
export function formatPrice(tl) {
  const n = typeof tl === "string" ? tl : String(tl);
  if (!/^\d+(\.\d{1,2})?$/.test(n)) throw new Error("gecersiz fiyat: " + n);
  return n.includes(".") ? n : n + ".0";
}
