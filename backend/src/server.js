// Troia: backend HTTP server (bağımlılık az: node:http)
// Endpoint'ler:
//   POST /onboard        { slug, payout }                 → registry'ye merchant kaydı
//   GET  /quote?grossTL=&valorDays=                        → komisyon önizleme (settle etmeden)
//   POST /pos/webhook     { posRef, slug, grossTL, valorDays }  (iyzico imzalı, mock)  → doğrula → settle
//   GET  /health
//
// Money-first: gerçekte önce iyzico charge onaylanır, SONRA on-chain settle. Bu PoC webhook'u
// charge'ı temsil eder; imza fail-closed doğrulanır (imzasız istek 401).

import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// .env'i kendimiz yükle (node src/server.js ile de çalışsın)
try {
  const envPath = join(dirname(fileURLToPath(import.meta.url)), "../.env");
  if (existsSync(envPath) && typeof process.loadEnvFile === "function") process.loadEnvFile(envPath);
} catch { /* yoksa sorun değil, ortam değişkenleri dışarıdan gelebilir */ }

import { estimateFromSeries, commission, usdcOutFor } from "./commission.js";
import { fetchUsdTrySeries } from "./oracle.js";
import { verifyWebhook, initializeCheckoutForm, retrieveCheckoutForm, createPayment } from "./iyzico.js";
import * as chain from "./chain.js";

const PORT = process.env.PORT || 3000;
const WEB = join(dirname(fileURLToPath(import.meta.url)), "../../web");
function serveHtml(res, file) {
  try {
    const b = readFileSync(join(WEB, file));
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(b);
  } catch {
    res.writeHead(404); res.end("not found");
  }
}

function P() {
  return {
    z: Number(process.env.COMMISSION_Z || 1),
    marginBps: Number(process.env.COMMISSION_MARGIN_BPS || 30),
    usdFundingAprBps: Number(process.env.USD_FUNDING_APR_BPS || 430),
  };
}

let _cache = { at: 0, mu: 0, sigma: 0, spot: 0 };
async function rates() {
  if (Date.now() - _cache.at < 60 * 60 * 1000 && _cache.spot) return _cache; // 1 saat cache
  const { closes, spot, source } = await fetchUsdTrySeries();
  let mu, sigma;
  if (closes && closes.length >= 2) ({ mu, sigma } = estimateFromSeries(closes));
  else { mu = 0.00055; sigma = 0.003; } // fallback: sakin piyasa varsayılanı
  _cache = { at: Date.now(), mu, sigma, spot, source };
  return _cache;
}

function json(res, code, obj) {
  const b = JSON.stringify(obj);
  res.writeHead(code, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(b) });
  res.end(b);
}
function readBody(req, limit = 10_240) {
  return new Promise((resolve, reject) => {
    const chunks = []; let n = 0;
    req.on("data", (c) => {
      n += c.length;
      if (n > limit) { reject(new Error("body too large")); req.destroy(); return; }
      chunks.push(c); // Buffer topla, string '+=' çok-baytlı UTF-8'i chunk sınırında bozar
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

// Ödeme tutarını hesaplar → { chargeTLkurus (alıcının Troy kartından çekilecek ₺), usdcOut6 (satıcıya USDC, 6-dec) }
// grossUSD (USD cent): uluslararası mağaza USD fiyatlar → SATICI TAM fiyatı USDC alır; komisyon ALICININ ₺ tutarına eklenir.
// grossTL (kuruş): geriye dönük ₺-fiyatlı → alıcı sabit ₺ öder, satıcı komisyon düşülmüş USDC alır.
function computeSettlement(src, spot, totalBps) {
  const usdCents = Number(src.grossUSD);
  if (usdCents > 0) {
    const chargeTLkurus = Math.round(usdCents * spot * (1 + totalBps / 10_000)); // par ₺ + komisyon
    const usdcOut6 = BigInt(Math.round(usdCents * 1e4)); // cent → 6-dec USDC (satıcı tam fiyatı alır)
    return { chargeTLkurus, usdcOut6 };
  }
  const grossTL = Number(src.grossTL);
  return { chargeTLkurus: grossTL, usdcOut6: usdcOutFor(grossTL, spot, totalBps) };
}

// --- iyzico sandbox durum + geçici oturum belleği (demo için in-memory) ---
// iyzico ancak GERÇEK sandbox anahtarları varsa açık (ikisi de "sandbox-" ile başlamalı) →
// placeholder/webhook-secret ile açılıp demo'yu kırmaz.
const iyzicoOn = () => (process.env.IYZICO_API_KEY || "").startsWith("sandbox-") && (process.env.IYZICO_SECRET_KEY || "").startsWith("sandbox-");
const pendingPay = new Map(); // token -> { merchantId, orderId, grossTL, valorDays }
const payResult = new Map();  // token -> { ok, ... } | { error }
function demoBuyer(req) {
  const ip = String(req.headers["x-forwarded-for"] || (req.socket && req.socket.remoteAddress) || "85.34.78.112").split(",")[0].trim().replace(/^::ffff:/, "") || "85.34.78.112";
  return {
    id: "BY-demo", name: "Demo", surname: "Kullanici", gsmNumber: "+905350000000",
    email: "demo@troia.dev", identityNumber: "11111111111",
    registrationAddress: "Demo Mah. Troia Sok. No:1", ip, city: "Istanbul", country: "Turkey", zipCode: "34000",
  };
}
function payPage(title, sub) {
  return `<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1">
<title>Troia</title><style>body{margin:0;height:100vh;display:flex;align-items:center;justify-content:center;
background:#0C1B30;color:#F4EFE4;font-family:-apple-system,Arial,sans-serif;text-align:center}
.c{max-width:360px;padding:24px}h1{font-family:Georgia,serif;font-weight:500;font-size:1.5rem;margin:0 0 10px}
p{color:#9FB1CB;font-size:.9rem;line-height:1.5}</style><div class=c><h1>${title}</h1><p>${sub || "Bu sekmeyi kapatabilirsiniz."}</p></div>`;
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://x");

    if (req.method === "GET" && url.pathname === "/health") return json(res, 200, { ok: true, iyzico: iyzicoOn() });

    // --- demo sayfaları (localhost) ---
    if (req.method === "GET" && (url.pathname === "/store" || url.pathname === "/")) return serveHtml(res, "demo-store.html");
    if (req.method === "GET" && url.pathname === "/checkout") return serveHtml(res, "demo-checkout.html");

    // --- demo ödeme (iyzico charge'ı temsil eder → doğrudan settle; imzalı yol /pos/webhook'ta kanıtlı) ---
    // GÜVENLİK: kimlik doğrulaması yok → yalnız açıkça açılmış demo derlemelerinde. Üretimde asla.
    if (req.method === "POST" && url.pathname === "/demo/pay") {
      if (process.env.TROIA_ENABLE_DEMO !== "1") return json(res, 404, { error: "not found" });
      const b = JSON.parse(await readBody(req) || "{}");
      const valorDays = Number(b.valorDays || process.env.DEFAULT_VALOR_DAYS || 7);
      if (!b.merchantId || !b.orderId || !(valorDays >= 1 && valorDays <= 365)) return json(res, 400, { error: "gecersiz istek" });
      const { active } = await chain.resolveMerchant(b.merchantId);
      if (!active) return json(res, 400, { error: "merchant kayitli/aktif degil" });
      const { mu, sigma, spot } = await rates();
      const c = commission(valorDays, { mu, sigma, ...P() });
      const { chargeTLkurus, usdcOut6 } = computeSettlement(b, spot, c.totalBps);
      if (!(chargeTLkurus > 0) || chargeTLkurus > 1e11) return json(res, 400, { error: "gecersiz tutar" });
      // posRef sipariş-başına STABİL → aynı sipariş iki kez settle edilemez (on-chain isSettled guard).
      const posRefStr = "demo-" + b.orderId;
      const r = await chain.settle({ posRefStr, slug: b.merchantId, grossTLkurus: chargeTLkurus, commissionBps: c.totalBps, valorDays, usdcOut6: usdcOut6.toString() });
      return json(res, 200, { ok: true, commissionBps: c.totalBps, chargeTLkurus, usdcOut: Number(usdcOut6) / 1e6, ...r });
    }

    // --- komisyon önizleme --- (grossTL=kuruş VEYA grossUSD=USD cent kabul eder)
    if (req.method === "GET" && url.pathname === "/quote") {
      const valorDays = Number(url.searchParams.get("valorDays") || process.env.DEFAULT_VALOR_DAYS || 7);
      if (!(valorDays >= 1 && valorDays <= 365)) return json(res, 400, { error: "gecersiz parametre" });
      const { mu, sigma, spot } = await rates();
      const c = commission(valorDays, { mu, sigma, ...P() });
      const { chargeTLkurus, usdcOut6 } = computeSettlement({ grossTL: url.searchParams.get("grossTL"), grossUSD: url.searchParams.get("grossUSD") }, spot, c.totalBps);
      if (!(chargeTLkurus > 0) || chargeTLkurus > 1e11) return json(res, 400, { error: "gecersiz tutar" });
      return json(res, 200, { grossTLkurus: chargeTLkurus, chargeTLkurus, valorDays, usdTryRate: spot, commission: c, usdcOut6: usdcOut6.toString(), usdcOut: Number(usdcOut6) / 1e6 });
    }

    // --- iyzico sandbox: DİREKT kart ödemesi (kart eklentide girilir → sandbox panelinde görünür → settle) ---
    if (req.method === "POST" && url.pathname === "/pay/card") {
      if (!iyzicoOn()) return json(res, 404, { error: "iyzico yapilandirilmadi" });
      const b = JSON.parse(await readBody(req) || "{}");
      const c = b.card || {};
      const valorDays = Number(b.valorDays || process.env.DEFAULT_VALOR_DAYS || 7);
      if (!b.merchantId || !b.orderId || !c.cardNumber || !c.expireMonth || !c.expireYear || !c.cvc || !(valorDays >= 1 && valorDays <= 365))
        return json(res, 400, { error: "gecersiz istek" });
      const { active } = await chain.resolveMerchant(b.merchantId);
      if (!active) return json(res, 400, { error: "merchant kayitli/aktif degil" });
      const { mu, sigma, spot } = await rates();
      const comm = commission(valorDays, { mu, sigma, ...P() });
      const { chargeTLkurus, usdcOut6 } = computeSettlement(b, spot, comm.totalBps);
      if (!(chargeTLkurus > 0) || chargeTLkurus > 1e11) return json(res, 400, { error: "gecersiz tutar" });
      const priceTL = (chargeTLkurus / 100).toFixed(2);
      const pay = await createPayment({ conversationId: b.orderId, priceTL, card: c, buyer: demoBuyer(req), item: b.itemName });
      if (pay.kind !== "ok" || !pay.data || pay.data.status !== "success") {
        return json(res, 402, { error: (pay.data && pay.data.errorMessage) || "iyzico odeme reddedildi" });
      }
      // iyzico'da başarılı ödeme (sandbox panelinde görünür) → merchant'a on-chain USDC settle
      try {
        const r = await chain.settle({ posRefStr: "iyz-" + b.orderId, slug: b.merchantId, grossTLkurus: chargeTLkurus, commissionBps: comm.totalBps, valorDays, usdcOut6: usdcOut6.toString() });
        return json(res, 200, { ok: true, paymentId: pay.data.paymentId, chargeTLkurus, usdcOut: Number(usdcOut6) / 1e6, ...r });
      } catch (e) {
        console.error("[troia] iyz-card settle:", e.message);
        return json(res, 200, { ok: true, paymentId: pay.data.paymentId, chargeTLkurus, usdcOut: Number(usdcOut6) / 1e6, settleError: true });
      }
    }

    // --- iyzico sandbox: checkout form başlat (gerçek kart formu iyzico'da) ---
    if (req.method === "POST" && url.pathname === "/pay/init") {
      if (!iyzicoOn()) return json(res, 400, { error: "iyzico yapilandirilmadi" });
      const b = JSON.parse(await readBody(req) || "{}");
      const valorDays = Number(b.valorDays || process.env.DEFAULT_VALOR_DAYS || 7);
      if (!b.merchantId || !b.orderId || !(valorDays >= 1 && valorDays <= 365)) return json(res, 400, { error: "gecersiz istek" });
      const { active } = await chain.resolveMerchant(b.merchantId);
      if (!active) return json(res, 400, { error: "merchant kayitli/aktif degil" });
      const { mu, sigma, spot } = await rates();
      const c = commission(valorDays, { mu, sigma, ...P() });
      const { chargeTLkurus } = computeSettlement(b, spot, c.totalBps);
      if (!(chargeTLkurus > 0) || chargeTLkurus > 1e11) return json(res, 400, { error: "gecersiz tutar" });
      const priceTL = (chargeTLkurus / 100).toFixed(2);
      const base = process.env.PUBLIC_BASE_URL || ("http://localhost:" + PORT);
      const r = await initializeCheckoutForm({ conversationId: b.orderId, priceTL, buyer: demoBuyer(req), callbackUrl: base + "/pay/callback" });
      if (r.kind !== "ok" || !r.data || r.data.status !== "success" || !r.data.token) {
        return json(res, 502, { error: "iyzico init basarisiz", detail: (r.data && r.data.errorMessage) || r.reason });
      }
      pendingPay.set(r.data.token, { merchantId: b.merchantId, orderId: b.orderId, grossUSD: b.grossUSD, grossTL: b.grossTL, valorDays });
      return json(res, 200, { token: r.data.token, paymentPageUrl: r.data.paymentPageUrl });
    }

    // --- iyzico callback: kullanıcı iyzico'da ödedi → sonucu server-side doğrula → settle ---
    if (req.method === "POST" && url.pathname === "/pay/callback") {
      const raw = await readBody(req);
      let token = new URLSearchParams(raw).get("token");
      if (!token) { try { token = JSON.parse(raw).token; } catch { /* yok */ } }
      const pend = token && pendingPay.get(token);
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      if (!token || !pend) return res.end(payPage("Geçersiz ödeme oturumu"));
      const r = await retrieveCheckoutForm({ conversationId: pend.orderId, token });
      const ok = r.kind === "ok" && r.data && r.data.status === "success" && r.data.paymentStatus === "SUCCESS";
      if (!ok) { payResult.set(token, { error: (r.data && r.data.errorMessage) || "odeme onaylanmadi" }); return res.end(payPage("Ödeme onaylanmadı")); }
      const { mu, sigma, spot } = await rates();
      const c = commission(pend.valorDays, { mu, sigma, ...P() });
      const { chargeTLkurus, usdcOut6 } = computeSettlement(pend, spot, c.totalBps);
      try {
        const s = await chain.settle({ posRefStr: "iyz-" + pend.orderId, slug: pend.merchantId, grossTLkurus: chargeTLkurus, commissionBps: c.totalBps, valorDays: pend.valorDays, usdcOut6: usdcOut6.toString() });
        payResult.set(token, { ok: true, commissionBps: c.totalBps, usdcOut: Number(usdcOut6) / 1e6, ...s });
        return res.end(payPage("Ödeme başarılı ✓", "Satıcıya USDC gönderildi. Bu sekmeyi kapatabilirsiniz."));
      } catch (e) {
        console.error("[troia] iyz settle:", e.message);
        payResult.set(token, { error: "settle hatasi" });
        return res.end(payPage("Ödeme alındı", "Zincir kaydı bekleniyor. Bu sekmeyi kapatabilirsiniz."));
      }
    }

    // --- iyzico ödeme durumu (overlay bunu poll eder) ---
    if (req.method === "GET" && url.pathname === "/pay/status") {
      const token = url.searchParams.get("token");
      const r = token && payResult.get(token);
      if (!r) return json(res, 200, { status: "pending" });
      return json(res, 200, r.ok ? { status: "success", ...r } : { status: "failed", ...r });
    }

    // --- onboarding --- (operatör-yalnız: payout adresi belirlemek ayrıcalıklı işlemdir)
    if (req.method === "POST" && url.pathname === "/onboard") {
      const admin = process.env.OPERATOR_ADMIN_TOKEN;
      if (!admin || req.headers["x-admin-token"] !== admin) return json(res, 401, { error: "yetkisiz" });
      const body = JSON.parse(await readBody(req) || "{}");
      if (!body.slug || !/^0x[0-9a-fA-F]{40}$/.test(body.payout || "")) return json(res, 400, { error: "slug + gecerli payout gerekli" });
      const r = await chain.registerMerchant(body.slug, body.payout);
      return json(res, 200, { ok: true, ...r });
    }

    // --- POS webhook (charge onaylandı) → settle ---
    if (req.method === "POST" && url.pathname === "/pos/webhook") {
      const raw = await readBody(req);
      const sig = req.headers["x-signature"];
      if (!verifyWebhook(raw, sig, process.env.IYZICO_SECRET_KEY)) return json(res, 401, { error: "imza dogrulanamadi" });
      const b = JSON.parse(raw || "{}");
      const grossTL = Number(b.grossTL), valorDays = Number(b.valorDays || process.env.DEFAULT_VALOR_DAYS || 7);
      if (!b.posRef || !b.slug || !(grossTL > 0) || !(valorDays >= 1 && valorDays <= 365)) return json(res, 400, { error: "gecersiz webhook govdesi" });
      const { active } = await chain.resolveMerchant(b.slug);
      if (!active) return json(res, 400, { error: "merchant kayitli/aktif degil" });
      const { mu, sigma, spot } = await rates();
      const c = commission(valorDays, { mu, sigma, ...P() });
      const usdcOut = usdcOutFor(grossTL, spot, c.totalBps);
      const r = await chain.settle({ posRefStr: b.posRef, slug: b.slug, grossTLkurus: grossTL, commissionBps: c.totalBps, valorDays, usdcOut6: usdcOut.toString() });
      return json(res, 200, { ok: true, commissionBps: c.totalBps, usdcOut: Number(usdcOut) / 1e6, ...r });
    }

    json(res, 404, { error: "not found" });
  } catch (e) {
    // hata sızıntısı yok, istemciye jenerik, detay logda
    console.error("[troia]", e.message);
    json(res, 500, { error: "sunucu hatasi" });
  }
});

server.listen(PORT, () => console.log(`Troia backend :${PORT}`));
