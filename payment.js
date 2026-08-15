const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const ALLOWED_FEATURES = new Set(["materialAssistant", "recommendationCount"]);
const WECHAT_PAY_API_BASE = "https://api.mch.weixin.qq.com";

function normalizeText(value, maxLength = 127) {
  return String(value || "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function normalizePem(value) {
  return String(value || "").replace(/\\n/g, "\n").trim();
}

function readConfiguredPem(env, inlineName, pathName) {
  const configuredPath = String(env[pathName] || "").trim();
  if (configuredPath) {
    try {
      return normalizePem(fs.readFileSync(configuredPath, "utf8"));
    } catch (error) {
      return "";
    }
  }
  return normalizePem(env[inlineName]);
}

function parseJson(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch (error) {
    return fallback;
  }
}

function isHttpsUrl(value) {
  try {
    return new URL(String(value || "")).protocol === "https:";
  } catch (error) {
    return false;
  }
}

function isPrivateKeyUsable(value) {
  if (!value) return false;
  try {
    crypto.createPrivateKey(value);
    return true;
  } catch (error) {
    return false;
  }
}

function isPublicKeyUsable(value) {
  if (!value) return false;
  try {
    crypto.createPublicKey(value);
    return true;
  } catch (error) {
    return false;
  }
}

function normalizePaymentProducts(rawValue) {
  const source = typeof rawValue === "string" ? parseJson(rawValue, {}) : rawValue;
  const entries = Array.isArray(source)
    ? source.map((item) => [item?.id, item])
    : Object.entries(source && typeof source === "object" ? source : {});
  return entries
    .map(([entryId, raw]) => {
      const item = raw && typeof raw === "object" ? raw : {};
      const id = normalizeText(item.id || entryId, 40).toLowerCase();
      const title = normalizeText(item.title, 42);
      const description = normalizeText(item.description || title, 127);
      const feature = normalizeText(item.feature, 40);
      const amountFen = Number(item.amountFen);
      if (!/^[a-z0-9][a-z0-9_-]{1,39}$/.test(id)) return null;
      if (!title || !ALLOWED_FEATURES.has(feature)) return null;
      if (!Number.isInteger(amountFen) || amountFen < 1 || amountFen > 100000000) return null;
      if (item.active === false) return null;
      return {
        id,
        title,
        description,
        feature,
        amountFen,
        priceText: `¥${(amountFen / 100).toFixed(2)}`,
      };
    })
    .filter(Boolean);
}

function readJsonl(filePath) {
  if (!fs.existsSync(filePath)) return [];
  try {
    return fs
      .readFileSync(filePath, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch (error) {
          return null;
        }
      })
      .filter(Boolean);
  } catch (error) {
    return [];
  }
}

function appendJsonl(filePath, record) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${JSON.stringify(record)}\n`, "utf8");
}

function currentOrders(filePath) {
  const orders = new Map();
  readJsonl(filePath).forEach((record) => {
    if (record?.outTradeNo) orders.set(record.outTradeNo, record);
  });
  return Array.from(orders.values());
}

function createOutTradeNo() {
  return `LD${Date.now().toString(36).toUpperCase()}${crypto.randomBytes(5).toString("hex").toUpperCase()}`.slice(0, 32);
}

function rsaSign(message, privateKey) {
  return crypto.sign("RSA-SHA256", Buffer.from(message, "utf8"), privateKey).toString("base64");
}

function buildWechatAuthorization({ method, pathname, body, mchid, serialNo, privateKey, timestamp, nonceStr }) {
  const ts = String(timestamp || Math.floor(Date.now() / 1000));
  const nonce = nonceStr || crypto.randomBytes(16).toString("hex");
  const message = `${String(method || "GET").toUpperCase()}\n${pathname}\n${ts}\n${nonce}\n${body || ""}\n`;
  const signature = rsaSign(message, privateKey);
  return {
    timestamp: ts,
    nonceStr: nonce,
    header: `WECHATPAY2-SHA256-RSA2048 mchid="${mchid}",nonce_str="${nonce}",timestamp="${ts}",serial_no="${serialNo}",signature="${signature}"`,
  };
}

function createMiniProgramPayParams(appid, prepayId, privateKey) {
  const timeStamp = String(Math.floor(Date.now() / 1000));
  const nonceStr = crypto.randomBytes(16).toString("hex");
  const packageValue = `prepay_id=${prepayId}`;
  const paySign = rsaSign(`${appid}\n${timeStamp}\n${nonceStr}\n${packageValue}\n`, privateKey);
  return { timeStamp, nonceStr, package: packageValue, signType: "RSA", paySign };
}

function verifyWechatPaySignature(rawBody, headers, publicKey, expectedPublicKeyId) {
  const timestamp = String(headers["wechatpay-timestamp"] || "");
  const nonce = String(headers["wechatpay-nonce"] || "");
  const signature = String(headers["wechatpay-signature"] || "");
  const serial = String(headers["wechatpay-serial"] || "");
  if (!timestamp || !nonce || !signature || !serial) return false;
  if (expectedPublicKeyId && serial !== expectedPublicKeyId) return false;
  return crypto.verify(
    "RSA-SHA256",
    Buffer.from(`${timestamp}\n${nonce}\n${rawBody}\n`, "utf8"),
    publicKey,
    Buffer.from(signature, "base64")
  );
}

function decryptWechatPayResource(resource, apiV3Key) {
  const key = Buffer.from(String(apiV3Key || ""), "utf8");
  if (key.length !== 32) throw new Error("APIv3 密钥必须为 32 字节。");
  const combined = Buffer.from(String(resource?.ciphertext || ""), "base64");
  if (combined.length <= 16) throw new Error("微信支付回调密文不完整。");
  const ciphertext = combined.subarray(0, combined.length - 16);
  const authTag = combined.subarray(combined.length - 16);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(String(resource?.nonce || ""), "utf8"));
  decipher.setAuthTag(authTag);
  decipher.setAAD(Buffer.from(String(resource?.associated_data || ""), "utf8"));
  const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  return JSON.parse(plain);
}

function publicProduct(product) {
  return {
    id: product.id,
    title: product.title,
    description: product.description,
    amountFen: product.amountFen,
    priceText: product.priceText,
    feature: product.feature,
  };
}

function sanitizeOrder(order) {
  if (!order) return null;
  return {
    outTradeNo: order.outTradeNo,
    productId: order.productId,
    productTitle: order.productTitle,
    amountFen: order.amountFen,
    priceText: `¥${(Number(order.amountFen || 0) / 100).toFixed(2)}`,
    status: order.status,
    createdAt: order.createdAt,
    paidAt: order.paidAt || "",
  };
}

function createPaymentService(options = {}) {
  const env = options.env || process.env;
  const dataDir = options.dataDir || path.join(__dirname, "data");
  const appid = String(options.appid || env.WECHAT_APPID || "").trim();
  const ordersFile = String(env.MP_PAYMENT_ORDERS_FILE || path.join(dataDir, "payment-orders.jsonl"));
  const persistentStorageConfigured =
    typeof options.persistentStorageConfigured === "function" ? options.persistentStorageConfigured : () => false;

  function getSecrets() {
    return {
      mchid: String(env.WECHAT_PAY_MCHID || "").trim(),
      serialNo: String(env.WECHAT_PAY_CERT_SERIAL_NO || "").trim(),
      apiV3Key: String(env.WECHAT_PAY_API_V3_KEY || ""),
      privateKey: readConfiguredPem(env, "WECHAT_PAY_PRIVATE_KEY", "WECHAT_PAY_PRIVATE_KEY_PATH"),
      publicKeyId: String(env.WECHAT_PAY_PUBLIC_KEY_ID || "").trim(),
      publicKey: readConfiguredPem(env, "WECHAT_PAY_PUBLIC_KEY", "WECHAT_PAY_PUBLIC_KEY_PATH"),
      notifyUrl: String(env.WECHAT_PAY_NOTIFY_URL || "").trim(),
    };
  }

  function getProducts() {
    return normalizePaymentProducts(env.MP_PAYMENT_PRODUCTS_JSON || "{}");
  }

  function getConfiguration() {
    const secrets = getSecrets();
    const products = getProducts();
    const checks = [
      { key: "appid", label: "小程序 AppID", complete: Boolean(appid), sensitive: false },
      { key: "mchid", label: "微信支付商户号", complete: Boolean(secrets.mchid), sensitive: false },
      { key: "jsapiPermission", label: "JSAPI/小程序支付权限", complete: env.MP_PAYMENT_JSAPI_ENABLED === "true", sensitive: false },
      { key: "appidBinding", label: "商户号与 AppID 绑定", complete: env.MP_PAYMENT_APPID_BOUND === "true", sensitive: false },
      { key: "merchantCertificate", label: "商户证书序列号", complete: Boolean(secrets.serialNo), sensitive: false },
      { key: "merchantPrivateKey", label: "商户私钥", complete: isPrivateKeyUsable(secrets.privateKey), sensitive: true },
      { key: "apiV3Key", label: "APIv3 密钥（32字节）", complete: Buffer.byteLength(secrets.apiV3Key, "utf8") === 32, sensitive: true },
      { key: "wechatPayPublicKeyId", label: "微信支付公钥 ID", complete: Boolean(secrets.publicKeyId), sensitive: false },
      { key: "wechatPayPublicKey", label: "微信支付公钥", complete: isPublicKeyUsable(secrets.publicKey), sensitive: false },
      { key: "notifyUrl", label: "HTTPS 支付回调地址", complete: isHttpsUrl(secrets.notifyUrl), sensitive: false },
      { key: "products", label: "收费项目与价格", complete: products.length > 0, sensitive: false },
      { key: "persistentStorage", label: "订单持久化存储", complete: Boolean(persistentStorageConfigured()), sensitive: false },
    ];
    const configurationComplete = checks.every((item) => item.complete);
    const enabled = env.MP_PAYMENT_ENABLED === "true";
    const freeTrial = env.MP_DOCUMENT_DOWNLOAD_FREE !== "false";
    const ready = enabled && configurationComplete && !freeTrial;
    const merchantKeys = ["appid", "mchid", "merchantCertificate", "merchantPrivateKey", "apiV3Key", "wechatPayPublicKeyId", "wechatPayPublicKey"];
    const merchantConfigured = checks.filter((item) => merchantKeys.includes(item.key)).every((item) => item.complete);
    const status = freeTrial
      ? "free-trial"
      : ready
        ? "ready"
        : configurationComplete
          ? "activation-pending"
          : merchantConfigured
            ? "integration-pending"
            : "merchant-setup-pending";
    return {
      enabled,
      freeTrial,
      ready,
      status,
      merchantConfigured,
      configurationComplete,
      integrationPrepared: true,
      checks,
      missingKeys: checks.filter((item) => !item.complete).map((item) => item.key),
      products: products.map(publicProduct),
      secrets,
    };
  }

  async function callWechat(pathname, method, payload, configuration) {
    const body = JSON.stringify(payload);
    const authorization = buildWechatAuthorization({
      method,
      pathname,
      body,
      mchid: configuration.secrets.mchid,
      serialNo: configuration.secrets.serialNo,
      privateKey: configuration.secrets.privateKey,
    });
    const response = await fetch(`${WECHAT_PAY_API_BASE}${pathname}`, {
      method,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: authorization.header,
        "User-Agent": "liude-xiaozhan-miniprogram/1.0",
      },
      body,
    });
    const raw = await response.text();
    const responseHeaders = {
      "wechatpay-timestamp": response.headers.get("wechatpay-timestamp") || "",
      "wechatpay-nonce": response.headers.get("wechatpay-nonce") || "",
      "wechatpay-signature": response.headers.get("wechatpay-signature") || "",
      "wechatpay-serial": response.headers.get("wechatpay-serial") || "",
    };
    if (!verifyWechatPaySignature(raw, responseHeaders, configuration.secrets.publicKey, configuration.secrets.publicKeyId)) {
      const signatureError = new Error("微信支付接口应答签名验证失败，订单未创建。");
      signatureError.statusCode = 502;
      throw signatureError;
    }
    let result = {};
    try {
      result = raw ? JSON.parse(raw) : {};
    } catch (error) {
      result = {};
    }
    if (!response.ok) {
      const requestId = response.headers.get("request-id") || response.headers.get("Request-ID") || "";
      const message = normalizeText(result.message || result.detail || `微信支付下单失败：${response.status}`, 180);
      const paymentError = new Error(requestId ? `${message}（Request-ID: ${requestId}）` : message);
      paymentError.statusCode = 502;
      paymentError.wechatRequestId = requestId;
      throw paymentError;
    }
    return {
      payload: result,
      requestId: response.headers.get("request-id") || response.headers.get("Request-ID") || "",
    };
  }

  async function createOrder({ openid, productId, clientRequestId }) {
    const configuration = getConfiguration();
    if (!configuration.ready) {
      const error = new Error(
        configuration.freeTrial
          ? "当前仍为免费内测，无需支付。"
          : configuration.configurationComplete
            ? "微信支付资料已齐，等待管理员开启正式收费。"
            : "微信支付资料尚未配置完整，暂不能发起付款。"
      );
      error.statusCode = 503;
      error.paymentConfiguration = configuration;
      throw error;
    }
    const product = getProducts().find((item) => item.id === String(productId || "").trim().toLowerCase());
    if (!product) {
      const error = new Error("收费项目不存在或尚未开放。");
      error.statusCode = 400;
      throw error;
    }
    const normalizedOpenid = String(openid || "").trim();
    if (!normalizedOpenid) {
      const error = new Error("当前微信登录身份无效，请重新登录后再试。");
      error.statusCode = 401;
      throw error;
    }
    const requestKey = normalizeText(clientRequestId, 64);
    if (requestKey) {
      const existing = currentOrders(ordersFile).find(
        (order) => order.openid === normalizedOpenid && order.clientRequestId === requestKey && order.status === "PENDING"
      );
      if (existing?.paymentParams) {
        return { order: sanitizeOrder(existing), payment: existing.paymentParams, reused: true };
      }
    }

    const outTradeNo = createOutTradeNo();
    const now = new Date().toISOString();
    const baseOrder = {
      outTradeNo,
      clientRequestId: requestKey,
      openid: normalizedOpenid,
      productId: product.id,
      productTitle: product.title,
      feature: product.feature,
      amountFen: product.amountFen,
      status: "CREATED",
      createdAt: now,
      updatedAt: now,
    };
    appendJsonl(ordersFile, baseOrder);
    try {
      const { payload, requestId } = await callWechat(
        "/v3/pay/transactions/jsapi",
        "POST",
        {
          appid,
          mchid: configuration.secrets.mchid,
          description: product.description,
          out_trade_no: outTradeNo,
          notify_url: configuration.secrets.notifyUrl,
          amount: { total: product.amountFen, currency: "CNY" },
          payer: { openid: normalizedOpenid },
          attach: product.id,
        },
        configuration
      );
      if (!payload.prepay_id) throw new Error("微信支付没有返回 prepay_id。");
      const paymentParams = createMiniProgramPayParams(appid, payload.prepay_id, configuration.secrets.privateKey);
      const pendingOrder = {
        ...baseOrder,
        status: "PENDING",
        prepayId: payload.prepay_id,
        paymentParams,
        wechatRequestId: requestId,
        updatedAt: new Date().toISOString(),
      };
      appendJsonl(ordersFile, pendingOrder);
      return { order: sanitizeOrder(pendingOrder), payment: paymentParams, reused: false };
    } catch (error) {
      appendJsonl(ordersFile, {
        ...baseOrder,
        status: "CREATE_FAILED",
        failureMessage: normalizeText(error.message, 240),
        updatedAt: new Date().toISOString(),
      });
      throw error;
    }
  }

  function getOrder(openid, outTradeNo) {
    const order = currentOrders(ordersFile).find((item) => item.outTradeNo === outTradeNo && item.openid === openid);
    return sanitizeOrder(order);
  }

  function listOrders() {
    return currentOrders(ordersFile)
      .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
      .map((order) => ({ ...sanitizeOrder(order), storageKey: order.openid ? crypto.createHash("sha256").update(order.openid).digest("hex").slice(0, 16) : "" }));
  }

  async function handleNotification(headers, rawBody, onPaid) {
    const configuration = getConfiguration();
    const { secrets } = configuration;
    if (!configuration.merchantConfigured || Buffer.byteLength(secrets.apiV3Key, "utf8") !== 32) {
      const error = new Error("微信支付回调验签配置不完整。");
      error.statusCode = 503;
      throw error;
    }
    const normalizedHeaders = Object.fromEntries(Object.entries(headers || {}).map(([key, value]) => [String(key).toLowerCase(), value]));
    if (!verifyWechatPaySignature(rawBody, normalizedHeaders, secrets.publicKey, secrets.publicKeyId)) {
      const error = new Error("微信支付回调签名无效。");
      error.statusCode = 401;
      throw error;
    }
    const event = JSON.parse(rawBody || "{}");
    const transaction = decryptWechatPayResource(event.resource, secrets.apiV3Key);
    const outTradeNo = String(transaction.out_trade_no || "");
    const order = currentOrders(ordersFile).find((item) => item.outTradeNo === outTradeNo);
    if (!order) throw new Error("支付订单不存在，等待重试。");
    if (transaction.mchid !== secrets.mchid || transaction.appid !== appid) throw new Error("支付回调商户或 AppID 不匹配。");
    if (Number(transaction.amount?.total) !== Number(order.amountFen)) throw new Error("支付回调金额与订单不一致。");
    if (transaction.trade_state !== "SUCCESS") {
      return { processed: false, outTradeNo, tradeState: transaction.trade_state || "UNKNOWN" };
    }
    if (order.status === "PAID") return { processed: true, duplicate: true, outTradeNo };
    if (typeof onPaid === "function") await onPaid({ openid: order.openid, feature: order.feature, order, transaction });
    const paidOrder = {
      ...order,
      status: "PAID",
      transactionId: String(transaction.transaction_id || ""),
      paidAt: transaction.success_time || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    appendJsonl(ordersFile, paidOrder);
    return { processed: true, duplicate: false, outTradeNo, order: sanitizeOrder(paidOrder) };
  }

  return { createOrder, getConfiguration, getOrder, getProducts, handleNotification, listOrders, ordersFile };
}

module.exports = {
  buildWechatAuthorization,
  createMiniProgramPayParams,
  createPaymentService,
  decryptWechatPayResource,
  normalizePaymentProducts,
  verifyWechatPaySignature,
};
