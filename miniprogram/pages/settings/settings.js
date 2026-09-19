const api = require("../../utils/api");
const env = require("../../utils/env");
const userSettings = require("../../utils/settings");
const progress = require("../../utils/progress");
const bookingNotices = require("../../utils/booking-notices");

const ADVISORS = [
  { key: "a1", name: "张老师", desc: "院校匹配 / 时间规划" },
  { key: "a2", name: "陆老师", desc: "文书材料 / 申请核对" }
];

Page({
  data: {
    settings: userSettings.DEFAULT_SETTINGS,
    advisors: ADVISORS,
    noticeLoading: false,
    noticeProgress: 0,
    noticeProgressText: "",
    canSubscribeBookingNotice: false,
    noticeAuthorized: false,
    noticeTitle: "老师预约提醒",
    noticeDescription: "正在读取当前通知模板类型。",
    noticeButtonText: "开启预约提醒",
    settingsClass: ""
  },

  onUnload() {
    progress.stop(this, "noticeProgressTimer");
  },

  onLoad() {
    this.refresh();
  },

  onShow() {
    this.refresh();
  },

  refresh() {
    const settings = userSettings.loadSettings();
    const session = wx.getStorageSync(env.STORAGE_KEYS.session) || {};
    const canSubscribeBookingNotice = Boolean(
      session.canSubscribeBookingNotice || session.user?.canSubscribeBookingNotice
    );
    this.setData({
      settings,
      canSubscribeBookingNotice,
      settingsClass: userSettings.getPageClass()
    });
    userSettings.applyRuntimeSettings(settings);
    if (canSubscribeBookingNotice) this.loadTeacherNoticeConfig();
  },

  loadTeacherNoticeConfig() {
    if (this.noticeConfigLoading) return;
    this.noticeConfigLoading = true;
    api
      .getBookingConfig()
      .then((config) => {
        this.noticeConfig = config;
        return bookingNotices.checkLongTermAcceptance(config).then((accepted) => ({ config, accepted }));
      })
      .then(({ config, accepted }) => {
        const presentation = bookingNotices.getPresentation(config, accepted);
        this.setData({
          noticeAuthorized: accepted,
          noticeTitle: presentation.title,
          noticeDescription: presentation.description,
          noticeButtonText: presentation.buttonText
        });
      })
      .catch(() => {})
      .finally(() => {
        this.noticeConfigLoading = false;
      });
  },

  updateSwitch(event) {
    const key = event.currentTarget.dataset.key;
    const value = event.detail.value;
    const settings = getApp().refreshSettings({ [key]: value });
    this.setData({
      settings,
      settingsClass: userSettings.getPageClass()
    });
    wx.showToast({ title: "设置已保存", icon: "success" });
  },

  selectAdvisor(event) {
    const defaultAdvisor = event.currentTarget.dataset.key;
    const settings = getApp().refreshSettings({ defaultAdvisor });
    this.setData({ settings });
    wx.showToast({ title: "默认顾问已更新", icon: "success" });
  },

  resetSettings() {
    const settings = userSettings.resetSettings();
    getApp().globalData.settings = settings;
    this.setData({
      settings,
      settingsClass: userSettings.getPageClass()
    });
    wx.showToast({ title: "已恢复默认", icon: "success" });
  },

  clearLocalData() {
    wx.showModal({
      title: "清理本地记录",
      content: "会清理最近推荐、材料草稿、预约记录，并在本机隐藏当前账号此前的客服聊天记录。后台咨询记录仍保留，新消息正常接收；不会退出登录或删除设置。",
      confirmText: "清理",
      success: (result) => {
        if (!result.confirm) return;
        require('../../utils/message-history').clear();
        const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : [];
        pages.forEach(page => {
          if (page.route === 'pages/messages/messages') page.setData({ records: [], count: 0, content: '', scrollTarget: '', historyCleared: true });
        });
        wx.removeStorageSync(env.STORAGE_KEYS.latestProfile);
        wx.removeStorageSync(env.STORAGE_KEYS.latestRecommendation);
        wx.removeStorageSync(env.STORAGE_KEYS.materials);
        wx.removeStorageSync("booking_records");
        wx.showToast({ title: "已清理", icon: "success" });
      }
    });
  },

  enableTeacherBookingNotice() {
    if (!wx.requestSubscribeMessage) {
      wx.showModal({
        title: "当前微信版本不支持",
        content: "请升级微信后再开启老师预约提醒。",
        showCancel: false
      });
      return;
    }

    this.setData({ noticeLoading: true });
    progress.start(this, {
      timerKey: "noticeProgressTimer",
      progressKey: "noticeProgress",
      textKey: "noticeProgressText",
      from: 18,
      cap: 86,
      step: 6,
      text: "正在读取预约通知模板配置。"
    });
    api
      .getBookingConfig()
      .then((config) => {
        progress.finish(this, {
          timerKey: "noticeProgressTimer",
          progressKey: "noticeProgress",
          textKey: "noticeProgressText",
          text: "通知配置读取完成。"
        });
        if (!config.canSubscribe) {
          wx.showModal({
            title: "当前账号无需授权",
            content: "只有已配置为预约通知接收人的老师微信号才能授权。学生、负责人或未配置的账号不会显示模板 ID。",
            showCancel: false
          });
          return;
        }
        if (!config.templateId || !config.subscribeEnabled) {
          wx.showModal({
            title: "订阅消息未配置",
            content: "请确认 Render 已开启通知、模板字段映射有效，并已填写当前小程序的模板 ID。",
            showCancel: false
          });
          return;
        }
        this.noticeConfig = config;
        return bookingNotices.requestAuthorization(config).then(({ accepted }) => {
          const longTerm = bookingNotices.isLongTerm(config);
          const presentation = bookingNotices.getPresentation(config, accepted && longTerm);
          this.setData({
            noticeAuthorized: accepted && longTerm,
            noticeTitle: presentation.title,
            noticeDescription: presentation.description,
            noticeButtonText: presentation.buttonText
          });
          wx.showModal({
            title: accepted ? "已开启预约提醒" : "未开启预约提醒",
            content: accepted
              ? longTerm
                ? "长期预约提醒已开启。后续学生提交预约时可持续接收通知，无需再次授权。"
                : "已获得一条微信预约通知的发送权限。当前模板是一次性订阅，微信平台会在成功发送后消耗该权限。"
              : "你没有允许该订阅消息，学生预约仍会保存在预约管理中。",
            showCancel: false
          });
        });
      })
      .catch((error) => {
        progress.finish(this, {
          timerKey: "noticeProgressTimer",
          progressKey: "noticeProgress",
          textKey: "noticeProgressText",
          text: "通知配置读取失败。"
        });
        wx.showModal({
          title: "无法读取通知配置",
          content: error.message || "请确认后端已更新并可以访问。",
          showCancel: false
        });
      })
      .finally(() => {
        progress.reset(this, {
          timerKey: "noticeProgressTimer",
          progressKey: "noticeProgress",
          textKey: "noticeProgressText"
        });
        this.setData({ noticeLoading: false });
      });
  },

  logout() {
    wx.showModal({
      title: "退出登录",
      content: "退出后仍可浏览公开内容；保存资料、预约等操作需要重新登录。",
      confirmText: "退出",
      success: (result) => {
        if (!result.confirm) return;
        wx.removeStorageSync(env.STORAGE_KEYS.token);
        wx.removeStorageSync(env.STORAGE_KEYS.session);
        const app = getApp();
        app.globalData.token = "";
        app.globalData.session = null;
        app.globalData.latestProfile = null;
        app.globalData.latestRecommendation = null;
        app.globalData.wechatProfile = null;
        app.globalData.onboardingProfile = null;
        wx.switchTab({ url: "/pages/home/home" });
      }
    });
  }
});
