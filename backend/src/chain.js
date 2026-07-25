// Troia — Arc zincir yardımcısı (ethers v6, rate-limit dayanıklı)
// SettlementPool.settle + MerchantRegistry. Operatör key YALNIZ .env.
// Public Arc RPC rate-limit (-32011) verebildiği için: static network (az RPC çağrısı),
// sabit gasPrice (getFeeData yok), ve tüm çağrılarda retry/backoff.

import { ethers } from "ethers";

const CHAIN_ID = 5042002;
const GAS_PRICE = 80_000_000_000n; // 80 gwei sabit (Arc ~24-44) → fee estimation RPC çağrısı yok
const GAS_LIMIT = 600_000n;

const REGISTRY_ABI = [
  "function registerMerchant(bytes32 merchantId, address payout) external",
  "function setActive(bytes32 merchantId, bool active) external",
  "function resolve(bytes32 merchantId) view returns (address payout, bool active)",
];
const POOL_ABI = [
  "function settle(bytes32 posRef, bytes32 merchantId, uint256 grossTL, uint256 commissionBps, uint256 valorDays, uint256 usdcOut) external",
  "function isSettled(bytes32 posRef) view returns (bool)",
  "function poolBalance() view returns (uint256)",
];

function env(name) {
  const v = process.env[name];
  if (!v) throw new Error("Eksik env: " + name);
  return v;
}

let _ctx;
export function ctx() {
  if (_ctx) return _ctx;
  const network = ethers.Network.from(CHAIN_ID);
  const provider = new ethers.JsonRpcProvider(env("ARC_RPC_URL"), network, {
    staticNetwork: network, // tekrar tekrar eth_chainId çağırma
    batchMaxCount: 1,
  });
  provider.pollingInterval = 4000; // wait() daha seyrek poll etsin (rate-limit)
  const wallet = new ethers.Wallet(env("OPERATOR_PK"), provider);
  const registry = new ethers.Contract(env("REGISTRY_ADDR"), REGISTRY_ABI, wallet);
  const pool = new ethers.Contract(env("POOL_ADDR"), POOL_ABI, wallet);
  _ctx = { provider, wallet, registry, pool };
  return _ctx;
}

/** Rate-limit / geçici RPC hatalarında geri-çekilerek yeniden dener. */
async function withRetry(fn, tries = 7) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      const msg = (e?.error?.message || e?.shortMessage || e?.message || "").toLowerCase();
      const rateLimited = e?.error?.code === -32011 || msg.includes("request limit") || msg.includes("could not coalesce") || msg.includes("rate");
      if (rateLimited && i < tries - 1) {
        last = e;
        await new Promise((r) => setTimeout(r, 500 * (i + 1)));
        continue;
      }
      throw e;
    }
  }
  throw last;
}

export const merchantId = (slug) => ethers.id(slug);
export const posRef = (s) => ethers.id(s);

export async function registerMerchant(slug, payout) {
  const { registry } = ctx();
  const tx = await withRetry(() => registry.registerMerchant(merchantId(slug), payout, { gasLimit: 250_000n, gasPrice: GAS_PRICE }));
  await withRetry(() => tx.wait());
  return { merchantId: merchantId(slug), txHash: tx.hash };
}

export async function resolveMerchant(slug) {
  const { registry } = ctx();
  const [payout, active] = await withRetry(() => registry.resolve(merchantId(slug)));
  return { payout, active };
}

/** Ödemeyi on-chain settle eder → txHash + explorer linki. */
export async function settle({ posRefStr, slug, grossTLkurus, commissionBps, valorDays, usdcOut6 }) {
  const { pool } = ctx();
  const ref = posRef(posRefStr);
  if (await withRetry(() => pool.isSettled(ref))) throw new Error("zaten settle edildi");
  const tx = await withRetry(() =>
    pool.settle(
      ref,
      merchantId(slug),
      BigInt(grossTLkurus),
      BigInt(Math.round(commissionBps)),
      BigInt(valorDays),
      BigInt(usdcOut6),
      { gasLimit: GAS_LIMIT, gasPrice: GAS_PRICE }
    )
  );
  const rec = await withRetry(() => tx.wait());
  return { txHash: tx.hash, explorer: "https://testnet.arcscan.app/tx/" + tx.hash, block: rec.blockNumber };
}

export async function poolBalance() {
  const { pool } = ctx();
  return (await withRetry(() => pool.poolBalance())).toString();
}
