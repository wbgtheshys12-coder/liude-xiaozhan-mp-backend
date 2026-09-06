const api = require("../../utils/api");
const env = require("../../utils/env");
const progress = require("../../utils/progress");
const studentProfile = require("../../utils/profile");

Page({
  data: {
    loading: false,
    loginProgress: 0,
    loginProgressText: "",
    message: "",
    isError: false,
    privacyAccepted: false
  },

  onLoad() {
    const app = getApp();
    const token = app.globalData.token || wx.getStorageSync(env.STORAGE_KEYS.token);
    if (!token) return;
    // Reuse our server session; protected requests already renew expired tokens.
    // Do not request a new WeChat identity or optional avatar on every launch.
    this.setData({ loading: true, privacyAccepted: true, message: "正在进入留德小栈…" });
    return this.goAfterLogin(app.globalData.session || wx.getStorageSync(env.STORAGE_KEYS.session) || {}, true)
      .catch(() => this.setData({ message: "暂时未能读取资料，请检查网络后重试。", isError: true }))
      .finally(() => this.setData({ loading: false }));
  },

  onUnload() {
    progress.stop(this, "loginProgressTimer");
  },

  togglePrivacy(event) {
    this.setData({ privacyAccepted: (event.detail.value || []).includes("accepted") });
  },

  openPrivacyContract() {
    const unavailable = () => wx.showModal({
      title: "隐私指引暂未打开",
      content: "请检查网络后重试，也可在微信小程序右上角菜单中查看隐私保护指引。阅读后再决定是否同意。",
      showCancel: false
    });
    if (!wx.openPrivacyContract) {
      unavailable();
      return;
    }
    wx.openPrivacyContract({
      fail: unavailable
    });
  },

  enterApp() {
    const pages = typeof getCurrentPages === "function" ? getCurrentPages() : [];
    if (pages.length > 1) { wx.navigateBack(); return; }
    wx.switchTab({ url: "/pages/home/home" });
  },

  openAbout() {
    wx.navigateTo({ url: "/pages/about/about" });
  },

  routeProfile(profile) {
    studentProfile.store(profile || {});
    this.enterApp();
  },

  goAfterLogin(session = {}, reuseSession = false) {
    if (studentProfile.isInternalSession(session)) {
      this.enterApp();
      return Promise.resolve();
    }
    if (reuseSession && studentProfile.isComplete(studentProfile.getStored())) {
      this.enterApp();
      return Promise.resolve();
    }
    if (!reuseSession && session.profile && typeof session.profile === "object") {
      this.routeProfile(session.profile);
      return Promise.resolve();
    }
    return api
      .getProfile()
      .then((result) => {
        this.routeProfile(result.profile);
      });
  },

  login() {
    if (this.data.loading) return;
    if (!this.data.privacyAccepted) {
      this.setData({ message: "请先阅读并同意用户隐私保护指引。", isError: true });
      return;
    }
    this.setData({ loading: true, message: "", isError: false });
    progress.start(this, {
      timerKey: "loginProgressTimer",
      progressKey: "loginProgress",
      textKey: "loginProgressText",
      from: 18,
      cap: 90,
      step: 6,
      text: "正在安全连接微信账号，通常只需几秒。"
    });
    return api
      .loginUser()
      .then((payload) => {
        progress.finish(this, {
          timerKey: "loginProgressTimer",
          progressKey: "loginProgress",
          textKey: "loginProgressText",
          text: "登录成功，正在进入。"
        });
        return this.goAfterLogin(payload);
      })
      .catch((error) => {
        progress.finish(this, {
          timerKey: "loginProgressTimer",
          progressKey: "loginProgress",
          textKey: "loginProgressText",
          text: "登录未完成，请检查网络后重试。"
        });
        this.setData({
          message: error.message,
          isError: true
        });
      })
      .finally(() => {
        progress.reset(this, {
          timerKey: "loginProgressTimer",
          progressKey: "loginProgress",
          textKey: "loginProgressText"
        });
        this.setData({ loading: false });
      });
  }
});
