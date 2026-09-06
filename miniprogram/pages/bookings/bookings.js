const api = require("../../utils/api");
const env = require("../../utils/env");
const userSettings = require("../../utils/settings");

function formatLocalRecord(item = {}, index) {
  return {
    id: item.id || `local_${index}`,
    serverId: item.id || "",
    advisorName: item.advisorName || item.advisor || "顾问",
    studentName: item.studentName || "",
    contact: item.contact || "",
    school: item.school || "",
    major: item.major || "",
    applicationLevel: item.applicationLevel || "",
    date: item.date || "",
    dateDisplay: item.dateDisplay || item.date || "",
    time: item.time || "",
    note: item.note || "无备注",
    status: item.status || "confirmed",
    statusText: item.status === "cancelled" ? "已取消" : "已确认",
    canCancel: Boolean(item.id && item.status !== "cancelled"),
    isLocalOnly: !item.id
  };
}

function mergeServerAndLocal(serverRecords, localRecords) {
  const seen = new Set();
  const merged = [];
  (serverRecords || []).forEach((item) => {
    if (item.id) seen.add(item.id);
    merged.push({
      ...item,
      serverId: item.id,
      note: item.note || "无备注",
      statusText: item.statusText || (item.status === "cancelled" ? "已取消" : "已确认"),
      isLocalOnly: false
    });
  });
  (localRecords || []).forEach((item, index) => {
    if (item.id && seen.has(item.id)) return;
    merged.push(formatLocalRecord(item, index));
  });
  return merged;
}

const footerLayout = require("../../utils/footer-layout");

Page({
  data: {
    footerInset: 0,
    records: [],
    loading: false,
    message: "",
    isError: false,
    settingsClass: ""
  },

  onShow() {
    footerLayout.show(this, ".bottom-actions");
    const app = getApp();
    if (!app.globalData.token && !wx.getStorageSync(env.STORAGE_KEYS.token)) {
      wx.redirectTo({ url: "/pages/login/login" });
      return;
    }
    this.setData({ settingsClass: userSettings.getPageClass() });
    userSettings.applyRuntimeSettings();
    this.loadBookings();
  },

  onReady() { footerLayout.show(this, ".bottom-actions"); },
  onResize() { footerLayout.show(this, ".bottom-actions"); },
  onHide() { footerLayout.hide(this); },
  onUnload() { footerLayout.hide(this); },

  loadBookings() {
    const localRecords = wx.getStorageSync("booking_records") || [];
    this.setData({ loading: true, message: "", isError: false });
    api
      .getMyBookings({ status: "all" })
      .then((result) => {
        const records = mergeServerAndLocal(result.records || [], localRecords);
        this.setData({
          records,
          loading: false,
          message: records.length ? "" : "暂无预约记录。"
        });
      })
      .catch((error) => {
        const records = mergeServerAndLocal([], localRecords);
        this.setData({
          records,
          loading: false,
          message: records.length ? "暂时无法同步服务器记录，已显示本地预约记录。" : error.message,
          isError: !records.length
        });
      });
  },

  createBooking() {
    wx.switchTab({ url: "/pages/booking/booking" });
  },

  cancelBooking(event) {
    const bookingId = event.currentTarget.dataset.id;
    const record = (this.data.records || []).find((item) => item.id === bookingId || item.serverId === bookingId);
    if (!record) return;
    if (record.isLocalOnly || !record.serverId) {
      wx.showToast({ title: "旧本地记录无法在线取消", icon: "none" });
      return;
    }
    if (!record.canCancel) {
      wx.showToast({ title: "该预约当前不可取消", icon: "none" });
      return;
    }
    wx.showModal({
      title: "取消预约",
      content: `确认取消 ${record.dateDisplay || record.date} ${record.time} 与${record.advisorName}的预约吗？取消后该时间段会释放。`,
      confirmText: "确认取消",
      confirmColor: "#d93025",
      success: (result) => {
        if (!result.confirm) return;
        this.setData({ loading: true });
        api
          .cancelBooking(record.serverId)
          .then((payload) => {
            this.markLocalCancelled(record.serverId);
            this.loadBookings();
            if (payload.cancelNotified) {
              wx.showToast({ title: "已取消并已通知", icon: "success" });
              return;
            }
            if (payload.cancelNotificationConfigured) {
              wx.showModal({
                title: "预约已取消",
                content: "预约记录已经取消，但企业群提醒暂时未送达，请手动告知老师。",
                showCancel: false
              });
              return;
            }
            wx.showToast({ title: "已取消", icon: "success" });
          })
          .catch((error) => {
            this.setData({ loading: false, message: error.message, isError: true });
          });
      }
    });
  },

  markLocalCancelled(bookingId) {
    const records = wx.getStorageSync("booking_records") || [];
    const nextRecords = records.map((item) =>
      item.id === bookingId
        ? {
            ...item,
            status: "cancelled",
            cancelledAt: Date.now()
          }
        : item
    );
    wx.setStorageSync("booking_records", nextRecords);
  },

  copyBooking(event) {
    const bookingId = event.currentTarget.dataset.id;
    const record = (this.data.records || []).find((item) => item.id === bookingId || item.serverId === bookingId);
    if (!record) return;
    const text = [
      "留德小栈预约记录",
      `学生：${record.studentName || "未填写"}`,
      `联系方式：${record.contact || "未填写"}`,
      `当前学校：${record.school || "未填写"}`,
      `当前专业：${record.major || "未填写"}`,
      `申请层次：${record.applicationLevel || "未填写"}`,
      `日期：${record.dateDisplay || record.date}`,
      `时间：${record.time}`,
      `顾问：${record.advisorName}`,
      `状态：${record.statusText}`,
      `备注：${record.note || "无"}`
    ].join("\n");
    wx.setClipboardData({
      data: text,
      success: () => wx.showToast({ title: "已复制", icon: "success" })
    });
  }
});
