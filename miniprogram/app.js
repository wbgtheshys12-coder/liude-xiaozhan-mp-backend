const env = require("./utils/env");
const userSettings = require("./utils/settings");
const api = require("./utils/api");
const studentProfile = require("./utils/profile");

App({
  globalData: {
    mode: env.APP_MODE,
    token: "",
    session: null,
    latestProfile: null,
    latestRecommendation: null,
    wechatProfile: null,
    settings: userSettings.DEFAULT_SETTINGS
  },

  onLaunch() {
    this.globalData.token = wx.getStorageSync(env.STORAGE_KEYS.token) || "";
    this.globalData.session = wx.getStorageSync(env.STORAGE_KEYS.session) || null;
    this.globalData.latestProfile = studentProfile.getStored();
    const hasAccountScope = Boolean(this.globalData.session?.user?.storageKey);
    this.globalData.wechatProfile = hasAccountScope
      ? wx.getStorageSync(env.scopedKey(env.STORAGE_KEYS.wechatProfile)) || null
      : null;
    this.globalData.settings = userSettings.loadSettings();
    userSettings.applyRuntimeSettings(this.globalData.settings);
  },

  onShow() {
    // Public browsing must never trigger authorization or mandatory onboarding.
    userSettings.applyRuntimeSettings(this.globalData.settings);
  },

  ensureStudentProfile() {
    if (this._profileChecking || !this.globalData.token) return;
    const session = this.globalData.session || wx.getStorageSync(env.STORAGE_KEYS.session) || {};
    if (studentProfile.isInternalSession(session) || studentProfile.isComplete(studentProfile.getStored())) return;
    const pages = getCurrentPages();
    const route = pages.length ? pages[pages.length - 1].route : "";
    if (!route || ["pages/login/login", "pages/onboarding/onboarding"].includes(route)) return;
    this._profileChecking = true;
    api
      .getProfile()
      .then((result) => {
        const profile = studentProfile.store(result.profile || {});
        if (result.isAdmin || result.isTeacher || result.isOwner || result.isPlatformAdmin || studentProfile.isComplete(profile)) return;
        const currentPages = getCurrentPages();
        const currentRoute = currentPages.length ? currentPages[currentPages.length - 1].route : "";
        if (!["pages/login/login", "pages/onboarding/onboarding"].includes(currentRoute)) {
          wx.navigateTo({ url: "/pages/onboarding/onboarding" });
        }
      })
      .catch(() => {})
      .finally(() => {
        this._profileChecking = false;
      });
  },

  refreshSettings(patch) {
    this.globalData.settings = patch ? userSettings.saveSettings(patch) : userSettings.loadSettings();
    userSettings.applyRuntimeSettings(this.globalData.settings);
    return this.globalData.settings;
  }
});
