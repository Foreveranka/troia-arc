// Troia content script: sayfadaki kripto ödeme isteğini (ağ + adres + tutar) algılar,
// "Troy kartıyla öde" seçeneğini sayfaya enjekte eder ve tıklanınca kart-giriş panelini açar.
// Anahtar tutmaz, imza atmaz. Fail-closed.

(function () {
  "use strict";

  var BACKEND = location.origin;
  var IYZICO = false; // backend iyzico sandbox ile yapılandırıldıysa true (health'ten okunur)
  try {
    fetch(BACKEND + "/health").then(function (r) { return r.json(); })
      .then(function (h) { IYZICO = !!(h && h.iyzico); }).catch(function () {});
  } catch (e) { /* health yoksa simüle akış */ }
  var LOGO = '<rect width="1460" height="1420" fill="#F4EFE4"/><g transform="translate(0.000000,1420.000000) scale(0.100000,-0.100000)"><path fill="#0C1B30" d="M0 7100 l0 -7100 7300 0 7300 0 0 7100 0 7100 -7300 0 -7300 0 0 -7100z m9523 5091 c-4 -3 -9 -40 -11 -81 -1 -41 -9 -129 -17 -195 -8 -66 -16 -138 -19 -160 -2 -22 -11 -96 -19 -165 -9 -69 -27 -224 -41 -345 -29 -249 -52 -437 -66 -540 -6 -38 -14 -113 -20 -165 -5 -52 -17 -149 -25 -215 -20 -154 -64 -515 -72 -581 -4 -37 -1 -61 11 -84 9 -18 16 -40 16 -48 0 -7 6 -28 13 -45 22 -51 38 -99 48 -142 6 -22 14 -44 20 -49 5 -6 9 -18 9 -28 0 -9 6 -32 14 -50 20 -50 37 -99 47 -143 6 -22 14 -44 20 -49 5 -6 9 -19 9 -30 0 -12 7 -34 15 -50 8 -15 15 -36 15 -45 0 -9 7 -29 15 -45 8 -15 15 -36 15 -45 0 -9 7 -29 15 -45 8 -15 15 -36 15 -45 0 -9 7 -29 15 -45 8 -15 15 -36 15 -45 0 -9 7 -29 15 -45 8 -15 15 -35 15 -43 0 -8 6 -29 14 -46 7 -18 24 -66 37 -107 12 -41 29 -86 36 -100 7 -14 13 -33 13 -42 0 -10 6 -32 14 -50 8 -18 24 -66 37 -106 12 -40 26 -75 30 -78 5 -3 9 -17 9 -32 0 -15 6 -36 14 -47 7 -11 16 -33 18 -50 6 -32 22 -81 43 -130 8 -16 16 -41 18 -55 6 -33 26 -88 43 -123 8 -16 14 -39 14 -51 0 -12 7 -31 15 -42 28 -37 19 -84 -29 -145 -24 -30 -47 -65 -50 -76 -4 -12 -13 -24 -22 -27 -8 -3 -23 -26 -34 -51 -11 -25 -24 -45 -30 -45 -6 0 -19 -20 -30 -45 -11 -25 -24 -45 -30 -45 -6 0 -17 -15 -25 -34 -8 -18 -23 -44 -34 -57 -42 -50 -121 -160 -121 -169 0 -5 -13 -25 -30 -43 -16 -19 -30 -39 -30 -44 0 -5 -13 -24 -30 -43 -16 -19 -29 -40 -30 -47 0 -6 -16 -30 -35 -53 -19 -23 -35 -47 -35 -54 0 -7 -12 -23 -26 -37 -14 -13 -35 -39 -46 -59 -12 -19 -34 -50 -50 -68 -15 -18 -28 -38 -28 -44 0 -5 -13 -26 -30 -45 -16 -18 -30 -39 -30 -45 0 -5 -13 -26 -30 -45 -16 -18 -30 -39 -30 -45 0 -5 -13 -26 -30 -45 -16 -18 -30 -40 -30 -47 0 -7 -10 -21 -21 -32 -12 -10 -36 -41 -54 -69 -18 -27 -42 -59 -54 -69 -11 -11 -21 -25 -21 -32 0 -7 -13 -28 -29 -47 -26 -28 -33 -51 -52 -158 -12 -68 -24 -142 -26 -164 -1 -22 -7 -60 -13 -85 -6 -25 -12 -63 -15 -85 -3 -22 -11 -74 -19 -115 -8 -41 -22 -120 -31 -175 -20 -125 -43 -262 -57 -340 -5 -33 -12 -75 -13 -93 -2 -18 -10 -70 -19 -115 -14 -78 -26 -150 -62 -367 -8 -52 -21 -126 -28 -165 -14 -72 -10 -164 14 -325 13 -89 26 -211 41 -375 6 -66 14 -136 20 -155 5 -19 13 -89 19 -155 11 -129 31 -305 51 -449 l12 -88 -209 -417 c-115 -229 -215 -420 -221 -424 -7 -4 -13 -19 -13 -32 0 -14 -5 -25 -11 -25 -5 0 -15 -13 -20 -30 l-11 -30 -901 -1 c-496 0 -919 -1 -940 -2 -25 -1 -44 4 -54 15 -8 9 -66 119 -130 245 -63 125 -118 232 -123 238 -4 5 -47 87 -94 180 -48 94 -97 188 -111 210 -27 45 -32 107 -14 196 5 30 14 97 19 149 4 52 13 131 19 175 13 99 36 302 56 500 9 83 23 196 31 252 7 56 14 123 15 150 1 26 4 59 8 72 7 25 -2 100 -34 281 -9 52 -22 136 -30 185 -7 50 -18 115 -23 145 -11 54 -37 216 -46 275 -2 17 -9 57 -15 90 -17 90 -37 208 -56 325 -9 58 -21 128 -26 155 -6 28 -14 77 -18 110 -4 33 -13 83 -19 110 -12 52 -30 161 -39 229 -4 25 -21 59 -49 97 -24 31 -44 61 -44 67 0 5 -7 15 -16 23 -8 7 -24 29 -35 48 -11 20 -46 74 -80 121 -33 47 -75 108 -93 135 -19 28 -43 60 -55 72 -11 12 -21 24 -21 27 0 7 -188 285 -220 326 -16 21 -30 41 -30 45 0 3 -19 32 -43 63 -23 31 -86 122 -140 202 -54 80 -125 183 -158 230 -110 156 -169 249 -169 265 0 19 28 113 40 136 5 9 12 33 15 53 4 20 11 39 16 42 5 3 9 14 9 26 0 11 6 34 14 51 7 18 23 64 35 102 12 39 26 79 31 90 4 11 18 52 30 90 11 39 27 86 35 105 7 19 29 85 49 145 38 118 55 168 67 200 11 32 69 207 79 240 4 17 14 46 21 65 6 19 17 51 24 70 7 19 18 51 24 70 7 19 16 49 21 65 8 28 17 54 45 135 32 88 97 289 106 325 6 22 14 44 20 49 5 6 9 19 9 30 0 12 7 34 15 50 17 33 20 161 5 216 -5 20 -14 87 -20 150 -5 63 -16 165 -24 225 -8 61 -21 171 -29 245 -9 74 -18 146 -21 160 -4 14 -11 72 -16 130 -6 58 -17 157 -25 220 -8 63 -21 176 -29 250 -8 74 -20 162 -26 195 -5 33 -10 88 -10 122 0 34 -4 72 -10 85 -5 13 -14 68 -19 123 -17 172 -32 297 -46 382 -8 47 -11 92 -6 105 7 19 10 17 29 -24 12 -24 22 -50 22 -57 0 -7 11 -36 24 -65 14 -29 29 -72 36 -94 6 -23 15 -44 20 -47 6 -3 10 -16 10 -28 0 -12 14 -49 30 -81 17 -32 30 -66 30 -75 0 -9 7 -29 15 -45 8 -15 15 -36 15 -45 0 -9 13 -43 30 -75 16 -33 32 -74 36 -90 3 -17 10 -36 15 -42 5 -6 17 -37 28 -70 10 -32 26 -72 35 -89 9 -16 16 -37 16 -46 0 -8 11 -39 25 -67 14 -29 25 -58 25 -64 1 -7 9 -31 20 -53 11 -22 19 -46 20 -54 0 -8 13 -43 30 -78 17 -34 30 -70 30 -79 0 -9 7 -28 15 -42 8 -15 24 -55 36 -90 12 -34 26 -65 30 -68 5 -3 9 -16 9 -30 0 -13 14 -51 30 -84 17 -33 30 -68 30 -78 0 -10 7 -27 15 -38 8 -10 15 -30 15 -44 0 -14 14 -49 30 -79 17 -30 30 -62 30 -72 0 -25 42 -109 54 -109 15 0 645 630 673 674 14 22 44 60 67 85 23 25 50 60 61 76 10 17 40 53 66 80 25 28 49 60 53 72 4 11 31 45 61 74 30 29 55 58 55 65 0 6 27 41 60 77 33 36 60 69 60 75 0 5 26 38 58 73 32 35 68 80 79 99 12 19 40 53 62 75 23 21 41 43 41 48 0 18 53 77 69 77 10 0 31 -19 49 -42 51 -69 165 -213 202 -256 19 -21 62 -74 95 -117 33 -43 86 -109 118 -146 31 -37 57 -71 57 -74 0 -4 29 -41 65 -84 122 -144 185 -223 185 -233 0 -11 690 -708 700 -708 9 0 30 47 30 66 0 8 9 33 20 57 19 42 34 81 72 192 11 33 24 65 28 70 5 6 26 60 46 120 21 61 43 119 50 130 6 11 20 45 29 75 10 30 21 60 25 65 4 6 13 26 18 45 16 51 61 172 71 191 5 9 24 58 42 110 17 52 45 122 60 156 16 34 29 66 29 72 0 5 20 60 45 122 25 62 45 118 45 124 0 6 9 29 20 50 11 22 25 54 30 70 19 65 60 172 79 212 12 23 21 47 21 52 0 6 11 35 25 65 14 30 25 61 25 69 0 33 15 26 18 -9 2 -20 0 -40 -5 -43z"/></g>';
  var NETNAME = { arc: "Arc", arb: "Arbitrum", eth: "Ethereum", avax: "Avalanche" };

  function validateIntent(x) {
    if (!x || typeof x !== "object") return null;
    var merchantId = x.merchantId, orderId = x.orderId, valorDays = x.valorDays;
    if (typeof merchantId !== "string" || !merchantId) return null;
    if (typeof orderId !== "string" || !orderId) return null;
    var gUSD = Number(x.grossUSD), gTL = Number(x.grossTL);
    var hasUSD = Number.isFinite(gUSD) && gUSD > 0 && gUSD <= 1e9;
    var hasTL = Number.isFinite(gTL) && gTL > 0 && gTL <= 1e11;
    if (!hasUSD && !hasTL) return null;
    var v = Number(valorDays);
    if (!Number.isInteger(v) || v < 1 || v > 365) return null;
    var name = (typeof x.merchantName === "string" && x.merchantName) ? x.merchantName.slice(0, 60) : merchantId;
    var item = (typeof x.itemName === "string" && x.itemName) ? x.itemName.slice(0, 80) : "";
    var net = (typeof x.network === "string" && NETNAME[x.network]) ? x.network : null;
    var addr = (typeof x.address === "string" && /^0x[0-9a-fA-F]{40}$/.test(x.address)) ? x.address : null;
    return {
      merchantId: merchantId, orderId: orderId, valorDays: v, merchantName: name, itemName: item,
      grossUSD: hasUSD ? gUSD : null, grossTL: hasTL ? gTL : null, network: net, address: addr
    };
  }

  function readIntent() {
    var el = document.querySelector('script[type="application/troia+json"]');
    if (!el) return null;
    try { return validateIntent(JSON.parse(el.textContent || "{}")); }
    catch (e) { return null; }
  }

  var current = readIntent();

  function syncButton() {
    if (current && current.network) injectPayButton(); // kripto+ağ seçildi → adresi kullanıcı yapıştırır
    else removePayButton();
  }

  var obs = new MutationObserver(function () {
    var next = readIntent();
    if (JSON.stringify(next) !== JSON.stringify(current)) { current = next; syncButton(); }
  });
  obs.observe(document.documentElement, { childList: true, subtree: true });

  chrome.runtime.onMessage.addListener(function (msg, _sender, sendResponse) {
    if (msg && msg.type === "troia:getIntent") { sendResponse({ intent: current, origin: location.host }); return true; }
    if (msg && msg.type === "troia:openPay") { openPay(); sendResponse({ ok: !!current }); return true; }
    return true;
  });

  window.addEventListener("message", function (e) {
    if (e.source === window && e.data && e.data.type === "TROIA_PAID")
      document.dispatchEvent(new CustomEvent("troia:paid", { detail: e.data }));
  });

  // ---- Sayfaya "Troy kartıyla öde" düğmesini enjekte et (site Troia'sız; düğmeyi eklenti ekler) ----
  function injectPayButton() {
    var slot = document.getElementById("pay-slot");
    if (!slot || slot.querySelector("#troia-cardpay")) return;
    var b = document.createElement("button");
    b.id = "troia-cardpay";
    b.type = "button";
    b.setAttribute("style", "width:100%;border:none;cursor:pointer;background:#0C1B30;color:#F4EFE4;padding:14px 16px;display:flex;align-items:center;gap:12px;border-top:2px solid #C7A468;text-align:left;font:600 14px/1.2 -apple-system,BlinkMacSystemFont,Arial,sans-serif");
    b.innerHTML =
      '<svg viewBox="0 0 1460 1420" style="width:30px;height:30px;flex:none">' + LOGO + '</svg>' +
      '<span style="flex:1">Troy kartıyla öde<br><span style="font-weight:400;font-size:12px;color:#9FB1CB">Troia · kripto bilmene gerek yok</span></span>' +
      '<span style="color:#C7A468;font-size:16px">&rarr;</span>';
    b.addEventListener("click", function (e) { e.preventDefault(); openPay(); });
    slot.appendChild(b);
  }
  function removePayButton() {
    var b = document.getElementById("troia-cardpay");
    if (b) b.remove();
  }
  syncButton();

  // ---------- Kart-giriş ödeme paneli (overlay) ----------
  function fmtTL(kurus) { return "₺" + (kurus / 100).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function fmtUSD(cents) { return "$" + (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]; }); }

  var host = null;
  function close() { if (host) { host.remove(); host = null; document.removeEventListener("keydown", onKey); } }
  function onKey(e) { if (e.key === "Escape") close(); }

  var CSS = [
    ':host{all:initial}',
    '*{box-sizing:border-box;margin:0;font-family:-apple-system,BlinkMacSystemFont,"Helvetica Neue",Arial,sans-serif}',
    '.bd{position:fixed;inset:0;z-index:2147483647;background:rgba(6,12,22,.74);backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center;padding:20px}',
    '.pan{width:100%;max-width:380px;background:#F4EFE4;color:#0C1B30;border-top:2px solid #B08A50;box-shadow:0 40px 90px -25px rgba(0,0,0,.8);animation:up .18s ease-out}',
    '@keyframes up{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}',
    '.hd{background:#0C1B30;color:#F4EFE4;display:flex;align-items:center;gap:11px;padding:14px 16px}',
    '.hd svg{width:30px;height:30px;flex:none}.hd b{font-family:"Hoefler Text",Palatino,Georgia,serif;font-size:1.15rem;letter-spacing:.16em;font-weight:500}',
    '.hd small{display:block;font-size:.5rem;letter-spacing:.24em;text-transform:uppercase;color:#9FB1CB;margin-top:3px}',
    '.x{margin-left:auto;background:none;border:none;color:#9FB1CB;font-size:1.3rem;line-height:1;cursor:pointer;padding:2px 6px}.x:hover{color:#F4EFE4}',
    '.mch{padding:14px 16px;border-bottom:1px solid rgba(12,27,48,.14);display:flex;justify-content:space-between;align-items:center}',
    '.mch .nm{font-family:"Hoefler Text",Palatino,Georgia,serif;font-size:1rem}.mch .or{font-size:.62rem;letter-spacing:.06em;text-transform:uppercase;color:#42536E;margin-top:2px}',
    '.vf{font-size:.52rem;letter-spacing:.14em;text-transform:uppercase;color:#B08A50;border:1px solid #B08A50;padding:4px 7px}',
    '.amt{padding:18px 16px;text-align:center;border-bottom:1px solid rgba(12,27,48,.14)}',
    '.amt .l{font-size:.58rem;letter-spacing:.18em;text-transform:uppercase;color:#42536E}',
    '.amt .v{font-family:"Hoefler Text",Palatino,Georgia,serif;font-size:2.1rem;font-weight:500;margin-top:5px;font-variant-numeric:tabular-nums}',
    '.amt .u{font-size:.72rem;color:#42536E;margin-top:6px;min-height:1em}',
    '.frm{padding:14px 16px 4px}.fl{margin-bottom:11px}.fl label{display:block;font-size:.55rem;letter-spacing:.13em;text-transform:uppercase;color:#42536E;margin-bottom:5px}',
    '.fl input{width:100%;background:#fff;border:1px solid rgba(12,27,48,.28);color:#0C1B30;font-size:.92rem;padding:10px 11px}.fl input:focus{outline:none;border-color:#B08A50}',
    '.two{display:grid;grid-template-columns:1fr 1fr;gap:11px}',
    '.pay{width:100%;border:none;cursor:pointer;background:#0C1B30;color:#F4EFE4;font-weight:600;letter-spacing:.05em;text-transform:uppercase;font-size:.8rem;padding:15px;border-top:2px solid #B08A50}',
    '.pay:hover{background:#0A1728}.pay:disabled{opacity:.6;cursor:default}',
    '.ft{padding:12px 16px 15px;text-align:center;font-size:.66rem;color:#42536E;line-height:1.5}',
    '.ok{padding:26px 20px;text-align:center}.ok .ic{width:52px;height:52px;border-radius:50%;background:#0C1B30;display:flex;align-items:center;justify-content:center;margin:0 auto 14px}',
    '.ok h3{font-family:"Hoefler Text",Palatino,Georgia,serif;font-weight:500;font-size:1.3rem;margin-bottom:6px}',
    '.ok p{font-size:.82rem;color:#42536E;line-height:1.5}.ok b{color:#0C1B30}',
    '.ok a{display:inline-block;margin-top:14px;font-size:.72rem;letter-spacing:.06em;text-transform:uppercase;color:#0C1B30;border-bottom:1px solid #B08A50;text-decoration:none;padding-bottom:2px}',
    '.err{color:#8B2E23;font-size:.76rem;text-align:center;padding:0 16px 12px}',
    '.hint{margin:0 16px 12px;font-size:.7rem;color:#42536E;background:rgba(176,138,80,.12);border:1px solid rgba(176,138,80,.4);padding:8px 10px;line-height:1.5}.hint b{color:#0C1B30}',
    '.step{font-size:.5rem;letter-spacing:.14em;text-transform:uppercase;color:#B08A50;font-weight:700;margin-right:5px}',
    '.arow{display:flex;gap:8px}.arow input{flex:1;font-family:ui-monospace,Menlo,monospace;font-size:.78rem}',
    '.mini{border:none;background:#0C1B30;color:#F4EFE4;font-size:.6rem;letter-spacing:.06em;text-transform:uppercase;padding:0 12px;cursor:pointer;flex:none}.mini:hover{background:#0A1728}',
    '.sep{height:1px;background:rgba(12,27,48,.14);margin:2px 0 12px}',
    '.amt .v small{font-size:.85rem;color:#42536E;margin-left:5px;font-family:-apple-system,Arial,sans-serif}',
    '.stp{display:none}.stp.on{display:block}',
    '.stt{padding:15px 16px 8px;font-family:"Hoefler Text",Palatino,Georgia,serif;font-size:1.05rem;color:#0C1B30;display:flex;align-items:center;gap:9px}',
    '.stt .step{font-size:.55rem}',
    '.note{margin:0 16px 12px;font-size:.74rem;color:#42536E;line-height:1.5}.note b{color:#0C1B30}',
    '.btns{display:grid;grid-template-columns:1fr 1.5fr;gap:10px;padding:6px 16px 16px}',
    '.ghost{border:1px solid rgba(12,27,48,.3);background:transparent;color:#0C1B30;font-weight:600;text-transform:uppercase;letter-spacing:.05em;font-size:.76rem;padding:14px;cursor:pointer;font-family:-apple-system,Arial,sans-serif}.ghost:hover{background:rgba(12,27,48,.05)}',
    '.btns .pay{border-top:none}'
  ].join("");

  function openPay() {
    document.dispatchEvent(new CustomEvent("troia:pay-ack"));
    if (host || !current) return;
    var intent = current;
    var netName = NETNAME[intent.network] || "Arc";
    var shortAddr = intent.address ? (intent.address.slice(0, 8) + "…" + intent.address.slice(-6)) : "";
    var qParam = intent.grossUSD != null ? ("grossUSD=" + intent.grossUSD) : ("grossTL=" + intent.grossTL);
    var usdRef = intent.grossUSD != null ? fmtUSD(intent.grossUSD) : "";

    host = document.createElement("div");
    host.id = "troia-pay-root";
    var sh = host.attachShadow({ mode: "open" });
    document.documentElement.appendChild(host);
    document.addEventListener("keydown", onKey);

    sh.innerHTML =
      '<style>' + CSS + '</style>' +
      '<div class="bd" part="bd">' +
        '<div class="pan" role="dialog" aria-label="Troia ödeme">' +
          '<div class="hd"><svg viewBox="0 0 1460 1420">' + LOGO + '</svg>' +
            '<div><b>TROIA</b><small>built on Arc</small></div>' +
            '<button class="x" title="Kapat">×</button></div>' +
          '<div class="body">' +
            '<div class="mch"><div><div class="nm">' + esc(intent.merchantName) + '</div>' +
              '<div class="or">Sipariş ' + esc(intent.orderId) + (intent.itemName ? ' · ' + esc(intent.itemName) : '') + '</div></div>' +
              '<span class="vf">Arc</span></div>' +
            '<div class="amt"><div class="l">Ödenecek</div>' +
              '<div class="v">' + (usdRef || "$0.00") + '<small>USDC</small></div>' +
              '<div class="u" id="q">Troy kartından ₺ çekilir</div></div>' +
            '<div class="stp on" id="step1">' +
              '<div class="stt"><span class="step">1 / 2</span>Ödeme adresi</div>' +
              '<div class="fl"><label>Mağazadaki adresi yapıştır · ' + esc(netName) + ' → Arc</label>' +
                '<div class="arow"><input id="depAddr" placeholder="0x…" autocomplete="off" spellcheck="false"><button type="button" class="mini" id="pasteAddr">Yapıştır</button></div></div>' +
              '<div class="note">Bu adrese Arc ağında <b>' + (usdRef || "USDC") + '</b> gönderilir (akıllı kontrat).</div>' +
              '<div class="err" id="er1" style="display:none"></div>' +
              '<button class="pay" id="toStep2" type="button">Devam →</button>' +
            '</div>' +
            '<div class="stp" id="step2">' +
              '<div class="stt"><span class="step">2 / 2</span>Kart bilgileri</div>' +
              '<div class="frm">' +
                '<div class="fl"><label>Kart üzerindeki isim</label><input id="ccName" placeholder="Ad Soyad" autocomplete="off"></div>' +
                '<div class="fl"><label>Kart numarası</label><input id="ccNum" placeholder="1234 5678 9012 3456" autocomplete="off" inputmode="numeric"></div>' +
                '<div class="two"><div class="fl"><label>Son kullanma</label><input id="ccExp" placeholder="AA / YY" inputmode="numeric"></div>' +
                '<div class="fl"><label>CVV</label><input id="ccCvc" placeholder="123" inputmode="numeric"></div></div>' +
              '</div>' +
              '<div class="hint" id="hint" style="display:none"></div>' +
              '<div class="err" id="er2" style="display:none"></div>' +
              '<div class="btns"><button class="ghost" id="backStep1" type="button">← Geri</button><button class="pay" id="payBtn" type="button">Öde</button></div>' +
            '</div>' +
            '<div class="ft">Adres → akıllı kontrat · kart → iyzico · kart bilgin Troia\'ya iletilmez</div>' +
          '</div>' +
        '</div>' +
      '</div>';

    var $ = function (s) { return sh.querySelector(s); };
    $(".x").addEventListener("click", close);
    $(".bd").addEventListener("click", function (e) { if (e.target === $(".bd")) close(); });

    $("#pasteAddr").addEventListener("click", function () {
      var inp = $("#depAddr");
      try {
        navigator.clipboard.readText().then(function (t) {
          if (t && t.trim()) { inp.value = t.trim(); } else { inp.focus(); }
        }).catch(function () { inp.focus(); }); // izin yoksa: elle ⌘V / Ctrl+V
      } catch (e) { inp.focus(); }
    });

    // canlı kur, sadece bilgi (₺ karşılığı)
    fetch(BACKEND + "/quote?" + qParam + "&valorDays=" + intent.valorDays)
      .then(function (r) { return r.json(); })
      .then(function (q) {
        if (q && q.chargeTLkurus > 0) $("#q").textContent = "Troy kartından ~" + fmtTL(q.chargeTLkurus) + " çekilir";
        else $("#q").textContent = netName + " ağında satıcıya USDC gönderilir";
      })
      .catch(function () { $("#q").textContent = netName + " ağında satıcıya USDC gönderilir"; });

    function showErr(id, msg) { var e = $(id); e.style.display = "block"; e.textContent = "Hata: " + msg; }
    function parseExp(s) {
      var d = String(s || "").replace(/\D/g, "");
      if (d.length < 3) return { mm: "", yyyy: "" };
      var mm = d.slice(0, 2), yy = d.slice(2).slice(-2);
      return { mm: mm, yyyy: yy.length === 2 ? "20" + yy : "" };
    }

    var depositAddress = "";
    // ADIM 1 → ADIM 2
    $("#toStep2").addEventListener("click", function () {
      $("#er1").style.display = "none";
      var addr = ($("#depAddr").value || "").trim();
      if (!/^0x[0-9a-fA-F]{40}$/.test(addr)) { showErr("#er1", "geçerli ödeme adresi yapıştır (0x… 42 hane)"); return; }
      depositAddress = addr;
      $("#step1").classList.remove("on"); $("#step2").classList.add("on");
      if (IYZICO) { var h = $("#hint"); h.style.display = "block"; h.innerHTML = "<b>Sandbox test kartı:</b> 5528 7900 0000 0008 · 12/30 · 123"; }
    });
    $("#backStep1").addEventListener("click", function () {
      $("#step2").classList.remove("on"); $("#step1").classList.add("on");
    });

    // ADIM 2 → öde
    $("#payBtn").addEventListener("click", function () {
      var btn = $("#payBtn"), prev = btn.textContent; $("#er2").style.display = "none";
      var body = { merchantId: intent.merchantId, orderId: intent.orderId, valorDays: intent.valorDays, network: intent.network, itemName: intent.itemName, address: depositAddress };
      if (intent.grossUSD != null) body.grossUSD = intent.grossUSD; else body.grossTL = intent.grossTL;
      if (IYZICO) {
        var ex = parseExp($("#ccExp").value);
        body.card = {
          cardHolderName: ($("#ccName").value || "").trim() || "Demo Kullanici",
          cardNumber: ($("#ccNum").value || "").replace(/\s/g, ""),
          expireMonth: ex.mm, expireYear: ex.yyyy, cvc: ($("#ccCvc").value || "").trim()
        };
        if (!body.card.cardNumber || !body.card.cvc || !ex.yyyy) { showErr("#er2", "kart bilgilerini eksiksiz gir"); return; }
      }
      btn.disabled = true; btn.textContent = "İşleniyor…";
      fetch(BACKEND + (IYZICO ? "/pay/card" : "/demo/pay"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (res) {
          if (!res.ok || !res.j || res.j.error) throw new Error((res.j && res.j.error) || "ödeme başarısız");
          success(res.j, intent, netName, depositAddress);
        })
        .catch(function (err) { btn.disabled = false; btn.textContent = prev; showErr("#er2", err.message); });
    });

    function safeExplorer(j) {
      if (typeof j.txHash === "string" && /^0x[0-9a-fA-F]{64}$/.test(j.txHash)) return "https://testnet.arcscan.app/tx/" + j.txHash;
      return "";
    }
    function success(j, it, nName, addr) {
      var check = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#F4EFE4" stroke-width="2.5"><path d="M4 12l5 5L20 6"/></svg>';
      var url = safeExplorer(j);
      var short = url ? (j.txHash.slice(0, 10) + "…" + j.txHash.slice(-8)) : "";
      var shortAddr = addr ? (addr.slice(0, 8) + "…" + addr.slice(-6)) : "";
      $(".body").innerHTML =
        '<div class="ok"><div class="ic">' + check + '</div>' +
        '<h3>Ödeme tamamlandı</h3>' +
        '<p><b>$' + Number(j.usdcOut).toFixed(2) + ' USDC</b> gönderildi' +
        (shortAddr ? '<br><span style="font-size:.74rem;font-family:ui-monospace,Menlo,monospace">' + esc(shortAddr) + '</span>' : '') +
        '<br><span style="font-size:.76rem">' + esc(nName) + ' → Arc · Circle CCTP</span></p>' +
        (url ? '<a href="' + esc(url) + '" target="_blank" rel="noopener">Arc Explorer\'da gör · ' + short + '</a>' : "") +
        '</div>' +
        '<div class="ft">Sipariş ' + esc(it.orderId) + ' · ' + esc(it.merchantName) + ' · Troy kartla ödendi</div>';
      window.postMessage({ type: "TROIA_PAID", orderId: it.orderId, txHash: j.txHash, usdcOut: j.usdcOut }, "*");
    }
  }

  document.addEventListener("troia:pay", openPay);
})();
