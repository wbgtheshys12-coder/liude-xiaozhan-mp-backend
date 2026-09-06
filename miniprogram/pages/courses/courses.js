const api = require("../../utils/api");
const env = require("../../utils/env");

function normalizeCourse(item) {
  const playable = Boolean(item.type === "recorded" && item.videoUrl);
  const liveReady = Boolean(item.type === "live" && item.liveUrl);
  return {
    ...item,
    typeText: item.type === "live" ? "直播课" : "录播课",
    actionText: item.type === "live" ? (liveReady ? "进入直播" : "直播待开放") : (playable ? "开始学习" : "视频待开放"),
    availabilityText: item.type === "live" ? (liveReady ? "直播入口已开放" : "直播入口待配置") : (playable ? "视频已开放" : "视频待上传"),
    tagText: (item.tags || []).join(" · "),
    playable,
    liveReady,
    available: playable || liveReady
  };
}

Page({
  data: {
    loading: true,
    courses: [],
    notice: "",
    protectNote: "",
    currentCourse: null
  },

  onShow() {
    this.loadCourses();
  },

  loadCourses() {
    this.setData({ loading: true });
    api
      .getCourses()
      .then((result) => {
        this.setData({
          courses: (result.records || []).map(normalizeCourse),
          notice: result.bindingNote || "当前微信号即课程登录账号。",
          protectNote: result.protectNote || "课程不提供下载入口。"
        });
      })
      .catch((error) => {
        wx.showToast({ title: error.message || "课程读取失败", icon: "none" });
      })
      .finally(() => this.setData({ loading: false }));
  },

  openCourse(event) {
    const id = event.currentTarget.dataset.id;
    const course = this.data.courses.find((item) => item.id === id);
    if (!course) return;
    if (course.type === "recorded") {
      if (!course.videoUrl) {
        wx.showModal({
          title: "课程待开放",
          content: "该录播课已建档，老师上传视频链接后即可学习。",
          showCancel: false
        });
        return;
      }
      api.recordUsage("course.open.recorded", { id: course.id, title: course.title }).catch(() => {});
      this.setData({ currentCourse: course });
      return;
    }
    if (!course.liveUrl) {
      wx.showModal({
        title: "直播待开放",
        content: "该直播课已建档，老师设置直播入口后即可进入。",
        showCancel: false
      });
      return;
    }
    api.recordUsage("course.open.live", { id: course.id, title: course.title }).catch(() => {});
    wx.navigateTo({
      url: `/pages/live/live?url=${encodeURIComponent(course.liveUrl)}&title=${encodeURIComponent(course.title)}`,
      fail: () => {
        wx.setClipboardData({
          data: course.liveUrl,
          success: () => wx.showToast({ title: "直播入口已复制", icon: "success" })
        });
      }
    });
  },

  closePlayer() {
    this.setData({ currentCourse: null });
  },

  sendFeedback(event) {
    if (!api.ensureLogin()) return;
    const id = event.currentTarget.dataset.id;
    const course = this.data.courses.find((item) => item.id === id);
    wx.navigateTo({ url: `/pages/messages/messages?course=${encodeURIComponent(course?.title || "课程反馈")}` });
  }
});
