const test = require("node:test");
const assert = require("node:assert/strict");

const localEngine = require("../local-engine");

test("reviewed transcript rows do not reprocess uploaded files and keep six relevant industrial-engineering results", async () => {
  const result = await localEngine.createRecommendation({
    major: "工程造价",
    gpa: "3.44",
    language: "IELTS 7.0",
    targetDegree: "硕士",
    targetField: "Wirtschaftsingenieurwesen",
    projects: "BIM、工程项目管理、成本测算、数据分析",
    transcriptRows: [
      { course: "高等数学", grade: "89", credits: "5" },
      { course: "概率论与数理统计", grade: "79", credits: "4" },
      { course: "工程经济学", grade: "91", credits: "3" },
      { course: "项目管理", grade: "83", credits: "3" },
      { course: "BIM 技术与应用", grade: "91", credits: "2" },
      { course: "工程结构", grade: "87", credits: "3" },
    ],
    transcriptReviewed: true,
    files: [
      {
        name: "must-not-be-read.pdf",
        type: "application/pdf",
        content: "data:application/pdf;base64,this-is-deliberately-not-a-pdf",
      },
    ],
    recommendationCount: 6,
  });

  assert.equal(result.recommendations.length, 6);
  const programs = result.recommendations.map((item) => item.program).join(" ");
  result.recommendations.slice(0, 4).forEach((item) => {
    assert.match(item.program, /Wirtschaftsingenieurwesen|Industrial Engineering/);
  });
  assert.match(programs, /Wirtschaftsingenieurwesen|Industrial Engineering|Technologiemanagement|Production and Management/);
  assert.doesNotMatch(programs, /Biomedical Engineering/);
  result.recommendations.forEach((item) => {
    assert.ok(item.matchPercent <= 90);
    assert.match(item.reason, /综合评分|课程/);
  });
});

test("transcript preview selection retains foundation courses even when they occur late", () => {
  const ordinaryRows = Array.from({ length: 70 }, (_, index) => ({
    course: `专业课程 ${index + 1}`,
    grade: "80",
    credits: "2",
  }));
  const foundationRows = [
    { course: "高等数学 A", grade: "89", credits: "5" },
    { course: "Probability and Mathematical Statistics", grade: "79", credits: "4" },
    { course: "工程经济学", grade: "91", credits: "3" },
    { course: "BIM 技术与应用", grade: "91", credits: "2" },
  ];

  const selected = localEngine.testHelpers.selectRepresentativeTranscriptRows(
    [...ordinaryRows, ...foundationRows],
    50
  );
  const selectedCourses = selected.map((row) => row.course).join(" ");
  assert.equal(selected.length, 50);
  foundationRows.forEach((row) => assert.match(selectedCourses, new RegExp(row.course.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))));
});

test("manually supplied GPA keeps priority and supports 7-point and sub-60 percentage scales", () => {
  const ukSummary = localEngine.buildTranscriptSummary(
    [{ text: "Overall Programme Average: 51.90 Assessment 100% Wt 90", method: "PDF 课程整理" }],
    { gpa: "51.90/100" }
  );
  assert.equal(ukSummary.extractedScoreText, "51.9/100");
  assert.equal(ukSummary.extractedScore, 51.9);

  const anuSummary = localEngine.buildTranscriptSummary(
    [{ text: "UNDERGRADUATE GPA: 4.261 POSTGRADUATE GPA: 5.833", method: "PDF 课程整理" }],
    { gpa: "5.833/7.0" }
  );
  assert.equal(anuSummary.extractedScoreText, "5.833/7.0");
  assert.equal(anuSummary.extractedScore, 83.3);
});

test("US portal transcript rows extract course, letter grade and credits", () => {
  const rows = localEngine.testHelpers.extractTranscriptRowsFromText(
    "43119 BUS 1010 402 Business Ethics 101 GU Online A 3.00 3.00 3.00 12.00 " +
      "40143 HIST 1700 419 American Civilization Hollow Tree B- 3.00 3.00 3.00 8.10 " +
      "40510 MATH 0950 503 Pre-Algebra GU Online C 3.00 3.00 3.00 6.00"
  );
  assert.equal(rows.length, 3);
  assert.match(rows[0].course, /Business Ethics/i);
  assert.equal(rows[0].grade, "A");
  assert.equal(rows[0].credits, "3.00");
});

test("column-grouped portal transcript still yields reviewable course names", () => {
  const summary = localEngine.buildTranscriptSummary(
    [{
      text:
        "COURSE SUBJECT 43119 40143 40510 41547 BUS HIST MATH ENG 1010 1700 0950 1040 " +
        "Business Ethics 101 American Civilization Pre-Algebra Composition 104 GU Online Hollow Tree " +
        "A B- C B 3.00 3.00 3.00 3.00 GPA 2.92",
      method: "PDF 课程整理",
    }],
    { major: "商业伦理" }
  );
  const courses = summary.rowsFromOcr.map((row) => row.course).join(" ");
  assert.match(courses, /Business Ethics/i);
  assert.match(courses, /American Civilization/i);
  assert.match(courses, /Pre-Algebra/i);
  assert.match(courses, /Composition/i);
});

test("partial transcript evidence prompts course completion without reporting recognition failure", async () => {
  const preview = await localEngine.createTranscriptPreview({
    profile: { major: "化学", gpa: "3.6/4.0" },
    files: [{
      name: "partial.pdf",
      type: "application/pdf",
      content: `data:application/pdf;base64,${Buffer.from("%PDF-1.4\nSample Academic Transcript\n").toString("base64")}`,
    }],
  });
  assert.equal(preview.rows.length, 2);
  assert.equal(preview.rows[1].course, "请补充核心课程");
  assert.match(preview.rows[1].note, /手动补充 3-6 门核心课程/);
  assert.match(preview.transcriptSummary.warnings.join(" "), /补充 3-6 门核心课程/);
  assert.doesNotMatch(preview.transcriptSummary.warnings.join(" "), /无法识别|识别失败/);
});
