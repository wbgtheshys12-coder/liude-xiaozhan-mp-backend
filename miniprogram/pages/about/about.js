const env = require("../../utils/env");
const api = require("../../utils/api");
const OFFICIAL_ACCOUNT_USERNAME = "gh_654d500aae6b";
const OFFICIAL_ACCOUNT_WECHAT = "liudexiaozhan01";

const STRENGTHS = [
  { number: "01", title: "申请实战经验丰富", desc: "关注复杂背景与疑难申请，也为曾经申请受挫的学生梳理原因、完善材料和重新规划申请路径。" },
  { number: "02", title: "德语教学三年沉淀", desc: "携手“逢考必过德语”，团队累计服务 2000+ 德语学员，提供各阶段德语与高考德语辅导。" },
  { number: "03", title: "亚琛工大硕博团队", desc: "以德国硕博团队的学习与科研经验为基础，落地杭州滨江，结合对德国高校科研教学体系的了解，制定适合个人背景的留学方案。" },
  { number: "04", title: "AI 辅助留学申请", desc: "自主开发留学 AI 系统，持续积累德国高校与项目信息，减少申请信息差，让院校匹配、材料整理和师生协作更高效。" }
];

const PROCESS = [
  { title: "完善一份个人信息", desc: "姓名、联系方式、申请层次和专业方向只需集中填写，预约与客服沟通可直接复用。" },
  { title: "整理课程与申请目标", desc: "可上传成绩单图片或 PDF，也可在校对表中手动补充课程、学分和成绩。" },
  { title: "生成院校专业建议", desc: "综合专业背景、课程、成绩、语言、城市和州等信息，默认给出 6 所有依据的候选院校。" },
  { title: "准备文书与材料", desc: "按调查表生成简历和动机信初稿，并结合本科或硕士申请清单继续完善。" },
  { title: "预约老师复核", desc: "通过预约或客服消息提交问题，由老师核对学校官网、项目要求和最终申请材料。" }
];

const LETTER = [
  "留德小栈面向准备德国本科与硕士申请的学生。我们关注的不只是提供一张学校名单，更希望帮助学生看清课程是否匹配、材料还缺什么，以及下一步应该先做哪件事。",
  "留德小栈把院校专业建议、成绩单课程校对、申请材料清单、简历与动机信初稿、网课学习、预约和客服沟通放进同一个清晰的流程。资料不完整时，系统也会先依据已经填写的专业和申请目标给出可继续完善的建议。",
  "我们相信工具应当提高准备效率，也应当诚实说明边界。自动生成的结果属于 AI 辅助初稿，关键申请条件仍需要结合学校官网、项目条例和老师复核后再使用。"
];

const SERVICES = [
  { title: "院校与专业建议", desc: "结合专业、课程、成绩、语言、城市、州和院校数据库证据，生成可解释的候选结果。" },
  { title: "成绩单与课程校对", desc: "支持图片和 PDF 上传、识别进度、手动增删课程及确认后再匹配。" },
  { title: "申请文书工具", desc: "收集必填信息后生成简历和动机信初稿，支持德语或英语方向并保留人工修改空间。" },
  { title: "申请材料清单", desc: "按本科申请和硕士申请分别整理材料，帮助学生查看准备进度。" },
  { title: "网课学习", desc: "免费公开课可直接学习；限定课程按账号授权，登录后可向老师发送课程反馈。" },
  { title: "预约与客服沟通", desc: "学生可预约老师或在客服对话中留言，老师可在管理端查看并回复。" }
];

const BOUNDARIES = [
  "院校推荐、匹配报告和文书内容均为 AI 辅助生成，不代表录取承诺。",
  "课程匹配、截止日期、语言要求和申请材料以大学及项目官方网站的最新规定为准。",
  "正式提交前，请由本人或负责老师检查姓名、日期、成绩、项目名称和事实经历。",
  "暂未开放的能力不会要求用户付款；后续如开放收费，会先清楚展示服务内容和价格。"
];

const PRIVACY = [
  "上传的成绩单、文书信息和其他材料只用于当前账号的留学申请服务、功能处理与老师核对。",
  "页面使用脱敏账号标识，不向其他学生展示 openid、联系方式或上传文件。",
  "请勿在客服消息中发送银行卡密码、支付密钥、身份证完整照片等与申请无关的高敏感信息。",
  "需要删除文件时，可在对应材料页面操作；如需进一步处理，可通过客服消息联系老师。"
];

Page({
  data: {
    process: PROCESS,
    strengths: STRENGTHS,
    posterUrl: `${env.API_BASE_URL}/api/mp/public/about-poster.jpg?v=20260830`,
    serviceWechat: "liudexiaozhan",
    officialAccountUsername: OFFICIAL_ACCOUNT_USERNAME,
    officialAccountWechat: OFFICIAL_ACCOUNT_WECHAT,
    letter: LETTER,
    services: SERVICES,
    boundaries: BOUNDARIES,
    privacy: PRIVACY
  },

  onLoad() {
    api.getPublicConfig().then((config) => {
      const username = config && config.officialAccountUsername;
      if (/^gh_[a-zA-Z0-9]+$/.test(username || "")) {
        this.setData({ officialAccountUsername: username });
      }
    }).catch(() => {});
  },

  openOfficialAccount() {
    const fallback = () => wx.showModal({ title: "关注留德小栈", content: "当前暂不支持直接打开公众号。请复制公众号微信号 liudexiaozhan01，在微信搜索中选择“公众号”查找，或查看下方海报二维码。", confirmText: "复制微信号", success: (res) => { if (res.confirm) wx.setClipboardData({ data: OFFICIAL_ACCOUNT_WECHAT }); } });
    if (!this.data.officialAccountUsername || typeof wx.openOfficialAccountProfile !== "function") return fallback();
    try {
      wx.openOfficialAccountProfile({ username: this.data.officialAccountUsername, fail: fallback });
    } catch (_) {
      fallback();
    }
  },

  goConsult() {
    wx.navigateTo({ url: "/pages/consult/consult" });
  },

  copyOfficialAccount() {
    wx.setClipboardData({
      data: OFFICIAL_ACCOUNT_WECHAT,
      success: () => wx.showToast({ title: "已复制，请在微信搜索公众号", icon: "none" }),
      fail: () => wx.showModal({ title: "公众号微信号", content: OFFICIAL_ACCOUNT_WECHAT + "（也可长按页面上的微信号复制）", showCancel: false })
    });
  },

  copyContact(event) {
    const value = event.currentTarget.dataset.value;
    if (!["留德小栈", this.data.serviceWechat].includes(value)) return;
    wx.setClipboardData({
      data: value,
      success: () => wx.showToast({ title: "已复制，可前往搜索", icon: "none" }),
      fail: () => wx.showToast({ title: "复制未完成，请重试", icon: "none" })
    });
  },

  previewPoster() {
    wx.previewImage({
      current: this.data.posterUrl,
      urls: [this.data.posterUrl],
      showmenu: true,
      fail: () => wx.showToast({ title: "图片暂未打开，请检查网络后重试", icon: "none" })
    });
  },

  openPolicy() {
    const unavailable = () => wx.showModal({
      title: "隐私与使用说明",
      content: "请先阅读本页的“结果怎么理解”和“资料与隐私”。完整隐私保护指引可在微信小程序右上角菜单查看。",
      showCancel: false
    });
    if (!wx.openPrivacyContract) return unavailable();
    wx.openPrivacyContract({ fail: unavailable });
  }
});
