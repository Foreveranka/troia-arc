// Troia eklenti config
export const BACKEND_URL = "http://localhost:3000";
export const CHECKOUT_URL = "http://localhost:5173/checkout"; // hosted checkout (demo)
export const EXPLORER = "https://testnet.arcscan.app";

// Model A: sayfa yalnız merchantId taşır; ödeme adresi on-chain registry'den çözülür.
// Intent şeması (satıcı sayfasına gömer):
//   <script type="application/troia+json">
//     {"merchantId":"merchant.demo-store","orderId":"MS-4821","grossTL":149900,"valorDays":7}
//   </script>
export function validateIntent(x) {
  if (!x || typeof x !== "object") return null;
  const { merchantId, orderId, grossTL, valorDays } = x;
  if (typeof merchantId !== "string" || !merchantId) return null;
  if (typeof orderId !== "string" || !orderId) return null;
  if (!Number.isFinite(grossTL) || grossTL <= 0 || grossTL > 1e11) return null; // kuruş
  const v = Number(valorDays);
  if (!Number.isInteger(v) || v < 1 || v > 365) return null;
  return { merchantId, orderId, grossTL, valorDays: v };
}
