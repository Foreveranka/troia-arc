// Troia popup: reads the active tab's intent and opens the in-page crypto
// payment panel (network select → deposit address → pay).

const fmtUSD = (usd) => "$" + Number(usd).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

  document.getElementById("nm").textContent = intent.merchantName || intent.merchantId;
  document.getElementById("ava").textContent = (intent.merchantName || "M").charAt(0).toUpperCase();
  document.getElementById("ord").textContent = "Sipariş " + intent.orderId + (intent.itemName ? " · " + intent.itemName : "");

  const usdc = intent.grossUSD != null ? (intent.grossUSD / 100) : null;
  document.getElementById("usdc").innerHTML = (usdc != null ? fmtUSD(usdc) : "0.00") + '<span class="u">USDC</span>';

  const pay = document.getElementById("pay");
  pay.addEventListener("click", async () => {
    try {
      await chrome.tabs.sendMessage(tab.id, { type: "troia:openPay" }); // sayfadaki ödeme panelini aç
      window.close();
    } catch { /* content script yok, sessizce geç */ }
  });
}

main();
