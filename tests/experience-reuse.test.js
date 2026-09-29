const test = require("node:test");
const assert = require("node:assert/strict");
const experience = require("../miniprogram/utils/experience");
const value = { researchProjects: [{ name: "Project", start: "2020-01", end: "2020-06", details: "Actual work" }] };
test("CV can ignore timeline gaps without ignoring invalid dates", () => {
  const oldEducation = { education: [{ name: "University", start: "2018-09", end: "2022-06" }] };
  assert.ok(experience.validate(oldEducation, new Date("2026-09-29")).length);
  assert.equal(experience.validate(oldEducation, new Date("2026-09-29"), { ignoreGaps: true }).length, 0);
  oldEducation.education[0].end = "2017-01";
  assert.ok(experience.validate(oldEducation, new Date("2026-09-29"), { ignoreGaps: true }).length);
});
test("structured experience is submitted without mutating independent notes", () => {
  const profile = { experience: "Extra", projects: "", internships: "" };
  const payload = experience.forRecommendation(profile, value);
  assert.match(payload.experience, /Project/);
  assert.match(payload.experience, /Extra/);
  assert.equal(profile.experience, "Extra");
  assert.equal(profile.projects, "");
});
test("legacy exact auto-copies are removed but manual additions survive", () => {
  const generated = experience.toForm(value).researchProjects;
  assert.equal(experience.independentNotes({ projects: generated }, value).projects, "");
  assert.equal(experience.independentNotes({ projects: generated + "\nManual note" }, value).projects, generated + "\nManual note");
});
test("removing a structured row removes it from future recommendations", () => {
  assert.equal(experience.forRecommendation({ experience: "Extra" }, {}).experience, "Extra");
  assert.equal(experience.forRecommendation({}, {}).projects, "");
});
test("cross feature CV reuse remains available", () => {
  assert.match(experience.toForm(value).researchProjects, /Actual work/);
});
