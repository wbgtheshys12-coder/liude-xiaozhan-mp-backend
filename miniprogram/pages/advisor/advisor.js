const api = require("../../utils/api");
const experience = require("../../utils/experience");
const env = require("../../utils/env");
const progress = require("../../utils/progress");
const studentProfile = require("../../utils/profile");

function defaultProfile() {
  return {
    name: "",
    school: "",
    degree: "",
    major: "",
    gpa: "",
    language: "",
    targetDegree: "硕士",
    instructionLanguage: "",
    studentStatus: "",
    chinaEducation: "是",
    targetField: "",
    cityPreference: "",
    statePreference: "",
    budget: "",
    experience: "",
    courses: "",
    thesisTopic: "",
    projects: "",
    internships: "",
    careerPlan: "",
    targetSchoolRequirements: "",
    notes: ""
  };
}

const FORM_STEPS = ["基础背景", "院校目标", "课程经历", "课程信息", "生成推荐"];
const CITY_OPTIONS = ["Munich", "Berlin", "Stuttgart", "Karlsruhe", "Dresden", "Aachen", "Cologne", "Mannheim"];
const STATE_OPTIONS = [
  { value: "Bavaria", label: "巴伐利亚" },
  { value: "Baden-Wuerttemberg", label: "巴登-符腾堡" },
  { value: "Berlin", label: "柏林" },
  { value: "North Rhine-Westphalia", label: "北威州" },
  { value: "Hesse", label: "黑森" },
  { value: "Saxony", label: "萨克森" },
  { value: "Lower Saxony", label: "下萨克森" }
];
const EDUCATION_STATUS_OPTIONS = [
  { label: "本科在读（尚未毕业）", degree: "本科", status: "在读" },
  { label: "本科已毕业", degree: "本科", status: "已毕业" },
  { label: "硕士在读（尚未毕业）", degree: "硕士", status: "在读" },
  { label: "硕士已毕业", degree: "硕士", status: "已毕业" },
  { label: "其他学历 / 状态", degree: "其他", status: "其他" }
];
const TARGET_DEGREE_OPTIONS = ["本科", "硕士", "博士"];
const CHINA_EDUCATION_OPTIONS = ["是", "否", "不确定"];
const INSTRUCTION_LANGUAGE_OPTIONS = ["德语授课", "英语授课", "英德均可"];
const LANGUAGE_TEST_TYPES = [
  { type: "IELTS", placeholder: "例如 7.0（L7.5 / R7 / W6.5 / S6.5）" },
  { type: "TOEFL iBT", placeholder: "例如 95" },
  { type: "TestDaF", placeholder: "例如 4×4" },
  { type: "DSH", placeholder: "例如 DSH-2" },
  { type: "telc C1 Hochschule", placeholder: "例如 bestanden" },
  { type: "Goethe-Zertifikat", placeholder: "例如 C1" },
  { type: "CET-6", placeholder: "例如 520" },
  { type: "GRE", placeholder: "例如 320 + 4.0" },
  { type: "GMAT", placeholder: "例如 680" }
];

const DEFAULT_FILE_HINT = "成绩单为可选项，支持照片或 PDF；重点课程也可按需填写。";
const EMPTY_TRANSCRIPT_ROW = { course: "", grade: "", credits: "", term: "", note: "" };

function createTranscriptRow(row = {}) {
  return {
    id: `tr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    ...EMPTY_TRANSCRIPT_ROW,
    ...row
  };
}

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function splitPreference(value) {
  return String(value || "")
    .split(/[、，,\/]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildLocationState(profile) {
  const selectedCities = splitPreference(profile.cityPreference).filter((city) => CITY_OPTIONS.includes(city));
  const selectedStates = splitPreference(profile.statePreference).filter((state) => STATE_OPTIONS.some((item) => item.value === state));
  return {
    selectedCities,
    selectedStates,
    cityOptions: CITY_OPTIONS.map((value) => ({ value, selected: selectedCities.includes(value) })),
    stateOptions: STATE_OPTIONS.map((item) => ({ ...item, selected: selectedStates.includes(item.value) }))
  };
}

function findOptionIndex(options, value, fallback = 0) {
  const index = options.indexOf(String(value || "").trim());
  return index >= 0 ? index : fallback;
}

function findEducationStatusIndex(profile) {
  const degree = cleanText(profile.degree);
  const status = cleanText(profile.studentStatus);
  const index = EDUCATION_STATUS_OPTIONS.findIndex(
    (item) => degree.includes(item.degree) && status.includes(item.status)
  );
  if (index >= 0) return index;
  if (degree.includes("本科") && /毕业/.test(degree)) return 1;
  if (degree.includes("本科")) return 0;
  if (degree.includes("硕士") && /毕业/.test(degree)) return 3;
  if (degree.includes("硕士")) return 2;
  return 0;
}

function buildLanguageTestOptions(languageText) {
  const source = cleanText(languageText);
  return LANGUAGE_TEST_TYPES.map((item) => {
    const escaped = item.type.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = source.match(new RegExp(`${escaped}\\s*[:：]?\\s*([^；;、,]*)`, "i"));
    return {
      ...item,
      selected: Boolean(match),
      score: match ? cleanText(match[1]) : ""
    };
  });
}

function serializeLanguageTests(options) {
  return (options || [])
    .filter((item) => item.selected)
    .map((item) => `${item.type}${cleanText(item.score) ? `: ${cleanText(item.score)}` : ""}`)
    .join("；");
}

function buildSelectionState(profile) {
  return {
    educationStatusOptions: EDUCATION_STATUS_OPTIONS,
    educationStatusIndex: findEducationStatusIndex(profile),
    targetDegreeOptions: TARGET_DEGREE_OPTIONS,
    targetDegreeIndex: findOptionIndex(TARGET_DEGREE_OPTIONS, profile.targetDegree, 1),
    chinaEducationOptions: CHINA_EDUCATION_OPTIONS,
    chinaEducationIndex: findOptionIndex(CHINA_EDUCATION_OPTIONS, profile.chinaEducation, 0),
    instructionLanguageOptions: INSTRUCTION_LANGUAGE_OPTIONS,
    instructionLanguageIndex: findOptionIndex(INSTRUCTION_LANGUAGE_OPTIONS, profile.instructionLanguage, 2),
    languageTestOptions: buildLanguageTestOptions(profile.language)
  };
}

function buildCountOptions(entitlements) {
  const paidEnabled = Boolean(entitlements?.recommendationCount);
  const freeCounts = env.FREE_RECOMMENDATION_COUNTS || [1];
  return [1, 3, 6, 10].map((value) => ({
    value,
    label: freeCounts.includes(value) ? `${value} 所` : `${value} 所 待开发`,
    locked: !freeCounts.includes(value) && !paidEnabled
    }));
}

function formatFileSize(size) {
  const bytes = Number(size || 0);
  if (!bytes) return "大小未知";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function decorateFiles(files) {
  const now = Date.now();
  return (files || []).map((file, index) => ({
    ...file,
    id: `${now}-${index}-${file.name || "file"}`,
    displaySize: formatFileSize(file.size)
  }));
}

function buildFileHint(files) {
  if (!files.length) return DEFAULT_FILE_HINT;
  return `已选择 ${files.length} 个文件，可单独删除后重新上传。`;
}

function splitCourseSeeds(value) {
  return cleanText(value)
    .split(/[、，,;；\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 8);
}

function buildTranscriptRows(profile, files) {
  const seeds = splitCourseSeeds(profile.courses);
  const rows = seeds.map((course) => createTranscriptRow({
    course,
    note: "来自课程关键词，请核对成绩和学分"
  }));

  if (profile.gpa) {
    rows.unshift(createTranscriptRow({
      course: "综合成绩 / GPA",
      grade: profile.gpa,
      note: "来自基础背景，请确认是否与成绩单一致"
    }));
  }

  if (!rows.length && files.length) {
    rows.push(createTranscriptRow({
      course: "待补充课程",
      note: "请根据成绩单或实际学习经历补充课程、成绩和学分"
    }));
  }

  return rows.length ? rows : [createTranscriptRow()];
}

function normalizePreviewTranscriptRows(rows, fallbackRows) {
  const normalized = (Array.isArray(rows) ? rows : [])
    .map((row) =>
      createTranscriptRow({
        course: /^(待校对课程|待补充课程|请补充核心课程)$/.test(cleanText(row.course)) ? "" : cleanText(row.course),
        grade: cleanText(row.grade),
        credits: cleanText(row.credits),
        term: cleanText(row.term),
        note: /^(待校对课程|待补充课程|请补充核心课程)$/.test(cleanText(row.course)) ? "" : cleanText(row.note)
      })
    )
    .filter((row) => cleanText(row.course));
  return normalized.slice(0, 50);
}

function hasTranscriptEvidence(files, rows) {
  // An attachment or placeholder is not a recognized course result.
  return (rows || []).some((row) => {
    const course = cleanText(row.course);
    return course && !/待(?:校对|补充)课程|综合成绩|GPA/i.test(course) && cleanText(row.grade) && Number(row.credits) > 0;
  });
}

function buildTranscriptNote(rows, reviewed) {
  const filledRows = (rows || []).filter((row) => cleanText(row.course) && !/待校对课程|待补充课程|请补充核心课程/.test(row.course));
  if (!filledRows.length) return "";
  const table = filledRows
    .slice(0, 20)
    .map((row, index) => {
      const course = row.course || "未填写课程";
      const grade = row.grade || "成绩待补";
      const credits = row.credits || "学分待补";
      const term = row.term || "学期待补";
      const note = row.note ? `，备注：${row.note}` : "";
      return `${index + 1}. ${course}｜${grade}｜${credits}｜${term}${note}`;
    })
    .join("；");
  return `${reviewed ? "学生已确认课程" : "课程参考信息（含自动整理内容，未经逐项确认）"}：${table}`;
}

function buildSubmissionProfile(profile, files, transcriptRows, transcriptReviewed) {
  const nextProfile = { ...profile };
  const transcriptNote = buildTranscriptNote(transcriptRows, transcriptReviewed);
  if (transcriptNote) {
    nextProfile.notes = cleanText([nextProfile.notes, transcriptNote].filter(Boolean).join("；"));
  }
  if (!files.length && !cleanText(nextProfile.notes) && cleanText(nextProfile.courses)) {
    nextProfile.notes = `课程信息：${cleanText(nextProfile.courses)}`;
  }
  if (!files.length && !cleanText(nextProfile.notes)) {
    nextProfile.notes = "学生资料暂未补全，先根据已填写内容和院校专业数据库生成初步推荐。";
  }
  return nextProfile;
}

Page({
  data: {
    formSteps: FORM_STEPS,
    currentStep: 0,
    showKeyCourses: false,
    profile: defaultProfile(),
    ...buildLocationState(defaultProfile()),
    recommendationCount: 6,
    countOptions: buildCountOptions({}),
    files: [],
    transcriptRows: [],
    transcriptReviewed: false,
    transcriptWarningAccepted: false,
    transcriptPreviewLoading: false,
    transcriptProgress: 0,
    transcriptProgressText: "",
    transcriptPreviewSummary: null,
    transcriptNeedsManualEntry: false,
    showManualMatchForm: false,
    matchQuestionnaireUploading: false,
    fileHint: DEFAULT_FILE_HINT,
    submitting: false,
    submitProgress: 0,
    submitProgressText: "",
    message: "",
    isError: false,
    paywallVisible: false,
    paywallMessage: ""
  },

  onLoad() {
    const app = getApp();
    const session = app.globalData.session || wx.getStorageSync(env.STORAGE_KEYS.session) || {};
    const storedProfile = app.globalData.latestProfile || studentProfile.getStored();
    const profile = {
      ...defaultProfile(),
      ...storedProfile,
      targetDegree: storedProfile.targetDegree || storedProfile.applicationLevel || "硕士"
    };
    this.setData({
      experienceData: experience.load(),
      countOptions: buildCountOptions(session.entitlements || {}),
      profile,
      ...buildLocationState(profile),
      ...buildSelectionState(profile)
    });
  },

  onExperienceChange(event) {
    const value = event.detail.value, fields = experience.toForm(value);
    this.setData({ experienceData: value, "profile.experience": [fields.professionalExperience, fields.researchProjects, fields.activities].filter(Boolean).join("\n"), "profile.projects": fields.researchProjects || this.data.profile.projects, "profile.internships": fields.professionalExperience || this.data.profile.internships });
  },

  onUnload() {
    progress.stop(this, "transcriptProgressTimer");
    progress.stop(this, "submitProgressTimer");
  },

  onFieldInput(event) {
    const field = event.currentTarget.dataset.field;
    const transcriptFields = ["major", "gpa", "courses", "targetField", "experience"];
    this.setData({
      [`profile.${field}`]: event.detail.value,
      ...(transcriptFields.includes(field) ? { transcriptReviewed: false, transcriptWarningAccepted: false } : {})
    });
  },

  onEducationStatusChange(event) {
    const index = Number(event.detail.value);
    const selected = EDUCATION_STATUS_OPTIONS[index] || EDUCATION_STATUS_OPTIONS[0];
    this.setData({
      educationStatusIndex: index,
      "profile.degree": selected.degree,
      "profile.studentStatus": selected.status
    });
  },

  onTargetDegreeChange(event) {
    const index = Number(event.detail.value);
    this.setData({
      targetDegreeIndex: index,
      "profile.targetDegree": TARGET_DEGREE_OPTIONS[index] || TARGET_DEGREE_OPTIONS[1]
    });
  },

  onChinaEducationChange(event) {
    const index = Number(event.detail.value);
    this.setData({
      chinaEducationIndex: index,
      "profile.chinaEducation": CHINA_EDUCATION_OPTIONS[index] || CHINA_EDUCATION_OPTIONS[0]
    });
  },

  onInstructionLanguageChange(event) {
    const index = Number(event.detail.value);
    this.setData({
      instructionLanguageIndex: index,
      "profile.instructionLanguage": INSTRUCTION_LANGUAGE_OPTIONS[index] || INSTRUCTION_LANGUAGE_OPTIONS[2]
    });
  },

  toggleLanguageTest(event) {
    const index = Number(event.currentTarget.dataset.index);
    const languageTestOptions = this.data.languageTestOptions.map((item, itemIndex) =>
      itemIndex === index ? { ...item, selected: !item.selected } : item
    );
    this.setData({
      languageTestOptions,
      "profile.language": serializeLanguageTests(languageTestOptions)
    });
  },

  onLanguageScoreInput(event) {
    const index = Number(event.currentTarget.dataset.index);
    const languageTestOptions = this.data.languageTestOptions.map((item, itemIndex) =>
      itemIndex === index ? { ...item, selected: true, score: event.detail.value } : item
    );
    this.setData({
      languageTestOptions,
      "profile.language": serializeLanguageTests(languageTestOptions)
    });
  },

  goStep(event) {
    this.setData({ currentStep: Number(event.currentTarget.dataset.index) });
  },

  nextStep() {
    this.setData({ currentStep: Math.min(FORM_STEPS.length - 1, this.data.currentStep + 1) });
  },

  toggleKeyCourses() {
    this.setData({ showKeyCourses: !this.data.showKeyCourses });
  },

  prevStep() {
    this.setData({ currentStep: Math.max(0, this.data.currentStep - 1) });
  },

  toggleCity(event) {
    const value = event.currentTarget.dataset.value;
    const selectedCities = this.data.selectedCities.includes(value)
      ? this.data.selectedCities.filter((item) => item !== value)
      : [...this.data.selectedCities, value];
    const cityOptions = this.data.cityOptions.map((item) => ({ ...item, selected: selectedCities.includes(item.value) }));
    this.setData({
      selectedCities,
      cityOptions,
      "profile.cityPreference": selectedCities.join("、")
    });
  },

  toggleState(event) {
    const value = event.currentTarget.dataset.value;
    const selectedStates = this.data.selectedStates.includes(value)
      ? this.data.selectedStates.filter((item) => item !== value)
      : [...this.data.selectedStates, value];
    const stateOptions = this.data.stateOptions.map((item) => ({ ...item, selected: selectedStates.includes(item.value) }));
    this.setData({
      selectedStates,
      stateOptions,
      "profile.statePreference": selectedStates.join("、")
    });
  },

  setRecommendationCount(event) {
    const value = Number(event.currentTarget.dataset.value);
    const locked = event.currentTarget.dataset.locked;
    if (locked === true || locked === "true") {
      this.showPaywall("10 所推荐与收费权益正在开发中，当前请使用已开放的 6 所推荐。");
      return;
    }
    this.setData({ recommendationCount: value });
  },

  showPaywall(message) {
    this.setData({
      paywallVisible: true,
      paywallMessage: message
    });
  },

  closePaywall() {
    this.setData({ paywallVisible: false });
  },

  chooseFiles() {
    if (!api.ensureLogin()) return;
    api
      .chooseTranscriptFiles()
      .then(async (files) => {
        if (!files.length) return;
        for (const file of files) {
          if (!file.materialId) {
            if (Number(file.size || 0) > 12 * 1024 * 1024) throw new Error("为便于保存到资料库，请将单个成绩单控制在12MB以内。");
            const result = await api.uploadStudentMaterial({ file, category: "成绩单", usage: "院校匹配及老师复核", studentName: this.data.profile.name || "", trainingConsent: false });
            file.materialId = result.record.id;
          }
        }
        const mergedFiles = [...this.data.files, ...files].slice(0, 3);
        const selectedFiles = decorateFiles(mergedFiles);
        const transcriptRows = this.data.transcriptRows.length
          ? this.data.transcriptRows
          : buildTranscriptRows(this.data.profile, selectedFiles);
        this.setData({
          files: selectedFiles,
          transcriptRows,
          transcriptReviewed: false,
          transcriptWarningAccepted: false,
          transcriptPreviewLoading: true,
          transcriptPreviewSummary: null,
          transcriptNeedsManualEntry: false,
          fileHint:
            this.data.files.length + files.length > 3
              ? "最多保留 3 个文件，已自动保留前 3 个。"
              : "文件已加入。重点课程为选填项，可直接进入下一步。",
          message: "成绩单已加入，正在整理课程、成绩和学分...",
          isError: false
        });
        progress.start(this, {
          timerKey: "transcriptProgressTimer",
          progressKey: "transcriptProgress",
          textKey: "transcriptProgressText",
          from: 12,
          cap: 90,
          step: 5,
          text: "正在上传文件、增强图片/PDF，并提取课程、成绩和学分。"
        });
        this.previewTranscriptRows(selectedFiles, transcriptRows);
      })
      .catch((error) => {
        const isTooLarge = /18MB|过大/.test(error.message || "");
        this.setData({
          message: isTooLarge ? error.message : "文件选择未完成，请重新选择成绩单图片或 PDF。",
          isError: true
        });
      });
  },

  previewTranscriptRows(files, fallbackRows) {
    const requestId = this.transcriptRequestId = (this.transcriptRequestId || 0) + 1;
    return api
      .previewTranscript({
        files,
        profile: this.data.profile
      })
      .then((result) => {
        if (requestId !== this.transcriptRequestId) return;
        const transcriptRows = normalizePreviewTranscriptRows(result.rows, fallbackRows);
        const summary = result.transcriptSummary || {};
        const extractedScoreText = cleanText(summary.extractedScoreText);
        const extractedMajor = cleanText(summary.extractedMajor);
        const profileUpdates = {};
        if (extractedScoreText && !cleanText(this.data.profile.gpa)) {
          profileUpdates["profile.gpa"] = extractedScoreText;
        }
        if (extractedMajor && !cleanText(this.data.profile.major)) {
          profileUpdates["profile.major"] = extractedMajor;
        }
        const hasRecognizedRows = typeof result.recognizedCourseCount === "number"
          ? result.recognizedCourseCount > 0
          : hasTranscriptEvidence([], transcriptRows);
        progress.finish(this, {
          timerKey: "transcriptProgressTimer",
          progressKey: "transcriptProgress",
          textKey: "transcriptProgressText",
          text: hasRecognizedRows ? "课程信息已整理，请对照原件核对。" : "请补充课程信息，完善匹配依据。"
        });
        this.setData({
          ...profileUpdates,
          transcriptRows,
          transcriptPreviewLoading: false,
          transcriptPreviewSummary: summary,
          transcriptNeedsManualEntry: !hasRecognizedRows,
          message: "",
          isError: false
        });
      })
      .catch((error) => {
        if (requestId !== this.transcriptRequestId) return;
        progress.finish(this, {
          timerKey: "transcriptProgressTimer",
          progressKey: "transcriptProgress",
          textKey: "transcriptProgressText",
          text: "课程表可继续编辑，也可重新整理文件。"
        });
        this.setData({
          transcriptRows: [],
          transcriptPreviewLoading: false,
          transcriptPreviewSummary: {
            confidence: "低",
            summary: "已保留可编辑课程表。补充关键课程，或手动补充课程后即可继续。"
          },
          transcriptNeedsManualEntry: true,
          message: error.statusCode === 413 ? error.message : "",
          isError: error.statusCode === 413
        });
      });
  },

  removeFile(event) {
    const index = Number(event.currentTarget.dataset.index);
    const file = this.data.files[index];
    if (!file) return;
    wx.showModal({
      title: "删除成绩单文件",
      content: `确认从本次匹配移除“${file.name || "已选文件"}”吗？资料库中的原件仍保留，可到学生资料库单独删除。`,
      confirmText: "删除",
      confirmColor: "#d93025",
      success: (res) => {
        if (!res.confirm) return;
        this.transcriptRequestId = (this.transcriptRequestId || 0) + 1;
        const files = this.data.files.filter((_, itemIndex) => itemIndex !== index);
        progress.reset(this, {
          timerKey: "transcriptProgressTimer",
          progressKey: "transcriptProgress",
          textKey: "transcriptProgressText"
        });
        this.setData({
          files,
          transcriptRows: [],
          fileHint: buildFileHint(files),
          transcriptReviewed: false,
          transcriptWarningAccepted: false,
          transcriptPreviewLoading: false,
          transcriptPreviewSummary: files.length ? this.data.transcriptPreviewSummary : null,
          transcriptNeedsManualEntry: files.length ? this.data.transcriptNeedsManualEntry : false,
          message: "",
          isError: false
        });
        if (files.length) {
          this.setData({transcriptPreviewLoading: true});
          this.previewTranscriptRows(files, []);
        }
      }
    });
  },

  rebuildTranscriptRows() {
    this.setData({
      transcriptRows: buildTranscriptRows(this.data.profile, this.data.files),
      transcriptReviewed: false,
      transcriptWarningAccepted: false,
      transcriptPreviewSummary: null,
      transcriptNeedsManualEntry: true,
      message: "已根据当前课程/GPA重新生成表格，请继续核对。",
      isError: false
    });
  },

  toggleManualMatchForm() {
    this.setData({ showManualMatchForm: !this.data.showManualMatchForm });
  },

  uploadMatchQuestionnaire() {
    if (this.data.matchQuestionnaireUploading) return;
    this.setData({ matchQuestionnaireUploading: true, message: "请选择已填写的匹配度调查表。", isError: false });
    api
      .chooseStudentMaterialFiles()
      .then((files) => {
        if (!files.length) return [];
        return Promise.all(
          files.map((file) =>
            api.uploadStudentMaterial({
              category: "匹配度调查表",
              usage: "院校专业匹配补充",
              trainingConsent: false,
              studentName: cleanText(this.data.profile.name),
              file
            })
          )
        );
      })
      .then((records) => {
        if (!records || !records.length) return;
        this.setData({
          showManualMatchForm: true,
          message: `已上传 ${records.length} 份匹配度调查表。请同步填写下方关键课程信息，确保本次推荐可以立即使用。`,
          isError: false
        });
      })
      .catch((error) => this.setData({ message: error.message || "调查表上传未完成，请稍后重试。", isError: true }))
      .finally(() => this.setData({ matchQuestionnaireUploading: false }));
  },

  addTranscriptRow() {
    this.setData({
      transcriptRows: [...this.data.transcriptRows, createTranscriptRow()],
      transcriptReviewed: false,
      transcriptWarningAccepted: false
    });
  },

  removeTranscriptRow(event) {
    const index = Number(event.currentTarget.dataset.index);
    const transcriptRows = this.data.transcriptRows.filter((_, itemIndex) => itemIndex !== index);
    this.setData({
      transcriptRows: transcriptRows.length ? transcriptRows : [createTranscriptRow()],
      transcriptReviewed: false,
      transcriptWarningAccepted: false
    });
  },

  onTranscriptInput(event) {
    const index = Number(event.currentTarget.dataset.index);
    const field = event.currentTarget.dataset.field;
    if (!field || !this.data.transcriptRows[index]) return;
    this.setData({
      [`transcriptRows[${index}].${field}`]: event.detail.value,
      transcriptReviewed: false,
      transcriptWarningAccepted: false
    });
  },

  confirmTranscriptReview() {
    if (this.data.transcriptPreviewLoading) {
      wx.showToast({title: "成绩单仍在识别，请稍候", icon: "none"});
      return;
    }
    if (!hasTranscriptEvidence(this.data.files, this.data.transcriptRows)) {
      wx.showModal({
        title: "补充课程信息",
        content: "目前还没有具体课程信息。系统仍可根据专业、目标方向、城市、语言等已填信息生成 6 所初步推荐；也可返回补充课程，提高匹配依据完整度。",
        confirmText: "按现有信息推荐",
        cancelText: "返回填写",
        success: (result) => {
          if (!result.confirm) return;
          this.setData({
            transcriptReviewed: true,
            transcriptWarningAccepted: true,
            transcriptNeedsManualEntry: true,
            message: "已确认使用现有信息，本次会生成带依据说明的初步推荐。",
            isError: false
          });
        }
      });
      return;
    }
    this.setData({
      transcriptReviewed: true,
      transcriptWarningAccepted: true,
      transcriptNeedsManualEntry: false,
      message: "课程信息表已确认，可以进入下一步生成推荐。",
      isError: false
    });
  },

  submitProfile() {
    if (!api.ensureLogin()) return;
    const missing = [["school", "当前学校"], ["major", "当前专业"], ["targetField", "目标专业方向"]].filter(([key]) => !String(this.data.profile[key] || "").trim()).map(([, label]) => label);
    if (missing.length) { this.setData({ message: `请填写必填项：${missing.join("、")}`, isError: true, currentStep: !this.data.profile.targetField && this.data.profile.school && this.data.profile.major ? 1 : 0 }); return; }
    if (this.data.submitting) return;
    const now = Date.now();

    if (this.data.transcriptPreviewLoading) {
      this.setData({
        currentStep: 3,
        message: "成绩单仍在处理中，请稍候再生成推荐。",
        isError: true
      });
      return;
    }

    const usableRows = (this.data.transcriptRows || []).filter(row => cleanText(row.course) && !/待校对课程|待补充课程|请补充核心课程/.test(row.course));
    const submissionProfile = buildSubmissionProfile(
      this.data.profile,
      this.data.files,
      usableRows,
      this.data.transcriptReviewed
    );

    if (this.lastSubmitAt && now - this.lastSubmitAt < 2500) {
      this.setData({ message: "推荐正在处理中，请不要连续点击。", isError: true });
      return;
    }
    this.lastSubmitAt = now;

    const payload = {
      ...submissionProfile,
      cityPreference: submissionProfile.cityPreference || this.data.selectedCities.join("、"),
      statePreference: submissionProfile.statePreference || this.data.selectedStates.join("、"),
      recommendationCount: String(this.data.recommendationCount),
      transcriptRows: usableRows,
      transcriptReviewed: this.data.transcriptReviewed,
      transcriptFileCount: this.data.files.length,
      files: []
    };

    this.setData({
      submitting: true,
      message: "正在结合申请背景、课程信息和院校数据库生成推荐...",
      isError: false
    });
    progress.start(this, {
      timerKey: "submitProgressTimer",
      progressKey: "submitProgress",
      textKey: "submitProgressText",
      from: 10,
      cap: 92,
      step: 4,
      text: "正在整合课程信息、申请目标和专业库数据。"
    });
    api
      .recommend(payload)
      .then((recommendation) => {
        progress.finish(this, {
          timerKey: "submitProgressTimer",
          progressKey: "submitProgress",
          textKey: "submitProgressText",
          text: "推荐已生成，正在打开结果页。"
        });
        const app = getApp();
        app.globalData.latestProfile = payload;
        app.globalData.latestRecommendation = recommendation;
        wx.setStorageSync(env.scopedKey(env.STORAGE_KEYS.latestProfile), payload);
        wx.setStorageSync(env.scopedKey(env.STORAGE_KEYS.latestRecommendation), recommendation);
        wx.navigateTo({ url: "/pages/results/results" });
      })
      .catch((error) => {
        progress.finish(this, {
          timerKey: "submitProgressTimer",
          progressKey: "submitProgress",
          textKey: "submitProgressText",
          text: "已保留当前填写内容。"
        });
        if (error.statusCode === 402) {
          this.showPaywall(error.message);
          return;
        }
        const limited = error.statusCode === 429 || /429|频繁|繁忙|限流/.test(error.message || "");
        this.setData({
          message: limited
            ? "当前请求较多，请稍后重新生成。已填写内容和文件已保留。"
            : error.message || "服务连接暂时不可用，已填内容已保留，请稍后重试。",
          isError: true
        });
      })
      .finally(() => {
        this.setData({ submitting: false });
      });
  }
});
