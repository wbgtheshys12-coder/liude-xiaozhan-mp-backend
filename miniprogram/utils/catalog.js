const api = require("./api");
const schools = require("./schools");
let cache = null;
const TERMS = { engineering: "工程", mechanical: "机械", computer: "计算机", informatics: "计算机 信息学", data: "数据", science: "科学", business: "商科", economics: "经济", management: "管理", electrical: "电气", civil: "土木", architecture: "建筑", industrial: "工业工程", textile: "纺织", fashion: "时尚", biology: "生物", chemistry: "化学", medicine: "医学", psychology: "心理", mathematics: "数学", physics: "物理", environmental: "环境", energy: "能源", software: "软件", artificial: "人工智能", communication: "通信", logistics: "物流", finance: "金融" };
function plain(value) { return String(value || "").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/[*#_]/g, "").trim(); }
function chineseDates(value) {
  return plain(value).replace(/winter\s*(semester|term)|Wintersemester/gi, "冬季学期").replace(/summer\s*(semester|term)|Sommersemester/gi, "夏季学期").replace(/application\s*(period|deadline)/gi, "申请时间").replace(/deadline/gi, "截止日期").replace(/rolling admissions?/gi, "滚动申请").replace(/not (specified|available)|n\/a/gi, "待官网确认");
}
function findSchool(university) {
  const name = String(university || "").toLowerCase();
  const aliases = { "tu berlin": "tuberlin", "tu darmstadt": "tudarmstadt", "tu dresden": "tudresden", "technical university of munich": "tum", "karlsruhe institute of technology": "kit", "rwth aachen university": "rwth" };
  const all = schools.getSchools();
  return all.find((school) => [school.nameEn, school.englishName, school.nameDe, school.germanName, school.name].some((value) => value && value.toLowerCase() === name)) || all.find((school) => school.id.replace(/[-_]/g, "") === aliases[name]);
}
function enrich(program) {
  const school = findSchool(program.university);
  const corpus = [program.title, program.university, ...(program.keywords || []), ...(program.domains || [])].join(" ").toLowerCase();
  return { ...program, overview: plain(program.overview), prerequisites: plain(program.prerequisites), schoolName: school?.name || program.university, schoolId: school?.id || "", applicationPeriod: chineseDates(program.applicationPeriod) || "待官网确认", applicationDeadline: chineseDates(program.applicationDeadline) || "请查看申请时间及当期官网", searchText: [corpus, school?.name, ...Object.keys(TERMS).filter((term) => corpus.includes(term)).map((term) => TERMS[term])].join(" ") };
}
function load() { if (!cache) cache = api.getPublicCatalog().then((result) => (result.records || []).map(enrich)).catch((error) => { cache = null; throw error; }); return cache; }
function results(records, query) {
  const terms = String(query || "").trim().toLowerCase().split(/\s+/).filter(Boolean);
  return records.filter((record) => terms.every((term) => record.searchText.includes(term))).slice(0, 80).map((record) => ({ key: `db-${record.id}`, type: "program", badge: "专业库", title: record.title, subtitle: `${record.schoolName} · ${record.degree}`, url: `/pages/school/school?${record.schoolId ? `id=${record.schoolId}&` : ""}program=${encodeURIComponent(record.id)}` }));
}
module.exports = { load, results, chineseDates, enrich };
