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
    allCourses: [],
    categories: ["全部"],
    activeCategory: "全部",
    notice: "",
    protectNote: "",
    currentCourse: null,
    playbackRates: [0.5, 0.8, 1, 1.25, 1.5, 2], playbackRate: 1
  },

  onShow() {
    this.loadCourses();
  },

  loadCourses() {
    this.setData({ loading: true, courses: [], allCourses: [], categories: ["全部"], currentCourse: null, notice: "", protectNote: "" });
    api
      .getCourses()
      .then((result) => {
        const courses = (result.records || []).map(normalizeCourse).filter((course) => course.available);
        const categories=["全部",...new Set(courses.map(c=>c.category||"未分类"))];
        const activeCategory=categories.includes(this.data.activeCategory)?this.data.activeCategory:"全部";
        this.setData({
          allCourses:courses,categories,activeCategory,
          courses:activeCategory==="全部"?courses:courses.filter(c=>(c.category||"未分类")===activeCategory),
          notice: courses.length ? (result.bindingNote || "选择课程开始学习。") : "该功能暂未开放",
          protectNote: courses.length ? (result.protectNote || "课程不提供下载入口。") : "当前没有已公开发布的可播放课程。"
        });
      })
      .catch((error) => {
        wx.showToast({ title: error.message || "课程读取失败", icon: "none" });
      })
      .finally(() => this.setData({ loading: false }));
  },

  chooseCategory(event){
    const category=event.currentTarget.dataset.category;
    if(!this.data.categories.includes(category))return;
    this.setData({activeCategory:category,currentCourse:null,courses:category==="全部"?this.data.allCourses:this.data.allCourses.filter(c=>(c.category||"未分类")===category)});
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
      this.setData({ currentCourse: course, playbackRate: 1 });
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

  applyPlaybackRate() {
    try {
      const context=wx.createVideoContext('coursePlayer',this);
      context.playbackRate(this.data.playbackRate);
    } catch (_) {
      this.setData({playbackRate:1});
      wx.showToast({title:'当前微信版本暂不支持倍速，请更新微信后重试',icon:'none'});
    }
  },
  choosePlaybackRate(event) {
    const rate=Number(event.currentTarget.dataset.rate);
    if(!this.data.currentCourse||!this.data.playbackRates.includes(rate))return;
    this.setData({playbackRate:rate});this.applyPlaybackRate();
  },

  sendFeedback(event) {
    if (!api.ensureLogin()) return;
    const id = event.currentTarget.dataset.id;
    const course = this.data.courses.find((item) => item.id === id);
    wx.navigateTo({ url: `/pages/messages/messages?course=${encodeURIComponent(course?.title || "课程反馈")}` });
  }
});
