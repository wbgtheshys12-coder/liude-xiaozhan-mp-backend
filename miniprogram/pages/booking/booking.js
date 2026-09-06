const api = require("../../utils/api");
const profile = require("../../utils/profile");
Page({
  data: { studentName: "", contact: "", note: "", sending: false, successMessage: "", advisors: ["顾问老师", "陆老师"], advisorIndex: 0 },
  onShow() { const saved = profile.getStored(); this.setData({ studentName: this.data.studentName || saved.name || "", contact: this.data.contact || saved.contact || "" }); },
  inputField(event) { const key = event.currentTarget.dataset.key; if (["studentName", "contact", "note"].includes(key)) this.setData({ [key]: event.detail.value }); },
  changeAdvisor(event) { this.setData({ advisorIndex: Number(event.detail.value) }); },
  async submit() {
    if (!api.ensureLogin() || this.data.sending) return;
    const { studentName, contact, note, advisorIndex } = this.data;
    if (![studentName, contact, note].every((value) => value.trim())) { wx.showToast({ title: "请完整填写带 * 的内容", icon: "none" }); return; }
    this.setData({ sending: true, successMessage: "" });
    try {
      const result = await api.request({ url: "/api/mp/booking-request", method: "POST", data: { studentName, contact, note, advisorKey: advisorIndex === 1 ? "a2" : "a1" } });
      this.setData({ successMessage: result.message });
      wx.showModal({ title: "申请已记录", content: result.message, showCancel: false });
    } catch (error) { wx.showToast({ title: error.message, icon: "none" }); }
    finally { this.setData({ sending: false }); }
  },
  viewBookings() { if (api.ensureLogin()) wx.navigateTo({ url: "/pages/bookings/bookings" }); },
  copyWechat() { wx.setClipboardData({ data: "liudexiaozhan" }); }
});
