const env = require("../../utils/env");
const api = require("../../utils/api");
const progress = require("../../utils/progress");
const experience = require("../../utils/experience");

const FORM_KEY_PREFIX = "liude_user_tool_form";
const TOOL_SCHEMA_VERSION = "20260905-factual-structured-v6";

const TOOL_DEFS = [
  {
    key: "motivation",
    title: "动机申请信生成",
    shortTitle: "动机信",
    documentTitle: "留德小栈德国高校申请动机信",
    actionLabel: "生成动机信初稿",
    wordExportLabel: "导出完整动机信 Word",
    pdfExportLabel: "导出完整动机信 PDF（水印）",
    summary: "按本科/硕士申请要求、目标学校要求和个人经历，生成德语或英语动机信结构稿。",
    templateSource: "字段沿用公司原版《留德动机信准备表》；正式提交前仍需按目标学校题目、字数和申请轮次逐校复核。",
    sections: [
      {
        title: "个人与学习背景",
        fields: [
           { key: "name", label: "姓名", placeholder: "例如：张同学", required: true },
           { key: "latinName", label: "护照拼音姓名", placeholder: "仅填拉丁字母姓名，例如 ZHANG San；不要填写护照号码", required: true },
           { key: "email", label: "联系邮箱", placeholder: "用于动机信抬头", required: true },
           { key: "phone", label: "联系电话", placeholder: "含国家/地区区号，例如 +86", required: true },
           { key: "currentCity", label: "现居城市", placeholder: "例如：杭州 / Hangzhou", required: true },
           { key: "schoolMajor", label: "就读大学、专业、时间、均分", placeholder: "例如：XX大学，服装设计与工程，2020-2024，均分82", required: true },
           { key: "applicationLevel", label: "申请层次", placeholder: "本科或硕士", required: true },
           { key: "targetProgram", label: "目标学校和专业", placeholder: "还没确定可以写目标方向，例如德国服装/纺织/时尚管理硕士", required: true },
        ]
      },
      {
        title: "为什么选择德国",
        fields: [
          { key: "germanyOrigin", label: "从何处了解到德国留学，何时开始有想法", type: "long", placeholder: "家庭、老师、同学、网络、教育展、课程兴趣、德语/汽车/设计等触发点", required: true },
          { key: "germanyMajorUnderstanding", label: "你对该专业在德国的了解", type: "long", placeholder: "行业发展、公司企业、展会、博物馆、竞赛、德国在该方向吸引你的地方", required: true },
          { key: "germanEducationUnderstanding", label: "你对德国教育的了解", type: "long", placeholder: "文凭认可度、教育成本、就业机会、国际化背景、实践导向等", required: true }
        ]
      },
      {
        title: "为什么选择该专业",
        fields: [
          { key: "interestedDirections", label: "今后感兴趣的专业方向", type: "long", placeholder: "想上哪些课程，了解哪些知识，做哪些实践或实验，计划多久毕业，想实现什么学习目标", required: true },
          { key: "relevantCourses", label: "本科阶段相关课程", type: "long", placeholder: "列出高分课、核心课，以及这些课程如何帮助后续学习", required: true },
          { key: "projectsInternships", label: "实习、项目、竞赛、毕业设计或工作经验", type: "long", placeholder: "写清项目做了什么、你的职责、收获，以及和目标方向的关系", required: true }
        ]
      },
      {
        title: "毕业后的计划",
        desc: "继续深造和就业二选一，也可以都写，后续人工再筛选。",
        fields: [
          { key: "furtherStudyPlan", label: "继续读研或读博计划", type: "long", placeholder: "研究方向、意向国家/大学/科研机构、为何确立目标" },
          { key: "careerPlan", label: "就业计划", type: "long", placeholder: "职业目标、是否回国、希望进入哪类公司和部门、为何确定该目标", required: true }
        ]
      }
    ]
  },
  {
    key: "cv",
    title: "留德申请个人简历生成",
    shortTitle: "留德简历",
    documentTitle: "留德小栈留德申请个人简历",
    actionLabel: "生成留德申请个人简历初稿",
    wordExportLabel: "导出完整留德申请个人简历 Word",
    pdfExportLabel: "导出完整留德申请个人简历 PDF（水印）",
    summary: "整理教育、考试、实习、项目、论文、奖励和技能，生成德式结构的德语或英语简历初稿。",
    templateSource: "字段沿用公司原版《个人简历信息表》，但不收集护照号、身份证号、家庭住址和紧急联系人等非必要敏感信息。",
    sections: [
      {
        title: "个人信息",
        fields: [
           { key: "name", label: "姓名", placeholder: "中英文姓名", required: true },
           { key: "latinName", label: "护照拼音姓名", placeholder: "仅填拉丁字母姓名，例如 ZHANG San；不要填写护照号码", required: true },
           { key: "email", label: "邮箱", placeholder: "用于简历联系方式", required: true },
           { key: "phone", label: "电话", placeholder: "含国家/地区区号，例如 +86", required: true },
           { key: "currentCity", label: "现居城市", placeholder: "例如：杭州 / Hangzhou", required: true },
           { key: "citizenship", label: "国籍", placeholder: "例如：中国；此处不要填写身份证号或护照号", required: true },
           { key: "birthInfo", label: "生日、出生地", placeholder: "例如：2002-03-18，杭州；无需填写身份证号", required: true }
        ]
      },
      {
        title: "教育背景与考试",
        fields: [
          { key: "education", label: "大学和交换经历", type: "long", placeholder: "学校、专业、学位、在校时间、均分/GPA、核心课程", required: true },
          { key: "schooling", label: "中小学经历（原有文本）", type: "long", placeholder: "小学、初中、高中各校名称、层次、起止年月；也可使用下方分项表" },
          { key: "gapExplanation", label: "时间空档说明", type: "long", placeholder: "如有备考、求职等空档，请写清起止年月及真实情况" },
          { key: "exchange", label: "交换经历或暑校", type: "long", placeholder: "学校、时间、课程、成绩；没有可留空" },
          { key: "tests", label: "语言和标准考试", type: "long", placeholder: "IELTS/TOEFL/TestDaF/GRE/GMAT，未考试可写计划考试日期" }
        ]
      },
      {
        title: "经历与成果",
        fields: [
          { key: "professionalExperience", label: "工作/实习经历", type: "long", placeholder: "单位、职位、时间、工作内容、成果；没有可留空" },
          { key: "researchProjects", label: "研究/项目经历", type: "long", placeholder: "项目名、时间、你的职责、方法、结果；毕业论文也写这里；没有可留空" },
          { key: "publications", label: "发表论文", type: "long", placeholder: "作者、题目、刊物/会议、时间；没有可留空" },
          { key: "honors", label: "奖励和荣誉", type: "long", placeholder: "竞赛获奖、奖学金、突出成绩，写明授奖单位和时间" }
        ]
      },
      {
        title: "补充能力",
        fields: [
           { key: "activities", label: "课外活动/社会实践", type: "long", placeholder: "活动、角色、每周投入时间、主要贡献" },
           { key: "skills", label: "计算机水平、专业证书、特长爱好", type: "long", placeholder: "软件、编程、设计工具、证书、语言、兴趣", required: true }
        ]
      }
    ]
  }
];

function findTool(key) {
  return TOOL_DEFS.find((item) => item.key === key) || TOOL_DEFS[0];
}

function clean(value) {
  return String(value || "").trim();
}

function padTimePart(value) {
  return String(value).padStart(2, "0");
}

function formatLocalTimestamp(date = new Date()) {
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${padTimePart(date.getHours())}:${padTimePart(
    date.getMinutes()
  )}:${padTimePart(date.getSeconds())}`;
}

function formatDocumentTimestamp(date = new Date(), language = "de") {
  const year = date.getFullYear();
  const month = padTimePart(date.getMonth() + 1);
  const day = padTimePart(date.getDate());
  const time = `${padTimePart(date.getHours())}:${padTimePart(date.getMinutes())}:${padTimePart(date.getSeconds())}`;
  return language === "en" ? `${year}-${month}-${day} ${time}` : `${day}.${month}.${year} ${time}`;
}

function draftNotice(language = "de") {
  if (language === "en") {
    return "Note: This AI-assisted draft is intended for application preparation only. Verify all facts and the target programme's official requirements before submission.";
  }
  return "Hinweis: Dieser KI-gestützte Entwurf dient nur der Vorbereitung der Bewerbung. Bitte prüfen Sie vor der Einreichung alle Angaben und die offiziellen Anforderungen des Zielstudiengangs.";
}

function storageKey(toolKey) {
  return env.scopedKey(`${FORM_KEY_PREFIX}_${toolKey}`);
}

function getProfileContext() {
  const app = getApp();
  if (!app.globalData.token) return { profile: {}, targets: "" };
  const profile = app.globalData.latestProfile || wx.getStorageSync(env.scopedKey(env.STORAGE_KEYS.latestProfile)) || {};
  const recommendation = app.globalData.latestRecommendation || wx.getStorageSync(env.scopedKey(env.STORAGE_KEYS.latestRecommendation)) || {};
  const targets = (recommendation.recommendations || [])
    .slice(0, 3)
    .map((item) => `${item.university || ""} ${item.program || ""}`.trim())
    .filter(Boolean)
    .join("；");
  return { profile, targets };
}

function prefillForm(toolKey) {
  const { profile, targets } = getProfileContext();
  if (toolKey === "motivation") {
    return {
      name: profile.name || "",
      latinName: profile.latinName || profile.englishName || "",
      email: profile.email || "",
      phone: profile.phone || (/^[^@]+@/.test(profile.contact || "") ? "" : profile.contact || ""),
      currentCity: profile.currentCity || "",
      schoolMajor: [profile.school, profile.major, profile.degree, profile.gpa].filter(Boolean).join("，"),
      applicationLevel: profile.applicationLevel || profile.targetDegree || "",
      targetProgram: targets || profile.targetField || "",
      relevantCourses: profile.courses || "",
      projectsInternships: profile.projects || profile.experience || "",
      interestedDirections: profile.targetField || "",
      careerPlan: profile.careerPlan || ""
    };
  }
  if (toolKey === "cv") {
    return {
      name: profile.name || "",
      latinName: profile.latinName || profile.englishName || "",
      email: profile.email || "",
      phone: profile.phone || (/^[^@]+@/.test(profile.contact || "") ? "" : profile.contact || ""),
      currentCity: profile.currentCity || "",
      citizenship: profile.citizenship || "",
      education: [profile.school, profile.major, profile.degree, profile.gpa, profile.courses].filter(Boolean).join("，"),
      tests: profile.language || "",
      professionalExperience: profile.internships || profile.experience || "",
      researchProjects: [profile.projects, profile.thesisTopic].filter(Boolean).join("\n"),
      skills: profile.skills || ""
    };
  }
  return {};
}

function withValues(tool, form) {
  return tool.sections.map((section) => ({
    ...section,
    fields: section.fields.map((field) => ({
      ...field,
      value: form[field.key] || ""
    }))
  }));
}

function flattenFields(sections) {
  return sections.reduce((acc, section) => acc.concat(section.fields || []), []);
}

function countFilled(sections) {
  return flattenFields(sections).filter((field) => clean(field.value)).length;
}

function missingRequired(tool, form) {
  return flattenFields(tool.sections).filter((field) => field.required && !clean(form[field.key])).map((field) => field.label);
}

function hasChineseInput(form) {
  return Object.values(form || {}).some((value) => /[\u3400-\u9fff]/.test(clean(value)));
}

function buildDocumentTitle(toolKey, language) {
  if (toolKey === "cv") return language === "en" ? "Curriculum Vitae" : "Lebenslauf";
  return language === "en" ? "Motivation Letter" : "Motivationsschreiben";
}

function buildDocumentFileBase(toolKey, language) {
  const suffix = language === "en" ? "en" : "de";
  return `${toolKey}-liude-${suffix}`;
}

function buildMotivationDraft(form, language = "de") {
  const isEnglish = language === "en";
  const plan = clean(form.furtherStudyPlan) || clean(form.careerPlan);
  if (isEnglish) {
    return [
      "MOTIVATION LETTER",
      `Generated: ${formatDocumentTimestamp(new Date(), "en")}`,
      draftNotice("en"),
      "",
      `Applicant: ${clean(form.name)}`,
      `Application level: ${clean(form.applicationLevel)}`,
      `Target university / programme: ${clean(form.targetProgram)}`,
      `Programme-specific requirements: ${clean(form.schoolRequirements)}`,
      "",
      "Dear Admissions Committee,",
      "",
      `My current academic background is: ${clean(form.schoolMajor)}. I am applying for ${clean(
        form.targetProgram
      )} in order to deepen the theoretical, methodological and practical skills that connect my previous studies with the target field.`,
      "",
      `My interest in studying in Germany developed from the following background: ${clean(
        form.germanyOrigin
      )}. My understanding of the field and its professional environment in Germany is: ${clean(
        form.germanyMajorUnderstanding
      )}. I also value the following aspects of the German higher-education system: ${clean(form.germanEducationUnderstanding)}.`,
      "",
      `Within the programme, I am particularly interested in: ${clean(form.interestedDirections)}. Relevant preparation from my previous studies includes: ${clean(
        form.relevantCourses
      )}. I have applied this knowledge in the following projects, internships or professional activities: ${clean(form.projectsInternships)}.`,
      "",
      `After graduation, I plan to: ${plan}. The programme will help me strengthen my subject knowledge, intercultural communication and ability to solve practical problems in an international environment.`,
      "",
      "Yours faithfully,",
      clean(form.name)
    ].join("\n");
  }
  return [
    "MOTIVATIONSSCHREIBEN",
    `Erstellt am: ${formatDocumentTimestamp(new Date(), "de")}`,
    draftNotice("de"),
    "",
    `Bewerber/in: ${clean(form.name)}`,
    `Bewerbungsniveau: ${clean(form.applicationLevel)}`,
    `Zielhochschule / Studiengang: ${clean(form.targetProgram)}`,
    `Studiengangsspezifische Anforderungen: ${clean(form.schoolRequirements)}`,
    "",
    "Sehr geehrte Damen und Herren,",
    "",
    `Mein bisheriger akademischer Hintergrund ist: ${clean(form.schoolMajor)}. Ich bewerbe mich für ${clean(
      form.targetProgram
    )}, um die theoretischen, methodischen und praktischen Kompetenzen zu vertiefen, die mein bisheriges Studium mit dem angestrebten Fachgebiet verbinden.`,
    "",
    `Mein Interesse an einem Studium in Deutschland entstand aus folgendem Hintergrund: ${clean(
      form.germanyOrigin
    )}. Mein Verständnis des Fachgebiets und seines beruflichen Umfelds in Deutschland ist: ${clean(
      form.germanyMajorUnderstanding
    )}. Am deutschen Hochschulsystem schätze ich insbesondere: ${clean(form.germanEducationUnderstanding)}.`,
    "",
    `Im Studium interessiere ich mich besonders für: ${clean(form.interestedDirections)}. Relevante fachliche Grundlagen aus meinem bisherigen Studium sind: ${clean(
      form.relevantCourses
    )}. Dieses Wissen habe ich in folgenden Projekten, Praktika oder beruflichen Tätigkeiten angewendet: ${clean(form.projectsInternships)}.`,
    "",
    `Nach dem Abschluss plane ich: ${plan}. Der Studiengang soll mir helfen, meine Fachkenntnisse, meine interkulturelle Kommunikation und meine Fähigkeit zur Lösung praktischer Probleme in einem internationalen Umfeld weiterzuentwickeln.`,
    "",
    "Mit freundlichen Grüßen",
    clean(form.name)
  ].join("\n");
}

function buildCvDraft(form, language = "de") {
  const isEnglish = language === "en";
  const optionalLine = (heading, value) => (clean(value) ? [heading, clean(value), ""] : []);
  if (isEnglish) {
    return [
      "CURRICULUM VITAE",
      `Generated: ${formatDocumentTimestamp(new Date(), "en")}`,
      draftNotice("en"),
      "",
      "PERSONAL DETAILS",
      `Name: ${clean(form.name)}`,
      `Email: ${clean(form.email)}`,
      `Phone: ${clean(form.phone)}`,
      `Current city: ${clean(form.currentCity)}`,
      `Citizenship: ${clean(form.citizenship)}`,
      `Date and place of birth: ${clean(form.birthInfo)}`,
      "",
      "EDUCATION",
      clean(form.education),
      "",
      ...optionalLine("EXCHANGE / SUMMER SCHOOL", form.exchange),
      "LANGUAGES AND STANDARDISED TESTS",
      clean(form.tests) || "No completed test stated.",
      "",
      "PROFESSIONAL EXPERIENCE",
      clean(form.professionalExperience),
      "",
      "RESEARCH, PROJECTS AND THESIS",
      clean(form.researchProjects),
      "",
      ...optionalLine("PUBLICATIONS", form.publications),
      ...optionalLine("HONOURS AND AWARDS", form.honors),
      ...optionalLine("EXTRACURRICULAR ACTIVITIES", form.activities),
      "SKILLS, CERTIFICATES AND INTERESTS",
      clean(form.skills)
    ].join("\n");
  }
  return [
    "LEBENSLAUF",
    `Erstellt am: ${formatDocumentTimestamp(new Date(), "de")}`,
    draftNotice("de"),
    "",
    "PERSÖNLICHE DATEN",
    `Name: ${clean(form.name)}`,
    `E-Mail: ${clean(form.email)}`,
    `Telefon: ${clean(form.phone)}`,
    `Wohnort: ${clean(form.currentCity)}`,
    `Staatsangehörigkeit: ${clean(form.citizenship)}`,
    `Geburtsdatum und -ort: ${clean(form.birthInfo)}`,
    "",
    "AUSBILDUNG",
    clean(form.education),
    "",
    ...optionalLine("AUSLANDS- / SOMMERSCHULERFAHRUNG", form.exchange),
    "SPRACHKENNTNISSE UND STANDARDISIERTE TESTS",
    clean(form.tests) || "Keine abgeschlossene Prüfung angegeben.",
    "",
    "BERUFS- UND PRAKTIKUMSERFAHRUNG",
    clean(form.professionalExperience),
    "",
    "FORSCHUNG, PROJEKTE UND ABSCHLUSSARBEIT",
    clean(form.researchProjects),
    "",
    ...optionalLine("PUBLIKATIONEN", form.publications),
    ...optionalLine("AUSZEICHNUNGEN", form.honors),
    ...optionalLine("AUSSERUNIVERSITÄRES ENGAGEMENT", form.activities),
    "KENNTNISSE, ZERTIFIKATE UND INTERESSEN",
    clean(form.skills)
  ].join("\n");
}

function buildDraft(toolKey, form, language = "de") {
  if (toolKey === "cv") return buildCvDraft(form, language);
  return buildMotivationDraft(form, language);
}

function buildPreviewDraft(draft, allowed, language = "de") {
  if (!draft || allowed) return draft || "";
  const previewLength = Math.max(Math.ceil(draft.length / 5), 180);
  const ending =
    language === "en"
      ? "— Preview ends here —\nFull access is required to view and export the complete Word or watermarked PDF."
      : "— Ende der Vorschau —\nFür die vollständige Word- oder PDF-Ausgabe ist die Freischaltung erforderlich.";
  return `${draft.slice(0, previewLength)}\n\n${ending}`;
}

function buildQuestionnairePlainText(tool, sections) {
  const lines = [
    `${tool.title}填写内容`,
    `生成时间：${formatLocalTimestamp()}`,
    "说明：本文件用于核对学生填写内容，不是可直接提交的正式申请文书。",
    ""
  ];
  sections.forEach((section) => {
    lines.push(section.title);
    (section.fields || []).forEach((field) => {
      lines.push(`${field.label}：${clean(field.value) || "未填写"}`);
    });
    lines.push("");
  });
  return lines.join("\n");
}

function writeAndOpenDocument(result, fallbackName, fileType) {
  return new Promise((resolve, reject) => {
    const fs = wx.getFileSystemManager();
    const extension = fileType === "docx" ? "docx" : "pdf";
    const safeName = String(result.fileName || fallbackName || `liude-document.${extension}`).replace(/[\\/:*?"<>|]/g, "_");
    const filePath = `${wx.env.USER_DATA_PATH}/${new RegExp(`\\.${extension}$`, "i").test(safeName) ? safeName : `${safeName}.${extension}`}`;
    fs.writeFile({
      filePath,
      data: result.contentBase64,
      encoding: "base64",
      success: () => {
        wx.openDocument({
          filePath,
          fileType: extension,
          showMenu: true,
          success: resolve,
          fail: reject
        });
      },
      fail: reject
    });
  });
}

Page({
  data: {
    tools: TOOL_DEFS,
    activeTool: TOOL_DEFS[0],
    activeSections: [],
    form: {},
    draft: "",
    displayDraft: "",
    draftLocked: false,
    materialAccessAllowed: false,
    materialAccessMessage: "正在确认文书下载状态。",
    generatingDraft: false,
    draftProgress: 0,
    draftProgressText: "",
    filledCount: 0,
    totalFields: 0,
    completion: 0,
    outputLanguage: "de",
    pageLimit: 2,
    experienceData: {},
    showExperience: false,
    languageOptions: [
      { key: "de", label: "Deutsch", note: "德语结构稿" },
      { key: "en", label: "English", note: "英语结构稿" }
    ],
    languageReviewMessage: ""
  },

  onLoad(options) {
    this.setActiveTool(options.tool || "motivation");
    if (!getApp().globalData.token) { this.setData({ materialAccessAllowed: true, materialAccessMessage: "可先浏览表单；保存个人资料、生成和导出时再自愿登录。" }); return; }
    api
      .checkMaterialAccess()
      .then((result) => {
        this.setData({
          materialAccessAllowed: Boolean(result.allowed !== false),
          materialAccessMessage: result.message || "当前账号可生成并下载德语/英语动机信与留德简历。"
        });
        this.refresh(this.data.activeTool, this.data.form, this.data.draft);
      })
      .catch(() => {
        this.setData({ materialAccessAllowed: false, materialAccessMessage: "服务暂未连接，请稍后重试，不代表需要付费。" });
        this.refresh(this.data.activeTool, this.data.form, this.data.draft);
      });
  },

  onUnload() {
    progress.stop(this, "draftProgressTimer");
    if (this.draftDelayTimer) {
      clearTimeout(this.draftDelayTimer);
      this.draftDelayTimer = null;
    }
  },

  onShow() {
    if (!getApp().globalData.token) return;
    api.checkMaterialAccess().then((result) => { this.setData({ materialAccessAllowed: result.allowed !== false, materialAccessMessage: result.message || "生成与导出可用" }); this.refresh(this.data.activeTool, this.data.form, this.data.draft); }).catch(() => {});
    const value = experience.load();
    if (Object.keys(value).length && JSON.stringify(value) !== JSON.stringify(this.data.experienceData)) this.applyExperience({ detail: { value } });
  },

  toggleExperience() { this.setData({ showExperience: !this.data.showExperience }); },
  applyExperience(event) {
    const value = event.detail.value;
    this.setData({ experienceData: value });
    const reusable = experience.toForm(value, this.data.outputLanguage);
    const form = { ...this.data.form, ...(this.data.activeTool.key === "cv" ? reusable : { projectsInternships: [reusable.researchProjects, reusable.professionalExperience].filter(Boolean).join("\n") || this.data.form.projectsInternships }) };
    this.refresh(this.data.activeTool, form, "");
    this.persistCurrent(form, "");
  },
  changePageLimit(event) {
    const pageLimit = Number(event.detail.value) === 0 ? 1 : 2;
    this.setData({ pageLimit });
    this.refresh(this.data.activeTool, { ...this.data.form, pageLimit }, "");
    this.persistCurrent();
  },

  setActive(event) {
    this.persistCurrent();
    this.setActiveTool(event.currentTarget.dataset.key);
  },

  selectLanguage(event) {
    const outputLanguage = event.currentTarget.dataset.language === "en" ? "en" : "de";
    const reusable = experience.toForm(this.data.experienceData || {}, outputLanguage);
    const form = this.data.activeTool.key === "cv" ? { ...this.data.form, ...reusable } : this.data.form;
    this.refresh(this.data.activeTool, form, "", outputLanguage);
    this.persistCurrent(this.data.form, "");
    return true;
  },

  setActiveTool(key) {
    const activeTool = findTool(key);
    const saved = getApp().globalData.token ? wx.getStorageSync(storageKey(activeTool.key)) || {} : {};
    const savedForm = { ...(saved.form || {}) };
    delete savedForm.citizenshipPassport;
    delete savedForm.emergencyContact;
    const shared = getApp().globalData.token ? wx.getStorageSync(env.scopedKey("liude-shared-personal-v1")) || {} : {};
    const form = { ...prefillForm(activeTool.key), ...shared, ...Object.fromEntries(Object.entries(savedForm).filter(([, value]) => value !== "")) };
    const experienceData = experience.load();
    if (activeTool.key === "cv") Object.assign(form, experience.toForm(experienceData, saved.outputLanguage === "en" ? "en" : "de"));
    this.setData({ experienceData, pageLimit: Number(form.pageLimit) === 1 ? 1 : 2 });
    const draft = saved.schemaVersion === TOOL_SCHEMA_VERSION ? saved.draft || "" : "";
    const outputLanguage = saved.outputLanguage === "en" ? "en" : "de";
    this.refresh(activeTool, form, draft, outputLanguage);
  },

  refresh(activeTool, form, draft, outputLanguage = this.data.outputLanguage) {
    const activeSections = withValues(activeTool, form);
    const totalFields = flattenFields(activeSections).length;
    const filledCount = countFilled(activeSections);
    const displayDraft = buildPreviewDraft(draft, this.data.materialAccessAllowed, outputLanguage);
    const languageReviewMessage = hasChineseInput(form)
      ? "可直接使用中文填写：系统在本地按填写内容整理结构，不会调用外部翻译平台；不能完整翻译的内容会明确标记待补全。可填写目标语言原文或请文书老师翻译。"
      : "当前填写内容会按所选语言生成；正式提交前仍需核对专有名词、项目要求和全部事实。";
    this.setData({
      activeTool,
      activeSections,
      form,
      draft,
      outputLanguage,
      displayDraft,
      draftParagraphs: displayDraft.split(/\n\s*\n/).filter(Boolean),
      draftLocked: Boolean(draft && !this.data.materialAccessAllowed),
      totalFields,
      filledCount,
      completion: totalFields ? Math.round((filledCount / totalFields) * 100) : 0,
      languageReviewMessage
    });
  },

  updateField(event) {
    const key = event.currentTarget.dataset.key;
    const form = {
      ...this.data.form,
      [key]: event.detail.value
    };
    this.refresh(this.data.activeTool, form, "");
    this.persistCurrent(form, "");
  },

  persistCurrent(form = this.data.form, draft = this.data.draft) {
    if (!getApp().globalData.token) return;
    const keys = ["name", "latinName", "phone", "email", "currentCity", "citizenship", "birthInfo"];
    const shared = wx.getStorageSync(env.scopedKey("liude-shared-personal-v1")) || {};
    keys.forEach((key) => { if (form[key]) shared[key] = form[key]; });
    wx.setStorageSync(env.scopedKey("liude-shared-personal-v1"), shared);
    wx.setStorageSync(storageKey(this.data.activeTool.key), {
      schemaVersion: TOOL_SCHEMA_VERSION,
      outputLanguage: this.data.outputLanguage,
      form,
      draft
    });
  },

  saveForm() {
    if (!api.ensureLogin()) return;
    this.persistCurrent();
    wx.showToast({ title: "已保存", icon: "success" });
  },

  validateRequiredFields() {
    if (!api.ensureLogin()) return false;
    if (this.data.activeTool.key === "cv") {
      const errors = experience.validate(this.data.experienceData);
      if (errors.length) { wx.showModal({ title: "请核对经历时间", content: errors.join("\n"), showCancel: false }); return false; }
    }
    const missing = missingRequired(this.data.activeTool, this.data.form);
    if (!missing.length) return true;
    wx.showModal({
      title: "请先补全必填信息",
      content: `以下带 * 的内容尚未填写：${missing.join("、")}。补全后才能生成或导出文书。`,
      showCancel: false
    });
    return false;
  },

  requestForeignDraft() {
    return api
      .generateMaterialDraft({
        toolKey: this.data.activeTool.key,
        language: this.data.outputLanguage,
        form: this.data.form
      })
      .then((result) => {
        const draft = clean(result && result.draft);
        if (!draft || result.foreignLanguageReady === false || /[\u3400-\u9fff]/.test(draft)) {
          throw new Error("目标语言初稿未通过完整性检查，请稍后重试或联系文书老师。");
        }
        this.setData({ generationReview: result.reviewMessage || "", translationComplete: result.translationComplete !== false });
        this.refresh(this.data.activeTool, this.data.form, draft);
        this.persistCurrent(this.data.form, draft);
        return draft;
      });
  },

  generateDraft() {
    if (this.data.generatingDraft) return;
    if (!this.validateRequiredFields()) return;
    this.setData({ generatingDraft: true });
    progress.start(this, {
      timerKey: "draftProgressTimer",
      progressKey: "draftProgress",
      textKey: "draftProgressText",
      from: 20,
      cap: 88,
      step: 10,
      interval: 220,
      text: "正在按你填写的事实整理结构，无法翻译的部分会标记待补全。"
    });
    this.requestForeignDraft()
      .then(() => {
        progress.finish(this, {
          timerKey: "draftProgressTimer",
          progressKey: "draftProgress",
          textKey: "draftProgressText",
          text: "结构初稿已生成，请核对翻译提示及全部事实。"
        });
        wx.showToast({ title: "已生成", icon: "success" });
      })
      .catch((error) => wx.showToast({ title: error.message || "初稿生成失败", icon: "none" }))
      .finally(() => {
        this.setData({ generatingDraft: false });
        progress.reset(this, {
          timerKey: "draftProgressTimer",
          progressKey: "draftProgress",
          textKey: "draftProgressText"
        });
      });
  },

  copyDraft() {
    if (!this.validateRequiredFields()) return;
    wx.showLoading({ title: "生成中", mask: true });
    this.requestForeignDraft()
      .then((draft) => {
        const data = buildPreviewDraft(draft, this.data.materialAccessAllowed, this.data.outputLanguage);
        return new Promise((resolve, reject) => wx.setClipboardData({ data, success: resolve, fail: reject }));
      })
      .then(() => {
        if (!this.data.materialAccessAllowed) {
          wx.showModal({
            title: "当前为预览内容",
            content: "收费/开通后可查看完整内容，并导出 Word 或水印 PDF。",
            showCancel: false
          });
        }
      })
      .catch((error) => wx.showToast({ title: error.message || "复制失败", icon: "none" }))
      .finally(() => wx.hideLoading());
  },

  goMessages() {
    wx.navigateTo({ url: "/pages/messages/messages" });
  },

  exportQuestionnairePdf() {
    if (!api.ensureLogin()) return;
    this.persistCurrent();
    api
      .exportDocumentPdf({
        kind: "questionnaire",
        toolKey: this.data.activeTool.key,
        language: "zh",
        title: `${this.data.activeTool.title}填写内容`,
        fileName: `${this.data.activeTool.key}-questionnaire-liude-watermark.pdf`,
        content: buildQuestionnairePlainText(this.data.activeTool, this.data.activeSections)
      })
      .then((result) => writeAndOpenDocument(result, `${this.data.activeTool.key}-questionnaire.pdf`, "pdf"))
      .catch((error) => wx.showToast({ title: error.message || "PDF 导出失败", icon: "none" }));
  },

  exportWord() {
    if (!this.validateRequiredFields()) return;
    const fileBase = buildDocumentFileBase(this.data.activeTool.key, this.data.outputLanguage);
    wx.showLoading({ title: "生成 Word", mask: true });
    this.requestForeignDraft()
      .then((draft) =>
        api.exportDocumentWord({
          kind: "draft",
          toolKey: this.data.activeTool.key,
          language: this.data.outputLanguage,
          title: buildDocumentTitle(this.data.activeTool.key, this.data.outputLanguage),
          fileName: `${fileBase}.docx`,
          content: draft,
          form: this.data.form
        })
      )
      .then((result) =>
        writeAndOpenDocument(result, `${fileBase}.docx`, "docx").then(() => {
          if (result.preview) {
            wx.showModal({
              title: "已导出付费前预览",
              content: "Word 仅包含完整内容前 20%。开通后可导出完整版本。",
              showCancel: false
            });
          }
        })
      )
      .catch((error) => wx.showToast({ title: error.message || "Word 导出失败", icon: "none" }))
      .finally(() => wx.hideLoading());
  },

  exportPdf() {
    if (!this.validateRequiredFields()) return;
    const fileBase = buildDocumentFileBase(this.data.activeTool.key, this.data.outputLanguage);
    wx.showLoading({ title: "生成 PDF", mask: true });
    this.requestForeignDraft()
      .then((draft) =>
        api.exportDocumentPdf({
          kind: "draft",
          toolKey: this.data.activeTool.key,
          language: this.data.outputLanguage,
          title: buildDocumentTitle(this.data.activeTool.key, this.data.outputLanguage),
          fileName: `${fileBase}-watermark.pdf`,
          content: draft,
          form: this.data.form
        })
      )
      .then((result) =>
        writeAndOpenDocument(result, `${fileBase}-watermark.pdf`, "pdf").then(() => {
          if (result.preview) {
            wx.showModal({
              title: "已导出付费前预览",
              content: "PDF 已加水印，并仅包含完整内容前 20%。开通后可导出完整水印版。",
              showCancel: false
            });
          }
        })
      )
      .catch((error) => wx.showToast({ title: error.message || "PDF 导出失败", icon: "none" }))
      .finally(() => wx.hideLoading());
  },

  clearForm() {
    wx.showModal({
      title: "清空填写内容",
      content: "确认清空当前模块已填写内容？",
      success: (result) => {
        if (!result.confirm) return;
        const form = prefillForm(this.data.activeTool.key);
        wx.removeStorageSync(storageKey(this.data.activeTool.key));
        this.refresh(this.data.activeTool, form, "");
      }
    });
  }
});
