const api = require("../../utils/api");

function formatTime(value) {
  if (!value) return "";
  const date = new Date(value);
  const pad = (number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

Page({
  data: {
    loading: true,
    conversations: [],
    count: 0,
    privacyNote: "",
    replyDrafts: {},
    replyingKey: ""
  },

  onShow() {
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
      .getAdminMessages()
      .then((result) => {
        this.setData({
          count: result.count || 0,
          privacyNote: result.privacyNote || "",
          conversations: (result.conversations || []).map((conversation) => {
            const messages = (conversation.messages || []).map((message) => ({ ...message, timeText: formatTime(message.createdAt) }));
            return {
              ...conversation,
              messages,
              lastTimeText: formatTime(conversation.lastMessageAt),
              lastMessageId: messages.length ? messages[messages.length - 1].id : ""
            };
          })
        });
      })
      .catch((error) => {
        if (!silent) wx.showToast({ title: error.message || "客服消息读取失败", icon: "none" });
      })
      .finally(() => {
        if (!silent) this.setData({ loading: false });
      });
  },

  inputReply(event) {
    const storageKey = event.currentTarget.dataset.storageKey;
    const replyDrafts = { ...this.data.replyDrafts, [storageKey]: String(event.detail.value || "").slice(0, 1000) };
    this.setData({ replyDrafts });
  },

  replyMessage(event) {
    const storageKey = event.currentTarget.dataset.storageKey;
    const content = String(this.data.replyDrafts[storageKey] || "").trim();
    if (!content) {
      wx.showToast({ title: "请填写回复内容", icon: "none" });
      return;
    }
    if (this.data.replyingKey) return;
    this.setData({ replyingKey: storageKey });
    api
      .replyAdminMessage(storageKey, content)
      .then((result) => {
        this.setData({ replyDrafts: { ...this.data.replyDrafts, [storageKey]: "" } });
        wx.showToast({ title: result.message || "回复成功", icon: "success" });
        return this.loadMessages();
      })
      .catch((error) => wx.showToast({ title: error.message || "回复失败", icon: "none" }))
      .finally(() => this.setData({ replyingKey: "" }));
  }
});
