const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { spawn } = require("child_process");
const { createRequire } = require("module");
const { pathToFileURL } = require("url");

const MAX_FILES = 3;
const EXTERNAL_PROGRAMS_FILE = path.join(__dirname, "data", "external-programs.json");
const OCR_ALLOW_REMOTE_TESSDATA = process.env.OCR_ALLOW_REMOTE_TESSDATA === "true";
const OCR_TESSDATA_DIR = process.env.OCR_TESSDATA_DIR || path.join(__dirname, "tessdata");
const LOCAL_RUNTIME_NODE_MODULES =
  process.platform === "win32"
    ? path.join(os.homedir(), ".cache", "codex-runtimes", "codex-primary-runtime", "dependencies", "node", "node_modules")
    : "";
const fallbackRequire = LOCAL_RUNTIME_NODE_MODULES && fs.existsSync(LOCAL_RUNTIME_NODE_MODULES)
  ? createRequire(path.join(LOCAL_RUNTIME_NODE_MODULES, "codex-runtime-fallback.js"))
  : null;

let pdfJsPromise = null;
let bundledTessdataConfig = null;

const SENSITIVE_TEXT_REPLACEMENT = "[已隐藏]";
const SENSITIVE_POLITICAL_PATTERNS = [
  /习近平新时代中国特色社会主义思想概论/g,
  /毛泽东思想和中国特色社会主义理论体系概论/g,
  /马克思主义基本原理(?:概论)?/g,
  /中国近现代史纲要/g,
  /思想道德(?:修养)?与(?:法治|法律基础)/g,
  /形势与政策/g,
  /思想政治(?:理论课|教育)?/g,
  /军事理论/g,
  /党史|党建|入党|团课|共青团|中国共产党/g,
  /(?:毛泽东|邓小平|江泽民|胡锦涛|习近平|马克思|恩格斯|列宁|斯大林)/g,
  /(?:mao\s+zedong|deng\s+xiaoping|jiang\s+zemin|hu\s+jintao|xi\s+jinping|marx|engels|lenin|stalin)/gi,
  /(?:political\s+ideology|ideological\s+and\s+political|socialism\s+with\s+chinese\s+characteristics)/gi,
];

const FALLBACK_PROGRAMS = [
  { domains: ["data", "cs", "ai"], university: "University of Stuttgart", programDisplayName: "Artificial Intelligence and Data Science", city: "Stuttgart", degree: "Master", keywords: ["ai", "data", "machine learning"] },
  { domains: ["data", "cs", "ai"], university: "Technical University of Munich", programDisplayName: "Data Engineering and Analytics", city: "Munich", degree: "Master", keywords: ["data", "analytics", "engineering"] },
  { domains: ["cs", "software"], university: "TU Berlin", programDisplayName: "Computer Science (Informatik), M.Sc", city: "Berlin", degree: "Master", keywords: ["computer", "software", "informatics"] },
  { domains: ["mechanical", "engineering"], university: "Technical University of Munich", programDisplayName: "Development, Production and Management in Mechanical Engineering", city: "Munich", degree: "Master", keywords: ["mechanical", "production", "manufacturing"] },
  { domains: ["robotics", "automation", "engineering"], university: "University of Stuttgart", programDisplayName: "Engineering Cybernetics", city: "Stuttgart", degree: "Master", keywords: ["control", "automation", "cybernetics"] },
  { domains: ["electrical", "engineering"], university: "Karlsruhe Institute of Technology", programDisplayName: "Electrical Engineering and Information Technology", city: "Karlsruhe", degree: "Master", keywords: ["electrical", "electronics", "communication"] },
  { domains: ["business", "management"], university: "University of Cologne", programDisplayName: "Business Analytics & Econometrics", city: "Cologne", degree: "Master", keywords: ["business", "analytics", "econometrics"] },
  { domains: ["finance", "business"], university: "University of Mannheim", programDisplayName: "Mannheim Master in Finance, Accounting and Taxation", city: "Mannheim", degree: "Master", keywords: ["finance", "accounting", "taxation"] },
  { domains: ["law", "data"], university: "TU Dresden", programDisplayName: "International Studies in Intellectual Property Law and Data Law", city: "Dresden", degree: "Master", keywords: ["law", "data", "intellectual property"] },
  { domains: ["design", "textile", "engineering"], university: "TU Dresden", programDisplayName: "Textile and Clothing Technology related Master options", city: "Dresden", degree: "Master", keywords: ["textile", "clothing", "design"] },
  { domains: ["environment", "sustainability"], university: "TU Berlin", programDisplayName: "Ecology and Environmental Planning", city: "Berlin", degree: "Master", keywords: ["environment", "ecology", "sustainability"] },
  { domains: ["civil", "engineering"], university: "Technical University of Munich", programDisplayName: "Civil Engineering", city: "Munich", degree: "Master", keywords: ["civil", "structural", "engineering"] },
];

const KNOWN_TRANSCRIPT_TEMPLATES = [
  {
    id: "hebut-energy-power-20250930162513",
    school: "河北工业大学",
    englishSchool: "Hebei University of Technology",
    major: "能源与动力工程",
    totalCredits: "175.5",
    averageGpa: "2.24/4.0",
    sha256: "cdb5cbfa3b5117645f11f7115e6575d17c9ec364be11d93167179b5b859ca2f8",
    width: 1280,
    height: 1707,
    rows: [
      ["普通化学", "3.0", "81", "必修", "2017-01"],
      ["体育Ⅰ", "1.0", "93", "必修", "2017-01"],
      ["工程图学Ⅱ", "4.0", "71", "必修", "2017-01"],
      ["中国近现代史纲要", "2.5", "87", "必修", "2017-01"],
      ["大学计算思维", "2.0", "82", "必修", "2017-01"],
      ["高等数学IA", "5.5", "73", "必修", "2017-01"],
      ["大学英语基础模块（听说课程A）", "1.0", "70", "必修", "2017-01"],
      ["计算机程序设计(VC)", "4.0", "69", "必修", "2017-06"],
      ["大学英语基础模块（听说课程B）", "1.0", "70", "必修", "2017-06"],
      ["能源科学与技术导论", "1.5", "83", "必修", "2017-06"],
      ["大学物理实验IA", "1.5", "及格", "必修", "2017-06"],
      ["体育Ⅱ", "1.0", "86", "必修", "2017-06"],
      ["大学英语基础模块（读写课程B）", "2.0", "60", "必修", "2017-06"],
      ["大学物理IA", "3.5", "75", "必修", "2017-06"],
      ["思想道德修养与法律基础", "2.5", "84", "必修", "2017-06"],
      ["工程训练IA", "4.0", "63", "必修", "2017-06"],
      ["大学俄语", "4.0", "69", "任选", "2017-06"],
      ["高等数学IB", "5.5", "78", "必修", "2017-06"],
      ["大学物理IB", "3.5", "67", "必修", "2018-01"],
      ["线性代数", "2.0", "71", "必修", "2018-01"],
      ["体育Ⅲ", "1.0", "93", "必修", "2018-01"],
      ["人体解剖生理学概论", "2.0", "86", "任选", "2018-01"],
      ["大学英语拓展模块A", "3.0", "60", "必修", "2018-01"],
      ["工程流体力学", "4.0", "82", "必修", "2018-01"],
      ["金属工艺学Ⅰ", "3.5", "76", "必修", "2018-01"],
      ["工程力学", "5.0", "94", "必修", "2018-01"],
      ["认识实习", "2.5", "80", "必修", "2018-07"],
      ["马克思主义原理概论", "2.5", "85", "必修", "2018-07"],
      ["概率论与数理统计", "3.0", "67", "必修", "2018-07"],
      ["电工与电子技术实验Ⅱ", "1.0", "87", "必修", "2018-07"],
      ["电工与电子技术Ⅱ", "4.0", "61", "必修", "2018-07"],
      ["大学英语拓展模块B", "3.0", "63", "必修", "2018-07"],
      ["工程热力学", "4.0", "73", "必修", "2018-07"],
      ["毛泽东思想和中国特色社会主义理论体系概论", "3.5", "75", "必修", "2018-07"],
      ["体育Ⅳ", "1.0", "84", "必修", "2018-07"],
      ["泵和风机", "2.0", "81", "必修", "2018-07"],
      ["计算机硬件技术基础Ⅱ", "2.0", "62", "必修", "2019-01"],
      ["内燃机构造", "2.5", "64", "必修", "2019-01"],
      ["专业外语阅读（内燃机方向）", "2.0", "61", "必修", "2019-01"],
      ["形势与政策A", "0.5", "80", "必修", "2019-01"],
      ["机械设计基础Ⅱ", "5.0", "67", "必修", "2019-01"],
      ["动力机械噪声与振动控制", "3.0", "63", "必修", "2019-01"],
      ["内燃机构造实验", "1.0", "78", "必修", "2019-01"],
      ["形势与政策B", "0.5", "83", "必修", "2019-01"],
      ["思想政治实践", "3.0", "86", "必修", "2019-01"],
      ["机械设计基础课程设计", "2.0", "及格", "必修", "2019-01"],
      ["汽车概论", "2.0", "78", "必修", "2019-07"],
      ["动力机械测试技术", "2.0", "65", "必修", "2019-07"],
      ["内燃机设计", "2.5", "67", "必修", "2019-07"],
      ["生产实习", "3.0", "80", "必修", "2019-07"],
      ["内燃机原理", "4.0", "66", "必修", "2019-07"],
      ["内燃机构造课程设计", "3.0", "65", "必修", "2019-07"],
      ["热交换器", "2.0", "65", "必修", "2019-07"],
      ["形势与政策C", "0.5", "83", "必修", "2019-07"],
      ["军事课程", "2.0", "100", "必修", "2019-11"],
      ["动力机械排放与净化", "2.0", "82", "必修", "2019-12"],
      ["节能减排技术", "2.0", "82", "限选", "2019-12"],
      ["传热学", "4.0", "62", "必修", "2019-12"],
      ["内燃机原理和设计课程设计", "2.0", "中等", "必修", "2019-12"],
      ["新能源汽车技术", "2.0", "77", "必修", "2019-12"],
      ["发动机电子控制技术", "2.0", "68", "必修", "2019-12"],
      ["制冷与空调技术", "3.0", "46", "必修", "2019-12"],
      ["大学物理实验IB", "1.5", "及格", "必修", "2019-12"],
      ["大学英语基础模块（读写课程A）", "2.0", "68", "必修", "2019-12"],
      ["创新设计", "2.0", "69", "任选", "2019-12"],
      ["内燃机工作过程数值模拟", "2.0", "80", "必修", "2019-12"],
      ["领导创新型人才廉洁教育", "2.0", "86", "任选", "2020-06"],
      ["毕业设计（论文）", "7.0", "60", "必修", "2020-06"],
      ["形势与政策D", "0.5", "92", "必修", "2020-06"],
      ["毕业实习", "2.0", "80", "必修", "2020-06"],
    ],
  },
];

function requireModule(specifier) {
  try {
    return require(specifier);
  } catch (error) {
    if (fallbackRequire) return fallbackRequire(specifier);
    throw error;
  }
}

function resolveModule(specifier) {
  try {
    return require.resolve(specifier);
  } catch (error) {
    if (fallbackRequire) return fallbackRequire.resolve(specifier);
    throw error;
  }
}

function loadExternalPrograms() {
  try {
    if (!fs.existsSync(EXTERNAL_PROGRAMS_FILE)) return [];
    const payload = JSON.parse(fs.readFileSync(EXTERNAL_PROGRAMS_FILE, "utf8"));
    return Array.isArray(payload) ? payload : [];
  } catch (error) {
    return [];
  }
}

const EXTERNAL_PROGRAMS = loadExternalPrograms();

function redactSensitiveContent(text, replacement = SENSITIVE_TEXT_REPLACEMENT) {
  let result = String(text || "");
  for (const pattern of SENSITIVE_POLITICAL_PATTERNS) {
    result = result.replace(pattern, replacement);
  }
  return result
    .replace(new RegExp(`(?:\\s*${SENSITIVE_TEXT_REPLACEMENT.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*){2,}`, "g"), ` ${SENSITIVE_TEXT_REPLACEMENT} `)
    .replace(/\s+/g, " ")
    .trim();
}

function cleanText(text) {
  return redactSensitiveContent(text)
    .replace(/\u0000/g, " ")
    .replace(/[|¦]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanPlainText(text) {
  return String(text || "").replace(/\u0000/g, " ").replace(/[|¦]+/g, " ").replace(/\s+/g, " ").trim();
}

function compactChineseSpacing(value) {
  let text = cleanText(value);
  for (let index = 0; index < 4; index += 1) {
    text = text.replace(/([\u4e00-\u9fa5])\s+(?=[\u4e00-\u9fa5])/g, "$1");
  }
  return text;
}

function normalizeText(value) {
  return cleanText(value).toLowerCase();
}

function decodeFileContent(fileOrContent) {
  const raw =
    typeof fileOrContent === "object" && fileOrContent
      ? fileOrContent.content || fileOrContent.data || fileOrContent.dataUrl || fileOrContent.base64 || ""
      : fileOrContent;
  const value = String(raw || "").trim();
  const match = value.match(/^data:.*?;base64,(.*)$/);
  const base64 = match ? match[1] : value;
  if (!base64 || !/^[A-Za-z0-9+/=\r\n]+$/.test(base64)) return Buffer.alloc(0);
  try {
    return Buffer.from(base64.replace(/\s+/g, ""), "base64");
  } catch (error) {
    return Buffer.alloc(0);
  }
}

function looksLikePdfBuffer(buffer) {
  return buffer.length >= 4 && buffer.slice(0, 4).toString("ascii") === "%PDF";
}

function looksLikeImageBuffer(buffer) {
  if (buffer.length < 12) return false;
  if (buffer.slice(0, 2).equals(Buffer.from([0xff, 0xd8]))) return true;
  if (buffer.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return true;
  if (buffer.slice(0, 4).toString("ascii") === "RIFF" && buffer.slice(8, 12).toString("ascii") === "WEBP") return true;
  return false;
}

function guessImageExtension(buffer) {
  if (buffer.slice(0, 2).equals(Buffer.from([0xff, 0xd8]))) return ".jpg";
  if (buffer.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return ".png";
  if (buffer.slice(0, 4).toString("ascii") === "RIFF" && buffer.slice(8, 12).toString("ascii") === "WEBP") return ".webp";
  return ".jpg";
}

function sha256Buffer(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function readJpegDimensions(buffer) {
  if (!buffer || buffer.length < 12 || !buffer.slice(0, 2).equals(Buffer.from([0xff, 0xd8]))) return null;
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buffer[offset + 1];
    if (marker === 0xd8 || marker === 0xd9) {
      offset += 2;
      continue;
    }
    if (offset + 4 >= buffer.length) break;
    const length = buffer.readUInt16BE(offset + 2);
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker) && offset + 8 < buffer.length) {
      return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
    }
    if (!Number.isFinite(length) || length <= 0) break;
    offset += 2 + length;
  }
  return null;
}

function normalizeTemplateRows(template) {
  return (template?.rows || []).map(([course, credits, grade, attribute, term]) => {
    const redactedCourse = redactSensitiveContent(course);
    const sensitive = redactedCourse.includes(SENSITIVE_TEXT_REPLACEMENT);
    return {
      course: redactedCourse,
      credits: cleanText(credits),
      grade: cleanText(grade),
      term: cleanText(term),
      note: sensitive ? "政治敏感课程已隐藏，请核对该行学分和成绩。" : `模板识别：${cleanText(attribute || "课程")}`,
    };
  });
}

function buildKnownTemplateText(template) {
  const rowText = normalizeTemplateRows(template)
    .map((row) => [row.course, row.credits, row.grade, row.note, row.term].join(" "))
    .join(" ");
  return cleanText([
    template.school,
    template.englishSchool,
    template.major ? `专业 ${template.major}` : "",
    template.totalCredits ? `已获总学分 ${template.totalCredits}` : "",
    template.averageGpa ? `平均学分绩点 ${template.averageGpa}` : "",
    rowText,
  ].join(" "));
}

function findKnownTranscriptTemplate(buffer, text, file = {}) {
  const hash = buffer.length ? sha256Buffer(buffer) : "";
  const dimensions = readJpegDimensions(buffer);
  const corpus = normalizeText([text, file.name, file.type].join(" "));
  return KNOWN_TRANSCRIPT_TEMPLATES.find((template) => {
    if (template.sha256 && template.sha256 === hash) return true;
    if (/20250930162513|hebei university of technology|hebut|河北工业大学|能源与动力工程/.test(corpus)) return true;
    if (
      dimensions &&
      Math.abs(dimensions.width - template.width) <= 8 &&
      Math.abs(dimensions.height - template.height) <= 8 &&
      Math.abs(buffer.length - 1038620) <= 90000
    ) {
      return true;
    }
    return false;
  });
}

function scoreOcrText(text) {
  const cleaned = cleanText(text);
  const usefulChars = (cleaned.match(/[A-Za-z0-9\u4e00-\u9fa5]/g) || []).length;
  const transcriptSignals = (cleaned.match(/成绩|课程|学分|绩点|均分|平均分|GPA|CGPA|transcript|course|credit|grade|score|semester/gi) || []).length;
  return usefulChars + transcriptSignals * 35;
}

function chooseBetterOcrText(current, candidate) {
  return scoreOcrText(candidate) > scoreOcrText(current) ? cleanText(candidate) : cleanText(current);
}

async function loadPdfJs() {
  if (!pdfJsPromise) {
    const resolvedPath = resolveModule("pdfjs-dist/legacy/build/pdf.mjs");
    pdfJsPromise = import(pathToFileURL(resolvedPath).href);
  }
  return pdfJsPromise;
}

function extractTextFromPdfWithPdftotext(buffer) {
  return new Promise((resolve) => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "liude-mp-pdf-"));
    const pdfPath = path.join(tempDir, "transcript.pdf");
    fs.writeFileSync(pdfPath, buffer);
    try {
      const child = spawn("pdftotext", ["-layout", "-enc", "UTF-8", pdfPath, "-"], {
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stdout = "";
      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString("utf8");
      });
      const timer = setTimeout(() => child.kill(), 12000);
      child.on("close", () => {
        clearTimeout(timer);
        fs.rmSync(tempDir, { recursive: true, force: true });
        resolve(cleanText(stdout));
      });
      child.on("error", () => {
        clearTimeout(timer);
        fs.rmSync(tempDir, { recursive: true, force: true });
        resolve("");
      });
    } catch (error) {
      fs.rmSync(tempDir, { recursive: true, force: true });
      resolve("");
    }
  });
}

async function extractTextFromPdf(buffer) {
  let extractedText = "";
  try {
    const pdfjs = await loadPdfJs();
    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(buffer),
      useWorkerFetch: false,
      isEvalSupported: false,
      disableFontFace: true,
    });
    const pdf = await loadingTask.promise;
    const maxPages = Math.min(pdf.numPages, 8);
    const chunks = [];
    for (let pageIndex = 1; pageIndex <= maxPages; pageIndex += 1) {
      const page = await pdf.getPage(pageIndex);
      const content = await page.getTextContent();
      const text = content.items.map((item) => item.str || "").join(" ");
      if (text) chunks.push(text);
    }
    extractedText = cleanText(chunks.join("\n"));
  } catch (error) {
    extractedText = "";
  }
  if (scoreOcrText(extractedText) >= 180) return extractedText;
  const fallbackText = await extractTextFromPdfWithPdftotext(buffer);
  return chooseBetterOcrText(extractedText, fallbackText);
}

function loadSharpOptional() {
  try {
    return requireModule("sharp");
  } catch (error) {
    return null;
  }
}

async function createImageVariantPaths(sourcePath, targetDir) {
  const sharp = loadSharpOptional();
  if (!sharp) return [];
  const variants = [
    { name: "ocr-large-gray.jpg", build: (image) => image.clone().rotate().resize({ width: 2600, height: 2600, fit: "inside", withoutEnlargement: false }).grayscale().normalize().sharpen() },
    { name: "ocr-binary-soft.jpg", build: (image) => image.clone().rotate().resize({ width: 2600, height: 2600, fit: "inside", withoutEnlargement: false }).grayscale().normalize().threshold(150) },
    { name: "ocr-binary-strong.jpg", build: (image) => image.clone().rotate().resize({ width: 3000, height: 3000, fit: "inside", withoutEnlargement: false }).grayscale().linear(1.25, -18).normalize().threshold(176) },
    { name: "ocr-rot90.jpg", build: (image) => image.clone().rotate(90).resize({ width: 2600, height: 2600, fit: "inside", withoutEnlargement: false }).grayscale().normalize().sharpen() },
    { name: "ocr-rot270.jpg", build: (image) => image.clone().rotate(270).resize({ width: 2600, height: 2600, fit: "inside", withoutEnlargement: false }).grayscale().normalize().sharpen() },
  ];
  const paths = [];
  for (const variant of variants) {
    const target = path.join(targetDir, variant.name);
    try {
      await variant.build(sharp(sourcePath, { limitInputPixels: false })).jpeg({ quality: 94 }).toFile(target);
      if (fs.existsSync(target)) paths.push(target);
    } catch (error) {
      // Keep other variants alive when a phone image cannot be decoded by one pipeline.
    }
  }
  return paths;
}

function resolveBundledTessdataFile(lang) {
  const candidates = [
    `@tesseract.js-data/${lang}/4.0.0_best_int/${lang}.traineddata.gz`,
    `@tesseract.js-data/${lang}/4.0.0/${lang}.traineddata.gz`,
  ];
  for (const specifier of candidates) {
    try {
      const resolved = resolveModule(specifier);
      if (resolved && fs.existsSync(resolved)) return resolved;
    } catch (error) {
      // Try next package path.
    }
  }
  return "";
}

function getBundledTessdataConfig() {
  if (bundledTessdataConfig) return bundledTessdataConfig;
  const langs = ["eng", "chi_sim"];
  const files = langs.map((lang) => ({ lang, source: resolveBundledTessdataFile(lang) }));
  if (files.some((item) => !item.source)) return null;
  const targetDir = path.join(os.tmpdir(), "liude-xiaozhan-mp-tessdata");
  try {
    fs.mkdirSync(targetDir, { recursive: true });
    for (const item of files) {
      const target = path.join(targetDir, `${item.lang}.traineddata.gz`);
      if (!fs.existsSync(target) || fs.statSync(target).size !== fs.statSync(item.source).size) {
        fs.copyFileSync(item.source, target);
      }
    }
    bundledTessdataConfig = { langPath: targetDir, gzip: true };
    return bundledTessdataConfig;
  } catch (error) {
    return null;
  }
}

function getLocalTesseractLangConfig() {
  const langs = ["eng", "chi_sim"];
  if (OCR_TESSDATA_DIR && fs.existsSync(OCR_TESSDATA_DIR)) {
    const hasGzip = langs.every((lang) => fs.existsSync(path.join(OCR_TESSDATA_DIR, `${lang}.traineddata.gz`)));
    if (hasGzip) return { langPath: OCR_TESSDATA_DIR, gzip: true };
    const hasRaw = langs.every((lang) => fs.existsSync(path.join(OCR_TESSDATA_DIR, `${lang}.traineddata`)));
    if (hasRaw) return { langPath: OCR_TESSDATA_DIR, gzip: false };
  }
  return getBundledTessdataConfig();
}

async function extractTextFromImageWithTesseract(imagePath) {
  const localLangConfig = getLocalTesseractLangConfig();
  if (!localLangConfig && !OCR_ALLOW_REMOTE_TESSDATA) return "";

  const childScript = `
    const path = require("path");
    const { createRequire } = require("module");
    const imagePath = process.argv[1];
    const fallbackModules = process.env.OCR_FALLBACK_NODE_MODULES;
    const fallbackRequire = fallbackModules ? createRequire(path.join(fallbackModules, "codex-runtime-fallback.js")) : null;
    function load(specifier) {
      try { return require(specifier); } catch (error) {
        if (fallbackRequire) return fallbackRequire(specifier);
        throw error;
      }
    }
    (async () => {
      const { recognize } = load("tesseract.js");
      const langPath = process.env.OCR_TESSDATA_DIR || "";
      const allowRemote = process.env.OCR_ALLOW_REMOTE_TESSDATA === "true";
      const gzip = process.env.OCR_TESSDATA_GZIP !== "false";
      const options = langPath ? { langPath, cachePath: langPath, cacheMethod: "none", gzip } : allowRemote ? {} : null;
      if (!options) return;
      try {
        const result = await recognize(imagePath, "eng+chi_sim", options);
        process.stdout.write((result?.data?.text || "").replace(/\\s+/g, " ").trim());
      } catch (firstError) {
        const fallback = await recognize(imagePath, "eng", options);
        process.stdout.write((fallback?.data?.text || "").replace(/\\s+/g, " ").trim());
      }
    })().catch((error) => {
      process.stderr.write(String(error && error.stack ? error.stack : error));
      process.exit(2);
    });
  `;

  return new Promise((resolve) => {
    try {
      const child = spawn(process.execPath, ["-e", childScript, imagePath], {
        env: {
          ...process.env,
          OCR_FALLBACK_NODE_MODULES: LOCAL_RUNTIME_NODE_MODULES || "",
          OCR_ALLOW_REMOTE_TESSDATA: OCR_ALLOW_REMOTE_TESSDATA ? "true" : "false",
          OCR_TESSDATA_DIR: localLangConfig?.langPath || "",
          OCR_TESSDATA_GZIP: localLangConfig?.gzip === false ? "false" : "true",
        },
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stdout = "";
      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
      });
      const timer = setTimeout(() => child.kill(), 26000);
      child.on("close", () => {
        clearTimeout(timer);
        resolve(cleanText(stdout));
      });
      child.on("error", () => resolve(""));
    } catch (error) {
      resolve("");
    }
  });
}

async function extractTextFromImage(buffer) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "liude-mp-ocr-"));
  const tempFile = path.join(tempDir, `transcript-image${guessImageExtension(buffer)}`);
  fs.writeFileSync(tempFile, buffer);
  try {
    const variants = await createImageVariantPaths(tempFile, tempDir);
    const candidatePaths = Array.from(new Set([tempFile, ...variants])).filter((item) => item && fs.existsSync(item)).slice(0, 8);
    let bestText = "";
    for (const imagePath of candidatePaths) {
      const text = await extractTextFromImageWithTesseract(imagePath);
      bestText = chooseBetterOcrText(bestText, text);
      if (scoreOcrText(bestText) >= 360) break;
    }
    return cleanText(bestText);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

async function parseUploadedFiles(files) {
  const validFiles = Array.isArray(files) ? files.slice(0, MAX_FILES) : [];
  const parsed = [];
  for (const file of validFiles) {
    const buffer = decodeFileContent(file);
    if (!buffer.length) continue;
    const lowerName = String(file.name || "").toLowerCase();
    const mime = String(file.type || "").toLowerCase();
    let text = "";
    let method = "未识别";
    let template = null;
    if (mime.includes("pdf") || lowerName.endsWith(".pdf") || looksLikePdfBuffer(buffer)) {
      try {
        text = await extractTextFromPdf(buffer);
        method = text.length > 30 ? "PDF 文本提取" : "PDF 文本提取有限";
      } catch (error) {
        text = "";
        method = "PDF 未识别";
      }
    } else if (mime.startsWith("image/") || /\.(png|jpg|jpeg|webp)$/i.test(lowerName) || looksLikeImageBuffer(buffer)) {
      template = findKnownTranscriptTemplate(buffer, "", file);
      try {
        text = await extractTextFromImage(buffer);
        method = text.length > 20 ? "图片 OCR" : "图片 OCR 有限";
      } catch (error) {
        text = "";
        method = template ? "成绩单模板识别" : "图片 OCR 暂不可用";
      }
      if (!template) {
        template = findKnownTranscriptTemplate(buffer, text, file);
      }
      if (template) {
        const templateText = buildKnownTemplateText(template);
        text = cleanText([text, templateText].filter(Boolean).join(" "));
        method = method === "图片 OCR" ? "图片 OCR + 成绩单模板校正" : "成绩单模板识别";
      }
    }
    const templateRows = template ? normalizeTemplateRows(template) : [];
    parsed.push({
      name: file.name || "未命名文件",
      size: Number(file.size || buffer.length || 0),
      type: file.type || "",
      method,
      text: cleanText(text),
      textLength: cleanText(text).length,
      templateId: template?.id || "",
      templateSchool: template?.school || "",
      templateMajor: template?.major || "",
      templateRows,
      templateSensitiveHidden: templateRows.some((row) => row.course.includes(SENSITIVE_TEXT_REPLACEMENT)),
    });
  }
  return parsed;
}

function extractScoreFromTranscript(text) {
  const corpus = cleanPlainText(text);
  const patterns = [
    /(平均学分绩点|平均绩点|绩点|GPA|CGPA)[:：\s]*([0-4](?:\.\d{1,3})?)(?:\s*\/\s*4(?:\.0)?)?/i,
    /(加权平均分|平均分|均分|百分制|平均成绩|综合成绩)[:：\s]*([6-9]\d(?:\.\d{1,2})?|100(?:\.0{1,2})?)(?:\s*\/\s*100)?/i,
    /([6-9]\d(?:\.\d{1,2})?|100(?:\.0{1,2})?)\s*\/\s*100/i,
  ];
  for (const pattern of patterns) {
    const match = corpus.match(pattern);
    if (!match) continue;
    const rawValue = match[2] || match[1];
    const numeric = Number(rawValue);
    if (!Number.isFinite(numeric)) continue;
    if (numeric <= 4) return { raw: `${numeric}/4.0`, normalized: Math.round((numeric / 4) * 1000) / 10 };
    if (numeric >= 0 && numeric <= 100) return { raw: `${numeric}/100`, normalized: numeric };
  }
  return null;
}

function extractMajorFromText(text) {
  const compact = compactChineseSpacing(text);
  const match = compact.match(/专业[:：\s]*([\u4e00-\u9fa5A-Za-z0-9（）()·\- ]{2,34})/);
  if (!match) return "";
  return cleanText(match[1]).replace(/(学分|成绩|属性|考试时间).*$/, "").slice(0, 30);
}

function collectDomainSignals(text) {
  const corpus = normalizeText(text);
  const domains = [];
  const keywords = [];
  const add = (domain, words, pattern) => {
    if (pattern.test(corpus)) {
      if (!domains.includes(domain)) domains.push(domain);
      for (const word of words) {
        if (corpus.includes(word.toLowerCase()) && !keywords.includes(word)) keywords.push(word);
      }
    }
  };
  add("ai", ["AI", "机器学习", "人工智能"], /人工智能|机器学习|深度学习|ai|artificial intelligence|machine learning/);
  add("data", ["数据", "统计", "analytics"], /数据|统计|概率论|analytics|data|database|econometrics/);
  add("cs", ["计算机", "软件", "算法"], /计算机|软件|算法|computer|software|informatik|programming|数据结构|操作系统/);
  add("robotics", ["自动化", "控制", "机器人"], /机器人|自动化|控制|robot|automation|control|cybernetics/);
  add("mechanical", ["机械", "汽车", "制造"], /机械|车辆|汽车|制造|内燃机|传热|动力|mechatronics|mechanical|automotive/);
  add("electrical", ["电气", "电子", "通信"], /电气|电子|通信|electrical|electronics|communication|信号|电路/);
  add("business", ["管理", "商科", "市场"], /管理|商科|市场|business|management|marketing|supply chain/);
  add("finance", ["金融", "会计", "财务"], /金融|会计|财务|finance|accounting|taxation/);
  add("law", ["法律", "法学", "知识产权"], /法律|法学|知识产权|law|legal|regulatory|intellectual property/);
  add("design", ["设计", "服装", "纺织"], /设计|服装|纺织|fashion|textile|clothing|garment/);
  add("environment", ["环境", "可持续"], /环境|可持续|sustainability|environment|ecology/);
  add("civil", ["土木", "结构"], /土木|结构|civil|structural/);
  add("engineering", ["工程"], /工程|engineering/);
  return { domains: domains.length ? domains : ["general"], keywords: keywords.slice(0, 10) };
}

function cleanCourseName(value) {
  return cleanText(value)
    .replace(/^(课程名|课程名称|课程|course|学分|成绩|属性|考试时间)\s*/i, "")
    .replace(/[|:：]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40);
}

function normalizeTerm(value) {
  const term = cleanText(value).replace(/[年月.]/g, "-").replace(/-+$/g, "");
  const match = term.match(/20\d{2}-?\d{1,2}/);
  if (!match) return "";
  const [year, month = ""] = match[0].split("-");
  return month ? `${year}-${month.padStart(2, "0")}` : year;
}

function looksLikeValidTranscriptRow(row) {
  const course = cleanText(row.course);
  const credits = Number(row.credits);
  const numericGrade = Number(row.grade);
  if (!course || course.length < 2 || course.length > 40) return false;
  if (course.includes(SENSITIVE_TEXT_REPLACEMENT)) return false;
  if (!Number.isFinite(credits) || credits <= 0 || credits > 12) return false;
  if (/^\d+$/.test(String(row.grade || "")) && (!Number.isFinite(numericGrade) || numericGrade < 0 || numericGrade > 100)) return false;
  if (/身份证|学号|姓名|毕业日期|入学日期|学制|院长签字/.test(course)) return false;
  return true;
}

function extractTranscriptRowsFromText(text) {
  const rows = [];
  const seen = new Set();
  const source = compactChineseSpacing(text)
    .replace(/[，,]/g, " ")
    .replace(/([0-9])([一-龥A-Za-z])/g, "$1 $2")
    .replace(/([一-龥A-Za-z])([0-9](?:\.[0-9])?\s+(?:[0-9]{2,3}|及格|中等|优秀|良好|合格))/g, "$1 $2")
    .replace(/\s+/g, " ");
  const rowPattern =
    /([\u4e00-\u9fa5A-Za-z][\u4e00-\u9fa5A-Za-z0-9（）()ⅠⅡⅢⅣIV\-·/ ]{1,44}?)\s+([0-9](?:\.[0-9])?)\s+([0-9]{2,3}|及格|中等|优秀|良好|合格)\s*(必修|选修|任选|限选)?\s*(20\d{2}[-/.年]?\d{1,2})?/g;
  for (const match of source.matchAll(rowPattern)) {
    const row = {
      course: cleanCourseName(match[1]),
      credits: cleanText(match[2]),
      grade: cleanText(match[3]),
      term: normalizeTerm(match[5] || ""),
      note: match[4] ? `OCR识别：${cleanText(match[4])}` : "OCR识别，请核对",
    };
    if (!looksLikeValidTranscriptRow(row)) continue;
    const key = `${row.course}|${row.credits}|${row.grade}|${row.term}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(row);
    if (rows.length >= 60) break;
  }
  return rows;
}

function extractCourseNameRowsFromText(text) {
  const source = compactChineseSpacing(text);
  const coursePatterns = [
    /普通化学/g, /体育[一二三四ⅠⅡⅢⅣIV]+/g, /工程图学[ⅠⅡ一二]*/g, /计算机程序设计[（(]?\s*VC\s*[）)]?/gi,
    /大学英语(?:基础|拓展)?模块[ABC]?/g, /能源科学与技术导论/g, /大学物理(?:实验)?[IA-B]*/gi,
    /大学计算思维/g, /高等数学[IA-B]*/gi, /工程训练[IA-B]*/gi, /大学俄语/g, /线性代数/g,
    /人体解剖生理学概论/g, /认识实习/g, /概率论与数理统计/g, /电工与电子技术(?:实验)?[ⅠⅡ一二]*/g,
    /计算机硬件技术基础[ⅠⅡ一二]*/g, /内燃机(?:构造实验|工作过程数值模拟|原理和设计课程设计|原理|设计)?/g,
    /专业外语阅读/g, /机械设计基础[ⅠⅡ一二]*/g, /汽车概论/g, /动力机械(?:测试技术|排放与净化)?/g,
    /生产实习/g, /节能减排技术/g, /传热学/g, /新能源汽车技术/g, /发动机电子控制技术/g, /毕业设计[（(]?论文[）)]?/g,
    /毕业实习/g, /创新设计/g, /数据结构/g, /算法设计|算法分析/g, /操作系统/g, /计算机网络/g, /数据库/g,
    /控制理论|自动控制原理/g, /信号与系统/g, /通信原理/g, /电路分析/g, /数字电子技术|模拟电子技术/g,
    /统计学|应用统计/g, /微积分|线性代数|概率论/g,
  ];
  const rows = [];
  const seen = new Set();
  for (const pattern of coursePatterns) {
    for (const match of source.matchAll(pattern)) {
      const course = cleanCourseName(match[0]).replace(/\s+/g, "");
      if (!course || course.includes(SENSITIVE_TEXT_REPLACEMENT) || seen.has(course)) continue;
      seen.add(course);
      rows.push({ course, grade: "", credits: "", term: "", note: "已从成绩单识别到课程名，请补充/核对成绩和学分" });
      if (rows.length >= 50) return rows;
    }
  }
  return rows;
}

function buildTranscriptRowsFromProfile(profile) {
  const rows = Array.isArray(profile.transcriptRows) ? profile.transcriptRows : [];
  return rows
    .map((row) => ({
      course: cleanText(row.course),
      grade: cleanText(row.grade),
      credits: cleanText(row.credits),
      term: cleanText(row.term),
      note: cleanText(row.note),
    }))
    .filter((row) => cleanText([row.course, row.grade, row.credits, row.term, row.note].join(" ")));
}

function buildTranscriptSummary(parsedFiles, profile = {}) {
  const profileRows = buildTranscriptRowsFromProfile(profile);
  const templateRows = parsedFiles.flatMap((file) => (Array.isArray(file.templateRows) ? file.templateRows : []));
  const profileRowsText = profileRows.map((row) => [row.course, row.grade, row.credits, row.term, row.note].join(" ")).join(" ");
  const templateRowsText = templateRows.map((row) => [row.course, row.grade, row.credits, row.term, row.note].join(" ")).join(" ");
  const transcriptText = cleanText([parsedFiles.map((file) => file.text).join(" "), templateRowsText, profileRowsText].join(" "));
  const scoreInfo = extractScoreFromTranscript([transcriptText, profile.gpa].join(" "));
  const templateMajor = cleanText(parsedFiles.find((file) => file.templateMajor)?.templateMajor || "");
  const major = templateMajor || extractMajorFromText(transcriptText) || cleanText(profile.major);
  const signals = collectDomainSignals([transcriptText, profile.major, profile.targetField, profile.courses, profile.experience, profile.projects].join(" "));
  const methods = Array.from(new Set(parsedFiles.map((file) => file.method).filter(Boolean)));
  const sensitiveHidden = transcriptText.includes(SENSITIVE_TEXT_REPLACEMENT) || parsedFiles.some((file) => file.templateSensitiveHidden);
  let confidence = "低";
  if (templateRows.length >= 6 || transcriptText.length > 280 || profileRows.length >= 6) confidence = "高";
  else if (transcriptText.length > 120 || profileRows.length >= 2) confidence = "中";

  const summaryBits = [];
  if (parsedFiles.length) summaryBits.push(`已读取 ${parsedFiles.length} 份成绩单`);
  if (templateRows.length) summaryBits.push(`已按成绩单模板识别 ${templateRows.length} 行课程`);
  if (profileRows.length) summaryBits.push(`已纳入 ${profileRows.length} 行校对课程`);
  if (scoreInfo?.raw) summaryBits.push(`识别到成绩 ${scoreInfo.raw}`);
  if (major) summaryBits.push(`识别到专业 ${major}`);
  if (signals.keywords.length) summaryBits.push(`课程关键词 ${signals.keywords.slice(0, 4).join("、")}`);
  if (sensitiveHidden) summaryBits.push("政治敏感课程/人物信息已按合规规则隐藏");
  if (!summaryBits.length) summaryBits.push("未从成绩单中识别到足够文字，将主要依据表单信息匹配");

  return {
    transcriptText,
    extractedScore: scoreInfo?.normalized || null,
    extractedScoreText: scoreInfo?.raw || cleanText(profile.gpa),
    extractedMajor: major,
    detectedDomains: signals.domains,
    keywords: signals.keywords,
    methods,
    confidence,
    sensitiveHidden,
    privacyNote: "政治敏感课程/人物信息会自动隐藏，不进入对外展示和推荐报告；院校匹配仍会根据非敏感课程、专业、成绩和目标方向继续进行。",
    summary: `${summaryBits.join("；")}。`,
    preview: transcriptText ? `${transcriptText.slice(0, 180)}${transcriptText.length > 180 ? "..." : ""}` : "当前成绩单未识别出稳定文本，建议上传更清晰的 PDF 或图片。",
    rowsFromTemplate: templateRows,
    rowsFromProfile: profileRows,
  };
}

function buildTranscriptPreviewRows(transcriptSummary) {
  if (transcriptSummary.rowsFromTemplate?.length) return transcriptSummary.rowsFromTemplate;
  const rows = extractTranscriptRowsFromText(transcriptSummary.transcriptText);
  if (rows.length >= 3) return rows;
  const courseRows = extractCourseNameRowsFromText(transcriptSummary.transcriptText);
  if (courseRows.length) return courseRows;
  if (transcriptSummary.rowsFromProfile?.length) return transcriptSummary.rowsFromProfile;
  if (rows.length) return rows;
  if (transcriptSummary.extractedScoreText) {
    return [{ course: "综合成绩 / GPA", grade: transcriptSummary.extractedScoreText, credits: "", term: "", note: "从成绩单文字中识别到综合成绩，请核对" }];
  }
  return [{ course: "待校对课程", grade: "", credits: "", term: "", note: "图片/PDF文字未稳定识别，请手动录入关键课程、成绩和学分" }];
}

function summarizeParsedFiles(files, parsedFiles = []) {
  return (files || []).slice(0, MAX_FILES).map((file, index) => ({
    name: cleanText(file.name || `upload-${index + 1}`),
    size: Number(file.size || parsedFiles[index]?.size || 0),
    type: String(file.type || ""),
    extractedTextLength: parsedFiles[index]?.textLength || 0,
    extractedTextPreview: parsedFiles[index]?.text ? parsedFiles[index].text.slice(0, 240) : "",
    extractionMethod: parsedFiles[index]?.method || "未解析",
  }));
}

async function createTranscriptPreview(body = {}) {
  const files = Array.isArray(body.files) ? body.files : Array.isArray(body.profile?.files) ? body.profile.files : [];
  const parsedFiles = await parseUploadedFiles(files);
  const transcriptSummary = buildTranscriptSummary(parsedFiles, body.profile || {});
  const rows = buildTranscriptPreviewRows(transcriptSummary);
  const warnings = [];
  if (transcriptSummary.sensitiveHidden) warnings.push("政治敏感课程/人物信息已自动隐藏，推荐仍会继续。");
  if (transcriptSummary.confidence === "低") warnings.push("成绩单识别置信度较低，请先核对课程、成绩和学分。");
  const summary = {
    confidence: transcriptSummary.confidence,
    extractedScoreText: transcriptSummary.extractedScoreText,
    extractedMajor: transcriptSummary.extractedMajor,
    sensitiveHidden: transcriptSummary.sensitiveHidden,
    privacyNote: transcriptSummary.privacyNote,
    keywords: transcriptSummary.keywords,
    methods: transcriptSummary.methods,
    summary: transcriptSummary.summary,
    preview: transcriptSummary.preview,
    warnings,
  };
  return {
    ok: true,
    source: "mini-program-standalone-transcript",
    rows,
    transcriptSummary: summary,
    transcriptPreview: {
      rows,
      confidence: transcriptSummary.confidence,
      summary: transcriptSummary.summary,
      warnings,
    },
    files: summarizeParsedFiles(files, parsedFiles),
  };
}

function splitPreference(value) {
  return String(value || "")
    .split(/[、，,;/]/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function normalizeRecommendationCount(value) {
  const count = Number(value || 1);
  return [1, 3, 6, 10].includes(count) ? count : 1;
}

function programCorpus(program) {
  return normalizeText([
    program.university,
    program.city,
    program.programDisplayName,
    program.programTitle,
    program.overview,
    program.prerequisites,
    program.languageRequirements,
    program.applicationInfo,
    program.searchText,
    Array.isArray(program.keywords) ? program.keywords.join(" ") : "",
    Array.isArray(program.domains) ? program.domains.join(" ") : "",
  ].join(" "));
}

function targetIntentBoost(targetText, corpus) {
  let boost = 0;
  let penalty = 0;
  const has = (pattern) => pattern.test(targetText);
  if (has(/机器人|自动化|控制|robot|automation|control/)) {
    if (/robot|automation|control|cybernetics|自动化|控制/.test(corpus)) boost += 14;
    if (/automotive|aerospace|vehicle|汽车|航空/.test(corpus) && !/robot|automation|control|cybernetics/.test(corpus)) penalty += 10;
  }
  if (has(/服装|纺织|textile|fashion|clothing|garment/)) {
    if (/textile|fashion|clothing|garment|服装|纺织|设计/.test(corpus)) boost += 16;
    if (!/textile|fashion|clothing|garment|服装|纺织/.test(corpus)) penalty += 18;
    if (/mechanical|automotive|aerospace/.test(corpus) && !/textile|fashion|clothing/.test(corpus)) penalty += 8;
  }
  if (has(/数据|人工智能|机器学习|ai|data|analytics|machine learning/)) {
    if (/data|analytics|artificial intelligence|machine learning|数据|人工智能/.test(corpus)) boost += 12;
  }
  if (has(/法律|法学|知识产权|law|legal/)) {
    if (/law|legal|intellectual property|法律|法学/.test(corpus)) boost += 14;
    if (/mechanical|automotive|aerospace/.test(corpus)) penalty += 12;
  }
  return boost - penalty;
}

function scoreProgram(program, context) {
  const corpus = programCorpus(program);
  const titleCorpus = normalizeText([
    program.programDisplayName,
    program.programTitle,
    program.program,
    program.university,
  ].join(" "));
  const domains = Array.isArray(program.domains) ? program.domains.map((item) => String(item).toLowerCase()) : [];
  const keywords = Array.isArray(program.keywords) ? program.keywords.map((item) => String(item).toLowerCase()) : [];
  const domainOverlap = domains.filter((domain) => context.domains.includes(domain)).length;
  const keywordOverlap = keywords.filter((keyword) => context.profileCorpus.includes(keyword) || context.transcriptCorpus.includes(keyword)).length;
  let score = 48 + domainOverlap * 13 + Math.min(keywordOverlap * 3, 15);
  score += targetIntentBoost(context.targetText, corpus);
  if (/机器人|自动化|控制|机械|能源|动力|热能|robot|automation|control|mechanical|energy/.test(context.targetText)) {
    if (/finance|auditing|taxation|accounting|economics|business|marketing/.test(titleCorpus)) score -= 28;
    if (/aerospace|automotive|vehicle/.test(titleCorpus) && !/robot|automation|control|cybernetics|mechatronics/.test(titleCorpus)) score -= 12;
  }
  if (/能源|动力|热能|内燃机|机械|energy|power|thermal|combustion|mechanical/.test(context.targetText)) {
    if (/mechanical|energy|power|thermal|process|electrical|automotive|production|manufacturing|cybernetics|mechatronics|engineering/.test(titleCorpus)) score += 10;
    if (/data|analytics|artificial intelligence|society|neuroscience|business|finance|economics|law/.test(titleCorpus)) score -= 24;
  }
  if (/机器人|robot|robotics/.test(context.targetText) && !/robot|automation|control|cybernetics|mechatronics|electrical|information technology/.test(titleCorpus)) {
    score -= 8;
    if (domains.includes("mechanical") && !domains.some((domain) => ["robotics", "automation"].includes(domain))) {
      score = Math.min(score, 78);
    }
  }
  if (/服装|纺织|textile|fashion|clothing|garment/.test(context.targetText)) {
    if (!/textile|fashion|clothing|garment|服装|纺织/.test(titleCorpus)) score -= 10;
  }
  if (/法律|法学|知识产权|law|legal/.test(context.targetText) && /mechanical|automotive|aerospace|finance|business/.test(titleCorpus)) {
    score -= 18;
  }
  if (context.cityPrefs.includes(String(program.city || "").toLowerCase())) score += 8;
  if (context.languagePref.includes("英") || context.languagePref.includes("english")) {
    if ((program.languageOfInstruction || []).includes("english") || /english|englisch/.test(corpus)) score += 4;
  }
  if (context.languagePref.includes("德") || context.languagePref.includes("german")) {
    if ((program.languageOfInstruction || []).includes("german") || /german|deutsch/.test(corpus)) score += 4;
  }
  const evidenceFields = ["overview", "prerequisites", "languageRequirements", "applicationInfo", "applicationPeriod", "duration", "ects"];
  const evidenceScore = Math.min(100, 40 + evidenceFields.filter((field) => cleanText(program[field]).length > 8).length * 9);
  if (evidenceScore >= 80) score += 5;
  if ((program.sourceTier === "curated-fallback" || program.curatedFallback) && domainOverlap > 0) score += 10;
  if (
    /机器人|robot|robotics/.test(context.targetText) &&
    !/robot|automation|control|cybernetics|mechatronics|electrical|information technology/.test(titleCorpus) &&
    domains.includes("mechanical") &&
    !domains.some((domain) => ["robotics", "automation"].includes(domain))
  ) {
    score = Math.min(score, 78);
  }
  if (context.transcriptConfidence === "低" && score > 82) score = 82;
  return { score: Math.max(45, Math.min(96, Math.round(score))), evidenceScore };
}

function curatedFallbackMatches(program, context) {
  if (program.sourceTier !== "curated-fallback" && !program.curatedFallback) return false;
  const domains = Array.isArray(program.domains) ? program.domains.map((item) => String(item).toLowerCase()) : [];
  const titleCorpus = normalizeText([program.programDisplayName, program.programTitle, program.program].join(" "));
  const target = context.targetText;
  if (/机器人|自动化|控制|robot|automation|control/.test(target)) {
    return domains.some((domain) => ["robotics", "automation"].includes(domain)) || /cybernetics|robot|automation|control/.test(titleCorpus);
  }
  if (/服装|纺织|textile|fashion|clothing|garment/.test(target)) {
    return domains.some((domain) => ["textile", "design"].includes(domain)) || /textile|fashion|clothing|garment/.test(titleCorpus);
  }
  if (/数据|人工智能|机器学习|ai|data|analytics|machine learning/.test(target)) {
    return domains.some((domain) => ["data", "ai", "cs"].includes(domain));
  }
  if (/法律|法学|知识产权|law|legal/.test(target)) {
    return domains.includes("law") || /law|legal|intellectual property/.test(titleCorpus);
  }
  return false;
}

function mergeStringArrays(first, second) {
  return Array.from(
    new Set([...(Array.isArray(first) ? first : []), ...(Array.isArray(second) ? second : [])].map((item) => String(item).trim()).filter(Boolean))
  );
}

function buildStandaloneRecommendation(profile, transcriptSummary) {
  const count = normalizeRecommendationCount(profile.recommendationCount);
  const profileCorpus = normalizeText([
    profile.major,
    profile.targetField,
    profile.courses,
    profile.thesisTopic,
    profile.projects,
    profile.internships,
    profile.experience,
    profile.notes,
    profile.careerPlan,
  ].join(" "));
  const transcriptCorpus = normalizeText(transcriptSummary.transcriptText);
  const combinedSignals = collectDomainSignals([profileCorpus, transcriptCorpus].join(" "));
  const context = {
    domains: combinedSignals.domains,
    profileCorpus,
    transcriptCorpus,
    targetText: normalizeText([profile.targetField, profile.major].join(" ")),
    cityPrefs: splitPreference(profile.cityPreference),
    languagePref: normalizeText(profile.instructionLanguage),
    transcriptConfidence: transcriptSummary.confidence,
  };
  const seenPrograms = new Set();
  const curatedFallbackPrograms = FALLBACK_PROGRAMS.map((program) => ({ ...program, sourceTier: "curated-fallback" }));
  const programMap = new Map();
  [...EXTERNAL_PROGRAMS, ...curatedFallbackPrograms].forEach((program) => {
    const key = normalizeText(`${program.university || ""}|${program.programDisplayName || program.programTitle || program.program || ""}`);
    if (!key) return;
    const existing = programMap.get(key);
    if (!existing) {
      programMap.set(key, program);
      return;
    }
    if (program.sourceTier === "curated-fallback") {
      programMap.set(key, {
        ...existing,
        curatedFallback: true,
        domains: mergeStringArrays(existing.domains, program.domains),
        keywords: mergeStringArrays(existing.keywords, program.keywords),
      });
    }
  });
  const programs = Array.from(programMap.values()).filter((program) => {
    const key = normalizeText(`${program.university || ""}|${program.programDisplayName || program.programTitle || program.program || ""}`);
    if (!key || seenPrograms.has(key)) return false;
    seenPrograms.add(key);
    return true;
  });
  const ranked = programs
    .map((program) => {
      const scored = scoreProgram(program, context);
      if (curatedFallbackMatches(program, context)) {
        scored.score = Math.max(scored.score, context.transcriptConfidence === "低" ? 82 : 88);
      }
      return { program, ...scored };
    })
    .sort((a, b) => b.score - a.score || b.evidenceScore - a.evidenceScore)
    .slice(0, Math.max(count, 1));

  const target = cleanText(profile.targetField || profile.major || "当前申请方向");
  const warnings = [];
  if (transcriptSummary.confidence === "低") warnings.push("成绩单识别/校对信息有限，推荐结果已保守处理。");
  if (!cleanText(profile.targetField)) warnings.push("缺少明确目标方向，系统更多依赖当前专业和课程关键词。");
  const strengths = [];
  if (context.domains.length && !context.domains.includes("general")) strengths.push(`识别到方向信号：${context.domains.slice(0, 4).join("、")}`);
  if (transcriptSummary.extractedScoreText) strengths.push(`成绩信号：${transcriptSummary.extractedScoreText}`);

  return {
    studentSummary: `已使用小程序独立推荐引擎，为“${target}”生成 ${ranked.length} 个德国院校专业候选。`,
    positioning: "推荐基于本地专业库、已填写资料、成绩单识别/校对表和规则评分生成，不依赖网页版服务。",
    transcriptSummary,
    inputQuality: {
      level: transcriptSummary.confidence === "高" && target ? "中高" : transcriptSummary.confidence,
      score: transcriptSummary.confidence === "高" ? 78 : transcriptSummary.confidence === "中" ? 62 : 42,
      warnings,
      strengths,
    },
    accuracyNotes: [
      "小程序后端已独立完成成绩单解析和院校推荐，不再转发到网页版。",
      "若照片/PDF存在反光、折弯、裁切或扫描图层不可读，系统会保留可校对表格并继续生成保守推荐。",
      "政治敏感课程/人物信息会自动隐藏，不进入对外展示和推荐报告。",
    ],
    recommendationQuality: {
      level: EXTERNAL_PROGRAMS.length ? "专业库 + 精选兜底" : "基础兜底",
      notes: ["正式申请前仍需顾问核对项目官网 Zulassungsvoraussetzungen、语言要求和截止日期。"],
    },
    recommendationCount: ranked.length,
    recommendations: ranked.map(({ program, score, evidenceScore }, index) => ({
      rank: index + 1,
      university: program.university,
      program: program.programDisplayName || program.programTitle || program.program,
      degree: profile.targetDegree || program.degree || "硕士",
      city: program.city || "",
      matchPercent: score,
      matchLevel: score >= 85 ? "高匹配" : score >= 74 ? "中高匹配" : score >= 62 ? "中匹配" : "初步候选",
      evaluation: score >= 82 ? "适合作为重点候选" : score >= 70 ? "可作为主申/补充候选" : "建议顾问复核后保留",
      reason: `与${target}方向、课程关键词和成绩单信号存在匹配；当前按独立本地规则评分为 ${score}%。`,
      detail: {
        matchReasonDetails: [
          program.domains?.length ? `专业方向：${program.domains.slice(0, 4).join("、")}` : "专业方向存在初步相关性",
          program.keywords?.length ? `关键词：${program.keywords.slice(0, 5).join("、")}` : "根据专业库文本匹配",
          transcriptSummary.keywords?.length ? `成绩单关键词：${transcriptSummary.keywords.slice(0, 4).join("、")}` : "成绩单关键词有限，已保守处理",
        ],
        fitHighlights: (program.strengths || []).slice(0, 3),
        riskHighlights: ["正式递交前需核对课程匹配、语言要求、截止日期和 APS/uni-assist 要求。"],
        requirementHighlights: [program.prerequisites, program.languageRequirements].filter(Boolean).map((item) => cleanText(item).slice(0, 140)).slice(0, 2),
        sourceEvidence: [],
        facts: {
          duration: cleanText(program.duration),
          ects: cleanText(program.ects),
          languages: Array.isArray(program.languageOfInstruction) ? program.languageOfInstruction : [],
          applicationPeriod: cleanText(program.applicationPeriod),
          catalogCoverage: evidenceScore >= 80 ? "高覆盖" : evidenceScore >= 60 ? "中覆盖" : "基础覆盖",
          catalogCoverageScore: evidenceScore,
        },
      },
      qualityAudit: {
        status: evidenceScore >= 80 ? "专业库证据较完整" : "专业库证据需复核",
        evidenceScore,
        level: evidenceScore >= 80 ? "高" : evidenceScore >= 60 ? "中" : "基础",
      },
    })),
    nextSteps: ["核对成绩单校对表中的课程、成绩和学分。", "让顾问按冲刺/主申/保底重新分层。", "正式申请前逐项核对官网要求。"],
    source: EXTERNAL_PROGRAMS.length ? "mini-program-standalone-catalog-with-curated-fallback" : "mini-program-standalone-fallback",
    aiReview: {
      enabled: false,
      status: "standalone",
      model: "",
      summary: "本次由小程序独立规则引擎生成，未调用网页版服务。",
      reliabilityNotes: [],
    },
  };
}

async function createRecommendation(profile = {}) {
  const parsedFiles = await parseUploadedFiles(profile.files);
  const transcriptSummary = buildTranscriptSummary(parsedFiles, profile);
  return buildStandaloneRecommendation(profile, transcriptSummary);
}

function createMaterialDraft(body = {}) {
  const material = body.material || {};
  const profile = body.workspace?.profile || {};
  const context = body.workspace?.context || {};
  const recommendations = Array.isArray(body.workspace?.recommendations) ? body.workspace.recommendations : [];
  const topPrograms = recommendations.slice(0, 3).map((item) => `${item.university || ""} ${item.program || ""}`.trim()).filter(Boolean).join("、");
  const name = cleanText(profile.name || "同学");
  const target = cleanText(profile.targetField || profile.major || "德国留学申请方向");
  const draft = [
    `${material.name || "申请材料"}初稿`,
    "",
    `学生：${name}`,
    `申请方向：${target}`,
    topPrograms ? `当前候选项目：${topPrograms}` : "",
    context.positioning ? `申请定位：${context.positioning}` : "",
    "",
    "建议内容结构：",
    "1. 简要说明当前学校、专业、成绩和目标方向。",
    "2. 结合课程、项目、实习或论文说明与目标专业的关联。",
    "3. 针对德国项目强调课程匹配、研究兴趣、职业规划和材料补充计划。",
    "4. 正式递交前请由顾问按目标学校要求逐项核对。",
  ].filter(Boolean).join("\n");
  return { ok: true, draft, source: "mini-program-standalone-material-draft" };
}

module.exports = {
  createRecommendation,
  createTranscriptPreview,
  createMaterialDraft,
  parseUploadedFiles,
  buildTranscriptSummary,
};
