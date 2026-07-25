// Troia — komisyon motoru (kur riskinin matematiksel fiyatlaması)
//
//   Komisyon(n) = μ·n (drift) + z·σ·√n (volatilite) + funding + marj
//
// μ (drift): TL'nin günlük ortalama değer kaybı (trend) — doğrusal, n ile büyür.
// z·σ·√n (volatilite): belirsizlik tamponu — karekök-zaman (n günün toplam sallantısı σ√n).
// funding: havuz USD bazlı; USD funding oranı (~SOFR %4.3) × n/365.
// marj: sabit kâr (riskten bağımsız, şeffaf).
//
// μ ve σ CANLI USD/TL günlük kapanış serisinden hesaplanır → piyasa sakinse ucuz, gerginse pahalı.

/** Günlük kapanış serisinden μ (drift) ve σ (volatilite) — logaritmik getirilerle. */
export function estimateFromSeries(closes) {
  if (!Array.isArray(closes) || closes.length < 2) {
    throw new Error("en az 2 fiyat gerekli");
  }
  const rets = [];
  for (let i = 1; i < closes.length; i++) {
    const a = closes[i - 1], b = closes[i];
    if (a <= 0 || b <= 0) throw new Error("fiyatlar pozitif olmali");
    rets.push(Math.log(b / a)); // log getiri (toplanabilir)
  }
  const n = rets.length;
  const mu = rets.reduce((s, r) => s + r, 0) / n; // ortalama günlük drift
  const variance = rets.reduce((s, r) => s + (r - mu) ** 2, 0) / (n - 1); // örneklem varyansı
  const sigma = Math.sqrt(variance);
  return { mu, sigma, samples: n };
}

/**
 * Komisyonu bps olarak hesaplar.
 * @param {number} valorDays n — valör/blokaj günü
 * @param {object} p { mu, sigma, z, marginBps, usdFundingAprBps }
 * @returns {{driftBps,volBps,fundingBps,marginBps,totalBps}}
 */
export function commission(valorDays, p) {
  const n = valorDays;
  const { mu, sigma, z = 1, marginBps = 30, usdFundingAprBps = 430 } = p;
  const driftBps = Math.max(0, mu) * n * 10_000; // negatif drift'i 0'a kırp (TL güçlenirse ceza yok)
  const volBps = z * sigma * Math.sqrt(n) * 10_000;
  const fundingBps = (usdFundingAprBps / 365) * n;
  const totalBps = driftBps + volBps + fundingBps + marginBps;
  return {
    driftBps: round2(driftBps),
    volBps: round2(volBps),
    fundingBps: round2(fundingBps),
    marginBps: round2(marginBps),
    totalBps: round2(totalBps),
  };
}

/**
 * Brüt TL → merchant'a gidecek net USDC (6 decimals).
 * @param {bigint|number} grossTLkurus brüt tutar (kuruş)
 * @param {number} usdTryRate USD/TL kuru (ör. 46.5)
 * @param {number} totalBps komisyon (bps)
 * @returns {bigint} usdcOut (6 decimals)
 */
export function usdcOutFor(grossTLkurus, usdTryRate, totalBps) {
  const tl = Number(grossTLkurus) / 100; // kuruş → TL
  const usdGross = tl / usdTryRate; // brüt USD
  const usdNet = usdGross * (1 - totalBps / 10_000); // komisyon düş
  return BigInt(Math.floor(usdNet * 1e6)); // USDC 6 decimals
}

function round2(x) {
  return Math.round(x * 100) / 100;
}
