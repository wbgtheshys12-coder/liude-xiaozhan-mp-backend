const env = require("./env");
const DRAFT_KEY = "liude-shared-profile-draft-v1";

const APPLICATION_LEVELS = ["本科", "硕士"];
const REQUIRED_FIELDS = ["name", "contact", "school", "major", "applicationLevel"];
const PROFILE_FIELDS = ["name", "phone", "email", "school", "major", "applicationLevel"];
const FIELD_LABELS = {
  name: "姓名",
  contact: "手机号或邮箱",
  school: "当前/毕业学校",
  major: "当前/本科专业",
  applicationLevel: "申请层次"
};

function normalize(profile = {}) {
  const level = String(profile.applicationLevel || profile.targetDegree || "").trim();
  const phone = String(profile.phone || "").trim();
  const email = String(profile.email || "").trim().toLowerCase();
  const contact = phone || email || String(profile.contact || "").trim();
  return {
    ...profile,
    name: String(profile.name || "").trim(),
    phone,
    email,
    preferredContact: phone ? "phone" : email ? "email" : String(profile.preferredContact || "legacy"),
    contact,
    school: String(profile.school || "").trim(),
    major: String(profile.major || "").trim(),
    applicationLevel: APPLICATION_LEVELS.includes(level) ? level : "",
    companyAccount: String(profile.companyAccount || "").trim(),
    lockedAt: profile.lockedAt || "",
    updatedAt: profile.updatedAt || ""
  };
}

function isValidPhone(value) {
  return !value || /^\+?[0-9][0-9\s()-]{5,24}$/.test(String(value).trim());
}

function isValidEmail(value) {
  return !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value).trim());
}

function getMissingFields(profile) {
  const current = normalize(profile);
  return REQUIRED_FIELDS.filter((field) => !current[field]);
}

function isComplete(profile) {
  return getMissingFields(profile).length === 0;
}

function getStored() {
  try {
    const session = wx.getStorageSync(env.STORAGE_KEYS.session) || {};
    const hasAccountScope = Boolean(session.user?.storageKey);
    if (!hasAccountScope) return normalize({});
    const scoped = wx.getStorageSync(env.scopedKey(env.STORAGE_KEYS.latestProfile));
    return normalize({ ...(scoped || {}), ...(wx.getStorageSync(env.scopedKey(DRAFT_KEY)) || {}) });
  } catch (error) {
    return normalize({});
  }
}

function store(profile) {
  const current = getStored();
  const draft = wx.getStorageSync(env.scopedKey(DRAFT_KEY)) || {};
  const next = normalize({ ...current, ...(profile || {}), ...draft });
  wx.setStorageSync(env.scopedKey(env.STORAGE_KEYS.latestProfile), next);
  wx.setStorageSync(env.STORAGE_KEYS.latestProfile, next);
  try {
    getApp().globalData.latestProfile = next;
  } catch (error) {}
  return next;
}

// Device-local edits take precedence over delayed server/profile responses.
// Account scoping prevents another student's form from being reused.
function saveLocal(fields = {}) {
  const session = wx.getStorageSync(env.STORAGE_KEYS.session) || {};
  if (!session.user?.storageKey) return normalize({});
  const previous = wx.getStorageSync(env.scopedKey(DRAFT_KEY)) || {};
  const next = { ...previous, ...fields };
  if (Object.prototype.hasOwnProperty.call(fields, "phone") || Object.prototype.hasOwnProperty.call(fields, "email")) {
    const combined = { ...getStored(), ...next };
    next.contact = String(combined.phone || combined.email || "").trim();
  }
  if (Object.prototype.hasOwnProperty.call(fields, "applicationLevel")) next.targetDegree = fields.applicationLevel;
  if (Object.prototype.hasOwnProperty.call(fields, "targetDegree")) next.applicationLevel = fields.targetDegree;
  wx.setStorageSync(env.scopedKey(DRAFT_KEY), next);
  const merged = getStored();
  try { getApp().globalData.latestProfile = merged; } catch (_) {}
  return merged;
}
function getLocalEdits() {
  const session = wx.getStorageSync(env.STORAGE_KEYS.session) || {};
  return session.user?.storageKey ? wx.getStorageSync(env.scopedKey(DRAFT_KEY)) || {} : {};
}

function isInternalSession(session = {}) {
  const user = session.user || {};
  return Boolean(
    session.isAdmin ||
      session.isTeacher ||
      session.isOwner ||
      session.isPlatformAdmin ||
      session.isAdminWeb ||
      user.isAdmin ||
      user.isTeacher ||
      user.isOwner ||
      user.isPlatformAdmin ||
      user.isAdminWeb
  );
}

module.exports = {
  APPLICATION_LEVELS,
  REQUIRED_FIELDS,
  PROFILE_FIELDS,
  FIELD_LABELS,
  isValidPhone,
  isValidEmail,
  normalize,
  getMissingFields,
  isComplete,
  getStored,
  store,
  saveLocal,
  getLocalEdits,
  isInternalSession
};
