const env = require("./env");
const KEY = "liude-shared-experience-v1";
const GROUPS = [
  { key: "education", title: "大学及交换经历", dated: true, fields: [["name", "学校"], ["major", "专业 / 辅修"], ["degree", "学位 / 交换类型"], ["score", "总均分 / 专业均分 / 排名"], ["details", "核心课程与补充说明"]] },
  { key: "schooling", title: "中小学经历（单独填写）", dated: true, fields: [["name", "学校名称"], ["degree", "小学 / 初中 / 高中"], ["details", "补充说明"]] },
  { key: "tests", title: "语言与标准化考试", fields: [["name", "考试类型"], ["start", "考试日期 / 计划日期"], ["score", "总分及各科成绩"]] },
  { key: "professionalExperience", title: "工作与实习经历", dated: true, fields: [["name", "单位名称"], ["location", "工作城市"], ["role", "职位 / 全职或实习"], ["details", "职责、具体成果与收获"]] },
  { key: "researchProjects", title: "科研、项目与毕业论文", dated: true, fields: [["name", "项目名称"], ["role", "本人角色"], ["details", "研究方法、实施过程、成果与收获"]] },
  { key: "publications", title: "论文与发表成果", fields: [["name", "论文题目"], ["role", "作者及本人排序"], ["details", "期刊 / 会议、页码、发表年月"]] },
  { key: "honors", title: "奖励与荣誉", fields: [["name", "奖项"], ["start", "获奖年月"], ["details", "授奖单位与奖项级别"]] },
  { key: "activities", title: "课外活动与社会实践", dated: true, fields: [["name", "活动 / 组织名称"], ["role", "角色、每周投入时间"], ["details", "主要贡献与成果"]] },
  { key: "skills", title: "计算机、证书与兴趣", fields: [["name", "技能 / 证书 / 爱好"], ["details", "熟练程度 / 获得时间 / 说明"]] }
];
function load() { return getApp().globalData.session?.user?.storageKey ? wx.getStorageSync(env.scopedKey(KEY)) || {} : {}; }
function save(value) { if (getApp().globalData.session?.user?.storageKey) wx.setStorageSync(env.scopedKey(KEY), value); }
function month(value) { const match = String(value || "").match(/^(\d{4})-(0[1-9]|1[0-2])$/); return match ? Number(match[1]) * 12 + Number(match[2]) - 1 : NaN; }
function validate(value = {}, now = new Date()) {
  const errors = [], spans = [];
  const current = now.getFullYear() * 12 + now.getMonth();
  GROUPS.filter((group) => group.dated).forEach((group) => (value[group.key] || []).forEach((row, index) => {
    const start = month(row.start), end = row.ongoing ? current : month(row.end);
    if (!row.name || !Number.isFinite(start) || !Number.isFinite(end) || end < start || start > current || end > current) errors.push(`${group.title}第 ${index + 1} 项：请核对名称及起止年月，仍在持续才可勾选“至今”`);
    else if (["education", "schooling", "professionalExperience"].includes(group.key)) spans.push({ start, end });
  }));
  spans.sort((a, b) => a.start - b.start);
  if (spans.length) {
    let end = spans[0].end;
    const gaps = [];
    spans.slice(1).forEach((span) => { if (span.start > end + 1) gaps.push(span.start - end - 1); end = Math.max(end, span.end); });
    if (current > end + 1) gaps.push(current - end - 1);
    if (gaps.length && !String(value.gapExplanation || "").trim()) errors.push(`教育 / 工作时间轴有 ${gaps.length} 处空档，请填写真实起止月份及情况（例如备考、求职），不要虚构经历。`);
  }
  return errors;
}
function toForm(value = {}, language = "de") {
  const form = {};
  GROUPS.forEach((group) => {
    const rows = [...(value[group.key] || [])].sort((a, b) => String(b.start || "").localeCompare(String(a.start || "")));
    if (!rows.length) return;
    form[group.key] = rows.map((row) => [group.dated ? `${row.start || ""} – ${row.ongoing ? language === "en" ? "present" : "bis heute" : row.end || ""}` : "", ...group.fields.map(([key]) => row[key] || "")].filter(Boolean).join(" | ")).join("\n");
  });
  if (value.gapExplanation) form.gapExplanation = value.gapExplanation;
  return form;
}
module.exports = { GROUPS, load, save, validate, toForm, month };
