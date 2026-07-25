// Troia popup — aktif sekmedeki intent'i alır, backend'den quote çeker, öde butonunu kurar.
import { CHECKOUT_URL } from "./lib/config.js";

const fmtTL = (kurus) => "₺" + (kurus / 100).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtUSD = (usdc) => "$" + Number(usdc).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const prettyName = (mid) => mid.replace(/^merchant\./, "").replace(/[-_.]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

function show(el, on) { document.getElementById(el).classList.toggle("hidden", !on); }

async function main() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  let resp;
  try {
    resp = await chrome.tabs.sendMessage(tab.id, { type: "troia:getIntent" });
  } catch {
    resp = null; // content script yok (entegre olmayan sayfa)
  }
  const intent = resp && resp.intent;
  if (!intent) { show("card", false); show("empty", true); return; }

  show("empty", false); show("card", true);

  const name = prettyName(intent.merchantId);
  document.getElementById("nm").textContent = name;
  document.getElementById("ava").textContent = name.charAt(0) || "M";
  document.getElementById("ord").textContent = "Sipariş " + intent.orderId + " · doğrulanmış satıcı";
  document.getElementById("tl").textContent = fmtTL(intent.grossTL);

  // backend'den canlı quote (USDC karşılığı)
  const q = await chrome.runtime.sendMessage({ type: "troia:quote", grossTL: intent.grossTL, valorDays: intent.valorDays });
  const usdcEl = document.getElementById("usdc");
  if (q && q.ok && q.data && typeof q.data.usdcOut === "number") {
    usdcEl.innerHTML = fmtUSD(q.data.usdcOut) + '<span class="u">USDC · Arc</span>';
  } else {
    usdcEl.innerHTML = '—<span class="u">USDC · Arc</span>'; // backend kapalıysa
  }

  const pay = document.getElementById("pay");
  pay.addEventListener("click", () => {
    const url = new URL(CHECKOUT_URL);
    url.searchParams.set("merchantId", intent.merchantId);
    url.searchParams.set("orderId", intent.orderId);
    url.searchParams.set("grossTL", String(intent.grossTL));
    url.searchParams.set("valorDays", String(intent.valorDays));
    chrome.tabs.create({ url: url.toString() }); // hosted checkout (iyzico kart formu)
  });
}

main();
