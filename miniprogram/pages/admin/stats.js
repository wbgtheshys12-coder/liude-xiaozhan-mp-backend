const api = require("../../utils/api");

const SUMMARY_LABELS = {
  bookings: "预约总数",
  activeBookings: "有效预约",
  todayBookings: "今日预约",
  uploads: "上传资料",
  profiles: "个人资料",
  courses: "课程总数",
  publishedCourses: "已发布课程",
  messages: "客服消息",
  messageConversations: "客服会话",
  usage: "使用记录",
  activeUsers: "活跃用户"
};

function formatSummary(summary = {}) {
  return Object.keys(SUMMARY_LABELS).map((key) => ({
    key,
    label: SUMMARY_LABELS[key],
    value: summary[key] || 0
  }));
}

function formatAction(action) {
  const map = {
    "courses.view": "查看网课",
    "course.open.recorded": "打开录播课",
    "course.open.live": "打开直播课",
    "admin.course.save": "老师保存课程",
    "admin.course.video.upload": "老师上传视频",
    "admin.stats.view": "查看统计",
    "message.user.send": "用户发送客服消息",
    "admin.messages.view": "查看客服消息",
    "admin.message.reply": "回复客服消息",
    "material.upload": "上传资料",
    "document.export.questionnaire": "导出调查表",
    "document.export.draft": "导出文书初稿",
    "home.view": "访问首页",
    "recommendation.generate": "生成院校推荐",
    "recommendation.fallback": "备用推荐生成",
    "transcript.preview": "成绩单预识别"
  };
  return map[action] || action;
}

Page({
  data: {
    loading: true,
    summaryItems: [],
    actionItems: [],
    recentUsage: [],
    recentBookings: [],
    privacyNote: "",
    generatedAt: ""
  },

  onShow() {
    this.loadStats();
  },

  loadStats() {
    this.setData({ loading: true });
    api
      .getAdminStats()
      .then((result) => {
        this.setData({
          summaryItems: formatSummary(result.summary || {}),
          actionItems: (result.usage?.actions || []).slice(0, 12).map((item) => ({
            ...item,
            label: formatAction(item.action)
          })),
          recentUsage: (result.recentUsage || []).slice(0, 20).map((item) => ({
            ...item,
            label: formatAction(item.action)
          })),
          recentBookings: result.recentBookings || [],
          privacyNote: result.privacyNote || "",
          generatedAt: result.generatedAt || ""
        });
      })
      .catch((error) => wx.showToast({ title: error.message || "统计读取失败", icon: "none" }))
      .finally(() => this.setData({ loading: false }));
  },

  exportData() {
    api
      .exportAdminData()
      .then((result) => {
        wx.setClipboardData({
          data: JSON.stringify(result, null, 2),
          success: () => wx.showToast({ title: "已复制导出数据", icon: "success" })
        });
      })
      .catch((error) => wx.showToast({ title: error.message || "导出失败", icon: "none" }));
  }
});
