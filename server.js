const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const path = require("path");

const PORT = Number(process.env.PORT || 3108);
const WEB_ADVISOR_BASE_URL = (process.env.WEB_ADVISOR_BASE_URL || "https://hangzhou-zhihang-study-advisor-zada.onrender.com").replace(/\/+$/, "");
const WEB_ACCESS_PASSWORD = process.env.WEB_ACCESS_PASSWORD || "ldxz2026";
const WECHAT_APPID = process.env.WECHAT_APPID || "";
const WECHAT_SECRET = process.env.WECHAT_SECRET || "";
const MP_ALLOWED_OPENIDS = splitCsv(process.env.MP_ALLOWED_OPENIDS || "");
const MP_DEV_OPENID = process.env.MP_DEV_OPENID || "dev-openid";
const MP_ALLOW_DEV_LOGIN = process.env.MP_ALLOW_DEV_LOGIN === "true";
const MP_OPEN_LOGIN = process.env.MP_OPEN_LOGIN === "true";
const MP_LOG_DENIED_OPENID = process.env.MP_LOG_DENIED_OPENID === "true";
const ENTITLEMENTS_FILE = process.env.MP_ENTITLEMENTS_FILE || path.join(__dirname, "entitlements.json");
const MAX_REQUEST_BYTES = 22 * 1024 * 1024;

const sessions = new Map();
let webCookie = "";

function splitCsv(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function sendJson(res, statusCode, payload, extraHeaders = {}) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    ...extraHeaders,
  });
  res.end(JSON.stringify(payload));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (Buffer.byteLength(raw, "utf8") > MAX_REQUEST_BYTES) {
        reject(new Error("Payload too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(raw));
    req.on("error", reject);
  });
}

function getBearerToken(req) {
  const header = req.headers.authorization || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : "";
}

function createSession(session) {
  const token = crypto.randomBytes(28).toString("hex");
  sessions.set(token, {
    ...session,
    createdAt: Date.now(),
  });
  return token;
}

function getSession(req) {
  const token = getBearerToken(req);
  if (!token) return null;
  return sessions.get(token) || null;
}

function requireSession(req, res) {
  const session = getSession(req);
  if (!session) {
    sendJson(res, 401, { error: "请先登录小程序。" });
    return null;
  }
  return session;
}

function readEntitlements() {
  const fromEnv = process.env.MP_USER_ENTITLEMENTS_JSON;
  if (fromEnv) {
    try {
      return JSON.parse(fromEnv);
    } catch (error) {
      console.warn("MP_USER_ENTITLEMENTS_JSON 解析失败:", error.message);
    }
  }

  if (!fs.existsSync(ENTITLEMENTS_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(ENTITLEMENTS_FILE, "utf8"));
  } catch (error) {
    console.warn("entitlements.json 读取失败:", error.message);
    return {};
  }
}

function getUserEntitlements(openid) {
  const table = readEntitlements();
  const explicit = table[openid] || {};
  return {
    recommendationCount: Boolean(explicit.recommendationCount),
    materialAssistant: Boolean(explicit.materialAssistant),
  };
}

function maskOpenid(openid) {
  if (!openid) return "";
  if (openid.length <= 8) return `${openid.slice(0, 2)}***`;
  return `${openid.slice(0, 4)}***${openid.slice(-4)}`;
}

function createUserStorageKey(openid) {
  return crypto.createHash("sha256").update(String(openid || "")).digest("hex").slice(0, 16);
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || payload.errmsg || `请求失败：${response.status}`);
    error.statusCode = response.status;
    error.payload = payload;
    throw error;
  }
  return { response, payload };
}

async function ensureWebSession() {
  if (webCookie) return webCookie;

  const { response, payload } = await requestJson(`${WEB_ADVISOR_BASE_URL}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: WEB_ACCESS_PASSWORD, privacyAccepted: true }),
  });

  const setCookie = response.headers.get("set-cookie") || "";
  webCookie = setCookie.split(";")[0] || "";
  if (!webCookie) throw new Error("无法从网页版服务取得登录 Cookie。");

  if (payload.requiresWechat && !payload.authenticated) {
    await requestJson(`${WEB_ADVISOR_BASE_URL}/api/wechat/dev-login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: webCookie,
      },
      body: JSON.stringify({ privacyAccepted: true }),
    });
  }

  return webCookie;
}

async function callWebAdvisor(pathname, options = {}, retry = true) {
  const cookie = await ensureWebSession();
  try {
    const { payload } = await requestJson(`${WEB_ADVISOR_BASE_URL}${pathname}`, {
      ...options,
      headers: {
        ...(options.headers || {}),
        Cookie: cookie,
      },
    });
    return payload;
  } catch (error) {
    if (retry && (error.statusCode === 401 || error.statusCode === 429)) {
      webCookie = "";
      return callWebAdvisor(pathname, options, false);
    }
    throw error;
  }
}

async function codeToOpenid(code) {
  if (MP_ALLOW_DEV_LOGIN && (!WECHAT_APPID || !WECHAT_SECRET)) {
    return {
      openid: MP_DEV_OPENID,
      unionid: "",
      source: "local-dev",
    };
  }

  if (!WECHAT_APPID || !WECHAT_SECRET) {
    throw new Error("后端未配置 WECHAT_APPID / WECHAT_SECRET，无法完成微信登录。");
  }

  const url = new URL("https://api.weixin.qq.com/sns/jscode2session");
  url.searchParams.set("appid", WECHAT_APPID);
  url.searchParams.set("secret", WECHAT_SECRET);
  url.searchParams.set("js_code", code);
  url.searchParams.set("grant_type", "authorization_code");

  const { payload } = await requestJson(url.toString());
  if (!payload.openid) {
    throw new Error(payload.errmsg || "微信登录未返回 openid。");
  }
  return {
    openid: payload.openid,
    unionid: payload.unionid || "",
    source: "wechat",
  };
}

function handleDemoLogin(res) {
  const token = createSession({
    mode: "demo",
    openid: "demo-local",
    entitlements: {
      recommendationCount: true,
      materialAssistant: true,
    },
  });
  sendJson(res, 200, {
    token,
    mode: "demo",
    user: { label: "演示用户" },
    entitlements: {
      recommendationCount: true,
      materialAssistant: true,
    },
  });
}

async function handleUserLogin(req, res) {
  try {
    const rawBody = await readBody(req);
    const body = JSON.parse(rawBody || "{}");
    const code = String(body.code || "");
    if (!code) {
      sendJson(res, 400, { error: "缺少微信登录 code。" });
      return;
    }

    const login = await codeToOpenid(code);
    const allowed = MP_OPEN_LOGIN || MP_ALLOWED_OPENIDS.includes(login.openid);
    if (!allowed) {
      if (MP_LOG_DENIED_OPENID) {
        console.warn(`Denied Mini Program login openid: ${login.openid}`);
      }
      sendJson(res, 403, {
        error: "当前微信号未绑定，暂不能使用用户版。",
        openid: maskOpenid(login.openid),
      });
      return;
    }

    const entitlements = getUserEntitlements(login.openid);
    const token = createSession({
      mode: "user",
      openid: login.openid,
      unionid: login.unionid,
      entitlements,
    });

    sendJson(res, 200, {
      token,
      mode: "user",
      user: {
        openid: maskOpenid(login.openid),
        storageKey: createUserStorageKey(login.openid),
        source: login.source,
      },
      entitlements,
    });
  } catch (error) {
    sendJson(res, 500, { error: error.message || "微信登录失败。" });
  }
}

function handleSession(req, res) {
  const session = getSession(req);
  if (!session) {
    sendJson(res, 200, { authenticated: false });
    return;
  }
  sendJson(res, 200, {
    authenticated: true,
    mode: session.mode,
    user: {
      openid: maskOpenid(session.openid),
      storageKey: createUserStorageKey(session.openid),
    },
    entitlements: session.entitlements || {},
  });
}

async function handleDemoCases(req, res) {
  const session = requireSession(req, res);
  if (!session) return;
  if (session.mode !== "demo") {
    sendJson(res, 403, { error: "用户版不开放演示案例。" });
    return;
  }

  try {
    const payload = await callWebAdvisor("/api/demo-cases");
    sendJson(res, 200, payload);
  } catch (error) {
    sendJson(res, 502, { error: `演示案例读取失败：${error.message}` });
  }
}

async function handleDemoCase(req, res, caseId) {
  const session = requireSession(req, res);
  if (!session) return;
  if (session.mode !== "demo") {
    sendJson(res, 403, { error: "用户版不开放演示案例。" });
    return;
  }

  try {
    const payload = await callWebAdvisor(`/api/demo-cases/${encodeURIComponent(caseId)}`);
    sendJson(res, 200, payload);
  } catch (error) {
    sendJson(res, error.statusCode === 404 ? 404 : 502, { error: `演示案例读取失败：${error.message}` });
  }
}

function requiresPaidRecommendationCount(session, body) {
  const requested = Number(body.recommendationCount || 1);
  return session.mode === "user" && requested > 1 && !session.entitlements?.recommendationCount;
}

async function handleRecommend(req, res) {
  const session = requireSession(req, res);
  if (!session) return;

  try {
    const rawBody = await readBody(req);
    const body = JSON.parse(rawBody || "{}");

    if (requiresPaidRecommendationCount(session, body)) {
      sendJson(res, 402, {
        error: "更多推荐数量暂未对当前微信号开放。",
        paymentRequired: true,
        feature: "recommendationCount",
      });
      return;
    }

    const payload = await callWebAdvisor("/api/recommend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    sendJson(res, 200, payload);
  } catch (error) {
    sendJson(res, error.statusCode || 502, { error: `推荐生成失败：${error.message}` });
  }
}

function handleMaterialAccess(req, res) {
  const session = requireSession(req, res);
  if (!session) return;

  if (session.mode === "demo" || session.entitlements?.materialAssistant) {
    sendJson(res, 200, { allowed: true });
    return;
  }

  sendJson(res, 402, {
    allowed: false,
    paymentRequired: true,
    feature: "materialAssistant",
    error: "材料准备助手暂未对当前微信号开放。",
  });
}

async function handleMaterialDraft(req, res) {
  const session = requireSession(req, res);
  if (!session) return;

  if (session.mode !== "demo" && !session.entitlements?.materialAssistant) {
    sendJson(res, 402, {
      paymentRequired: true,
      feature: "materialAssistant",
      error: "材料准备助手暂未对当前微信号开放。",
    });
    return;
  }

  try {
    const rawBody = await readBody(req);
    const body = JSON.parse(rawBody || "{}");
    const payload = await callWebAdvisor("/api/material-draft", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    sendJson(res, 200, payload);
  } catch (error) {
    sendJson(res, error.statusCode || 502, { error: `材料初稿生成失败：${error.message}` });
  }
}

function handlePaymentPlaceholder(req, res) {
  const session = requireSession(req, res);
  if (!session) return;
  sendJson(res, 501, {
    error: "高级功能暂未对当前微信号开放。",
    paymentReady: false,
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "OPTIONS") {
    sendJson(res, 204, {});
    return;
  }

  if (req.method === "GET" && url.pathname === "/health") {
    sendJson(res, 200, {
      ok: true,
      service: "liude-xiaozhan-miniprogram-backend",
      upstream: WEB_ADVISOR_BASE_URL,
      wechatConfigured: Boolean(WECHAT_APPID && WECHAT_SECRET),
      openLogin: MP_OPEN_LOGIN,
      whitelistSize: MP_ALLOWED_OPENIDS.length,
      deniedOpenidLogging: MP_LOG_DENIED_OPENID,
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/mp/demo/login") {
    handleDemoLogin(res);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/mp/user/login") {
    handleUserLogin(req, res);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/mp/session") {
    handleSession(req, res);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/mp/demo-cases") {
    handleDemoCases(req, res);
    return;
  }

  const demoCaseMatch = url.pathname.match(/^\/api\/mp\/demo-cases\/(\d+)$/);
  if (req.method === "GET" && demoCaseMatch) {
    handleDemoCase(req, res, demoCaseMatch[1]);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/mp/recommend") {
    handleRecommend(req, res);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/mp/material-access") {
    handleMaterialAccess(req, res);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/mp/material-draft") {
    handleMaterialDraft(req, res);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/mp/payment/create") {
    handlePaymentPlaceholder(req, res);
    return;
  }

  sendJson(res, 404, { error: "Not found" });
});

server.listen(PORT, () => {
  console.log(`Liude Xiaozhan Mini Program adapter running at http://127.0.0.1:${PORT}`);
  console.log(`Web advisor upstream: ${WEB_ADVISOR_BASE_URL}`);
  console.log(`User whitelist: ${MP_ALLOWED_OPENIDS.length ? `${MP_ALLOWED_OPENIDS.length} openid(s)` : "empty"}`);
});

module.exports = server;
