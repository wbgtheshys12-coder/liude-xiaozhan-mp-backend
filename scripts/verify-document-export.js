const fs = require("node:fs");
const path = require("node:path");

process.env.PORT = "0";
process.env.MP_OPEN_LOGIN = "true";
process.env.MP_ALLOW_DEV_LOGIN = "true";
process.env.MP_DOCUMENT_DOWNLOAD_FREE = "true";

const localEngine = require("../local-engine");
const server = require("../server");

const outputDir = path.resolve(process.argv[2] || path.join(__dirname, "..", "tmp", "document-verification"));
fs.mkdirSync(outputDir, { recursive: true });

const motivationForm = {
  name: "测试申请人",
  latinName: "MAX MUSTER",
  email: "max.muster@example.com",
  phone: "+86 138 0000 0000",
  currentCity: "杭州",
  schoolMajor: "北京建筑大学，工程造价，2020-2024，均分 86",
  applicationLevel: "硕士",
  targetProgram: "达姆施塔特工业大学，建筑与房地产管理",
  schoolRequirements: "待核对官网题目和字数要求",
  germanyOrigin: "希望学习德国工程管理和数字建造",
  germanyMajorUnderstanding: "德国重视工程实践、科研和产业合作",
  germanEducationUnderstanding: "课程结构清晰，强调实践",
  interestedDirections: "BIM、工程造价、韧性城市和数据分析",
  relevantCourses: "工程经济学、工程管理、统计学、BIM",
  projectsInternships: "海绵城市韧性研究，使用 ANP、熵权和云模型；BIM 工程量计算实习",
  careerPlan: "毕业后从事数字建造和项目成本管理",
};

const cvForm = {
  name: "测试申请人",
  latinName: "MAX MUSTER",
  email: "max.muster@example.com",
  phone: "+86 138 0000 0000",
  currentCity: "杭州",
  citizenship: "中国",
  birthInfo: "2002-03-18，杭州",
  education: "北京建筑大学，工程造价，2020-2024，均分 86，工程经济学，统计学，BIM",
  tests: "IELTS 7.0，德语计划考试",
  professionalExperience: "工程造价实习，完成 BIM 工程量计算和成本复核",
  researchProjects: "海绵城市韧性项目，使用 ANP、熵权和云模型；社区韧性项目使用 DEMATEL、AISM 和 ABM",
  publications: "",
  honors: "",
  activities: "",
  skills: "Excel、AutoCAD、Revit、BIM",
};

async function main() {
  const generatedAtTextDe = "31.07.2026, 12:00:00 (China Standard Time)";
  const generatedAtTextEn = "31/07/2026, 12:00:00 (China Standard Time)";
  const motivation = localEngine.createMaterialDraft({
    toolKey: "motivation",
    language: "de",
    form: motivationForm,
  });
  const cv = localEngine.createMaterialDraft({
    toolKey: "cv",
    language: "en",
    form: cvForm,
  });
  if (!motivation.foreignLanguageReady || !cv.foreignLanguageReady) {
    throw new Error("Foreign-language draft contains unsupported CJK text.");
  }

  const motivationPdf = await server.testHelpers.createWatermarkedPdf(
    "Motivationsschreiben",
    motivation.draft.replace(/^MOTIVATIONSSCHREIBEN\s*/u, ""),
    "LIUDE XIAOZHAN ENTWURF",
    generatedAtTextDe,
    "de",
    "motivation"
  );
  const cvPdf = await server.testHelpers.createWatermarkedPdf(
    "Curriculum Vitae",
    cv.draft.replace(/^CURRICULUM VITAE\s*/u, ""),
    "LIUDE XIAOZHAN DRAFT",
    generatedAtTextEn,
    "en",
    "cv"
  );
  const motivationDocx = await server.testHelpers.createBrandedDocx(
    "Motivationsschreiben",
    motivation.draft.replace(/^MOTIVATIONSSCHREIBEN\s*/u, ""),
    generatedAtTextDe,
    "de"
  );
  const cvDocx = await server.testHelpers.createCvTableDocx(
    "Curriculum Vitae",
    cv.draft.replace(/^CURRICULUM VITAE\s*/u, ""),
    generatedAtTextEn,
    "en"
  );
  const matchingPdf = await server.testHelpers.createMatchingTablePdf(
    "院校选校与匹配汇总报告",
    {
      profile: {
        name: "测试申请人",
        school: "示例大学",
        major: "工程管理",
        targetDegree: "硕士",
        targetField: "建筑与房地产管理",
        gpa: "3.5/4.0",
        language: "IELTS 7.0",
      },
      recommendations: [
        ["Technical University of Munich", "慕尼黑工业大学", "Munich 慕尼黑", "Management and Technology"],
        ["RWTH Aachen University", "亚琛工业大学", "Aachen 亚琛", "Construction and Robotics"],
        ["TU Berlin", "柏林工业大学", "Berlin 柏林", "Building Sustainability"],
        ["University of Stuttgart", "斯图加特大学", "Stuttgart 斯图加特", "Infrastructure Planning"],
        ["TU Darmstadt", "达姆施塔特工业大学", "Darmstadt 达姆施塔特", "Civil Engineering"],
        ["Karlsruhe Institute of Technology", "卡尔斯鲁厄理工学院", "Karlsruhe 卡尔斯鲁厄", "Technology Management"],
      ].map(([university, schoolName, city, program], index) => ({
        university,
        schoolName,
        city,
        tags: ["TU9", "工科", index < 2 ? "冲刺" : index < 4 ? "稳妥" : "保底"],
        program,
        degree: "Master",
        projectOverview: "项目聚焦技术、管理和跨学科决策，需结合官网模块手册进一步核对课程方向与研究组。",
        programRequirements: "核对本科学位、先修课程、语言证明、申请期限、课程描述与材料要求。",
        courseEvaluation: "已纳入工程经济学、统计学、工程管理、成本规划和 BIM 等课程证据。",
        matchPercent: 84 - index * 3,
        matchLevel: index < 2 ? "冲刺匹配" : index < 4 ? "中高匹配" : "稳妥匹配",
        evidenceScore: 86 - index * 2,
        improvementSuggestions: "补充正式课程描述、课程学分和毕业设计证据，并由顾问逐项核对项目官网要求。",
      })),
    },
    "留德小栈 水印版",
    "2026年7月31日 12:00:00（北京时间）"
  );

  fs.writeFileSync(path.join(outputDir, "motivation-de-embedded-font.pdf"), motivationPdf);
  fs.writeFileSync(path.join(outputDir, "motivation-de-editable.docx"), motivationDocx);
  fs.writeFileSync(path.join(outputDir, "cv-en-table-embedded-font.pdf"), cvPdf);
  fs.writeFileSync(path.join(outputDir, "cv-en-table-editable.docx"), cvDocx);
  fs.writeFileSync(path.join(outputDir, "matching-table-embedded-font.pdf"), matchingPdf);
  fs.writeFileSync(path.join(outputDir, "motivation-de.txt"), motivation.draft, "utf8");
  fs.writeFileSync(path.join(outputDir, "cv-en.txt"), cv.draft, "utf8");

  console.log(outputDir);
  await new Promise((resolve) => server.close(resolve));
}

main().catch(async (error) => {
  console.error(error);
  if (server.listening) await new Promise((resolve) => server.close(resolve));
  process.exitCode = 1;
});
