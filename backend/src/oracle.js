// Troia: USD/TL kur oracle'ı (çok kaynaklı, anahtarsız, dayanıklı)
// Komisyon motoru için günlük kapanış serisi. Sıra: Binance USDT/TRY → Frankfurter(ECB) → config fallback.

/**
 * Son N günlük USD/TL kapanış serisi.
 * @returns {Promise<{closes:number[]|null, spot:number, source:string}>}
 */
export async function fetchUsdTrySeries({ days = 180, fetchImpl = globalThis.fetch } = {}) {
  // 1) Binance USDT/TRY günlük klines (kripto-native, anahtarsız)
  try {
    const url = `https://api.binance.com/api/v3/klines?symbol=USDTTRY&interval=1d&limit=${Math.min(days, 1000)}`;
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      const arr = await res.json();
      const closes = arr.map((k) => parseFloat(k[4])).filter((x) => Number.isFinite(x) && x > 0);
      if (closes.length >= 30) return { closes, spot: closes[closes.length - 1], source: "binance" };
    }
  } catch { /* düş */ }

  // 2) Frankfurter (ECB) USD→TRY zaman serisi
  try {
    const end = new Date();
    const start = new Date(end.getTime() - days * 24 * 3600 * 1000);
    const f = (d) => d.toISOString().slice(0, 10);
    const url = `https://api.frankfurter.dev/v1/${f(start)}..${f(end)}?base=USD&symbols=TRY`;
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      const j = await res.json();
      const closes = Object.keys(j.rates || {}).sort().map((d) => j.rates[d].TRY).filter((x) => Number.isFinite(x) && x > 0);
      if (closes.length >= 30) return { closes, spot: closes[closes.length - 1], source: "frankfurter" };
    }
  } catch { /* düş */ }

  // 3) config fallback (yalnız spot; μ/σ default kullanılır, demo hiç kırılmasın)
  const spot = Number(process.env.FALLBACK_USDTRY || 0);
  if (spot > 0) return { closes: null, spot, source: "fallback" };

  throw new Error("USD/TL serisi alınamadı (tüm kaynaklar başarısız)");
}

/** Test/offline için: verilen seriyi paketler. */
export function seriesFromCloses(closes) {
  if (!Array.isArray(closes) || closes.length < 2) throw new Error("gecersiz seri");
  return { closes, spot: closes[closes.length - 1], source: "manual" };
}
