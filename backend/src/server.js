// Troia — backend HTTP server (bağımlılık az: node:http)
// Endpoint'ler:
//   POST /onboard        { slug, payout }                 → registry'ye merchant kaydı
//   GET  /quote?grossTL=&valorDays=                        → komisyon önizleme (settle etmeden)
//   POST /pos/webhook     { posRef, slug, grossTL, valorDays }  (iyzico imzalı — mock)  → doğrula → settle
//   GET  /health
//
// Money-first: gerçekte önce iyzico charge onaylanır, SONRA on-chain settle. Bu PoC webhook'u
// charge'ı temsil eder; imza fail-closed doğrulanır (imzasız istek 401).

import { createServer } from "node:http";
import { estimateFromSeries, commission, usdcOutFor } from "./commission.js";
import { fetchUsdTrySeries } from "./oracle.js";
import { verifyWebhook } from "./iyzico.js";
import * as chain from "./chain.js";

const PORT = process.env.PORT || 3000;

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
    let d = "", n = 0;
    req.on("data", (c) => {
      n += c.length;
      if (n > limit) { reject(new Error("body too large")); req.destroy(); return; }
      d += c;
    });
    req.on("end", () => resolve(d));
    req.on("error", reject);
  });
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://x");

    if (req.method === "GET" && url.pathname === "/health") return json(res, 200, { ok: true });

    // --- komisyon önizleme ---
    if (req.method === "GET" && url.pathname === "/quote") {
      const grossTL = Number(url.searchParams.get("grossTL"));      // kuruş
      const valorDays = Number(url.searchParams.get("valorDays") || process.env.DEFAULT_VALOR_DAYS || 7);
      if (!(grossTL > 0) || !(valorDays >= 1 && valorDays <= 365)) return json(res, 400, { error: "gecersiz parametre" });
      const { mu, sigma, spot } = await rates();
      const c = commission(valorDays, { mu, sigma, ...P() });
      const usdcOut = usdcOutFor(grossTL, spot, c.totalBps);
      return json(res, 200, { grossTLkurus: grossTL, valorDays, usdTryRate: spot, commission: c, usdcOut6: usdcOut.toString(), usdcOut: Number(usdcOut) / 1e6 });
    }

    // --- onboarding ---
    if (req.method === "POST" && url.pathname === "/onboard") {
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
    // hata sızıntısı yok — istemciye jenerik, detay logda
    console.error("[troia]", e.message);
    json(res, 500, { error: "sunucu hatasi" });
  }
});

server.listen(PORT, () => console.log(`Troia backend :${PORT}`));
