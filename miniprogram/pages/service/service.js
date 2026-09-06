const env = require("../../utils/env");

const DATE_FILTERS = [
  { key: "all", label: "全部" },
  { key: "match", label: "匹配规划" },
  { key: "materials", label: "资料与文书" },
  { key: "course", label: "网课" },
  { key: "policy", label: "签证政策" },
  { key: "consult", label: "1v1咨询" }
];

const SERVICES = [
  {
    key: "advisor",
    category: "match",
    title: "院校专业匹配",
    price: "内部工具",
    booked: "按实际需求使用",
    image: "/assets/home/icon-school.png",
    desc: "填写专业和申请目标即可生成推荐；成绩单可选，上传后可进一步补充课程依据。",
    url: "/pages/advisor/advisor"
  },
  {
    key: "course",
    category: "match",
    title: "补课建议",
    price: "先修课核验",
    booked: "按目标专业判断",
    image: "/assets/home/icon-course.png",
    desc: "结合成绩单和目标项目模块要求，核对常见先修课与学分缺口。",
    url: "/pages/course/course"
  },
  {
    key: "plan",
    category: "match",
    title: "时间规划",
    price: "申请节奏",
    booked: "材料节点",
    image: "/assets/home/icon-plan.png",
    desc: "查看德国申请阶段、材料节点和顾问核对节奏。",
    url: "/pages/plan/plan"
  },
  {
    key: "motivation",
    category: "materials",
    title: "动机申请信生成",
    price: "德语 / 英语初稿免费",
    booked: "可联系老师人工校对",
    image: "/assets/home/icon-motivation.png",
    desc: "按本科/硕士要求、目标学校要求和个人经历生成德语或英语申请动机初稿。",
    url: "/pages/tools/tools?tool=motivation"
  },
  {
    key: "cv",
    category: "materials",
    title: "留德申请个人简历生成",
    price: "德语 / 英语初稿免费",
    booked: "可联系老师人工校对",
    image: "/assets/home/icon-cv.png",
    desc: "按德式简历结构整理教育、考试、实习、项目、奖励和技能，生成德语或英语水印 PDF。",
    url: "/pages/tools/tools?tool=cv"
  },
  {
    key: "onlineCourse",
    category: "course",
    title: "网课中心",
    price: "免费公开课可直接学习",
    booked: "录播课 / 直播课",
    image: "/assets/home/icon-course.png",
    desc: "免费公开课无需登录，限定课程按账号授权；登录后可发送课程反馈。",
    url: "/pages/courses/courses"
  },
  {
    key: "news",
    category: "policy",
    title: "高校资讯与政策",
    price: "申请提醒",
    booked: "院校/政策/人才",
    image: "/assets/home/icon-news.png",
    desc: "查看德国院校、APS、语言、蓝卡和人才引进方向摘要。",
    url: "/pages/news/news"
  },
  {
    key: "consult",
    category: "consult",
    title: "1v1问答",
    price: "问题整理",
    booked: "顾问核对",
    image: "/assets/home/icon-qa.png",
    desc: "提交申请问题，按主题和紧急程度整理给内部顾问。",
    url: "/pages/consult/consult"
  },
  {
    key: "booking",
    category: "consult",
    title: "顾问预约",
    price: "预约沟通",
    booked: "提交后由老师联系",
    image: "/assets/home/icon-qa.png",
    desc: "预约内部顾问核对申请方向、材料和时间规划。",
    tab: "/pages/booking/booking"
  }
];

Page({
  data: {
    filters: DATE_FILTERS,
    activeFilter: "all",
    services: SERVICES,
    visibleServices: SERVICES
  },

  openService(event) {
    const { url, tab } = event.currentTarget.dataset;
    if (tab) {
      wx.switchTab({ url: tab });
      return;
    }
    if (url) wx.navigateTo({ url });
  },

  switchFilter(event) {
    const activeFilter = event.currentTarget.dataset.key || "all";
    const visibleServices = activeFilter === "all" ? SERVICES : SERVICES.filter((item) => item.category === activeFilter);
    this.setData({ activeFilter, visibleServices });
  }
});
