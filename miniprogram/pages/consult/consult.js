const api = require("../../utils/api");

const TOPICS = ["院校匹配", "补课建议", "文书材料", "APS/签证", "时间规划"];
const URGENCY = ["普通", "本周需要", "截止前确认"];

Page({
  data: {
    topics: TOPICS,
    urgencyOptions: URGENCY,
    selectedTopic: "院校匹配",
    selectedUrgency: "普通",
    question: "",
    sending: false
  },

  chooseTopic(event) {
    this.setData({ selectedTopic: event.currentTarget.dataset.topic });
  },

  chooseUrgency(event) {
    this.setData({ selectedUrgency: event.currentTarget.dataset.urgency });
  },

  updateQuestion(event) {
    this.setData({ question: event.detail.value });
  },

  submitQuestion() {
    const question = this.data.question.trim();
    if (!question) {
      wx.showToast({ title: "请先填写问题", icon: "none" });
      return;
    }

    if (this.data.sending) return;
    const content = `【${this.data.selectedTopic} · ${this.data.selectedUrgency}】${question}`;
    this.setData({ sending: true });
    api
      .sendMessage(content)
      .then(() => {
        this.setData({ question: "" });
        wx.showModal({
          title: "问题已发送",
          content: "老师或客服可以在管理端看到并回复。你可以在“我的 → 联系客服”查看回复。",
          showCancel: false
        });
      })
      .catch((error) => wx.showToast({ title: error.message || "发送失败", icon: "none" }))
      .finally(() => this.setData({ sending: false }));
  },

  goBooking() {
    wx.switchTab({ url: "/pages/booking/booking" });
  },

  goMessages() {
    wx.navigateTo({ url: "/pages/messages/messages" });
  }
});
