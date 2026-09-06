const env = require("./env");

const STATUS_OPTIONS = ["未开始", "准备中", "已完成", "不适用"];

const CATEGORIES = [
  { key: "identity", label: "A. 身份材料" },
  { key: "education", label: "B. 学历材料" },
  { key: "language", label: "C. 语言材料" },
  { key: "aps", label: "D. APS 审核材料" },
  { key: "writing", label: "E. 文书材料" },
  { key: "majorExtra", label: "F. 专业附加材料" },
  { key: "applicationSystem", label: "G. 申请系统材料" },
  { key: "afterAdmission", label: "H. 录取后材料" }
];

function text(value) {
  return String(value || "").trim();
}

function lower(value) {
  return text(value).toLowerCase();
}

function hasAny(value, keywords) {
  const source = lower(value);
  return keywords.some((keyword) => source.includes(lower(keyword)));
}

function buildContext(profile, recommendationData) {
  const targetText = [
    profile.targetField,
    profile.major,
    profile.thesisTopic,
    profile.targetSchoolRequirements,
    profile.notes,
    (recommendationData.recommendations || []).map((item) => `${item.university} ${item.program}`).join(" ")
  ].join(" ");
  const languageText = `${profile.language || ""} ${profile.instructionLanguage || ""} ${profile.targetSchoolRequirements || ""}`;

  return {
    profile,
    recommendations: recommendationData.recommendations || [],
    isCurrentStudent: hasAny(`${profile.degree} ${profile.studentStatus}`, ["在读", "student", "studierend", "immatrikuliert", "eingeschrieben"]),
    needsAps: !hasAny(profile.chinaEducation, ["否", "nein", "no", "nicht", "non"]),
    needsGerman: hasAny(languageText, ["德语", "德福", "dsh", "testdaf", "deutsch", "german"]),
    needsEnglish: hasAny(languageText, ["英语", "ielts", "toefl", "雅思", "托福", "english", "englisch"]),
    needsPortfolio: hasAny(targetText, ["设计", "建筑", "艺术", "portfolio", "作品集"]),
    needsGreGmat: hasAny(targetText, ["gre", "gmat", "mba", "finance", "金融", "商科"]),
    needsUniAssist: hasAny(targetText, ["uni-assist", "uni assist"])
  };
}

function item(id, category, name, requiredLevel, description, deadlineStage, extra = {}) {
  return {
    id,
    category,
    name,
    requiredLevel,
    applicableCondition: extra.applicableCondition || "根据目标院校要求准备",
    description,
    priority: extra.priority || "中",
    deadlineStage,
    status: "未开始",
    uploadedFiles: [],
    notes: "",
    canAutoGenerate: Boolean(extra.templateType),
    templateType: extra.templateType || "",
    generatedDraft: ""
  };
}

function buildMaterials(context) {
  const materials = [
    item("passport", "identity", "护照首页扫描件", "必须", "确保护照有效期覆盖申请和签证阶段。", "申请前", { priority: "高" }),
    item("id-photo", "identity", "证件照", "必须", "准备电子版白底或学校要求格式。", "申请前"),
    item("transcript", "education", "本科成绩单", "必须", "中英文或中德文版本，需盖章。", "申请前", { priority: "高" }),
    item("degree-proof", "education", context.isCurrentStudent ? "在读证明" : "毕业证与学位证", "必须", "在读学生提交在读证明，毕业学生提交毕业证和学位证。", "申请前", { priority: "高" }),
    item("grading-scale", "education", "评分标准说明", "建议", "用于解释 GPA、百分制或等级制。", "申请前"),
    item("cv", "writing", "英文/德文 CV", "必须", "建议 1-2 页，突出课程、项目、实习和技能。", "申请前", { priority: "高", templateType: "cv" }),
    item("motivation-letter", "writing", "动机信", "必须", "按学校和专业定制申请动机、匹配点和职业规划。", "申请前", { priority: "高", templateType: "motivation" }),
    item("recommendation-request", "writing", "推荐信请求邮件", "条件需要", "部分项目要求推荐信，可提前联系老师。", "申请前", { templateType: "recommendationEmail" }),
    item("portal-account", "applicationSystem", "学校 Portal 账号与申请表", "必须", "记录账号、申请号、提交状态和截止日期。", "申请中", { priority: "高" }),
    item("visa-plan", "afterAdmission", "签证材料准备清单", "必须", "录取后准备资金证明、保险、住宿、VIDEX 等。", "录取后", { priority: "高", templateType: "visaMotivation" })
  ];

  if (context.needsEnglish) materials.push(item("english-proof", "language", "英语语言成绩", "必须", "IELTS / TOEFL 等成绩单，注意有效期。", "申请前", { priority: "高" }));
  if (context.needsGerman) materials.push(item("german-proof", "language", "德语语言成绩", "必须", "TestDaF / DSH / Goethe 等证明，按项目要求核对等级。", "申请前", { priority: "高" }));
  if (context.needsAps) {
    materials.push(item("aps-certificate", "aps", "APS 审核证书", "必须", "中国大陆学历通常需要 APS，建议尽早排期。", "申请前", { priority: "高" }));
    materials.push(item("aps-interview", "aps", "APS 面谈准备提纲", "建议", "按课程、毕业设计、实习项目整理可讲述素材。", "申请前", { templateType: "apsOutline" }));
  }
  if (context.needsPortfolio) materials.push(item("portfolio", "majorExtra", "作品集", "条件需要", "设计、建筑、艺术方向通常需要。", "申请前", { priority: "高" }));
  if (context.needsGreGmat) materials.push(item("gre-gmat", "majorExtra", "GRE / GMAT", "条件需要", "商科、金融或部分高竞争项目可能要求或建议提交。", "申请前"));
  if (context.needsUniAssist) materials.push(item("uni-assist", "applicationSystem", "Uni-Assist 材料与付款记录", "条件需要", "通过 Uni-Assist 申请的项目需上传材料并完成付款。", "申请中", { priority: "高" }));

  return materials;
}

function signature(profile) {
  return [profile.name, profile.school, profile.major, profile.targetDegree, profile.targetField, profile.thesisTopic].map(text).join("|");
}

function storageKey(profile) {
  return `${env.scopedKey(env.STORAGE_KEYS.materials)}_${signature(profile)}`;
}

function restoreProgress(profile, materials) {
  if (typeof getApp === "function" && !getApp().globalData.token) return materials;
  const saved = wx.getStorageSync(storageKey(profile));
  if (!saved || !saved.materials) return materials;
  const byId = {};
  saved.materials.forEach((savedItem) => {
    byId[savedItem.id] = savedItem;
  });
  return materials.map((material) => ({
    ...material,
    status: byId[material.id]?.status || material.status,
    notes: byId[material.id]?.notes || "",
    uploadedFiles: byId[material.id]?.uploadedFiles || [],
    generatedDraft: byId[material.id]?.generatedDraft || ""
  }));
}

function buildWorkspace(profile, recommendationData) {
  const context = buildContext(profile || {}, recommendationData || {});
  const materials = restoreProgress(profile || {}, buildMaterials(context));
  return {
    profile: profile || {},
    recommendations: context.recommendations,
    context,
    categories: CATEGORIES,
    statusOptions: STATUS_OPTIONS,
    materials
  };
}

function saveWorkspace(workspace) {
  if (typeof getApp === "function" && !getApp().globalData.token) return;
  wx.setStorageSync(storageKey(workspace.profile || {}), workspace);
}

function progress(materials) {
  const applicable = materials.filter((material) => material.status !== "不适用");
  const completed = applicable.filter((material) => material.status === "已完成");
  return {
    total: applicable.length,
    completed: completed.length,
    percent: applicable.length ? Math.round((completed.length / applicable.length) * 100) : 0
  };
}

function missingFields(profile, fields) {
  return fields.filter((field) => !text(profile[field]));
}

function buildDraft(material, workspace) {
  const profile = workspace.profile || {};
  const targets = (workspace.recommendations || [])
    .slice(0, 4)
    .map((item) => `${item.university} - ${item.program}`)
    .join("\n");

  if (material.templateType === "cv") {
    return [
      `待补充字段：${missingFields(profile, ["name", "school", "major", "language", "thesisTopic"]).join("、") || "无"}`,
      "",
      `${profile.name || "姓名"}`,
      `${profile.school || "当前学校"} | ${profile.major || "专业"}`,
      "",
      "Education",
      `- ${profile.degree || "学历"}，GPA/均分：${profile.gpa || "待补充"}`,
      `- Thesis / Abschlussarbeit: ${profile.thesisTopic || "待补充"}`,
      "",
      "Projects & Experience",
      `- ${profile.projects || profile.experience || "待补充项目、科研或实习经历"}`,
      "",
      "Skills & Languages",
      `- ${profile.language || "待补充语言成绩"}`
    ].join("\n");
  }

  if (material.templateType === "motivation") {
    return [
      `待补充字段：${missingFields(profile, ["targetField", "careerPlan", "projects", "thesisTopic"]).join("、") || "无"}`,
      "",
      "Dear Admissions Committee,",
      "",
      `I am applying for programs related to ${profile.targetField || profile.major || "my target field"} because my academic background and project experience have prepared me for advanced study in Germany.`,
      `My current background is ${profile.major || "待补充专业"} at ${profile.school || "待补充学校"}. My thesis / Abschlussarbeit topic is ${profile.thesisTopic || "待补充"}.`,
      `Relevant target programs include:\n${targets || "待补充目标项目"}`,
      "",
      `My long-term plan is ${profile.careerPlan || "待补充职业规划"}.`,
      "",
      "Sincerely,"
    ].join("\n");
  }

  if (material.templateType === "recommendationEmail") {
    return [
      "老师您好，",
      "",
      `我正在准备德国 ${profile.targetDegree || "硕士"} 申请，方向为 ${profile.targetField || profile.major || "待补充方向"}。想请问您是否方便为我提供一封英文推荐信？`,
      "我会整理 CV、成绩单、申请项目清单和推荐信要点，尽量减少您的时间成本。",
      "",
      "非常感谢！"
    ].join("\n");
  }

  if (material.templateType === "apsOutline") {
    return [
      "APS 面谈准备提纲",
      "",
      `专业主线：${profile.major || "待补充"}`,
      `核心课程：${profile.courses || "待补充"}`,
      `毕业论文：${profile.thesisTopic || "待补充"}`,
      `项目/实习：${profile.projects || profile.internships || "待补充"}`,
      "每门课建议准备：课程目标、核心概念、一个例题或项目应用、个人收获。"
    ].join("\n");
  }

  if (material.templateType === "visaMotivation") {
    return [
      "签证动机说明草稿",
      "",
      `我计划赴德国攻读 ${profile.targetDegree || "目标学历"}，方向为 ${profile.targetField || profile.major || "目标方向"}。`,
      `该学习计划与我的本科背景 ${profile.major || "待补充"} 以及未来规划 ${profile.careerPlan || "待补充"} 相匹配。`,
      "录取后将补充学校名称、课程开始时间、资金证明、住宿和保险信息。"
    ].join("\n");
  }

  return "当前材料暂无自动初稿模板。";
}

module.exports = {
  CATEGORIES,
  STATUS_OPTIONS,
  buildWorkspace,
  saveWorkspace,
  progress,
  buildDraft
};
