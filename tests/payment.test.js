const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "liude-payment-test-"));
const merchantKeys = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const wechatKeys = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const merchantPrivateKey = merchantKeys.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const wechatPublicKey = wechatKeys.publicKey.export({ type: "spki", format: "pem" }).toString();
const apiV3Key = "1234567890abcdefghijklmnopqrstuv";

process.env.PORT = "0";
process.env.MP_DATA_DIR = testDataDir;
process.env.MP_OPEN_LOGIN = "true";
process.env.MP_ALLOW_DEV_LOGIN = "true";
process.env.MP_DEV_OPENID = "payment-test-openid";
process.env.MP_ADMIN_OPENIDS_JSON = JSON.stringify(["payment-test-openid"]);
process.env.MP_MEDIA_SIGNING_SECRET = "payment-test-session-secret";
process.env.MP_DOCUMENT_DOWNLOAD_FREE = "false";
process.env.MP_PAYMENT_ENABLED = "true";
process.env.MP_PAYMENT_JSAPI_ENABLED = "true";
process.env.MP_PAYMENT_APPID_BOUND = "true";
process.env.WECHAT_APPID = "wx-payment-test-appid";
process.env.WECHAT_PAY_MCHID = "1900000001";
process.env.WECHAT_PAY_CERT_SERIAL_NO = "7777777777777777777777777777777777777777";
process.env.WECHAT_PAY_API_V3_KEY = apiV3Key;
process.env.WECHAT_PAY_PRIVATE_KEY = merchantPrivateKey;
process.env.WECHAT_PAY_PUBLIC_KEY_ID = "PUB_KEY_ID_TEST_001";
process.env.WECHAT_PAY_PUBLIC_KEY = wechatPublicKey;
process.env.WECHAT_PAY_NOTIFY_URL = "https://example.test/api/mp/payment/notify";
process.env.MP_PAYMENT_PRODUCTS_JSON = JSON.stringify({
  document_full: {
    title: "完整文书下载",
    description: "完整文书 Word 与水印 PDF 下载",
    feature: "materialAssistant",
    amountFen: 100,
  },
});

const nativeFetch = global.fetch;
global.fetch = async (url, options) => {
  if (String(url).startsWith("https://api.mch.weixin.qq.com/")) {
    assert.equal(options.method, "POST");
    assert.match(String(options.headers.Authorization || ""), /^WECHATPAY2-SHA256-RSA2048 /);
    const body = JSON.parse(options.body);
    assert.equal(body.amount.total, 100);
    assert.equal(body.payer.openid, "payment-test-openid");
    const raw = JSON.stringify({ prepay_id: "wx-test-prepay-id" });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const nonce = "response-nonce";
    const signature = crypto
      .sign("RSA-SHA256", Buffer.from(`${timestamp}\n${nonce}\n${raw}\n`, "utf8"), wechatKeys.privateKey)
      .toString("base64");
    return new Response(raw, {
      status: 200,
      headers: {
        "Request-ID": "wechat-request-id-test",
        "Wechatpay-Timestamp": timestamp,
        "Wechatpay-Nonce": nonce,
        "Wechatpay-Serial": "PUB_KEY_ID_TEST_001",
        "Wechatpay-Signature": signature,
      },
    });
  }
  return nativeFetch(url, options);
};

const server = require("../server");

async function waitForServer() {
  if (server.listening) return;
  await new Promise((resolve) => server.once("listening", resolve));
}

function baseUrl() {
  const address = server.address();
  return `http://127.0.0.1:${address.port}`;
}

async function requestJson(urlPath, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  const response = await nativeFetch(`${baseUrl()}${urlPath}`, {
    method: options.method || (options.body === undefined ? "GET" : "POST"),
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

function encryptResource(payload) {
  const nonce = "payment1234";
  const associatedData = "transaction";
  const cipher = crypto.createCipheriv("aes-256-gcm", Buffer.from(apiV3Key, "utf8"), Buffer.from(nonce, "utf8"));
  cipher.setAAD(Buffer.from(associatedData, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final(), cipher.getAuthTag()]);
  return { algorithm: "AEAD_AES_256_GCM", ciphertext: ciphertext.toString("base64"), nonce, associated_data: associatedData };
}

function callbackHeaders(rawBody) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = "callback-nonce";
  const signature = crypto
    .sign("RSA-SHA256", Buffer.from(`${timestamp}\n${nonce}\n${rawBody}\n`, "utf8"), wechatKeys.privateKey)
    .toString("base64");
  return {
    "Content-Type": "application/json",
    "Wechatpay-Timestamp": timestamp,
    "Wechatpay-Nonce": nonce,
    "Wechatpay-Serial": "PUB_KEY_ID_TEST_001",
    "Wechatpay-Signature": signature,
  };
}

test("payment readiness, JSAPI order, signed callback and entitlement binding", async () => {
  await waitForServer();
  const login = await requestJson("/api/mp/user/login", { body: { code: "payment-test" } });
  assert.equal(login.response.status, 200);
  const token = login.payload.token;

  const health = await requestJson("/health");
  assert.equal(health.payload.paymentIntegrationPrepared, true);
  assert.equal(health.payload.paymentConfigurationComplete, true);
  assert.equal(health.payload.paymentReady, true);
  assert.equal(health.payload.paymentProductCount, 1);

  const status = await requestJson("/api/mp/payment/status", { token });
  assert.equal(status.payload.paymentReady, true);
  assert.equal(status.payload.products[0].priceText, "¥1.00");
  assert.equal(status.payload.checklist.every((item) => item.complete), true);
  assert.equal(JSON.stringify(status.payload).includes(apiV3Key), false);
  assert.equal(JSON.stringify(status.payload).includes("BEGIN PRIVATE KEY"), false);

  const create = await requestJson("/api/mp/payment/create", {
    token,
    body: { productId: "document_full", clientRequestId: "payment-test-request-1" },
  });
  assert.equal(create.response.status, 200);
  assert.equal(create.payload.order.status, "PENDING");
  assert.equal(create.payload.payment.package, "prepay_id=wx-test-prepay-id");
  assert.equal(create.payload.payment.signType, "RSA");
  const outTradeNo = create.payload.order.outTradeNo;

  const callbackBody = JSON.stringify({
    id: "event-test-1",
    event_type: "TRANSACTION.SUCCESS",
    resource_type: "encrypt-resource",
    resource: encryptResource({
      appid: "wx-payment-test-appid",
      mchid: "1900000001",
      out_trade_no: outTradeNo,
      transaction_id: "4200000000000000000000000001",
      trade_state: "SUCCESS",
      success_time: new Date().toISOString(),
      amount: { total: 100, payer_total: 100, currency: "CNY", payer_currency: "CNY" },
    }),
  });
  const notify = await nativeFetch(`${baseUrl()}/api/mp/payment/notify`, {
    method: "POST",
    headers: callbackHeaders(callbackBody),
    body: callbackBody,
  });
  const notifyPayload = await notify.json();
  assert.equal(notify.status, 200);
  assert.equal(notifyPayload.code, "SUCCESS");

  const order = await requestJson(`/api/mp/payment/order?outTradeNo=${encodeURIComponent(outTradeNo)}`, { token });
  assert.equal(order.payload.order.status, "PAID");
  assert.equal(order.payload.entitlements.materialAssistant, true);

  const materialAccess = await requestJson("/api/mp/material-access", { token });
  assert.equal(materialAccess.payload.allowed, true);
  assert.equal(materialAccess.payload.freeDuringLaunch, false);

  const adminOrders = await requestJson("/api/mp/admin/payment-orders", { token });
  assert.equal(adminOrders.response.status, 200);
  assert.equal(adminOrders.payload.records[0].status, "PAID");
  assert.equal(JSON.stringify(adminOrders.payload).includes("payment-test-openid"), false);

  const duplicate = await nativeFetch(`${baseUrl()}/api/mp/payment/notify`, {
    method: "POST",
    headers: callbackHeaders(callbackBody),
    body: callbackBody,
  });
  assert.equal(duplicate.status, 200);
});

test.after(async () => {
  global.fetch = nativeFetch;
  if (server.listening) await new Promise((resolve) => server.close(resolve));
  fs.rmSync(testDataDir, { recursive: true, force: true });
});
