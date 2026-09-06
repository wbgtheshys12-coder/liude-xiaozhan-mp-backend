"use strict";

// Keep the original facts. Never substitute domain-based achievements or intentions.
// This local renderer is not a general-purpose translation service.
const LABELS = {
  name: ["Name", "Name"], latinName: ["Name in lateinischer Schrift", "Name in Latin script"],
  currentCity: ["Wohnort", "Current city"], citizenship: ["Staatsangehörigkeit", "Citizenship"],
  birthInfo: ["Geburtsdatum und -ort", "Date and place of birth"],
  schoolMajor: ["Studium und akademischer Hintergrund", "Academic background"],
  targetProgram: ["Zielhochschule und Studiengang", "Target university and programme"],
  germanyOrigin: ["Motivation für ein Studium in Deutschland", "Motivation for studying in Germany"],
  germanyMajorUnderstanding: ["Fachliches Interesse", "Academic interests"],
  germanEducationUnderstanding: ["Interesse am deutschen Hochschulsystem", "Interest in German higher education"],
  interestedDirections: ["Studienziele", "Study objectives"],
  relevantCourses: ["Relevante Studienleistungen", "Relevant coursework"],
  projectsInternships: ["Projekte und praktische Erfahrungen", "Projects and practical experience"],
  furtherStudyPlan: ["Weitere akademische Ziele", "Further academic objectives"],
  careerPlan: ["Berufliche Ziele", "Career objectives"],
  education: ["AUSBILDUNG", "EDUCATION"], schooling: ["SCHULBILDUNG", "PRIMARY AND SECONDARY EDUCATION"],
  exchange: ["AUSLANDS- / SOMMERSCHULERFAHRUNG", "EXCHANGE / SUMMER SCHOOL"],
  tests: ["SPRACHKENNTNISSE UND STANDARDISIERTE TESTS", "LANGUAGES AND STANDARDISED TESTS"],
  professionalExperience: ["BERUFS- UND PRAKTIKUMSERFAHRUNG", "PROFESSIONAL EXPERIENCE"],
  researchProjects: ["FORSCHUNG, PROJEKTE UND ABSCHLUSSARBEIT", "RESEARCH, PROJECTS AND THESIS"],
  publications: ["PUBLIKATIONEN", "PUBLICATIONS"], honors: ["AUSZEICHNUNGEN", "HONOURS AND AWARDS"],
  activities: ["AUSSERUNIVERSITÄRES ENGAGEMENT", "EXTRACURRICULAR ACTIVITIES"],
  skills: ["KENNTNISSE, ZERTIFIKATE UND INTERESSEN", "SKILLS, CERTIFICATES AND INTERESTS"],
  gapExplanation: ["ERLÄUTERUNG DER ZEITRÄUME", "EXPLANATION OF TIMELINE GAPS"]
};
function createFactualDraft(form, language, toolKey, generatedAt) {
  const de = language === "de", warnings = [];
  const label = (key) => LABELS[key]?.[de ? 0 : 1] || key;
  function value(key, properName = false) {
    const source = String(form[key] || "").trim();
    if (!source) return "";
    if (source.length > 5000) throw Object.assign(new Error("单项文书内容过长，请精简后重试。"), { statusCode: 400 });
    const cjk = /[\u3400-\u9fff]/u.test(source);
    const english = !properName && /\b(the|my|and|with|have|research|experience|skills)\b.*\b(the|my|and|with|have|for|in|to)\b/is.test(source);
    const german = !properName && /\b(ich|mein|meine|und|mit|für|habe|Studium)\b.*\b(der|die|das|und|mit|in|zu)\b/is.test(source);
    if (cjk || de && english && !german || !de && german && !english) {
      warnings.push(key);
      // Source stays intact in the questionnaire; a visible placeholder prevents invented translations.
      return de ? `[${label(key)}: Originalangaben aus dem Fragebogen vollständig ins Deutsche übertragen und prüfen.]` : `[${label(key)}: translate the original questionnaire response into English and verify it.]`;
    }
    return source;
  }
  const name = value("latinName", true) || value("name", true) || (de ? "[Name ergänzen]" : "[Add name]");
  const notice = de ? "Hinweis: KI-generierter Strukturentwurf. Keine erfundenen Angaben. Vor der Einreichung alle Fakten und die Zielsprache prüfen." : "Note: AI-generated structured draft. No invented facts. Verify all facts and the target language before submission.";
  const personal = [name, value("currentCity", true), form.email ? `E-Mail: ${value("email", true)}` : "", form.phone ? `${de ? "Telefon" : "Phone"}: ${value("phone", true)}` : ""].filter(Boolean);
  let lines;
  if (toolKey === "cv") {
    const cvPersonal = [`Name: ${name}`, form.currentCity ? `${label("currentCity")}: ${value("currentCity", true)}` : "", form.email ? `E-Mail: ${value("email", true)}` : "", form.phone ? `${de ? "Telefon" : "Phone"}: ${value("phone", true)}` : ""].filter(Boolean);
    lines = [de ? "LEBENSLAUF" : "CURRICULUM VITAE", `${de ? "Erstellt am" : "Generated"}: ${generatedAt}`, notice, "", de ? "PERSÖNLICHE DATEN" : "PERSONAL DETAILS", ...cvPersonal];
    for (const [key, text] of [["citizenship", de ? "Staatsangehörigkeit" : "Citizenship"], ["birthInfo", de ? "Geburtsdatum und -ort" : "Date and place of birth"]]) { const fact = value(key, true); if (fact) lines.push(`${text}: ${fact}`); }
    for (const key of ["education", "schooling", "exchange", "tests", "professionalExperience", "researchProjects", "publications", "honors", "activities", "skills", "gapExplanation"]) { const fact = value(key); if (fact) lines.push("", label(key), fact); }
  } else {
    lines = [de ? "MOTIVATIONSSCHREIBEN" : "MOTIVATION LETTER", `${de ? "Erstellt am" : "Generated"}: ${generatedAt}`, notice, "", ...personal, "", `${de ? "Bewerbung" : "Application"}: ${value("targetProgram", true) || (de ? "[Ziel ergänzen]" : "[Add target]")}`, "", de ? "Sehr geehrte Damen und Herren," : "Dear Admissions Committee,", ""];
    for (const key of ["schoolMajor", "germanyOrigin", "germanyMajorUnderstanding", "germanEducationUnderstanding", "interestedDirections", "relevantCourses", "projectsInternships", "furtherStudyPlan", "careerPlan"]) { const fact = value(key); if (fact) lines.push(fact, ""); }
    lines.push(de ? "Mit freundlichen Grüßen" : "Yours faithfully,", name);
  }
  return { draft: lines.join("\n"), warnings: [...new Set(warnings)], source: "factual-local-structured-draft-v2", translationComplete: warnings.length === 0 };
}
module.exports = { createFactualDraft };
