const api = require("../../utils/api");
const studentProfile = require("../../utils/profile");

function formatTime(value) {
  if (!value) return "";
  const date = new Date(value);
  const pad = (number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatRefreshTime() {
  const date = new Date();
  const pad = (number) => String(number).padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

Page({
  data: {
    loading: true,
    sending: false,
    records: [],
    content: "",
    count: 0,
    privacyNote: "",
    profile: studentProfile.normalize({}),
    profileComplete: false,
    scrollTarget: "",
    refreshedText: ""
  },

  onShow() {
    if (!getApp().globalData.token) { this.setData({ loading: false }); return; }
    this.loadMessages();
    this.stopPolling();
    this.messageTimer = setInterval(() => this.loadMessages(true), 15000);
  },

  onHide() {
    this.stopPolling();
  },

  onUnload() {
    this.stopPolling();
  },

  stopPolling() {
    if (this.messageTimer) {
      clearInterval(this.messageTimer);
      this.messageTimer = null;
    }
  },

  onPullDownRefresh() {
    this.loadMessages().finally(() => wx.stopPullDownRefresh());
  },

  loadMessages(silent = false) {
    if (!silent) this.setData({ loading: true });
    return api
      .getMessages()
      .then((result) => {
        const records = (result.records || []).map((record) => ({ ...record, timeText: formatTime(record.createdAt) }));
        const profile = studentProfile.store(result.profile || studentProfile.getStored());
        const profileComplete = Boolean(result.complete || studentProfile.isComplete(profile));
        this.setData({
          records,
          count: result.count || 0,
          privacyNote: result.privacyNote || "",
          profile,
          profileComplete,
          refreshedText: `最近更新 ${formatRefreshTime()}`,
          scrollTarget: ""
        });
        if (records.length) {
          wx.nextTick(() => this.setData({ scrollTarget: `msg-${records[records.length - 1].id}` }));
        }
      })
      .catch((error) => {
        if (!silent) wx.showToast({ title: error.message || "消息读取失败", icon: "none" });
      })
      .finally(() => {
        if (!silent) this.setData({ loading: false });
      });
  },

  inputContent(event) {
    this.setData({ content: String(event.detail.value || "").slice(0, 1000) });
  },

  onLoad(options) { if (options.course) this.setData({ content: `【课程反馈：${options.course}】\n` }); },

  sendMessage() {
    if (!api.ensureLogin()) return;
    const content = String(this.data.content || "").trim();
    if (!content) {
      wx.showToast({ title: "请填写咨询内容", icon: "none" });
      return;
    }
    if (this.data.sending) return;
    this.setData({ sending: true });
    api
      .sendMessage(content)
      .then((result) => {
        this.setData({ content: "" });
        wx.showToast({ title: result.message || "发送成功", icon: "success" });
        return this.loadMessages();
      })
      .catch((error) => wx.showToast({ title: error.message || "发送失败", icon: "none" }))
      .finally(() => this.setData({ sending: false }));
  }
});
