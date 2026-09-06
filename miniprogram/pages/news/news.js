const api = require("../../utils/api");
const TABS = [
  { key: "school", label: "院校" },
  { key: "policy", label: "政策" },
  { key: "talent", label: "人才" },
  { key: "talk", label: "杂谈" }
];

const ARTICLES = {
  school: [
    {
      title: "TU9 工科院校怎么做初筛",
      tag: "院校选择",
      desc: "建议先看专业模块、授课语言、城市偏好和申请系统，再判断是否作为冲刺、匹配或保底。"
    },
    {
      title: "商科与数据方向常见德国院校",
      tag: "商科数据",
      desc: "科隆、曼海姆、FAU、慕尼黑工大等院校常见于商科、金融、数据和管理交叉方向。"
    },
    {
      title: "城市偏好不能替代专业匹配",
      tag: "选校提醒",
      desc: "柏林、慕尼黑、斯图加特等城市资源重要，但最终仍要回到课程和专业要求。"
    }
  ],
  policy: [
    {
      title: "APS 与学历材料准备",
      tag: "材料",
      desc: "大陆学历申请德国通常要关注 APS、成绩单、在读证明、毕业证学位证和翻译件。"
    },
    {
      title: "语言证明和申请季",
      tag: "语言",
      desc: "英语/德语授课、冬季/夏季入学、语言证书提交时间会直接影响可申请项目池。"
    },
    {
      title: "ECTS 与课程模块核验",
      tag: "课程",
      desc: "很多项目会按学分和课程模块核验先修课，成绩单课程信息会影响匹配判断。"
    }
  ],
  talent: [
    {
      title: "德国紧缺人才路径",
      tag: "就业",
      desc: "工程、IT、数据、护理、医疗等方向可结合实习、就业和蓝卡路径提前规划。"
    },
    {
      title: "欧盟蓝卡与 Skilled Worker",
      tag: "居留",
      desc: "长期就业规划需要关注学历认可、工作合同、薪资门槛、语言和居留转换节点。"
    },
    {
      title: "申请阶段同步准备就业材料",
      tag: "简历",
      desc: "项目经历、德语计划、作品集、代码或研究成果可以同步整理，为后续实习做准备。"
    }
  ],
  talk: [
    {
      title: "德国申请不要只看排名",
      tag: "杂谈",
      desc: "课程模块、语言、城市、实习机会和毕业路径往往比单一排名更影响最终体验。"
    },
    {
      title: "成绩单识别后为什么还要校对",
      tag: "材料",
      desc: "拍照角度、红章遮挡、双列表格都会影响识别，学生校对后再匹配会更稳。"
    },
    {
      title: "留德准备的第一性问题",
      tag: "规划",
      desc: "先确定方向、语言、预算和时间，再把院校拆成冲刺、匹配、稳妥三个层级。"
    }
  ]
};

Page({
  data: {
    tabs: TABS,
    activeTab: "school",
    articles: ARTICLES.school
  },

  onLoad(options) {
    this.setTab(options.tab || "school");
    api.getPublicPosts().then((result) => this.setData({ posts: result.records || [], selectedPost: (result.records || []).find((post) => post.id === options.post) || null })).catch(() => {});
  },

  switchTab(event) {
    this.setTab(event.currentTarget.dataset.key);
  },

  openPost(event) { this.setData({ selectedPost: this.data.posts.find((post) => post.id === event.currentTarget.dataset.id) }); },
  closePost() { this.setData({ selectedPost: null }); },
  copySource() { const url = this.data.selectedPost?.sourceUrl; if (url) wx.setClipboardData({ data: url }); },

  setTab(key) {
    const activeTab = ARTICLES[key] ? key : "school";
    this.setData({
      activeTab,
      articles: ARTICLES[activeTab]
    });
  },

  openArticle(event) {
    const index = Number(event.currentTarget.dataset.index);
    const article = this.data.articles[index];
    if (!article) return;
    wx.showModal({
      title: article.title,
      content: `${article.desc}\n\n这是留德小栈内部申请提醒摘要，可用于前期选校和材料准备判断。`,
      showCancel: false
    });
  }
});
