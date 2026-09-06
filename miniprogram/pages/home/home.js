const env = require("../../utils/env");
const api = require("../../utils/api");
const schoolData = require("../../utils/schools");
const searchData = require("../../utils/search");
const userSettings = require("../../utils/settings");

const TRUST_TAGS = [
  { text: "前途至上" },
  { text: "专业留德" },
  { text: "程序透明" },
  { text: "账号绑定" }
];

const QUICK_MODULES = [
  { key: "materials", icon: "/assets/home/icon-cv.png", title: "申请材料", url: "/pages/materials/materials" },
  { key: "plan", icon: "/assets/home/icon-plan.png", title: "时间规划", url: "/pages/plan/plan" },
  { key: "qa", icon: "/assets/home/icon-qa.png", title: "1v1问答", url: "/pages/consult/consult" },
  { key: "about", icon: "/assets/home/icon-about.png", title: "关于我们", url: "/pages/about/about" }
];

const CORE_MODULES = [
  {
    key: "match",
    icon: "/assets/home/icon-school.png",
    title: "院校专业匹配",
    desc: "填写申请背景生成德国院校与专业推荐，成绩单可选",
    url: "/pages/advisor/advisor"
  },
  {
    key: "courses",
    icon: "/assets/home/icon-course.png",
    title: "网课中心",
    desc: "免费公开课直接学习，课程问题可向老师反馈",
    url: "/pages/courses/courses"
  },
  {
    key: "motivation",
    icon: "/assets/home/icon-motivation.png",
    title: "动机申请信",
    desc: "按申请阶段和学校要求生成德语或英语动机信初稿",
    url: "/pages/tools/tools?tool=motivation"
  },
  {
    key: "cv",
    icon: "/assets/home/icon-cv.png",
    title: "留德简历",
    desc: "按德式结构整理经历，生成德语或英语简历初稿",
    url: "/pages/tools/tools?tool=cv"
  }
];

const FEATURED_SCHOOLS = schoolData.getSchools();
const SCHOOL_STATS = schoolData.getSchoolStats();
const HOME_SCHOOL_COLLAPSED_COUNT = 2;
const COLLAPSED_FEATURED_SCHOOLS = FEATURED_SCHOOLS.slice(0, HOME_SCHOOL_COLLAPSED_COUNT);

function buildSchoolToggleText(expanded) {
  if (expanded) return "收起院校";
  const restCount = Math.max(FEATURED_SCHOOLS.length - HOME_SCHOOL_COLLAPSED_COUNT, 0);
  return restCount ? "显示更多院校" : "";
}

Page({
  data: {
    trustTags: TRUST_TAGS,
    quickModules: QUICK_MODULES,
    coreModules: CORE_MODULES,
    featuredSchools: COLLAPSED_FEATURED_SCHOOLS,
    schoolStats: SCHOOL_STATS,
    schoolsExpanded: false,
    hasMoreSchools: FEATURED_SCHOOLS.length > HOME_SCHOOL_COLLAPSED_COUNT,
    schoolToggleText: buildSchoolToggleText(false),
    searchQuery: "",
    searchPreview: [],
    settingsClass: ""
  },

  onShow() {
    this.setData({ settingsClass: userSettings.getPageClass() });
    userSettings.applyRuntimeSettings();
    api.recordUsage("home.view").catch(() => {});
    api.getPublicPosts().then((result) => this.setData({ publicPosts: result.records || [] })).catch(() => {});
  },

  openSearch() {
    const query = encodeURIComponent(this.data.searchQuery.trim());
    wx.navigateTo({ url: `/pages/search/search${query ? `?q=${query}` : ""}` });
  },

  openPost(event) { wx.navigateTo({ url: `/pages/news/news?post=${encodeURIComponent(event.currentTarget.dataset.id)}` }); },

  updateSearch(event) {
    const searchQuery = event.detail.value || "";
    const cleanQuery = searchQuery.trim();
    this.setData({
      searchQuery,
      searchPreview: cleanQuery ? searchData.search(cleanQuery, 4) : []
    });
  },

  openSearchResult(event) {
    const index = Number(event.currentTarget.dataset.index);
    const item = this.data.searchPreview[index];
    if (!item) return;
    if (item.tab) {
      wx.switchTab({ url: item.tab });
      return;
    }
    if (item.url) wx.navigateTo({ url: item.url });
  },

  openModule(event) {
    const { url, tab, action } = event.currentTarget.dataset;
    if (action === "contact") {
      wx.showModal({
        title: "1v1问答",
        content: "请联系顾问老师发送问题，后续可接入在线咨询入口。",
        showCancel: false
      });
      return;
    }
    if (action === "about") {
      wx.showModal({
        title: "关于留德小栈",
        content: "留德小栈提供德国院校专业匹配、申请材料整理和文书初稿生成工具。",
        showCancel: false
      });
      return;
    }
    if (tab) {
      wx.switchTab({ url: tab });
      return;
    }
    if (url) wx.navigateTo({ url });
  },

  openSchool(event) {
    const { id } = event.currentTarget.dataset;
    if (!id) return;
    wx.navigateTo({ url: `/pages/school/school?id=${id}` });
  },

  toggleSchools() {
    const schoolsExpanded = !this.data.schoolsExpanded;
    this.setData({
      schoolsExpanded,
      featuredSchools: schoolsExpanded ? FEATURED_SCHOOLS : COLLAPSED_FEATURED_SCHOOLS,
      schoolToggleText: buildSchoolToggleText(schoolsExpanded)
    });
  }
});
