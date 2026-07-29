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
