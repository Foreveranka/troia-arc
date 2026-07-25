import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { authHeader, verifyWebhook, formatPrice } from "../src/iyzico.js";

const KEYS = { apiKey: "sandbox-APIKEY", secretKey: "sandbox-SECRET", randomKey: "RND123" };

test("authHeader: IYZWSv2, deterministik ve doğru imza", () => {
  const path = "/payment/iyzipos/checkoutform/initialize/auth/ecom";
  const body = JSON.stringify({ conversationId: "c1", price: "1499.0" });
  const r1 = authHeader(path, body, KEYS);
  const r2 = authHeader(path, body, KEYS);
  assert.equal(r1.header, r2.header, "aynı girdi → aynı header");
  // imza = HMAC_SHA256(secret, randomKey+path+body)
  const expected = createHmac("sha256", KEYS.secretKey).update(KEYS.randomKey + path + body).digest("hex");
  assert.equal(r1.signature, expected);
  assert.ok(r1.header.startsWith("IYZWSv2 "));
  // "sign-the-sent-string": farklı body → farklı imza
  const r3 = authHeader(path, body + " ", KEYS);
  assert.notEqual(r1.signature, r3.signature);
});

test("verifyWebhook: fail-closed", () => {
  const secret = "whsec";
  const payload = '{"paymentStatus":"SUCCESS","conversationId":"c1"}';
  const good = createHmac("sha256", secret).update(payload).digest("hex");
  assert.equal(verifyWebhook(payload, good, secret), true, "doğru imza geçer");
  assert.equal(verifyWebhook(payload, "deadbeef", secret), false, "yanlış imza reddedilir");
  assert.equal(verifyWebhook(payload, "", secret), false, "boş imza reddedilir");
  assert.equal(verifyWebhook("", good, secret), false, "boş body reddedilir");
  assert.equal(verifyWebhook(payload, good, ""), false, "boş secret reddedilir");
});

test("formatPrice: kanonik olmayan ondalıkta fail-closed", () => {
  assert.equal(formatPrice("1499"), "1499.0");
  assert.equal(formatPrice("1499.5"), "1499.5");
  assert.equal(formatPrice(1499), "1499.0");
  assert.throws(() => formatPrice("1499.999"), /gecersiz/);
  assert.throws(() => formatPrice("abc"), /gecersiz/);
});
