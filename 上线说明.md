const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const path = require("path");
const localEngine = require("./local-engine");

const PORT = Number(process.env.PORT || 3108);
const WECHAT_APPID = process.env.WECHAT_APPID || "";
const WECHAT_SECRET = process.env.WECHAT_SECRET || "";
const MP_ALLOWED_OPENIDS = splitCsv(process.env.MP_ALLOWED_OPENIDS || "");
const MP_DEV_OPENID = process.env.MP_DEV_OPENID || "dev-openid";
const MP_ALLOW_DEV_LOGIN = process.env.MP_ALLOW_DEV_LOGIN === "true";
const MP_OPEN_LOGIN = process.env.MP_OPEN_LOGIN === "true";
const MP_LOG_DENIED_OPENID = process.env.MP_LOG_DENIED_OPENID === "true";
const MP_LOG_LOGIN_OPENID = process.env.MP_LOG_LOGIN_OPENID === "true";
const MP_FREE_RECOMMENDATION_COUNTS = parseIntegerList(process.env.MP_FREE_RECOMMENDATION_COUNTS || "1,3,6");
const MP_BOOKING_NOTIFY_ENABLED = process.env.MP_BOOKING_NOTIFY_ENABLED === "true";
const MP_BOOKING_TEMPLATE_ID = process.env.MP_BOOKING_TEMPLATE_ID || "";
const MP_BOOKING_TEMPLATE_FIELDS = parseJsonEnv("MP_BOOKING_TEMPLATE_FIELDS_JSON", {});
const MP_BOOKING_MINIPROGRAM_STATE = process.env.MP_BOOKING_MINIPROGRAM_STATE || "formal";
const MP_TEACHER_OPENIDS = parseJsonEnv("MP_TEACHER_OPENIDS_JSON", {});
const MP_OWNER_OPENIDS = parseJsonEnv("MP_OWNER_OPENIDS_JSON", []);
const MP_ADMIN_OPENIDS = parseJsonEnv("MP_ADMIN_OPENIDS_JSON", []);
const MP_BOOKING_WEBHOOK_URL = process.env.MP_BOOKING_WEBHOOK_URL || "";
const MP_BOOKING_TEACHER_WEBHOOKS = parseJsonEnv("MP_BOOKING_TEACHER_WEBHOOKS_JSON", {});
const ENTITLEMENTS_FILE = process.env.MP_ENTITLEMENTS_FILE || path.join(__dirname, "entitlements.json");
const MP_BOOKINGS_FILE = process.env.MP_BOOKINGS_FILE || path.join(__dirname, "data", "bookings.jsonl");
const DEFAULT_BOOKING_TIMES = [
  "09:00",
  "10:00",
  "11:00",
  "12:00",
  "13:00",
  "14:00",
  "15:00",
  "16:00",
  "17:00",
  "18:00",
  "19:00",
  "20:00",
  "21:00",
];
const MP_BOOKING_TIMES = normalizeTimeList(
  splitCsv(process.env.MP_BOOKING_TIMES || DEFAULT_BOOKING_TIMES.join(","))
);
const MP_BOOKING_TIMEZONE_OFFSET_MINUTES = Number(process.env.MP_BOOKING_TIMEZONE_OFFSET_MINUTES || 8 * 60);
const MAX_REQUEST_BYTES = Number(process.env.MAX_REQUEST_BYTES || 40 * 1024 * 1024);

const sessions = new Map();
let wechatAccessToken = { value: "", expiresAt: 0 };

function splitCsv(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseIntegerList(value) {
  return splitCsv(value)
    .map((item) => Number(item))
    .filter((item) => Number.isInteger(item) && item > 0);
}

function parseJsonEnv(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch (error) {
    console.warn(`${name} 解析失败:`, error.message);
    return fallback;
  }
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function parseBookingTimeToMinutes(value) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || "").trim());
  if (!match) return -1;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return -1;
  }
  return hour * 60 + minute;
}

function normalizeTimeList(values) {
  const seen = new Set();
  return (values || [])
    .map((value) => {
      const minutes = parseBookingTimeToMinutes(value);
      if (minutes < 0) return "";
      return `${pad2(Math.floor(minutes / 60))}:${pad2(minutes % 60)}`;
    })
    .filter((value) => {
      if (!value || seen.has(value)) return false;
      seen.add(value);
      return true;
    })
    .sort((a, b) => parseBookingTimeToMinutes(a) - parseBookingTimeToMinutes(b));
}

function getBookingLocalNow(date = new Date()) {
  return new Date(date.getTime() + MP_BOOKING_TIMEZONE_OFFSET_MINUTES * 60 * 1000);
}

function getBookingDateKey(date = new Date()) {
  const local = getBookingLocalNow(date);
  return `${local.getUTCFullYear()}-${pad2(local.getUTCMonth() + 1)}-${pad2(local.getUTCDate())}`;
}

function getBookingCurrentMinutes(date = new Date()) {
  const local = getBookingLocalNow(date);
  return local.getUTCHours() * 60 + local.getUTCMinutes();
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

function isJsonParseError(error) {
  return error instanceof SyntaxError && /JSON/i.test(error.message || "");
}

function sendBadJson(res) {
  sendJson(res, 400, { error: "请求格式不是合法 JSON，请重新提交。" });
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

const FALLBACK_PROGRAMS = [
  { domains: ["data", "cs", "ai"], university: "University of Stuttgart", program: "Artificial Intelligence and Data Science", city: "Stuttgart" },
  { domains: ["data", "cs", "ai"], university: "Technical University of Munich", program: "Data Engineering and Analytics", city: "Munich" },
  { domains: ["cs", "software"], university: "TU Berlin", program: "Computer Science (Informatik), M.Sc", city: "Berlin" },
  { domains: ["energy", "mechanical", "engineering"], university: "Technical University of Munich", program: "Energy and Process Engineering", city: "Munich" },
  { domains: ["energy", "environment", "engineering"], university: "FAU Erlangen-Nurnberg", program: "Clean Energy Processes (M.Sc.)", city: "Erlangen" },
  { domains: ["mechanical", "engineering"], university: "Technical University of Munich", program: "Development, Production and Management in Mechanical Engineering", city: "Munich" },
  { domains: ["mechanical", "engineering"], university: "University of Stuttgart", program: "Mechanical Engineering", city: "Stuttgart" },
  { domains: ["materials", "engineering"], university: "University of Stuttgart", program: "Materials Science (Materialwissenschaft)", city: "Stuttgart" },
  { domains: ["robotics", "automation", "engineering"], university: "University of Stuttgart", program: "Engineering Cybernetics", city: "Stuttgart" },
  { domains: ["electrical", "engineering"], university: "Karlsruhe Institute of Technology", program: "Electrical Engineering and Information Technology Master of Science", city: "Karlsruhe" },
  { domains: ["business", "management"], university: "University of Cologne", program: "Business Analytics & Econometrics, Master of Science (M.Sc.)", city: "Cologne" },
  { domains: ["business", "management"], university: "University of Mannheim", program: "Mannheim Master in Management", city: "Mannheim" },
  { domains: ["finance", "business"], university: "University of Mannheim", program: "Mannheim Master in Finance, Accounting and Taxation", city: "Mannheim" },
  { domains: ["law", "data"], university: "TU Dresden", program: "International Studies in Intellectual Property Law and Data Law (Master)", city: "Dresden" },
  { domains: ["design", "textile", "engineering"], university: "TU Dresden", program: "Textile and Clothing Technology related Master options", city: "Dresden" },
  { domains: ["environment", "sustainability"], university: "TU Berlin", program: "Ecology and Environmental Planning, M.Sc", city: "Berlin" },
  { domains: ["civil", "engineering"], university: "Technical University of Munich", program: "Civil Engineering", city: "Munich" },
  { domains: ["general"], university: "FAU Erlangen-Nurnberg", program: "Interdisciplinary Master options matching the submitted profile", city: "Erlangen" },
];

function normalizeMiniText(value) {
  return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function normalizeRecommendationCount(value) {
  const count = Number(value || 1);
  return [1, 3, 6, 10].includes(count) ? count : 1;
}

function detectFallbackDomains(profile) {
  const corpus = normalizeMiniText(
    [
      profile.major,
      profile.targetField,
      profile.courses,
      profile.thesisTopic,
      profile.projects,
      profile.internships,
      profile.experience,
      profile.notes,
    ].join(" ")
  );
  const domains = [];
  const add = (domain, pattern) => {
    if (pattern.test(corpus) && !domains.includes(domain)) domains.push(domain);
  };

  add("ai", /人工智能|机器学习|深度学习|\bai\b|artificial intelligence|machine learning/);
  add("data", /数据|统计|analytics|data|database|econometrics/);
  add("cs", /计算机|软件|算法|computer|software|informatik|programming/);
  add("robotics", /机器人|自动化|控制|robot|automation|control/);
  add("energy", /能源|动力|热能|内燃机|传热|发动机|energy|power|thermal|combustion|clean energy|process engineering/);
  add("mechanical", /机械|车辆|汽车|制造|动力|内燃机|传热|mechatronics|mechanical|automotive/);
  add("electrical", /电气|电子|通信|electrical|electronics|communication/);
  add("materials", /材料|materials?|material science|werkstoff/);
  add("business", /管理|商科|市场|business|management|marketing|supply chain/);
  add("finance", /金融|会计|财务|finance|accounting|taxation/);
  add("law", /法律|法学|知识产权|law|legal|regulatory|intellectual property/);
  add("design", /设计|服装|纺织|fashion|textile|clothing|garment/);
  add("environment", /环境|可持续|sustainability|environment|ecology/);
  add("civil", /土木|结构|civil|structural/);
  add("engineering", /工程|engineering/);

  return domains.length ? domains : ["general"];
}

function buildFallbackRecommendation(body, error) {
  const domains = detectFallbackDomains(body || {});
  const count = normalizeRecommendationCount(body?.recommendationCount);
  const target = body?.targetField || body?.major || "当前申请方向";
  const selected = [];

  for (const program of FALLBACK_PROGRAMS) {
    if (program.domains.some((domain) => domains.includes(domain)) && !selected.some((item) => item.university === program.university && item.program === program.program)) {
      selected.push(program);
    }
    if (selected.length >= count) break;
  }
  for (const program of FALLBACK_PROGRAMS) {
    if (selected.length >= count) break;
    if (!selected.some((item) => item.university === program.university && item.program === program.program)) selected.push(program);
  }

  return {
    studentSummary: `已根据当前已填写的部分资料和本地院校专业数据库，为“${target}”生成初步推荐。`,
    positioning: "当前资料完整度有限，推荐结果按保守策略排序；后续补充成绩、语言、课程和项目经历后可再次精排。",
    transcriptSummary: {
      filesRead: Array.isArray(body?.files) ? body.files.length : 0,
      methods: [],
      confidence: "低",
      extractedScoreText: body?.gpa || "未稳定识别",
      extractedMajor: body?.major || "未稳定识别",
      keywords: domains,
      summary: "本次使用本地数据库兜底生成；如上传文件未被稳定识别，仍会继续给出初步推荐。",
      preview: "资料不完整或上游繁忙时，系统已自动切换到本地数据库兜底推荐。",
    },
    inputQuality: {
      level: "低",
      score: 30,
      warnings: ["当前资料较少，建议后续补充完整成绩单、课程描述、语言成绩和目标方向。"],
      strengths: domains.includes("general") ? [] : ["已根据已填写文本识别到初步申请方向。"],
    },
    accuracyNotes: [
      "当前为本地数据库兜底推荐，已经避免 429 或资料不完整导致流程中断。",
      "由于学生资料尚不完整，匹配度做了保守处理，结果适合作为初筛清单。",
      error?.message ? `上游服务提示：${error.message}` : "",
    ].filter(Boolean),
    recommendationQuality: {
      level: "基础",
      notes: ["兜底结果来自本地规则和院校专业候选库，正式递交前仍需顾问核对官网要求。"],
    },
    recommendationCount: selected.length,
    recommendations: selected.map((program, index) => ({
      rank: index + 1,
      university: program.university,
      program: program.program,
      degree: body?.targetDegree || "硕士",
      city: program.city,
      matchPercent: Math.max(58, 72 - index * 3),
      matchLevel: "初步匹配",
      evaluation: "可作为初筛候选",
      reason: `根据已填写的${target}方向和本地数据库信号，暂列为初步候选；资料补全后建议重新生成精确排序。`,
      detail: {
        matchReasonDetails: ["本地数据库兜底推荐", "资料完整度较低，匹配度已保守处理"],
        fitHighlights: ["方向存在初步相关性，可进入顾问复核。"],
        riskHighlights: ["需要补充课程、成绩和语言信息后再判断申请把握。"],
        requirementHighlights: ["正式申请前请核对官网 Zulassungsvoraussetzungen、语言要求和截止日期。"],
        sourceEvidence: [],
        facts: {
          duration: "",
          ects: "",
          languages: [],
          applicationPeriod: "",
          catalogCoverage: "兜底候选",
          catalogCoverageScore: 45,
        },
      },
      qualityAudit: {
        status: "兜底推荐，需人工复核",
        evidenceScore: 45,
        level: "基础",
      },
    })),
    nextSteps: ["补充成绩单或课程描述后再次生成。", "由顾问核对候选项目官网要求。"],
    source: "mini-program-local-fallback",
    aiReview: {
      enabled: false,
      status: "fallback",
      model: "",
      summary: "上游繁忙或资料不足时，已自动切换为本地数据库兜底推荐。",
      reliabilityNotes: [],
    },
  };
}

function shouldUseRecommendationFallback(error) {
  const status = Number(error?.statusCode || 0);
  if ([400, 401, 408, 429, 500, 502, 503, 504].includes(status)) return true;
  return /429|rate|too many|timeout|timed out|fetch failed|ECONNRESET|ENOTFOUND|ETIMEDOUT|繁忙|频繁|限流|请求失败/i.test(error?.message || "");
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
    if (MP_LOG_LOGIN_OPENID) {
      console.warn(`Mini Program login openid: ${login.openid}`);
    }
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
        isAdmin: isAdminSession({ openid: login.openid }),
      },
      entitlements,
      isAdmin: isAdminSession({ openid: login.openid }),
    });
  } catch (error) {
    if (isJsonParseError(error)) {
      sendBadJson(res);
      return;
    }
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
      isAdmin: isAdminSession(session),
    },
    entitlements: session.entitlements || {},
    isAdmin: isAdminSession(session),
  });
}

async function handleDemoCases(req, res) {
  const session = requireSession(req, res);
  if (!session) return;
  sendJson(res, 200, { cases: [], mode: session.mode, source: "mini-program-standalone" });
}

async function handleDemoCase(req, res, caseId) {
  const session = requireSession(req, res);
  if (!session) return;
  sendJson(res, 404, { error: `独立小程序后端未内置演示案例 ${caseId}。` });
}

function normalizeBookingText(value, maxLength = 20) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function normalizeBooking(body, session) {
  const date = normalizeBookingText(body.date, 20);
  const dateDisplay = normalizeBookingText(body.dateDisplay || body.date, 30);
  const time = normalizeBookingText(body.time, 12);
  const advisorKey = normalizeBookingText(body.advisorKey || "a1", 20);
  const advisorName = normalizeBookingText(body.advisorName || (advisorKey === "a2" ? "陆老师" : "张老师"), 20);
  const studentName = normalizeBookingText(body.studentName || "微信用户", 20);
  const note = normalizeBookingText(body.note || "预约德国留学申请沟通", 50);
  const dateTime = normalizeBookingText(`${dateDisplay} ${time}`, 30);
  const id = `bk_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
  const bookingText =
    body.bookingText ||
    [
      "留德小栈预约信息",
      `学生：${studentName}`,
      `日期：${dateDisplay}`,
      `时间：${time}`,
      `顾问：${advisorName}`,
      `备注：${note || "无"}`,
    ].join("\n");

  return {
    id,
    advisorKey,
    advisorName,
    studentName,
    date,
    dateDisplay,
    time,
    dateTime,
    note,
    bookingText: String(bookingText || "").slice(0, 800),
    user: {
      openid: maskOpenid(session.openid),
      storageKey: createUserStorageKey(session.openid),
    },
    status: "confirmed",
    createdAt: new Date().toISOString(),
  };
}

function appendBookingRecord(booking) {
  try {
    fs.mkdirSync(path.dirname(MP_BOOKINGS_FILE), { recursive: true });
    fs.appendFileSync(MP_BOOKINGS_FILE, `${JSON.stringify(booking)}\n`, "utf8");
  } catch (error) {
    console.warn("预约记录写入失败:", error.message);
  }
}

function readBookingRecords() {
  if (!fs.existsSync(MP_BOOKINGS_FILE)) return [];
  try {
    return fs
      .readFileSync(MP_BOOKINGS_FILE, "utf8")
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
    console.warn("预约记录读取失败:", error.message);
    return [];
  }
}

function isActiveBooking(booking) {
  return !["cancelled", "rejected", "expired"].includes(String(booking.status || "confirmed"));
}

function getBookedBookingTimes(advisorKey, date) {
  const times = readBookingRecords()
    .filter((booking) => isActiveBooking(booking) && booking.advisorKey === advisorKey && booking.date === date)
    .map((booking) => booking.time)
    .filter(Boolean);
  return normalizeTimeList(times);
}

function getPastBookingTimes(date) {
  const today = getBookingDateKey();
  if (date < today) return MP_BOOKING_TIMES.slice();
  if (date > today) return [];
  const nowMinutes = getBookingCurrentMinutes();
  return MP_BOOKING_TIMES.filter((time) => parseBookingTimeToMinutes(time) <= nowMinutes);
}

function getBookingSlotState(advisorKey, date) {
  const bookedTimes = getBookedBookingTimes(advisorKey, date);
  const pastTimes = getPastBookingTimes(date);
  return {
    bookedTimes,
    pastTimes,
    unavailableTimes: normalizeTimeList([...bookedTimes, ...pastTimes]),
  };
}

function getUnavailableBookingTimes(advisorKey, date) {
  return getBookingSlotState(advisorKey, date).unavailableTimes;
}

function isPastBookingSlot(booking) {
  return getPastBookingTimes(booking.date).includes(booking.time);
}

function findBookingConflict(booking) {
  return readBookingRecords().find(
    (item) =>
      isActiveBooking(item) &&
      item.advisorKey === booking.advisorKey &&
      item.date === booking.date &&
      item.time === booking.time
  );
}

function getAdvisorOpenids(advisorKey) {
  const raw = MP_TEACHER_OPENIDS[advisorKey] || [];
  return Array.isArray(raw) ? raw.filter(Boolean) : [raw].filter(Boolean);
}

function compactStringArray(values) {
  return Array.from(new Set((values || []).flatMap((value) => (Array.isArray(value) ? value : [value])).map((value) => String(value || "").trim()).filter(Boolean)));
}

function getAllTeacherOpenids() {
  return compactStringArray(Object.values(MP_TEACHER_OPENIDS));
}

function getAdminOpenids() {
  return compactStringArray([MP_OWNER_OPENIDS, MP_ADMIN_OPENIDS, getAllTeacherOpenids()]);
}

function isAdminSession(session) {
  return Boolean(session?.openid && getAdminOpenids().includes(session.openid));
}

function getBookingWebhookUrls() {
  return compactStringArray([MP_BOOKING_WEBHOOK_URL, ...Object.values(MP_BOOKING_TEACHER_WEBHOOKS)]);
}

function buildBookingSubscribeData(booking) {
  const valueByName = {
    studentName: booking.studentName,
    advisorName: booking.advisorName,
    dateTime: booking.dateTime,
    date: booking.dateDisplay || booking.date,
    time: booking.time,
    note: booking.note || "预约沟通",
  };
  const fields =
    Object.keys(MP_BOOKING_TEMPLATE_FIELDS).length > 0
      ? MP_BOOKING_TEMPLATE_FIELDS
      : {
          thing1: "studentName",
          time2: "dateTime",
          thing3: "advisorName",
          thing4: "note",
        };

  return Object.entries(fields).reduce((data, [templateKey, sourceKey]) => {
    data[templateKey] = { value: normalizeBookingText(valueByName[sourceKey] || sourceKey, 20) };
    return data;
  }, {});
}

async function getWechatAccessToken() {
  if (wechatAccessToken.value && Date.now() < wechatAccessToken.expiresAt) {
    return wechatAccessToken.value;
  }

  const url = new URL("https://api.weixin.qq.com/cgi-bin/token");
  url.searchParams.set("grant_type", "client_credential");
  url.searchParams.set("appid", WECHAT_APPID);
  url.searchParams.set("secret", WECHAT_SECRET);

  const { payload } = await requestJson(url.toString());
  if (!payload.access_token) {
    throw new Error(payload.errmsg || "微信 access_token 获取失败");
  }

  wechatAccessToken = {
    value: payload.access_token,
    expiresAt: Date.now() + Math.max(Number(payload.expires_in || 7200) - 300, 60) * 1000,
  };
  return wechatAccessToken.value;
}

async function sendWechatSubscribeMessage(openid, booking) {
  if (!MP_BOOKING_NOTIFY_ENABLED) {
    return { sent: false, channel: "wechat-subscribe", reason: "MP_BOOKING_NOTIFY_ENABLED 未开启" };
  }
  if (!WECHAT_APPID || !WECHAT_SECRET || !MP_BOOKING_TEMPLATE_ID) {
    return { sent: false, channel: "wechat-subscribe", reason: "微信订阅消息配置不完整" };
  }

  const accessToken = await getWechatAccessToken();
  const { payload } = await requestJson(
    `https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=${encodeURIComponent(accessToken)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        touser: openid,
        template_id: MP_BOOKING_TEMPLATE_ID,
        page: "pages/booking/booking",
        miniprogram_state: MP_BOOKING_MINIPROGRAM_STATE,
        lang: "zh_CN",
        data: buildBookingSubscribeData(booking),
      }),
    }
  );

  if (payload.errcode && payload.errcode !== 0) {
    throw new Error(payload.errmsg || `微信订阅消息发送失败：${payload.errcode}`);
  }
  return { sent: true, channel: "wechat-subscribe", openid: maskOpenid(openid) };
}

async function sendBookingWebhook(url, booking) {
  if (!url) return { sent: false, channel: "webhook", reason: "未配置预约 Webhook" };

  const content = [
    "留德小栈新预约",
    `学生：${booking.studentName}`,
    `顾问：${booking.advisorName}`,
    `时间：${booking.dateDisplay} ${booking.time}`,
    `备注：${booking.note || "无"}`,
  ].join("\n");

  const { payload } = await requestJson(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      msgtype: "text",
      text: { content },
    }),
  });

  if (payload.errcode && payload.errcode !== 0) {
    throw new Error(payload.errmsg || `预约 Webhook 发送失败：${payload.errcode}`);
  }
  return { sent: true, channel: "webhook" };
}

async function sendBookingNotifications(booking) {
  const tasks = [];
  for (const webhookUrl of getBookingWebhookUrls()) {
    tasks.push(sendBookingWebhook(webhookUrl, booking));
  }
  for (const openid of getAllTeacherOpenids()) {
    tasks.push(sendWechatSubscribeMessage(openid, booking));
  }

  if (!tasks.length) {
    return {
      notified: false,
      message: "预约已提交成功，老师可在小程序预约管理中查看。若临近沟通时间仍未收到回复，可联系客服确认。",
      channels: [],
    };
  }

  const settled = await Promise.allSettled(tasks);
  const channels = settled
    .filter((item) => item.status === "fulfilled" && item.value?.sent)
    .map((item) => item.value);
  if (channels.length) {
    return { notified: true, message: "预约已提交成功，并已同步提醒老师。", channels };
  }

  const reason = settled
    .map((item) => (item.status === "rejected" ? item.reason?.message : item.value?.reason))
    .filter(Boolean)
    .join("；");
  return {
    notified: false,
    message:
      reason ||
      "预约已提交成功，并已保存到老师预约管理。通知暂时未送达时，老师仍可在小程序后台查看。",
    channels: [],
  };
}

async function handleBooking(req, res) {
  const session = requireSession(req, res);
  if (!session) return;

  try {
    const rawBody = await readBody(req);
    const body = JSON.parse(rawBody || "{}");
    const booking = normalizeBooking(body, session);
    const slotState = getBookingSlotState(booking.advisorKey, booking.date);
    if (isPastBookingSlot(booking)) {
      sendJson(res, 409, {
        ok: false,
        slotExpired: true,
        error: "该时间段已经过了，请重新选择今天稍后的时间，或改约之后的日期。",
        ...slotState,
      });
      return;
    }
    if (findBookingConflict(booking)) {
      sendJson(res, 409, {
        ok: false,
        slotTaken: true,
        error: "该时间段已被预约，请重新选择其他时间。",
        ...getBookingSlotState(booking.advisorKey, booking.date),
      });
      return;
    }
    appendBookingRecord(booking);
    const notifyResult = await sendBookingNotifications(booking);
    sendJson(res, 200, {
      ok: true,
      bookingId: booking.id,
      ...notifyResult,
    });
  } catch (error) {
    if (isJsonParseError(error)) {
      sendBadJson(res);
      return;
    }
    sendJson(res, 200, {
      ok: true,
      notified: false,
      message: error.message || "预约已提交成功，并已保存到老师预约管理。老师可在小程序后台查看。",
      channels: [],
    });
  }
}

function handleBookingSlots(req, res, url) {
  const session = requireSession(req, res);
  if (!session) return;

  const advisorKey = normalizeBookingText(url.searchParams.get("advisorKey") || "a1", 20);
  const date = normalizeBookingText(url.searchParams.get("date") || "", 20);
  if (!date) {
    sendJson(res, 400, { error: "缺少预约日期。" });
    return;
  }

  const slotState = getBookingSlotState(advisorKey, date);
  sendJson(res, 200, {
    ok: true,
    advisorKey,
    date,
    times: MP_BOOKING_TIMES,
    serverDate: getBookingDateKey(),
    serverMinutes: getBookingCurrentMinutes(),
    timezoneOffsetMinutes: MP_BOOKING_TIMEZONE_OFFSET_MINUTES,
    ...slotState,
  });
}

function handleBookingConfig(req, res) {
  const session = requireSession(req, res);
  if (!session) return;

  sendJson(res, 200, {
    ok: true,
    subscribeEnabled: Boolean(MP_BOOKING_TEMPLATE_ID),
    templateId: MP_BOOKING_TEMPLATE_ID,
    teacherNotificationConfigured: Boolean(
      MP_BOOKING_NOTIFY_ENABLED && MP_BOOKING_TEMPLATE_ID && getAllTeacherOpenids().length
    ),
    notifyAllConfiguredTeachers: true,
    teacherOpenidCount: getAllTeacherOpenids().length,
    webhookCount: getBookingWebhookUrls().length,
  });
}

function sanitizeBookingForAdmin(booking) {
  return {
    id: booking.id,
    advisorKey: booking.advisorKey,
    advisorName: booking.advisorName,
    studentName: booking.studentName,
    date: booking.date,
    dateDisplay: booking.dateDisplay,
    time: booking.time,
    dateTime: booking.dateTime,
    note: booking.note,
    bookingText: booking.bookingText,
    status: booking.status || "confirmed",
    createdAt: booking.createdAt,
    user: booking.user || {},
  };
}

function handleAdminBookings(req, res, url) {
  const session = requireSession(req, res);
  if (!session) return;
  if (!isAdminSession(session)) {
    sendJson(res, 403, { error: "当前微信号没有预约管理权限。" });
    return;
  }

  const advisorKey = normalizeBookingText(url.searchParams.get("advisorKey") || "all", 20);
  const status = normalizeBookingText(url.searchParams.get("status") || "active", 20);
  const records = readBookingRecords()
    .filter((booking) => (advisorKey === "all" ? true : booking.advisorKey === advisorKey))
    .filter((booking) => (status === "all" ? true : isActiveBooking(booking)))
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
    .slice(0, 120);
  const today = getBookingDateKey();
  const activeRecords = records.filter(isActiveBooking);
  const occupiedSlots = activeRecords
    .map((booking) => `${booking.advisorName || booking.advisorKey} ${booking.dateDisplay || booking.date} ${booking.time}`)
    .filter(Boolean);

  sendJson(res, 200, {
    ok: true,
    isAdmin: true,
    count: records.length,
    todayCount: activeRecords.filter((booking) => booking.date === today).length,
    occupiedSlots,
    records: records.map(sanitizeBookingForAdmin),
  });
}

function requiresPaidRecommendationCount(session, body) {
  const requested = Number(body.recommendationCount || 1);
  return (
    session.mode === "user" &&
    !MP_FREE_RECOMMENDATION_COUNTS.includes(requested) &&
    !session.entitlements?.recommendationCount
  );
}

async function handleRecommend(req, res) {
  const session = requireSession(req, res);
  if (!session) return;

  let body = {};
  try {
    const rawBody = await readBody(req);
    body = JSON.parse(rawBody || "{}");

    if (requiresPaidRecommendationCount(session, body)) {
      sendJson(res, 402, {
        error: "更多推荐数量暂未对当前微信号开放。",
        paymentRequired: true,
        feature: "recommendationCount",
      });
      return;
    }

    const payload = await localEngine.createRecommendation(body);
    sendJson(res, 200, payload);
  } catch (error) {
    if (isJsonParseError(error)) {
      sendBadJson(res);
      return;
    }
    if (/Payload too large/i.test(error.message || "")) {
      sendJson(res, 413, { error: "上传文件过大，请减少文件数量、压缩照片，或改传清晰 PDF 后再试。" });
      return;
    }
    sendJson(res, 200, buildFallbackRecommendation(body, error));
  }
}

async function handleTranscriptPreview(req, res) {
  const session = requireSession(req, res);
  if (!session) return;

  try {
    const rawBody = await readBody(req);
    const body = JSON.parse(rawBody || "{}");
    const payload = await localEngine.createTranscriptPreview(body);
    sendJson(res, 200, payload);
  } catch (error) {
    if (isJsonParseError(error)) {
      sendBadJson(res);
      return;
    }
    if (/Payload too large/i.test(error.message || "")) {
      sendJson(res, 413, { error: "上传文件过大，请减少文件数量、压缩照片，或改传清晰 PDF 后再试。" });
      return;
    }
    sendJson(res, 200, {
      ok: false,
      rows: [
        {
          course: "待校对课程",
          grade: "",
          credits: "",
          term: "",
          note: "成绩单图片暂未稳定识别，请手动录入关键课程后继续推荐",
        },
      ],
      transcriptSummary: {
        confidence: "低",
        summary: "成绩单预识别暂时不可用，请手动校对后继续推荐。",
        sensitiveHidden: false,
        privacyNote: "政治敏感课程/人物信息会自动隐藏，不进入对外展示和推荐报告；院校匹配仍可继续进行。",
        preview: "",
        methods: [],
        keywords: [],
      },
      files: [],
    });
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
    const payload = localEngine.createMaterialDraft(body);
    sendJson(res, 200, payload);
  } catch (error) {
    if (isJsonParseError(error)) {
      sendBadJson(res);
      return;
    }
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
      engine: "mini-program-standalone",
      transcriptEngine: "template-first-20260610",
      webSeparated: true,
      wechatConfigured: Boolean(WECHAT_APPID && WECHAT_SECRET),
      openLogin: MP_OPEN_LOGIN,
      whitelistSize: MP_ALLOWED_OPENIDS.length,
      deniedOpenidLogging: MP_LOG_DENIED_OPENID,
      loginOpenidLogging: MP_LOG_LOGIN_OPENID,
      freeRecommendationCounts: MP_FREE_RECOMMENDATION_COUNTS,
      bookingNotificationConfigured: Boolean(
        MP_BOOKING_WEBHOOK_URL ||
          Object.keys(MP_BOOKING_TEACHER_WEBHOOKS).length ||
          (MP_BOOKING_NOTIFY_ENABLED && MP_BOOKING_TEMPLATE_ID && getAllTeacherOpenids().length)
      ),
      bookingNotifyAllTeachers: true,
      bookingTeacherOpenidCount: getAllTeacherOpenids().length,
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

  if (req.method === "POST" && url.pathname === "/api/mp/transcript-preview") {
    handleTranscriptPreview(req, res);
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

  if (req.method === "GET" && url.pathname === "/api/mp/booking/slots") {
    handleBookingSlots(req, res, url);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/mp/booking/config") {
    handleBookingConfig(req, res);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/mp/admin/bookings") {
    handleAdminBookings(req, res, url);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/mp/booking") {
    handleBooking(req, res);
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
  console.log("Recommendation engine: mini-program standalone");
  console.log(`User whitelist: ${MP_ALLOWED_OPENIDS.length ? `${MP_ALLOWED_OPENIDS.length} openid(s)` : "empty"}`);
});

module.exports = server;
