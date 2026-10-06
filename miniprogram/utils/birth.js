// Shared by the form and backend. Dates are facts, not machine-translation input.
function parseDate(value, today = new Date()) {
  const text = String(value || "").trim();
  let match = text.match(/^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?$/);
  let parts = match && [Number(match[1]), Number(match[2]), Number(match[3])];
  if (!parts) {
    match = text.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if (match) parts = [Number(match[3]), Number(match[2]), Number(match[1])];
  }
  if (!parts) return "";
  const [year, month, day] = parts;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (year < 1900 || date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) return "";
  const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  if (iso > today.toISOString().slice(0, 10)) return "";
  return iso;
}

function details(form = {}) {
  const legacy = String(form.birthInfo || "").trim();
  const dateMatch = legacy.match(/(?:\d{4}[-/.年]\d{1,2}[-/.月]\d{1,2}日?|\d{1,2}\.\d{1,2}\.\d{4})/);
  const hasDate = Object.prototype.hasOwnProperty.call(form, "birthDate");
  const hasPlace = Object.prototype.hasOwnProperty.call(form, "birthPlace");
  const rawDate = hasDate ? String(form.birthDate || "").trim() : dateMatch ? dateMatch[0] : "";
  const date = parseDate(rawDate);
  const place = hasPlace ? String(form.birthPlace || "").trim() : legacy.replace(dateMatch ? dateMatch[0] : /^$/, "").replace(/(?:出生地|出生日期|生日)\s*[:：]?\s*/g, "").replace(/^[\s,，;；、]+|[\s,，;；、]+$/g, "");
  return { date, rawDate, place, error: rawDate && !date ? "请填写有效的出生日期，不能晚于今天。" : "" };
}

function normalizeForm(form = {}) {
  const birth = details(form);
  return { ...form, birthDate: birth.date || birth.rawDate, birthPlace: birth.place, birthInfo: [birth.date || birth.rawDate, birth.place].filter(Boolean).join("，") };
}

function knownPlace(value) {
  const map = { 北京: "Beijing", 上海: "Shanghai", 杭州: "Hangzhou", 南京: "Nanjing", 广州: "Guangzhou", 深圳: "Shenzhen", 成都: "Chengdu", 武汉: "Wuhan", 西安: "Xi'an", 无锡: "Wuxi", 苏州: "Suzhou", 长沙: "Changsha", 宁波: "Ningbo", 天津: "Tianjin", 重庆: "Chongqing" };
  const text = String(value || "").trim();
  const match = text.match(/^(?:中国[，,\s]*)?([\u3400-\u9fff]+?)(?:市)?(?:[，,\s]*中国)?$/);
  return match && map[match[1]] ? `${map[match[1]]}${/中国/.test(text) ? ", China" : ""}` : text;
}

function formatInfo(birth, language, translatedPlace = birth.place) {
  const date = birth.date ? (language === "de" ? birth.date.split("-").reverse().join(".") : birth.date) : "";
  return [date, String(translatedPlace || "").trim()].filter(Boolean).join(", ");
}

module.exports = { parseDate, details, normalizeForm, knownPlace, formatInfo };
