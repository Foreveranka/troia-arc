import { test } from "node:test";
import assert from "node:assert/strict";
import { estimateFromSeries, commission, usdcOutFor } from "../src/commission.js";

test("estimateFromSeries: μ ve σ makul çıkar", () => {
  // hafif yukarı trendli, dalgalı bir USD/TL serisi
  const closes = [46.0, 46.14, 46.05, 46.2, 46.35, 46.28, 46.5, 46.42, 46.6];
  const { mu, sigma, samples } = estimateFromSeries(closes);
  assert.equal(samples, 8);
  assert.ok(mu > 0, "yukarı trend → μ pozitif");
  assert.ok(sigma > 0 && sigma < 0.02, "günlük σ makul (<%2)");
});

test("commission: valör arttıkça toplam artar (T+1 < T+15 < T+30)", () => {
  const p = { mu: 0.00055, sigma: 0.003, z: 1, marginBps: 30, usdFundingAprBps: 430 };
  const c1 = commission(1, p);
  const c15 = commission(15, p);
  const c30 = commission(30, p);
  assert.ok(c1.totalBps < c15.totalBps);
  assert.ok(c15.totalBps < c30.totalBps);
  // T+1 kısa valör: bankaların gizli spread'inin (%0.7-1.1 = 70-110bps) altında olmalı
  assert.ok(c1.totalBps < 110, `T+1 komisyon ${c1.totalBps}bps < 110bps olmali`);
  // T+1'de volatilite tamponu drift'ten baskın (karekök-zaman)
  assert.ok(c1.volBps > c1.driftBps, "kısa valörde volatilite baskın");
});

test("commission: negatif drift 0'a kırpılır (TL güçlenirse ceza yok)", () => {
  const p = { mu: -0.001, sigma: 0.003, z: 1, marginBps: 30 };
  const c = commission(10, p);
  assert.equal(c.driftBps, 0, "negatif drift 0 olmali");
});

test("usdcOutFor: brüt TL → net USDC doğru", () => {
  // 100.000 kuruş = 1000 TL, kur 46.5, komisyon %2 (200bps)
  const out = usdcOutFor(100_000, 46.5, 200);
  // 1000/46.5 = 21.505... USD; *%98 = 21.075 USD → ~21.075e6
  const usd = Number(out) / 1e6;
  assert.ok(usd > 21.0 && usd < 21.1, `net USD ~21.07 bekleniyor, ${usd}`);
});

test("commission: sakin piyasa örneği doküman ballpark'ında (T+30 ~%3-5)", () => {
  const p = { mu: 0.00055, sigma: 0.003, z: 1, marginBps: 30, usdFundingAprBps: 430 };
  const c30 = commission(30, p);
  assert.ok(c30.totalBps > 250 && c30.totalBps < 550, `T+30 ${c30.totalBps}bps ~%3-5 arasi olmali`);
});
