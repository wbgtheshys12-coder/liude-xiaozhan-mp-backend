const TABS = [
  { key: "talent", label: "人才引进" },
  { key: "policy", label: "留学政策" }
];

const TALENT_ITEMS = [
  { title: "德国紧缺人才路径", desc: "工程、IT、数据、护理、医疗相关背景通常更适合结合就业和蓝卡路径提前规划。" },
  { title: "欧盟蓝卡 / Skilled Worker", desc: "关注学历认可、薪资门槛、工作合同、语言能力和居留转换时间点。" },
  { title: "实习与就业衔接", desc: "建议在申请阶段同步整理项目经历、德语计划、作品/代码/研究成果，后续可拓展企业与岗位信息。" }
];

const POLICY_ITEMS = [
  { title: "授课语言与开学季", desc: "匹配项目时优先核对英语/德语授课、冬季/夏季入学和申请截止日期。" },
  { title: "APS 与学历材料", desc: "中国大陆学历通常需要 APS，成绩单、在读证明、毕业证学位证应尽早准备双语版本。" },
  { title: "ECTS 与课程模块", desc: "德国院校常按模块学分核验先修课，成绩单课程信息和 ECTS 对照会影响专业匹配判断。" }
];

Page({
  data: {
    tabs: TABS,
    activeTab: "talent",
    items: TALENT_ITEMS
  },

  onLoad(options) {
    this.setTab(options.tab || "talent");
  },

  switchTab(event) {
    this.setTab(event.currentTarget.dataset.key);
  },

  setTab(key) {
    const activeTab = key === "policy" ? "policy" : "talent";
    this.setData({
      activeTab,
      items: activeTab === "policy" ? POLICY_ITEMS : TALENT_ITEMS
    });
  }
});
