const env = require("../../utils/env");

const MODULES = [
  {
    title: "数学与统计",
    desc: "线性代数、概率统计、优化、数值方法是工程、数据、AI 方向常见核验项。",
    level: "高频缺口"
  },
  {
    title: "编程与算法",
    desc: "计算机、机器人、数据科学申请通常需要算法、数据结构、Python/C++ 或系统课程证据。",
    level: "重点核对"
  },
  {
    title: "专业核心课",
    desc: "机械、电气、材料、商科等方向需要与目标项目逐项核对先修课程。",
    level: "按项目判断"
  },
  {
    title: "官网模块要求",
    desc: "德国院校常按模块内容、学分和考核方式核验先修课，请以目标项目官网和模块手册为准。",
    level: "逐项核对"
  }
];

Page({
  data: {
    modules: MODULES,
    diagnosisVisible: false,
    diagnosis: []
  },

  goAdvisor() {
    wx.navigateTo({ url: "/pages/advisor/advisor" });
  },

  showDiagnosis() {
    const app = getApp();
    const profile = app.globalData.latestProfile || wx.getStorageSync(env.scopedKey(env.STORAGE_KEYS.latestProfile)) || {};
    const recommendation = app.globalData.latestRecommendation || wx.getStorageSync(env.scopedKey(env.STORAGE_KEYS.latestRecommendation)) || {};
    const targetText = [profile.targetField, profile.major, profile.thesisTopic, profile.courses].join(" ").toLowerCase();
    const recommendations = recommendation.recommendations || [];
    const diagnosis = [];

    if (!profile.major && !recommendations.length) {
      diagnosis.push({
        title: "缺少资料",
        level: "先完成专业匹配",
        desc: "还没有读取到最近一次申请资料或推荐结果。请先完成院校专业匹配，再回到本页查看更精确的补课诊断。"
      });
    }

    if (/ai|robot|data|computer|informatik|软件|计算机|数据|机器人|人工智能/.test(targetText)) {
      diagnosis.push({
        title: "编程与算法证据",
        level: "重点补强",
        desc: "建议在成绩单核对表中补充 Python/C++、数据结构、算法、机器学习或机器人相关课程和学分；再对照目标项目模块手册判断先修要求。"
      });
    }

    if (/engineer|mechanical|机器|自动化|车辆|航空|材料|电气|mechatron/.test(targetText)) {
      diagnosis.push({
        title: "工程核心课",
        level: "逐项核对",
        desc: "建议核对数学、力学、控制、材料、机械设计、电工电子或自动化模块，并在成绩单核对表中写清学分、学期和必要备注。"
      });
    }

    if (/design|fashion|服装|纺织|艺术|portfolio/.test(targetText)) {
      diagnosis.push({
        title: "作品集与专业模块",
        level: "材料优先",
        desc: "设计、服装、纺织方向建议准备作品集或项目集，并补充材料、工艺、设计方法、用户研究或产品开发相关课程说明。"
      });
    }

    if (!diagnosis.length) {
      diagnosis.push({
        title: "通用课程核对",
        level: "基础诊断",
        desc: "当前资料没有明显高风险缺口。建议仍按目标项目官网要求核对数学/统计、专业核心课、语言证明和课程模块要求。"
      });
    }

    if (recommendations.length) {
      diagnosis.push({
        title: "推荐结果联动",
        level: `${recommendations.length} 个项目`,
        desc: `已读取最近一次推荐结果。请优先核对前 ${Math.min(3, recommendations.length)} 个项目官网中的 Zulassungsvoraussetzungen、Module Handbook 和 ECTS 要求。`
      });
    }

    this.setData({
      diagnosisVisible: true,
      diagnosis
    });
  }
});
