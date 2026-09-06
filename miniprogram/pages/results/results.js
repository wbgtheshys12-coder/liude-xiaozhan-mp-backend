const env = require("../../utils/env");
const api = require("../../utils/api");
const userSettings = require("../../utils/settings");
const schoolData = require("../../utils/schools");
const { chineseDates } = require("../../utils/catalog");

const AI_NOTICE = "AI 辅助生成说明：本报告由留德小栈根据用户提交的信息和本地院校专业数据库自动整理，仅供初步筛选与沟通参考；最终申请条件、课程匹配和录取要求以院校官网及顾问人工核验为准。";

function decorateRecommendationLocations(items) {
  const schools = schoolData.getSchools();
  return (items || []).map((item) => {
    const university = String(item.university || "").toLowerCase();
    const school = university && schools.find((candidate) =>
      [candidate.name, candidate.englishName, candidate.germanName]
        .map((value) => String(value || "").toLowerCase())
        .some((value) => value && (value === university || university.includes(value) || value.includes(university)))
    );
    return {
      ...item,
      detail: { ...(item.detail || {}), facts: { ...(item.detail?.facts || {}), applicationPeriod: chineseDates(item.detail?.facts?.applicationPeriod), applicationDeadline: chineseDates(item.detail?.facts?.applicationDeadline || item.detail?.facts?.deadline) || "未单列截止日期，请核对申请时间范围及官网当期公告" } },
      cityDisplay: school?.cityDisplay || item.city || "未填写",
      schoolName: school?.name || "",
      schoolTags: school?.tags || [],
      schoolType: school?.type || "",
      schoolSummary: school?.summary || "",
      schoolStrengths: school?.strengths || [],
      schoolApplication: school?.application || "",
      schoolLanguage: school?.language || "",
      schoolMaterialTips: school?.materialTips || [],
      schoolTuition: school?.tuition?.summary || school?.tuition?.label || ""
    };
  });
}

function cleanReportValue(value, maxLength = 260) {
  const text = String(value || "")
    .replace(/\[([^\]]+)\]\(https?:\/\/[^)\s]+\)/gi, "$1")
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/\*{1,3}/g, "")
    .replace(/(^|\s)#{1,6}\s*/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= maxLength) return text;
  const candidate = text.slice(0, Math.max(1, maxLength - 1));
  const lastBoundary = Math.max(
    candidate.lastIndexOf("。"),
    candidate.lastIndexOf("；"),
    candidate.lastIndexOf(". "),
    candidate.lastIndexOf("; ")
  );
  const cutAt = lastBoundary >= Math.floor(maxLength * 0.58) ? lastBoundary + 1 : candidate.length;
  return `${candidate.slice(0, cutAt).trim()}…`;
}

function reportList(values, limit = 6, maxLength = 260) {
  return (Array.isArray(values) ? values : [])
    .map((value) => cleanReportValue(value, maxLength))
    .filter(Boolean)
    .slice(0, limit);
}

function reportParagraph(values, limit = 6, maxLength = 260) {
  return reportList(values, limit, maxLength)
    .map((value) => `- ${value}`)
    .join("\n");
}

function buildMatchingTableData(profile, recommendation) {
  return {
    profile: {
      name: profile.name || "",
      school: profile.school || "",
      major: profile.major || "",
      targetDegree: profile.targetDegree || "",
      targetField: profile.targetField || profile.major || "",
      gpa: profile.gpa || "",
      language: profile.language || ""
    },
    summary: recommendation.studentSummary || "",
    recommendations: decorateRecommendationLocations(recommendation.recommendations).map((item, index) => {
      const detail = item.detail || {};
      const facts = detail.facts || {};
      const projectOverview = reportParagraph(
        [
          item.evaluation,
          ...reportList(detail.fitHighlights, 3),
          item.schoolSummary
        ],
        5,
        240
      );
      const programRequirements = reportParagraph(
        [
          facts.languages?.length ? `授课语言：${facts.languages.join(" / ")}` : item.schoolLanguage,
          facts.duration ? `学制：${facts.duration}` : "",
          facts.ects ? `学分：${facts.ects}` : "",
          facts.applicationPeriod ? `申请时间：${facts.applicationPeriod}` : "",
          ...reportList(detail.requirementHighlights, 3),
          item.schoolApplication
        ],
        7,
        240
      );
      const courseEvaluation = reportParagraph(
        [
          item.reason,
          facts.courseCoverageScore ? `课程覆盖评分：${facts.courseCoverageScore}/100` : "",
          facts.courseCoverage?.length ? `已覆盖课程领域：${facts.courseCoverage.join("、")}` : "",
          facts.missingCourseAreas?.length ? `建议补充核对：${facts.missingCourseAreas.join("、")}` : "",
          ...(detail.matchReasonDetails || []).slice(0, 3)
        ],
        7,
        320
      );
      const improvementSuggestions = reportParagraph(
        [
          ...(detail.riskHighlights || []),
          ...(item.schoolMaterialTips || []),
          item.schoolTuition ? `学费信息：${item.schoolTuition}` : "",
          item.qualityAudit?.status ? `证据复核：${item.qualityAudit.status}` : ""
        ],
        7,
        240
      );
      return {
        rank: item.rank || index + 1,
        university: item.university || "",
        schoolName: item.schoolName,
        cityDisplay: item.cityDisplay,
        tags: reportList(item.schoolTags?.length ? item.schoolTags : [item.schoolType], 6, 60),
        program: item.program || "",
        degree: item.degree || profile.targetDegree || "",
        projectOverview,
        programRequirements,
        courseEvaluation,
        matchPercent: item.matchPercent,
        matchLevel: item.matchLevel || item.evaluation || "",
        evidenceScore: item.qualityAudit?.evidenceScore,
        improvementSuggestions
      };
    })
  };
}

function buildMatchingReport(profile, recommendation) {
  const items = decorateRecommendationLocations(recommendation.recommendations);
  const lines = [
    "留德小栈院校专业匹配报告（AI 辅助）",
    "",
    AI_NOTICE,
    "",
    `学生：${profile.name || "未填写"}`,
    `当前学校 / 专业：${[profile.school, profile.major].filter(Boolean).join(" / ") || "未填写"}`,
    `目标学历 / 方向：${[profile.targetDegree, profile.targetField].filter(Boolean).join(" / ") || "未填写"}`,
    `GPA / 语言：${[profile.gpa, profile.language].filter(Boolean).join(" / ") || "未填写"}`,
    "",
    `匹配摘要：${recommendation.studentSummary || "暂无摘要"}`,
    "",
    "推荐清单"
  ];
  items.forEach((item, index) => {
    const details = item.detail?.matchReasonDetails || [];
    lines.push(
      "",
      `${item.rank || index + 1}. ${item.university || "未命名院校"}`,
      `专业：${item.program || "未填写"}`,
      `城市：${item.cityDisplay}`,
      `匹配度：${item.matchPercent ?? "-"}%`,
      `推荐依据：${item.reason || "待人工复核"}`
    );
    if (details.length) lines.push(`证据要点：${details.join("；")}`);
    if (item.qualityAudit?.status) {
      lines.push(`证据审计：${item.qualityAudit.status} · ${item.qualityAudit.evidenceScore ?? "-"}/100`);
    }
  });
  lines.push("", "—— 报告结束 ——", AI_NOTICE);
  return lines.join("\n");
}

function writeAndOpenPdf(result) {
  return new Promise((resolve, reject) => {
    const fs = wx.getFileSystemManager();
    const fileName = String(result.fileName || "liude-matching-report.pdf").replace(/[\\/:*?"<>|]/g, "_");
    const filePath = `${wx.env.USER_DATA_PATH}/${fileName.endsWith(".pdf") ? fileName : `${fileName}.pdf`}`;
    fs.writeFile({
      filePath,
      data: result.contentBase64,
      encoding: "base64",
      success: () => wx.openDocument({ filePath, fileType: "pdf", showMenu: true, success: resolve, fail: reject }),
      fail: reject
    });
  });
}

Page({
  data: {
    profile: {},
    recommendation: {},
    recommendations: [],
    exportingReport: false,
    aiNotice: AI_NOTICE,
    showEvidenceAudit: true,
    settingsClass: ""
  },

  onLoad() {
    const app = getApp();
    const profile = app.globalData.latestProfile || wx.getStorageSync(env.scopedKey(env.STORAGE_KEYS.latestProfile)) || {};
    const recommendation = app.globalData.latestRecommendation || wx.getStorageSync(env.scopedKey(env.STORAGE_KEYS.latestRecommendation)) || {};
    this.setData({
      profile,
      recommendation,
      recommendations: decorateRecommendationLocations(recommendation.recommendations),
      showEvidenceAudit: userSettings.loadSettings().evidenceAuditExpanded,
      settingsClass: userSettings.getPageClass()
    });
    userSettings.applyRuntimeSettings();
  },

  openMaterials() {
    wx.navigateTo({ url: "/pages/tools/tools" });
  },

  exportMatchingReport() {
    if (this.data.exportingReport) return;
    if (!this.data.recommendations.length) {
      wx.showToast({ title: "暂无可导出的匹配结果", icon: "none" });
      return;
    }
    this.setData({ exportingReport: true });
    api
      .exportDocumentPdf({
        kind: "matching",
        title: "院校选校与匹配汇总报告",
        fileName: "liude-matching-report-ai-watermark.pdf",
        content: buildMatchingReport(this.data.profile, this.data.recommendation),
        matchingData: buildMatchingTableData(this.data.profile, this.data.recommendation)
      })
      .then(writeAndOpenPdf)
      .then(() => wx.showToast({ title: "匹配报告已生成", icon: "success" }))
      .catch((error) => wx.showToast({ title: error.message || "报告生成失败", icon: "none" }))
      .finally(() => this.setData({ exportingReport: false }));
  },

  backToAdvisor() {
    wx.navigateBack();
  }
});
