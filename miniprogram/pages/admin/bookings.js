const api = require("../../utils/api");
const env = require("../../utils/env");
const userSettings = require("../../utils/settings");
const bookingNotices = require("../../utils/booking-notices");

const ADVISOR_FILTERS = [
  { key: "all", label: "全部" },
  { key: "a1", label: "张老师" },
  { key: "a2", label: "陆老师" }
];

function formatCreatedAt(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const pad = (num) => String(num).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function normalizeRecord(record) {
  const dateText = `${record.dateDisplay || record.date || ""} ${record.time || ""}`.trim();
  return {
    ...record,
    dateText,
    createdText: formatCreatedAt(record.createdAt),
    statusText: record.status === "confirmed" ? "已确认" : record.status || "已记录",
    noteText: record.note || "无备注",
    userText: record.user?.storageKey ? `用户 ${record.user.storageKey}` : "微信用户"
  };
}

Page({
  data: {
    advisorFilters: ADVISOR_FILTERS,
    selectedAdvisor: "all",
    loading: false,
    count: 0,
    todayCount: 0,
    occupiedSlots: [],
    records: [],
    error: "",
    canSubscribeBookingNotice: false,
    noticeTemplateId: "",
    noticeAuthorized: false,
    noticeTitle: "老师预约提醒",
    noticeDescription: "正在读取当前通知模板类型。",
    noticeButtonText: "开启预约提醒",
    settingsClass: ""
  },

  onLoad() {
    this.setData({ settingsClass: userSettings.getPageClass() });
    const session = wx.getStorageSync(env.STORAGE_KEYS.session) || {};
    this.setData({
      canSubscribeBookingNotice: Boolean(session.canSubscribeBookingNotice || session.user?.canSubscribeBookingNotice)
    });
    this.loadNoticeConfig();
    this.loadBookings();
  },

  loadNoticeConfig() {
    api
      .getBookingConfig()
      .then((config) => {
        this.noticeConfig = config;
        return bookingNotices.checkLongTermAcceptance(config).then((accepted) => ({ config, accepted }));
      })
      .then(({ config, accepted }) => {
        const presentation = bookingNotices.getPresentation(config, accepted);
        this.setData({
          canSubscribeBookingNotice: Boolean(config.canSubscribe),
          noticeTemplateId: config.subscribeEnabled ? config.templateId || "" : "",
          noticeAuthorized: accepted,
          noticeTitle: presentation.title,
          noticeDescription: presentation.description,
          noticeButtonText: presentation.buttonText
        });
      })
      .catch(() => {});
  },

  authorizeNextBookingNotice() {
    if (!wx.requestSubscribeMessage || !this.data.noticeTemplateId) {
      wx.showModal({
        title: "提醒授权暂不可用",
        content: "请确认后端通知模板已配置，或升级微信后再试。",
        showCancel: false
      });
      return;
    }
    const config = this.noticeConfig || {
      templateId: this.data.noticeTemplateId,
      subscribeEnabled: true,
      subscriptionMode: "one-time"
    };
    bookingNotices
      .requestAuthorization(config)
      .then(({ accepted }) => {
        const longTerm = bookingNotices.isLongTerm(config);
        const presentation = bookingNotices.getPresentation(config, accepted && longTerm);
        this.setData({
          noticeAuthorized: accepted && longTerm,
          noticeTitle: presentation.title,
          noticeDescription: presentation.description,
          noticeButtonText: presentation.buttonText
        });
        wx.showModal({
          title: accepted ? "预约提醒已开启" : "未获得授权",
          content: accepted
            ? longTerm
              ? "长期预约提醒已经开启，后续无需再次授权。"
              : "已获得下一条微信预约通知的发送权限。当前模板仍受微信一次性订阅规则限制。"
            : "你没有允许该订阅消息，学生预约仍会保存在预约管理中，但微信服务通知可能无法送达。",
          showCancel: false
        });
      })
      .catch((error) => wx.showToast({ title: error.message || "授权失败，请稍后重试", icon: "none" }));
  },

  onPullDownRefresh() {
    this.loadBookings().finally(() => wx.stopPullDownRefresh());
  },

  selectAdvisor(event) {
    const key = event.currentTarget.dataset.key || "all";
    this.setData({ selectedAdvisor: key });
    this.loadBookings();
  },

  loadBookings() {
    this.setData({ loading: true, error: "" });
    return api
      .getAdminBookings({
        advisorKey: this.data.selectedAdvisor,
        status: "active"
      })
      .then((payload) => {
        this.setData({
          count: payload.count || 0,
          todayCount: payload.todayCount || 0,
          occupiedSlots: payload.occupiedSlots || [],
          records: (payload.records || []).map(normalizeRecord)
        });
      })
      .catch((error) => {
        this.setData({
          error: error.message || "预约列表读取失败",
          records: [],
          count: 0,
          todayCount: 0,
          occupiedSlots: []
        });
      })
      .finally(() => {
        this.setData({ loading: false });
      });
  },

  copyBooking(event) {
    const id = event.currentTarget.dataset.id;
    const record = this.data.records.find((item) => item.id === id);
    if (!record) return;
    const text =
      record.bookingText ||
      [
        "留德小栈预约信息",
        `学生：${record.studentName || "微信用户"}`,
        `联系方式：${record.contact || "未填写"}`,
        `当前学校：${record.school || "未填写"}`,
        `当前专业：${record.major || "未填写"}`,
        `申请层次：${record.applicationLevel || "未填写"}`,
        `顾问：${record.advisorName || ""}`,
        `时间：${record.dateText}`,
        `备注：${record.noteText}`
      ].join("\n");
    wx.setClipboardData({
      data: text,
      success: () => wx.showToast({ title: "预约信息已复制", icon: "success" })
    });
  },

  refreshBookings() {
    this.loadBookings();
  }
});
