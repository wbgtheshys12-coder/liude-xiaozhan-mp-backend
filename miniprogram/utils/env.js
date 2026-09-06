const config = {
  APP_MODE: "user",
  APP_NAME: "留德小栈用户版",
  API_BASE_URL: "https://liude-xiaozhan-mp-backend.onrender.com",
  FREE_RECOMMENDATION_COUNTS: [1, 3, 6],
  FEATURES: {
    demoCases: false,
    paidRecommendationCount: true,
    paidMaterials: true
  },
  STORAGE_KEYS: {
    token: "liude_user_token",
    session: "liude_user_session",
    latestProfile: "liude_user_latest_profile",
    latestRecommendation: "liude_user_latest_recommendation",
    materials: "liude_user_materials",
    settings: "liude_user_settings",
    wechatProfile: "liude_user_wechat_profile",
    pendingWechatBind: "liude_user_pending_wechat_bind"
  }
};

function getUserScope() {
  const session = wx.getStorageSync(config.STORAGE_KEYS.session) || {};
  return session.user?.storageKey || "anonymous";
}

config.scopedKey = function scopedKey(baseKey) {
  return `${baseKey}_${getUserScope()}`;
};

module.exports = config;

