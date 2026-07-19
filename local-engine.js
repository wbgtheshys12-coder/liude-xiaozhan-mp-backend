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
const MAX_PDF_OCR_PAGES = Math.max(1, Math.min(Number(process.env.OCR_MAX_PDF_PAGES || 3), 6));
const LOCAL_RUNTIME_NODE_MODULES =
  process.platform === "win32"
    ? path.join(os.homedir(), ".cache", "codex-runtimes", "codex-primary-runtime", "dependencies", "node", "node_modules")
    : "";
const fallbackRequire = LOCAL_RUNTIME_NODE_MODULES && fs.existsSync(LOCAL_RUNTIME_NODE_MODULES)
  ? createRequire(path.join(LOCAL_RUNTIME_NODE_MODULES, "codex-runtime-fallback.js"))
  : null;

let pdfJsPromise = null;
let bundledTessdataConfig = null;
let pdfJsResourceOptions = null;

function copyDirectorySafe(source, target) {
  fs.mkdirSync(target, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const sourcePath = path.join(source, entry.name);
    const targetPath = path.join(target, entry.name);
    if (entry.isDirectory()) {
      copyDirectorySafe(sourcePath, targetPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(sourcePath, targetPath);
    }
  }
}

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
  { domains: ["energy", "mechanical", "engineering"], university: "Technical University of Munich", programDisplayName: "Energy and Process Engineering", city: "Munich", degree: "Master", keywords: ["energy", "process", "thermal"] },
  { domains: ["energy", "environment", "engineering"], university: "FAU Erlangen-Nurnberg", programDisplayName: "Clean Energy Processes (M.Sc.)", city: "Erlangen", degree: "Master", keywords: ["clean energy", "processes", "energy"] },
  { domains: ["mechanical", "engineering"], university: "Technical University of Munich", programDisplayName: "Development, Production and Management in Mechanical Engineering", city: "Munich", degree: "Master", keywords: ["mechanical", "production", "manufacturing"] },
  { domains: ["materials", "engineering"], university: "University of Stuttgart", programDisplayName: "Materials Science (Materialwissenschaft)", city: "Stuttgart", degree: "Master", keywords: ["materials", "material science"] },
  { domains: ["robotics", "automation", "engineering"], university: "University of Stuttgart", programDisplayName: "Engineering Cybernetics", city: "Stuttgart", degree: "Master", keywords: ["control", "automation", "cybernetics"] },
  { domains: ["electrical", "engineering"], university: "Karlsruhe Institute of Technology", programDisplayName: "Electrical Engineering and Information Technology", city: "Karlsruhe", degree: "Master", keywords: ["electrical", "electronics", "communication"] },
  { domains: ["business", "management"], university: "University of Cologne", programDisplayName: "Business Analytics & Econometrics", city: "Cologne", degree: "Master", keywords: ["business", "analytics", "econometrics"] },
  { domains: ["finance", "business"], university: "University of Mannheim", programDisplayName: "Mannheim Master in Finance, Accounting and Taxation", city: "Mannheim", degree: "Master", keywords: ["finance", "accounting", "taxation"] },
  { domains: ["law", "data"], university: "TU Dresden", programDisplayName: "International Studies in Intellectual Property Law and Data Law", city: "Dresden", degree: "Master", keywords: ["law", "data", "intellectual property"] },
  {
    domains: ["design", "textile", "materials", "mechanical", "engineering"],
    university: "TU Dresden",
    programDisplayName: "Textile Machinery and High Performance Material Technology",
    city: "Dresden",
    degree: "Master of Science",
    keywords: ["textile", "clothing", "ready-made clothing", "high performance materials", "textile machinery", "design"],
    overview: "Research-oriented Master program in textile machinery, textile engineering, ready-made clothing technology and high-performance material technology.",
    prerequisites: "First degree in mechanical engineering, textile engineering or technology, ready-made clothing engineering or technology, textile chemistry, textile finishing, or a closely related field; aptitude/admission regulations must be checked before application.",
    languageRequirements: "German-taught program; verify the current language requirement on the official TU Dresden page before application.",
    applicationPeriod: "Winter semester; public programme listings mention 15 July as an application deadline, but the current official page must be checked.",
    duration: "4 semesters",
    ects: "120 ECTS",
    sourcePaths: [
      { url: "https://tu-dresden.de/studium/vor-dem-studium/studienangebot/sins/sins_studiengang?autoid=105&set_language=en" },
      { url: "https://www2.daad.de/deutschland/studienangebote/international-programmes/en/detail/3683/" }
    ],
  },
  { domains: ["environment", "sustainability"], university: "TU Berlin", programDisplayName: "Ecology and Environmental Planning", city: "Berlin", degree: "Master", keywords: ["environment", "ecology", "sustainability"] },
  { domains: ["civil", "engineering"], university: "Technical University of Munich", programDisplayName: "Civil Engineering", city: "Munich", degree: "Master", keywords: ["civil", "structural", "engineering"] },
];

const TRANSCRIPT_TEMPLATES_FILE =
  process.env.MP_TRANSCRIPT_TEMPLATES_FILE ||
  path.join(process.env.MP_DATA_DIR || path.join(__dirname, "data"), "transcript-templates.private.json");

function loadPrivateTranscriptTemplates() {
  try {
    if (!fs.existsSync(TRANSCRIPT_TEMPLATES_FILE)) return [];
    const payload = JSON.parse(fs.readFileSync(TRANSCRIPT_TEMPLATES_FILE, "utf8"));
    if (!Array.isArray(payload)) return [];
    return payload.filter(
      (template) =>
        template &&
        /^[a-f0-9]{64}$/i.test(String(template.sha256 || "")) &&
        Array.isArray(template.rows)
    );
  } catch (error) {
    console.warn("私有成绩单模板读取失败:", error.message);
    return [];
  }
}

const KNOWN_TRANSCRIPT_TEMPLATES = loadPrivateTranscriptTemplates();

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
  if (!hash) return null;
  return KNOWN_TRANSCRIPT_TEMPLATES.find((template) => template.sha256 === hash) || null;
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

function getPdfJsResourceOptions() {
  if (pdfJsResourceOptions) return pdfJsResourceOptions;
  try {
    const packageRoot = path.dirname(resolveModule("pdfjs-dist/package.json"));
    const assetRoot = path.join(os.tmpdir(), "liude-xiaozhan-pdfjs-assets");
    const cMapTarget = path.join(assetRoot, "cmaps");
    const standardFontTarget = path.join(assetRoot, "standard_fonts");
    if (!fs.existsSync(path.join(cMapTarget, "UniGB-UCS2-H.bcmap"))) {
      copyDirectorySafe(path.join(packageRoot, "cmaps"), cMapTarget);
    }
    if (!fs.existsSync(path.join(standardFontTarget, "FoxitSerif.pfb"))) {
      copyDirectorySafe(path.join(packageRoot, "standard_fonts"), standardFontTarget);
    }
    pdfJsResourceOptions = {
      cMapUrl: pathToFileURL(cMapTarget + path.sep).href,
      cMapPacked: true,
      standardFontDataUrl: pathToFileURL(standardFontTarget + path.sep).href,
    };
    return pdfJsResourceOptions;
  } catch (error) {
    return {};
  }
}

function buildPdfDocumentOptions(buffer) {
  return {
    data: new Uint8Array(buffer),
    useWorkerFetch: false,
    isEvalSupported: false,
    disableFontFace: true,
    ...getPdfJsResourceOptions(),
  };
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

function extractTextFromPdfWithPdfJsText(buffer) {
  return new Promise((resolve) => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "liude-mp-pdf-text-"));
    const pdfPath = path.join(tempDir, "source.pdf");
    fs.writeFileSync(pdfPath, buffer);
    const childScript = `
      const fs = require("fs");
      const os = require("os");
      const path = require("path");
      const { pathToFileURL } = require("url");
      function cleanText(value) {
        return String(value || "").replace(/\\s+/g, " ").trim();
      }
      function copyDirOnce(source, target, sentinel) {
        if (!fs.existsSync(path.join(target, sentinel))) {
          fs.mkdirSync(target, { recursive: true });
          for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
            const sourcePath = path.join(source, entry.name);
            const targetPath = path.join(target, entry.name);
            if (entry.isDirectory()) {
              copyDirOnce(sourcePath, targetPath, "");
            } else if (entry.isFile()) {
              fs.copyFileSync(sourcePath, targetPath);
            }
          }
        }
      }
      (async () => {
        const pdfPath = process.argv[1];
        const maxPagesArg = Number(process.argv[2] || 8);
        const pdfjsRoot = path.dirname(require.resolve("pdfjs-dist/package.json"));
        const assetRoot = path.join(os.tmpdir(), "liude-xiaozhan-pdfjs-assets");
        const cMapTarget = path.join(assetRoot, "cmaps");
        const fontTarget = path.join(assetRoot, "standard_fonts");
        copyDirOnce(path.join(pdfjsRoot, "cmaps"), cMapTarget, "UniGB-UCS2-H.bcmap");
        copyDirOnce(path.join(pdfjsRoot, "standard_fonts"), fontTarget, "FoxitSerif.pfb");
        const pdfjs = await import(pathToFileURL(require.resolve("pdfjs-dist/legacy/build/pdf.mjs")).href);
        const pdf = await pdfjs.getDocument({
          data: new Uint8Array(fs.readFileSync(pdfPath)),
          useWorkerFetch: false,
          isEvalSupported: false,
          disableFontFace: true,
          cMapUrl: pathToFileURL(cMapTarget + path.sep).href,
          cMapPacked: true,
          standardFontDataUrl: pathToFileURL(fontTarget + path.sep).href,
        }).promise;
        const chunks = [];
        const maxPages = Math.min(pdf.numPages, Math.max(1, Math.min(maxPagesArg, 12)));
        for (let pageIndex = 1; pageIndex <= maxPages; pageIndex += 1) {
          const page = await pdf.getPage(pageIndex);
          const content = await page.getTextContent();
          const text = content.items.map((item) => item.str || "").join(" ");
          if (text) chunks.push(text);
        }
        process.stdout.write(cleanText(chunks.join("\\n")));
      })().catch((error) => {
        process.stderr.write(String(error && error.stack ? error.stack : error));
        process.exit(2);
      });
    `;

    let stdout = "";
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      fs.rmSync(tempDir, { recursive: true, force: true });
      resolve(cleanText(stdout));
    };

    try {
      const child = spawn(process.execPath, ["-e", childScript, pdfPath, "8"], {
        cwd: __dirname,
        stdio: ["ignore", "pipe", "ignore"],
      });
      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString("utf8");
      });
      const timer = setTimeout(() => child.kill(), 16000);
      child.on("close", () => {
        clearTimeout(timer);
        finish();
      });
      child.on("error", () => {
        clearTimeout(timer);
        finish();
      });
    } catch (error) {
      finish();
    }
  });
}

function renderPdfPagesToImageFiles(buffer) {
  return new Promise((resolve) => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "liude-mp-pdf-render-"));
    const pdfPath = path.join(tempDir, "source.pdf");
    fs.writeFileSync(pdfPath, buffer);
    const childScript = `
      const fs = require("fs");
      const os = require("os");
      const path = require("path");
      const { pathToFileURL } = require("url");
      function copyDirOnce(source, target, sentinel) {
        if (!fs.existsSync(path.join(target, sentinel))) {
          fs.mkdirSync(target, { recursive: true });
          for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
            const sourcePath = path.join(source, entry.name);
            const targetPath = path.join(target, entry.name);
            if (entry.isDirectory()) {
              copyDirOnce(sourcePath, targetPath, "");
            } else if (entry.isFile()) {
              fs.copyFileSync(sourcePath, targetPath);
            }
          }
        }
      }
      (async () => {
        const pdfPath = process.argv[1];
        const outDir = process.argv[2];
        const maxPages = Math.max(1, Math.min(Number(process.argv[3] || 3), 6));
        const { createCanvas } = require("@napi-rs/canvas");
        const pdfjsRoot = path.dirname(require.resolve("pdfjs-dist/package.json"));
        const assetRoot = path.join(os.tmpdir(), "liude-xiaozhan-pdfjs-assets");
        const cMapTarget = path.join(assetRoot, "cmaps");
        const fontTarget = path.join(assetRoot, "standard_fonts");
        copyDirOnce(path.join(pdfjsRoot, "cmaps"), cMapTarget, "UniGB-UCS2-H.bcmap");
        copyDirOnce(path.join(pdfjsRoot, "standard_fonts"), fontTarget, "FoxitSerif.pfb");
        const pdfjs = await import(pathToFileURL(require.resolve("pdfjs-dist/legacy/build/pdf.mjs")).href);
        const pdf = await pdfjs.getDocument({
          data: new Uint8Array(fs.readFileSync(pdfPath)),
          useWorkerFetch: false,
          isEvalSupported: false,
          disableFontFace: true,
          cMapUrl: pathToFileURL(cMapTarget + path.sep).href,
          cMapPacked: true,
          standardFontDataUrl: pathToFileURL(fontTarget + path.sep).href,
        }).promise;
        const paths = [];
        const count = Math.min(pdf.numPages, maxPages);
        for (let pageIndex = 1; pageIndex <= count; pageIndex += 1) {
          const page = await pdf.getPage(pageIndex);
          const baseViewport = page.getViewport({ scale: 1 });
          const scale = Math.min(2.8, Math.max(1.6, 2400 / Math.max(baseViewport.width, baseViewport.height)));
          const viewport = page.getViewport({ scale });
          const width = Math.max(1, Math.ceil(viewport.width));
          const height = Math.max(1, Math.ceil(viewport.height));
          const canvas = createCanvas(width, height);
          const context = canvas.getContext("2d");
          context.fillStyle = "#fff";
          context.fillRect(0, 0, width, height);
          await page.render({ canvasContext: context, viewport }).promise;
          const outPath = path.join(outDir, "page-" + pageIndex + ".png");
          fs.writeFileSync(outPath, canvas.toBuffer("image/png"));
          paths.push(outPath);
        }
        process.stdout.write(JSON.stringify(paths));
      })().catch((error) => {
        process.stderr.write(String(error && error.stack ? error.stack : error));
        process.exit(2);
      });
    `;

    let stdout = "";
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      const fallbackPaths = Array.from({ length: MAX_PDF_OCR_PAGES }, (_, index) => path.join(tempDir, `page-${index + 1}.png`)).filter((item) => fs.existsSync(item));
      try {
        const parsedPaths = JSON.parse(stdout || "[]").filter((item) => typeof item === "string" && fs.existsSync(item));
        resolve({ tempDir, paths: parsedPaths.length ? parsedPaths : fallbackPaths });
      } catch (error) {
        resolve({ tempDir, paths: fallbackPaths });
      }
    };

    try {
      const child = spawn(process.execPath, ["-e", childScript, pdfPath, tempDir, String(MAX_PDF_OCR_PAGES)], {
        cwd: __dirname,
        stdio: ["ignore", "pipe", "ignore"],
      });
      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString("utf8");
      });
      const timer = setTimeout(() => child.kill(), 22000);
      child.on("close", () => {
        clearTimeout(timer);
        finish();
      });
      child.on("error", () => {
        clearTimeout(timer);
        finish();
      });
    } catch (error) {
      finish();
    }
  });
}

async function extractTextFromPdfWithPageOcr(buffer) {
  const { tempDir, paths } = await renderPdfPagesToImageFiles(buffer);
  if (!paths.length) {
    fs.rmSync(tempDir, { recursive: true, force: true });
    return "";
  }
  const chunks = [];
  try {
    for (const imagePath of paths) {
      const imageBuffer = fs.readFileSync(imagePath);
      const text = await extractTextFromImage(imageBuffer);
      if (text) chunks.push(text);
      if (scoreOcrText(chunks.join(" ")) >= 540) break;
    }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
  return cleanText(chunks.join(" "));
}

async function extractTextFromPdf(buffer) {
  const extractedText = await extractTextFromPdfWithPdfJsText(buffer);
  if (scoreOcrText(extractedText) >= 180) return extractedText;
  const fallbackText = await extractTextFromPdfWithPdftotext(buffer);
  const bestText = chooseBetterOcrText(extractedText, fallbackText);
  if (scoreOcrText(bestText) >= 180) return bestText;
  const pageOcrText = await extractTextFromPdfWithPageOcr(buffer);
  return chooseBetterOcrText(bestText, pageOcrText);
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
        method = text.length > 30 ? "PDF 文本/OCR提取" : "PDF 文本提取有限";
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
  if (match) {
    return cleanText(match[1]).replace(/(学分|成绩|属性|考试时间).*$/, "").slice(0, 30);
  }
  const englishPatterns = [
    /\bMajor\s*[:：]?\s*([A-Z][A-Za-z0-9 &()/.\-]{2,80}?)(?=\s+(?:Credit|Gredit|Course|Academic|Student|College|Date|Admission|Program|F\/M)\b|$)/i,
    /\bspecialty\s+in\s+([A-Z][A-Za-z0-9 &()/.\-]{2,80}?)(?=\s+(?:from|upon|with|\.|,)|$)/i,
    /\bSubject\s*[:：]?\s*([A-Z][A-Za-z0-9 &()/.\-]{2,80}?)(?=\s+(?:School|Department|Gender|Student|Course)\b|$)/i,
  ];
  for (const pattern of englishPatterns) {
    const englishMatch = cleanText(text).match(pattern);
    if (englishMatch) {
      return cleanText(englishMatch[1]).replace(/\s+/g, " ").slice(0, 60);
    }
  }
  return "";
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
  add("ai", ["AI", "机器学习", "人工智能"], /人工智能|机器学习|深度学习|\bai\b|artificial intelligence|machine learning/);
  add("data", ["数据", "统计", "analytics"], /数据|统计|概率论|analytics|data|database|econometrics/);
  add("cs", ["计算机", "软件", "算法"], /计算机|软件|算法|computer|software|informatik|programming|数据结构|操作系统/);
  add("robotics", ["自动化", "控制", "机器人"], /机器人|自动化|控制|robotics?|automation|control engineering|automatic control|\bcontrol\b|cybernetics/);
  add("mechanical", ["机械", "汽车", "制造"], /机械|车辆|汽车|制造|内燃机|传热|动力|mechatronics|mechanical|automotive/);
  add("energy", ["能源", "动力", "热能"], /能源|动力|热能|内燃机|传热|发动机|energy|power|thermal|combustion|clean energy|process engineering/);
  add("electrical", ["电气", "电子", "通信"], /电气|电子|通信|electrical|electronic\b|electronics|telecommunication|communication|information engineering|information technology|信号|电路/);
  add("materials", ["材料", "材料科学"], /材料|materials?|material science|werkstoff/);
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
  const gradeFirstRowPattern =
    /([\u4e00-\u9fa5A-Za-z][\u4e00-\u9fa5A-Za-z0-9（）()ⅠⅡⅢⅣIV\-·/ ]{1,44}?)\s+([6-9][0-9]|100|及格|中等|优秀|良好|合格)\s+([0-9](?:\.[0-9])?)\s*(必修|选修|任选|限选)?\s*(20\d{2}[-/.年]?\d{1,2})?/g;
  for (const match of source.matchAll(gradeFirstRowPattern)) {
    const row = {
      course: cleanCourseName(match[1]),
      grade: cleanText(match[2]),
      credits: cleanText(match[3]),
      term: normalizeTerm(match[5] || ""),
      note: match[4] ? `智能整理：${cleanText(match[4])}` : "智能整理，请核对",
    };
    if (!looksLikeValidTranscriptRow(row)) continue;
    const key = `${row.course}|${row.credits}|${row.grade}|${row.term}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(row);
    if (rows.length >= 60) break;
  }
  const englishRowPattern =
    /\b[A-Z0-9]{6,10}\s+([A-Z][A-Za-z0-9.,'’&()+/\- ]{2,88}?)\s+([0-9](?:\.[05])?)\s+(?:Y\s+)?([A-F][+-]?|P|EX|W|PASS|N\/A|[0-9]{2,3})\s+(?:N\/A|[0-4](?:\.\d)?)\s+(20\d{2}-(?:Autumn|Spring|Summer|Fall)|20\d{2}[A-Za-z-]*)/g;
  for (const match of source.matchAll(englishRowPattern)) {
    const row = {
      course: cleanCourseName(match[1]),
      credits: cleanText(match[2]),
      grade: cleanText(match[3]),
      term: cleanText(match[4]),
      note: "英文成绩单OCR/文本识别，请核对",
    };
    if (!looksLikeValidTranscriptRow(row)) continue;
    const key = `${row.course}|${row.credits}|${row.grade}|${row.term}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(row);
    if (rows.length >= 80) break;
  }
  return rows;
}

function appendOcrCourseRow(rows, seen, course, note = "OCR识别到课程名，请核对成绩和学分") {
  const cleaned = cleanCourseName(course);
  const key = normalizeText(cleaned);
  if (!cleaned || cleaned.length < 3 || seen.has(key)) return;
  if (/student|transcript|academic year|course title|credit|grade|score|date of birth|admission|college|major|program/i.test(cleaned)) return;
  seen.add(key);
  rows.push({ course: cleaned, grade: "", credits: "", term: "", note });
}

function extractEnglishCourseRowsFromText(text) {
  const source = cleanText(text).replace(/\s+/g, " ");
  const patterns = [
    /Mathematics\s*\d+/gi,
    /Physics\s*\d+\s*[:：]?\s*[A-Za-z ]{0,32}/gi,
    /Engineering Mathematics/gi,
    /Further Engineering Mathematics/gi,
    /Algorithms? and Numerical Mathematics/gi,
    /Circuit Analysis and Design/gi,
    /Physics of Electronic Devices/gi,
    /Electronic Design Project/gi,
    /Engineering Communication Skills\s*\d*/gi,
    /Digital Electronics and Microcontrollers/gi,
    /Communication Networks and Signals/gi,
    /Power Electronics/gi,
    /Electronic Circuit Design/gi,
    /Electronic Process Practice/gi,
    /High Frequency Electronics/gi,
    /Transistors? and Optoelectronic Devices/gi,
    /Control Systems?/gi,
    /Embedded Systems Project/gi,
    /Communications Theory/gi,
    /Microprocessors? and Programmable Logic/gi,
    /Mechanical Engineering/gi,
    /Engineering Mechanics/gi,
    /Fluid Mechanics/gi,
    /Heat Transfer/gi,
    /Thermodynamics/gi,
    /Combustion/gi,
    /Machine Design/gi,
    /Manufacturing/gi,
    /Production Engineering/gi,
    /Materials? Science/gi,
    /Linear Algebra/gi,
    /Calculus/gi,
    /Probability(?: Theory)?/gi,
    /Statistics?/gi,
    /Stochastic Processes/gi,
    /Combinatorics/gi,
    /Functional Analysis/gi,
    /Algorithms?/gi,
    /Data Structures?/gi,
    /Operating Systems?/gi,
    /Database(?: Systems?)?/gi,
    /Computer Networks?/gi,
    /Software Engineering/gi,
    /Machine Learning/gi,
    /Deep Learning/gi,
    /Computer Vision/gi,
    /Natural Language Processing/gi,
    /Data Science/gi,
    /Data Ethics/gi,
    /Seminars? on Data Science and Applications/gi,
    /Textile(?: Machinery| Engineering| Technology)?/gi,
    /Fashion(?: Design| Engineering)?/gi,
    /Clothing(?: Design| Engineering)?/gi,
    /Garment(?: Engineering| Technology)?/gi,
    /Business Analytics/gi,
    /Econometrics/gi,
    /Accounting/gi,
    /Finance/gi,
    /Marketing/gi,
    /Supply Chain/gi,
  ];
  const rows = [];
  const seen = new Set();
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      appendOcrCourseRow(rows, seen, match[0]);
      if (rows.length >= 60) return rows;
    }
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
  for (const row of extractEnglishCourseRowsFromText(text)) {
    appendOcrCourseRow(rows, seen, row.course, row.note);
    if (rows.length >= 50) return rows;
  }
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
  const textRows = extractTranscriptRowsFromText(transcriptText);
  const courseNameRows = textRows.length >= 3 ? [] : extractCourseNameRowsFromText(transcriptText);
  const ocrRows = textRows.length ? textRows : courseNameRows;
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
  if (!templateRows.length && !profileRows.length && ocrRows.length) summaryBits.push(`已从OCR文本提取 ${ocrRows.length} 个课程信号`);
  if (scoreInfo?.raw) summaryBits.push(`识别到成绩 ${scoreInfo.raw}`);
  if (major) summaryBits.push(`识别到专业 ${major}`);
  if (signals.keywords.length) summaryBits.push(`课程关键词 ${signals.keywords.slice(0, 4).join("、")}`);
  if (sensitiveHidden) summaryBits.push("政治敏感课程/人物信息已按合规规则隐藏");
  if (!summaryBits.length) summaryBits.push("请补充手动课程表或匹配度调查表，系统将结合现有资料继续匹配");

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
    preview: transcriptText ? `${transcriptText.slice(0, 180)}${transcriptText.length > 180 ? "..." : ""}` : "可以上传更清晰的 PDF/图片，或直接通过手动课程表补充信息。",
    rowsFromTemplate: templateRows,
    rowsFromProfile: profileRows,
    rowsFromOcr: ocrRows,
  };
}

function buildTranscriptPreviewRows(transcriptSummary) {
  if (transcriptSummary.rowsFromTemplate?.length) return transcriptSummary.rowsFromTemplate;
  if (transcriptSummary.rowsFromOcr?.length) return transcriptSummary.rowsFromOcr;
  if (transcriptSummary.rowsFromProfile?.length) return transcriptSummary.rowsFromProfile;
  if (transcriptSummary.extractedScoreText) {
    return [{ course: "综合成绩 / GPA", grade: transcriptSummary.extractedScoreText, credits: "", term: "", note: "从成绩单文字中识别到综合成绩，请核对" }];
  }
  return [{ course: "待校对课程", grade: "", credits: "", term: "", note: "请通过手动课程表补充关键课程、成绩和学分" }];
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
  if (transcriptSummary.confidence === "低") warnings.push("当前课程信息较少，请核对课程、成绩和学分，或填写匹配度调查表。");
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
  const count = Number(value || 6);
  return [1, 3, 6, 10].includes(count) ? count : 6;
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

function programFocusCorpus(program) {
  return normalizeText([
    program.programDisplayName,
    program.programTitle,
    program.program,
    Array.isArray(program.keywords) ? program.keywords.join(" ") : "",
    Array.isArray(program.domains) ? program.domains.join(" ") : "",
    cleanText(program.overview).slice(0, 1200),
    Array.isArray(program.strengths) ? program.strengths.join(" ").slice(0, 800) : "",
  ].join(" "));
}

function programDomainCorpus(program) {
  return normalizeText([
    program.programDisplayName,
    program.programTitle,
    program.program,
    Array.isArray(program.keywords) ? program.keywords.join(" ") : "",
    Array.isArray(program.domains) ? program.domains.join(" ") : "",
  ].join(" "));
}

function targetIntentBoost(targetText, corpus) {
  let boost = 0;
  let penalty = 0;
  const has = (pattern) => pattern.test(targetText);
  if (has(/机器人|自动化|控制|robotics?|automation|control engineering|automatic control|\bcontrol\b/)) {
    if (/robotics?|automation|control engineering|automatic control|\bcontrol\b|cybernetics|自动化|控制/.test(corpus)) boost += 14;
    if (/automotive|aerospace|vehicle|汽车|航空/.test(corpus) && !/robotics?|automation|control engineering|automatic control|\bcontrol\b|cybernetics/.test(corpus)) penalty += 10;
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

const DOMAIN_LABELS = {
  ai: "人工智能",
  data: "数据科学",
  cs: "计算机/软件",
  robotics: "机器人/自动化/控制",
  mechanical: "机械工程",
  energy: "能源动力/热能",
  electrical: "电气电子",
  materials: "材料科学",
  business: "管理/商科",
  economics: "经济学",
  finance: "金融会计",
  law: "法律/知识产权",
  design: "设计/纺织服装",
  textile: "纺织服装",
  environment: "环境/可持续",
  civil: "土木/结构",
  life: "生命科学",
  social: "社会科学",
  engineering: "工程",
  general: "通用方向",
};

const DOMAIN_ORDER = [
  "robotics",
  "energy",
  "mechanical",
  "electrical",
  "materials",
  "ai",
  "data",
  "cs",
  "law",
  "finance",
  "business",
  "economics",
  "design",
  "textile",
  "environment",
  "civil",
  "life",
  "social",
  "engineering",
  "general",
];

const GENERIC_DOMAINS = new Set(["general", "engineering", "social", "life"]);

const DOMAIN_RULES = {
  ai: {
    strong: /artificial intelligence|machine learning|deep learning|人工智能|机器学习|深度学习|\bai\b/,
    related: ["data", "cs"],
  },
  data: {
    strong: /data science|data engineering|analytics|econometrics|statistics|big data|数据科学|数据工程|数据分析|统计|计量/,
    related: ["ai", "cs", "business", "economics"],
  },
  cs: {
    strong: /computer science|informatics|software engineering|programming|algorithm|计算机|软件|算法|信息学/,
    related: ["data", "ai", "engineering"],
  },
  robotics: {
    strong: /robotics?|\bautomation\b|automatic control|control engineering|\bcontrol\b|cybernetics|mechatronics|机器人|自动化|控制|机电/,
    related: ["electrical", "mechanical", "cs", "engineering"],
  },
  mechanical: {
    strong: /mechanical engineering|mechanics|manufacturing|production|automotive|aerospace|机械|车辆|汽车|制造|生产/,
    related: ["energy", "materials", "engineering", "electrical"],
  },
  energy: {
    strong: /energy|power|thermal|combustion|clean energy|能源|动力|热能|内燃机|传热|发动机/,
    related: ["mechanical", "electrical", "environment", "engineering"],
  },
  electrical: {
    strong: /electrical|electronic\b|electronics|information engineering|information technology|telecommunication|communication|signal|电气|电子|通信|信号|电路/,
    related: ["robotics", "cs", "engineering"],
  },
  materials: {
    strong: /materials?|material science|werkstoff|advanced materials|材料|材料科学/,
    related: ["mechanical", "engineering", "chemistry"],
  },
  law: {
    strong: /law|legal|intellectual property|regulatory|法律|法学|知识产权|监管/,
    related: ["data", "business"],
  },
  finance: {
    strong: /finance|accounting|taxation|auditing|controlling|金融|会计|财务|审计|税务/,
    related: ["business", "economics", "data"],
  },
  business: {
    strong: /business|management|marketing|supply chain|administration|管理|商科|市场|供应链/,
    related: ["finance", "economics", "data"],
  },
  economics: {
    strong: /economics?|econometrics|economic|经济|计量经济/,
    related: ["business", "finance", "data"],
  },
  design: {
    strong: /fashion|textile|clothing|garment|design|服装|纺织|设计/,
    related: ["textile", "engineering"],
  },
  textile: {
    strong: /fashion|textile|clothing|garment|服装|纺织/,
    related: ["design", "engineering"],
  },
  environment: {
    strong: /environment|ecology|sustainability|climate|clean energy|环境|生态|可持续|气候/,
    related: ["energy", "civil", "engineering"],
  },
  civil: {
    strong: /civil engineering|structural|building|construction|土木|结构|建筑/,
    related: ["engineering", "environment"],
  },
  engineering: {
    strong: /engineering|工程/,
    related: ["mechanical", "electrical", "civil", "energy", "materials"],
  },
};

const COURSE_AREA_RULES = {
  math: { label: "数学基础", pattern: /高等数学|数学分析|微积分|线性代数|概率论|数理统计|statistics|stochastics|calculus|linear algebra|mathematics/i },
  programming: { label: "编程/计算机基础", pattern: /程序设计|编程|计算机|数据结构|操作系统|computer|programming|informatics|software|database/i },
  algorithms: { label: "算法/理论计算机", pattern: /算法|离散数学|计算理论|theoretical computer|algorithm|logic|discrete/i },
  data: { label: "数据/统计/数据库", pattern: /数据|数据库|统计|计量|data|database|statistics|analytics|econometrics/i },
  ai: { label: "人工智能/机器学习", pattern: /人工智能|机器学习|深度学习|神经网络|artificial intelligence|machine learning|deep learning|neural/i },
  electrical: { label: "电气电子", pattern: /电路|电气|电子|通信|信号|电磁|electrical|electronic\b|electronics|telecommunication|communication|information engineering|information technology|signal|circuit|electromagnetic/i },
  control: { label: "控制/自动化", pattern: /自动控制|控制理论|控制工程|自动化|机器人|机电|measurement and control|control engineering|automation|robotics|cybernetics|mechatronics/i },
  mechanical: { label: "机械/制造", pattern: /机械|工程图学|机械设计|制造|车辆|汽车|mechanical|manufacturing|production|automotive|machine design/i },
  energy: { label: "能源动力/热工", pattern: /能源|动力|热能|传热|热力学|内燃机|发动机|燃烧|energy|power|thermal|thermodynamics|combustion|heat transfer|engine/i },
  materials: { label: "材料", pattern: /材料|金属|高分子|复合材料|materials?|material science|werkstoff|polymer/i },
  civil: { label: "土木/结构", pattern: /土木|结构|力学|建筑|civil|structural|construction|mechanics/i },
  environment: { label: "环境/可持续", pattern: /环境|生态|可持续|气候|environment|ecology|sustainability|climate/i },
  textile: { label: "纺织服装/设计", pattern: /服装|纺织|成衣|面料|设计|fashion|textile|clothing|garment|design/i },
  law: { label: "法律/知识产权", pattern: /法学|法律|民法|商法|知识产权|行政法|law|legal|intellectual property|regulatory/i },
  business: { label: "管理/商科", pattern: /管理|市场|运营|供应链|会计|财务|business|management|marketing|supply chain|accounting|finance/i },
  economics: { label: "经济/计量", pattern: /经济|计量经济|宏观|微观|economics|econometrics|microeconomics|macroeconomics/i },
};

const DOMAIN_COURSE_REQUIREMENTS = {
  ai: { required: ["programming", "algorithms", "math"], recommended: ["ai", "data"] },
  data: { required: ["math", "data", "programming"], recommended: ["algorithms", "ai"] },
  cs: { required: ["programming", "algorithms", "math"], recommended: ["data"] },
  robotics: { required: ["control", "electrical", "math"], recommended: ["programming", "mechanical"] },
  electrical: { required: ["electrical", "math"], recommended: ["control", "programming"] },
  mechanical: { required: ["mechanical", "math"], recommended: ["materials", "energy"] },
  energy: { required: ["energy", "mechanical", "math"], recommended: ["electrical", "environment"] },
  materials: { required: ["materials", "math"], recommended: ["mechanical"] },
  civil: { required: ["civil", "math"], recommended: ["environment", "materials"] },
  environment: { required: ["environment", "math"], recommended: ["energy", "civil"] },
  textile: { required: ["textile"], recommended: ["materials", "mechanical"] },
  design: { required: ["textile"], recommended: ["materials"] },
  law: { required: ["law"], recommended: ["business", "data"] },
  finance: { required: ["business", "math"], recommended: ["economics", "data"] },
  business: { required: ["business"], recommended: ["economics", "data"] },
  economics: { required: ["economics", "math"], recommended: ["data", "business"] },
};

function uniqueStrings(values) {
  return Array.from(new Set((values || []).map((item) => String(item || "").trim()).filter(Boolean)));
}

function domainLabel(domain) {
  return DOMAIN_LABELS[domain] || domain;
}

function orderDomains(domains) {
  return uniqueStrings(domains)
    .map((item) => item.toLowerCase())
    .sort((a, b) => {
      const ai = DOMAIN_ORDER.includes(a) ? DOMAIN_ORDER.indexOf(a) : DOMAIN_ORDER.length;
      const bi = DOMAIN_ORDER.includes(b) ? DOMAIN_ORDER.indexOf(b) : DOMAIN_ORDER.length;
      return ai - bi || a.localeCompare(b);
    });
}

function domainMentionIndex(domain, text) {
  const corpus = normalizeText(text);
  const rule = DOMAIN_RULES[domain];
  if (!rule) return Number.MAX_SAFE_INTEGER;
  const index = corpus.search(rule.strong);
  return index >= 0 ? index : Number.MAX_SAFE_INTEGER;
}

function orderTargetDomains(domains, text) {
  return orderDomains(domains).sort((a, b) => {
    const ai = domainMentionIndex(a, text);
    const bi = domainMentionIndex(b, text);
    if (ai !== bi) return ai - bi;
    return DOMAIN_ORDER.indexOf(a) - DOMAIN_ORDER.indexOf(b);
  });
}

function hasPattern(pattern, text) {
  return Boolean(pattern && pattern.test(text));
}

function inferDomainsFromText(text) {
  const corpus = normalizeText(text);
  const domains = collectDomainSignals(corpus).domains.filter((domain) => domain !== "general");
  const add = (domain, pattern) => {
    if (pattern.test(corpus) && !domains.includes(domain)) domains.push(domain);
  };
  add("economics", /economics?|econometrics|经济|计量经济/);
  add("life", /biology|biomedical|biotechnology|medical|health|生物|医学|健康/);
  add("social", /social|society|psychology|media|culture|社会|心理|媒体|文化/);
  add("textile", /textile|fashion|clothing|garment|纺织|服装/);
  return orderDomains(domains.length ? domains : ["general"]);
}

function inferTargetDomains(primaryTargetText, majorText, fallbackDomains = []) {
  const primaryDomains = inferDomainsFromText(primaryTargetText).filter((domain) => domain !== "general");
  const majorDomains = inferDomainsFromText([primaryTargetText, majorText].join(" ")).filter((domain) => domain !== "general");
  const fallback = (fallbackDomains || []).filter((domain) => domain !== "general");
  const selected = primaryDomains.length ? primaryDomains : majorDomains.length ? majorDomains : fallback.length ? fallback : ["general"];
  return orderTargetDomains(selected, [primaryTargetText, majorText].join(" "));
}

function getProgramDomains(program, corpus, titleCorpus) {
  const explicit = Array.isArray(program.domains) ? program.domains.map((item) => String(item).toLowerCase()) : [];
  const inferred = inferDomainsFromText([titleCorpus, corpus].join(" ")).filter((domain) => domain !== "general");
  return orderDomains([...explicit, ...inferred]);
}

function extractTargetTerms(text) {
  const corpus = normalizeText(text);
  const terms = [];
  const patterns = [
    /artificial intelligence|machine learning|deep learning|data science|data engineering|computer science|software engineering|electronic information engineering|electronics engineering|communication engineering|communications?|information engineering|information technology|mechanical engineering|energy science|energy engineering|process engineering|electrical engineering|civil engineering|intellectual property|business analytics|supply chain/gi,
    /人工智能|机器学习|深度学习|数据科学|数据工程|计算机|软件工程|机械工程|机械|能源与动力|能源|动力|热能|内燃机|传热|电气|电子|自动化|控制|机器人|材料科学|材料|土木|结构|知识产权|法学|法律|金融|会计|服装|纺织|设计|环境|可持续/g,
  ];
  for (const pattern of patterns) {
    for (const match of corpus.matchAll(pattern)) {
      const term = cleanText(match[0]).toLowerCase();
      if (term.length >= 2 && !terms.includes(term)) terms.push(term);
    }
  }
  return terms.slice(0, 12);
}

function targetTermMatches(terms, corpus) {
  const genericTerms = new Set(["engineering", "master", "science", "technology", "information"]);
  return terms.filter((term) => term && !genericTerms.has(term.toLowerCase()) && corpus.includes(term.toLowerCase()));
}

function computeProgramEvidence(program) {
  const fields = [
    ["overview", "项目介绍"],
    ["prerequisites", "申请要求"],
    ["languageRequirements", "语言要求"],
    ["applicationInfo", "申请流程"],
    ["applicationPeriod", "申请时间"],
    ["duration", "学制"],
    ["ects", "ECTS"],
    ["careerInfo", "职业方向"],
  ];
  const present = fields
    .filter(([field]) => cleanText(program[field]).length > (field === "duration" || field === "ects" ? 1 : 12))
    .map(([, label]) => label);
  const sourceUrls = Array.isArray(program.sourcePaths)
    ? program.sourcePaths.map((item) => cleanText(item.url || item.path)).filter(Boolean)
    : [];
  const corpus = cleanText([program.searchText, program.overview, program.prerequisites, program.applicationInfo].join(" "));
  const hasRulesDocument = /modulhandbuch|module handbook|prüfungsordnung|zugangsordnung|zulassungsordnung|aptitude|eignung|admission process|requirements/i.test(corpus);
  if (sourceUrls.length) present.push("来源链接");
  if (hasRulesDocument) present.push("模块/录取规则文件");
  const score = Math.min(100, 34 + present.length * 7 + (sourceUrls.length ? 6 : 0) + (hasRulesDocument ? 8 : 0));
  return {
    score,
    labels: uniqueStrings(present).slice(0, 8),
    sourceUrls: sourceUrls.slice(0, 2),
    coverage: score >= 82 ? "高覆盖" : score >= 64 ? "中覆盖" : "基础覆盖",
  };
}

function evaluateDomainFit(domain, programDomains, titleCorpus, corpus) {
  const rule = DOMAIN_RULES[domain];
  if (!rule) {
    return { domain, points: 0, strength: "none", evidence: `${domainLabel(domain)}未形成明确匹配` };
  }
  const inTitle = hasPattern(rule.strong, titleCorpus);
  const inCorpus = hasPattern(rule.strong, corpus);
  const directDomain = programDomains.includes(domain);
  const relatedDomains = (rule.related || []).filter((item) => programDomains.includes(item));
  if (inTitle) {
    return { domain, points: 38, strength: "title", evidence: `项目名称/标题直接命中${domainLabel(domain)}` };
  }
  if (directDomain && inCorpus) {
    return { domain, points: 24, strength: "strong", evidence: `专业库方向与项目文本同时命中${domainLabel(domain)}` };
  }
  if (inCorpus) {
    return { domain, points: 17, strength: "medium", evidence: `项目介绍/要求中出现${domainLabel(domain)}相关内容` };
  }
  if (directDomain) {
    return { domain, points: 16, strength: "medium", evidence: `专业库标签标注为${domainLabel(domain)}` };
  }
  if (relatedDomains.length) {
    return {
      domain,
      points: GENERIC_DOMAINS.has(domain) ? 8 : 10,
      strength: "weak",
      evidence: `与${domainLabel(domain)}相邻：${relatedDomains.map(domainLabel).join("、")}`,
    };
  }
  return { domain, points: 0, strength: "none", evidence: `未命中${domainLabel(domain)}核心方向` };
}

function detectCrossDomainRisk(targetDomains, programDomains, titleCorpus) {
  const risks = [];
  let penalty = 0;
  let cap = 96;
  const specificTargets = targetDomains.filter((domain) => !GENERIC_DOMAINS.has(domain));
  const hasTarget = (domains) => domains.some((domain) => specificTargets.includes(domain));
  const programHas = (domains) => domains.some((domain) => programDomains.includes(domain));

  if (hasTarget(["energy", "mechanical", "robotics", "electrical", "materials", "civil"]) && programHas(["finance", "business", "economics", "law"])) {
    penalty += 22;
    cap = Math.min(cap, 70);
    risks.push("工程类目标与商科/法律类项目存在方向冲突");
  }
  if (hasTarget(["law"]) && programHas(["mechanical", "energy", "electrical", "civil"])) {
    penalty += 24;
    cap = Math.min(cap, 68);
    risks.push("法律目标与工程项目不属于同一申请方向");
  }
  if (hasTarget(["law"]) && !programHas(["law"])) {
    penalty += 14;
    cap = Math.min(cap, 78);
    risks.push("目标包含法律/知识产权，但项目未体现法律方向");
  }
  if (hasTarget(["design", "textile"]) && !programHas(["design", "textile"])) {
    penalty += 18;
    cap = Math.min(cap, 72);
    risks.push("纺织服装/设计目标未在项目名称或标签中直接体现");
  }
  if (hasTarget(["robotics"]) && /aerospace|automotive|vehicle|航空|汽车/.test(titleCorpus) && !/robotics?|automation|control engineering|automatic control|\bcontrol\b|cybernetics|mechatronics/.test(titleCorpus)) {
    penalty += 18;
    cap = Math.min(cap, 68);
    risks.push("汽车/航空与机器人自动化相邻但不等同，已降权");
  }
  if (
    hasTarget(["robotics"]) &&
    programHas(["energy", "environment", "civil"]) &&
    !programHas(["electrical", "cs"]) &&
    !/robotics?|automation|control engineering|automatic control|\bcontrol\b|cybernetics|mechatronics|electrical|information technology|电气|自动化|控制|机器人/.test(titleCorpus)
  ) {
    penalty += 14;
    cap = Math.min(cap, 76);
    risks.push("机器人/自动化目标仅在项目正文中弱相关，项目标题主方向不是控制或电气，已降权");
  }
  if (hasTarget(["energy"]) && !programHas(["energy"]) && programHas(["mechanical", "electrical", "environment"])) {
    penalty += 8;
    cap = Math.min(cap, 88);
    risks.push("能源动力目标仅命中相邻工程方向，未直接命中能源/热能");
  }
  if (hasTarget(["electrical"])) {
    const titleHasElectricalCore = /electrical|electronics?|communication|telecommunication|information technology|information engineering|signal|circuit|microelectronic|embedded|电气|电子|通信|信息|信号|电路/.test(titleCorpus);
    if (!titleHasElectricalCore && /biomedical|chemical|process|energy|mechanical|materials?|civil|environment|aerospace|automotive/.test(titleCorpus)) {
      penalty += 20;
      cap = Math.min(cap, 76);
      risks.push("电子信息/电气目标与项目标题主方向不一致，泛工程项目已降权");
    } else if (!titleHasElectricalCore) {
      cap = Math.min(cap, 86);
      risks.push("电子信息/电气目标未在项目标题中直接体现，需二次核对课程要求");
    }
  }
  if (hasTarget(["ai"]) && !programHas(["ai"]) && programHas(["data", "cs"])) {
    penalty += 7;
    cap = Math.min(cap, 90);
    risks.push("人工智能目标仅命中数据/计算机相邻方向，未直接命中 AI");
  }
  if (hasTarget(["ai"]) && !/artificial intelligence|machine learning|\bai\b|人工智能|机器学习/.test(titleCorpus)) {
    cap = Math.min(cap, 92);
    risks.push("目标包含人工智能，但项目名称未直接体现 AI/机器学习");
  }
  if (hasTarget(["ai", "data", "cs"]) && programHas(["finance", "business", "economics"]) && !/data science|data engineering|business analytics|computer science|software|informatics|artificial intelligence|machine learning|\bai\b/.test(titleCorpus)) {
    penalty += 10;
    cap = Math.min(cap, 84);
    risks.push("计算机/数据目标与金融商科交叉项目存在方向稀释，已降权");
  }
  if (hasTarget(["ai", "data", "cs"]) && programHas(["mechanical", "energy", "civil"]) && !programHas(["ai", "data", "cs"])) {
    penalty += 16;
    cap = Math.min(cap, 74);
    risks.push("计算机/数据目标与纯工程项目方向不完全一致");
  }

  return { penalty, cap, risks };
}

function addScoreBreakdown(breakdown, label, points) {
  if (!points) return;
  breakdown.push({ label, points: Math.round(points) });
}

function rankingPriority(scored) {
  const strength = scored.audit?.strongestFit?.strength;
  const titlePriority = strength === "title" ? 30 : strength === "strong" ? 18 : strength === "medium" ? 8 : 0;
  const coursePriority = Math.min(15, Math.round((scored.audit?.courseFit?.score || 0) / 8));
  return titlePriority + coursePriority;
}

function numericCredits(value) {
  const num = Number(String(value || "").replace(/[^\d.]/g, ""));
  return Number.isFinite(num) && num > 0 ? Math.min(num, 12) : 1;
}

function collectTranscriptCourseRows(context) {
  const rows = Array.isArray(context.transcriptRows) ? context.transcriptRows : [];
  return rows
    .map((row) => ({
      course: cleanText(row.course),
      grade: cleanText(row.grade),
      credits: numericCredits(row.credits),
      term: cleanText(row.term),
    }))
    .filter((row) => row.course);
}

function buildTranscriptAreaProfile(context) {
  const rows = collectTranscriptCourseRows(context);
  const areas = {};
  const addArea = (areaKey, row, fallbackText = "") => {
    const rule = COURSE_AREA_RULES[areaKey];
    if (!rule) return;
    if (!areas[areaKey]) {
      areas[areaKey] = {
        key: areaKey,
        label: rule.label,
        credits: 0,
        courses: [],
      };
    }
    areas[areaKey].credits += row?.credits || 1;
    const courseName = cleanText(row?.course || fallbackText);
    if (courseName && !areas[areaKey].courses.includes(courseName)) {
      areas[areaKey].courses.push(courseName);
    }
  };

  for (const row of rows) {
    const text = normalizeText([row.course, row.term].join(" "));
    for (const [areaKey, rule] of Object.entries(COURSE_AREA_RULES)) {
      if (rule.pattern.test(text)) addArea(areaKey, row);
    }
  }

  if (!Object.keys(areas).length && context.transcriptCorpus) {
    for (const [areaKey, rule] of Object.entries(COURSE_AREA_RULES)) {
      if (rule.pattern.test(context.transcriptCorpus)) {
        addArea(areaKey, { course: rule.label, credits: 1 }, rule.label);
      }
    }
  }

  return {
    rows,
    areas,
    labels: Object.values(areas)
      .sort((a, b) => b.credits - a.credits)
      .map((area) => `${area.label}${area.credits ? ` ${Math.round(area.credits * 10) / 10}学分` : ""}`),
  };
}

function chooseRequirementDomains(targetDomains, programDomains) {
  const domains = [];
  for (const domain of targetDomains || []) {
    if (DOMAIN_COURSE_REQUIREMENTS[domain] && !domains.includes(domain)) domains.push(domain);
  }
  for (const domain of programDomains || []) {
    if (domains.length >= 2) break;
    if (DOMAIN_COURSE_REQUIREMENTS[domain] && !domains.includes(domain)) domains.push(domain);
  }
  return domains.slice(0, 2);
}

function evaluateCourseRequirementFit(program, context, programDomains, targetDomains) {
  const profile = context.transcriptAreaProfile || buildTranscriptAreaProfile(context);
  const requirementDomains = chooseRequirementDomains(targetDomains, programDomains);
  const required = uniqueStrings(requirementDomains.flatMap((domain) => DOMAIN_COURSE_REQUIREMENTS[domain]?.required || []));
  const recommended = uniqueStrings(requirementDomains.flatMap((domain) => DOMAIN_COURSE_REQUIREMENTS[domain]?.recommended || []));
  const matchedRequired = required.filter((areaKey) => profile.areas[areaKey]);
  const matchedRecommended = recommended.filter((areaKey) => profile.areas[areaKey]);
  const missingRequired = required.filter((areaKey) => !profile.areas[areaKey]);
  const requiredRatio = required.length ? matchedRequired.length / required.length : 0;
  const recommendedRatio = recommended.length ? matchedRecommended.length / recommended.length : 0;
  const score = Math.round(Math.min(100, requiredRatio * 78 + recommendedRatio * 22));
  const points = Math.round(Math.min(18, requiredRatio * 14 + recommendedRatio * 4));
  const matchedLabels = [...matchedRequired, ...matchedRecommended]
    .map((areaKey) => {
      const area = profile.areas[areaKey];
      return area ? `${area.label}：${area.courses.slice(0, 3).join("、")}` : "";
    })
    .filter(Boolean);
  const missingLabels = missingRequired.map((areaKey) => COURSE_AREA_RULES[areaKey]?.label || areaKey);
  return {
    score,
    points,
    requirementDomains,
    required,
    recommended,
    matchedRequired,
    matchedRecommended,
    missingRequired,
    matchedLabels,
    missingLabels,
    profileLabels: profile.labels,
  };
}

function scoreProgram(program, context) {
  const corpus = programCorpus(program);
  const focusCorpus = programFocusCorpus(program);
  const domainCorpus = programDomainCorpus(program);
  const titleCorpus = normalizeText([
    program.programDisplayName,
    program.programTitle,
    program.program,
    program.university,
  ].join(" "));
  const domains = getProgramDomains(program, domainCorpus, titleCorpus);
  const keywords = Array.isArray(program.keywords) ? program.keywords.map((item) => String(item).toLowerCase()) : [];
  const targetDomains = context.targetDomains?.length ? context.targetDomains : orderDomains(context.domains);
  const specificTargets = targetDomains.filter((domain) => !GENERIC_DOMAINS.has(domain));
  const domainFits = (specificTargets.length ? specificTargets : targetDomains)
    .map((domain) => evaluateDomainFit(domain, domains, titleCorpus, focusCorpus))
    .sort((a, b) => b.points - a.points);
  const strongestFit = domainFits[0] || { points: 0, strength: "none", evidence: "缺少明确目标方向" };
  const primaryTargetDomain = specificTargets[0] || "";
  const primaryTargetFit = primaryTargetDomain ? domainFits.find((fit) => fit.domain === primaryTargetDomain) : null;
  const directFits = domainFits.filter((fit) => fit.points >= 18);
  const relatedFits = domainFits.filter((fit) => fit.points > 0 && fit.points < 18);
  const keywordHits = keywords.filter((keyword) => keyword && (context.profileCorpus.includes(keyword) || context.transcriptCorpus.includes(keyword) || context.primaryTargetText.includes(keyword)));
  const transcriptHits = keywords.filter((keyword) => keyword && context.transcriptCorpus.includes(keyword));
  const targetTerms = extractTargetTerms(context.primaryTargetText || context.targetText);
  const exactTargetHits = targetTermMatches(targetTerms, [titleCorpus, focusCorpus].join(" "));
  const evidence = computeProgramEvidence(program);
  const breakdown = [];
  const risks = [];
  let score = 34;
  let cap = 96;

  let targetPoints = Math.min(46, domainFits.reduce((sum, fit, index) => sum + (index === 0 ? fit.points : Math.min(fit.points, 10)), 0));
  if (primaryTargetDomain && (!primaryTargetFit || primaryTargetFit.points < 18)) {
    targetPoints = Math.min(targetPoints, 24);
  }
  addScoreBreakdown(breakdown, "目标方向命中", targetPoints);
  score += targetPoints;

  const exactPoints = Math.min(18, exactTargetHits.length * 6);
  addScoreBreakdown(breakdown, "项目文本命中目标词", exactPoints);
  score += exactPoints;

  const keywordPoints = Math.min(12, keywordHits.length * 3);
  addScoreBreakdown(breakdown, "专业库关键词", keywordPoints);
  score += keywordPoints;

  const transcriptPoints = Math.min(14, transcriptHits.length * 4 + Math.max(0, context.transcriptDomains.filter((domain) => domains.includes(domain)).length) * 3);
  addScoreBreakdown(breakdown, "成绩单/课程证据", transcriptPoints);
  score += transcriptPoints;

  const courseFit = evaluateCourseRequirementFit(program, context, domains, targetDomains);
  if (courseFit.points) {
    score += courseFit.points;
    addScoreBreakdown(breakdown, "课程领域覆盖", courseFit.points);
  }

  if (context.cityPrefs.includes(String(program.city || "").toLowerCase())) {
    score += 5;
    addScoreBreakdown(breakdown, "城市偏好", 5);
  }
  if (context.languagePref.includes("英") || context.languagePref.includes("english")) {
    if ((program.languageOfInstruction || []).includes("english") || /english|englisch/.test(corpus)) {
      score += 4;
      addScoreBreakdown(breakdown, "授课语言偏好", 4);
    }
  }
  if (context.languagePref.includes("德") || context.languagePref.includes("german")) {
    if ((program.languageOfInstruction || []).includes("german") || /german|deutsch/.test(corpus)) {
      score += 4;
      addScoreBreakdown(breakdown, "授课语言偏好", 4);
    }
  }

  const evidencePoints = evidence.score >= 82 ? 8 : evidence.score >= 64 ? 5 : 2;
  score += evidencePoints;
  addScoreBreakdown(breakdown, "专业库证据覆盖", evidencePoints);

  if ((program.sourceTier === "curated-fallback" || program.curatedFallback) && strongestFit.points >= 18) {
    score += 5;
    addScoreBreakdown(breakdown, "精选候选校准", 5);
  }

  if (specificTargets.length && strongestFit.points === 0) {
    cap = Math.min(cap, 64);
    risks.push("未命中目标核心方向，仅可作为低优先级候选");
  } else if (specificTargets.length && !directFits.length) {
    cap = Math.min(cap, 76);
    risks.push("仅命中相邻方向，需顾问确认是否真的可申");
  }
  if (primaryTargetDomain && (!primaryTargetFit || primaryTargetFit.points < 18)) {
    cap = Math.min(cap, 86);
    risks.push(`第一目标方向“${domainLabel(primaryTargetDomain)}”未直接命中，已低于核心候选排序`);
  }

  const crossRisk = detectCrossDomainRisk(targetDomains, domains, titleCorpus);
  if (crossRisk.penalty) {
    score -= crossRisk.penalty;
    cap = Math.min(cap, crossRisk.cap);
    risks.push(...crossRisk.risks);
    addScoreBreakdown(breakdown, "方向冲突扣分", -crossRisk.penalty);
  }
  if (
    /electrical|electronic\b|electronics|communication|telecommunication|information engineering|电气|电子|通信|信息工程/.test(context.primaryTargetText) &&
    !/electrical|electronic\b|electronics|communication|telecommunication|information technology|information engineering|signal|circuit|电气|电子|通信|信息|信号|电路/.test(titleCorpus)
  ) {
    score -= 10;
    cap = Math.min(cap, 82);
    risks.push("主专业为电子信息/电气通信，但项目标题未直接体现该方向，已降权");
    addScoreBreakdown(breakdown, "主专业标题不匹配扣分", -10);
  }
  if (
    /energy|power|thermal|combustion|heat transfer|能源|动力|热能|内燃机|传热|发动机/.test(context.primaryTargetText) &&
    !/energy|power|thermal|combustion|heat|process engineering|clean energy|building energy|能源|动力|热能|内燃机|传热|发动机/.test(titleCorpus)
  ) {
    score -= 12;
    cap = Math.min(cap, 82);
    risks.push("能源动力目标未在项目标题中直接体现，已降权");
    addScoreBreakdown(breakdown, "能源标题不匹配扣分", -12);
  }
  if (
    /mechanical|mechanics|manufacturing|production|机械|制造/.test(context.primaryTargetText) &&
    !/textile|fashion|clothing|garment|纺织|服装/.test(context.primaryTargetText) &&
    /textile|fashion|clothing|garment|纺织|服装/.test(titleCorpus)
  ) {
    score -= 14;
    cap = Math.min(cap, 76);
    risks.push("机械目标与纺织服装机械交叉项目存在方向偏移，已降权");
    addScoreBreakdown(breakdown, "纺织交叉方向偏移扣分", -14);
  }
  if (
    targetDomains.some((domain) => ["ai", "data", "cs"].includes(domain)) &&
    !/bioinformatics|biomedical|biology|biotechnology|life science|medical|health|生物|医学/.test(context.primaryTargetText) &&
    /bioinformatics|biomedical|biology|biotechnology|medical|health/.test(titleCorpus)
  ) {
    score -= 18;
    cap = Math.min(cap, 72);
    risks.push("计算机/数据目标与生物信息或生医项目存在方向偏移，已降权");
    addScoreBreakdown(breakdown, "生物交叉方向偏移扣分", -18);
  }
  if (
    targetDomains.some((domain) => ["ai", "data", "cs"].includes(domain)) &&
    !/geo|geodesy|geoinformatics|gis|remote sensing|地理|测绘|遥感/.test(context.primaryTargetText) &&
    /geodesy|geoinformatics|gis|remote sensing|cartography/.test(titleCorpus)
  ) {
    score -= 18;
    cap = Math.min(cap, 72);
    risks.push("计算机/数据目标与测绘地理信息项目存在方向偏移，已降权");
    addScoreBreakdown(breakdown, "地理信息交叉方向偏移扣分", -18);
  }

  if (evidence.score < 58) {
    cap = Math.min(cap, 82);
    risks.push("专业库证据较少，需打开官网二次核对");
  }
  if (courseFit.required.length && courseFit.score < 45) {
    cap = Math.min(cap, 78);
    risks.push(`成绩单暂未覆盖关键课程领域：${courseFit.missingLabels.slice(0, 3).join("、")}`);
  } else if (courseFit.required.length && courseFit.score < 72) {
    cap = Math.min(cap, 88);
    risks.push(`关键课程覆盖不完整：${courseFit.missingLabels.slice(0, 2).join("、")}`);
  }
  if (context.transcriptConfidence === "低") {
    cap = Math.min(cap, primaryTargetFit?.strength === "title" ? 90 : 84);
    risks.push("成绩单/课程证据有限，已保守压低分数上限");
  }

  const finalScore = Math.max(35, Math.min(cap, Math.round(score)));
  return {
    score: finalScore,
    evidenceScore: evidence.score,
    audit: {
      targetDomains,
      programDomains: domains,
      directFits,
      relatedFits,
      strongestFit,
      exactTargetHits: exactTargetHits.slice(0, 6),
      keywordHits: uniqueStrings(keywordHits).slice(0, 8),
      transcriptHits: uniqueStrings(transcriptHits).slice(0, 8),
      evidence,
      courseFit,
      risks: uniqueStrings(risks),
      breakdown,
      cap,
      strongTargetHit: strongestFit.points >= 18,
    },
  };
}

function curatedFallbackMatches(program, context) {
  if (program.sourceTier !== "curated-fallback" && !program.curatedFallback) return false;
  const domains = Array.isArray(program.domains) ? program.domains.map((item) => String(item).toLowerCase()) : [];
  const titleCorpus = normalizeText([program.programDisplayName, program.programTitle, program.program].join(" "));
  const target = context.targetText;
  if (/机器人|自动化|控制|robotics?|automation|control engineering|automatic control|\bcontrol\b/.test(target)) {
    return domains.some((domain) => ["robotics", "automation"].includes(domain)) || /cybernetics|robotics?|automation|control engineering|automatic control|\bcontrol\b/.test(titleCorpus);
  }
  if (/服装|纺织|textile|fashion|clothing|garment/.test(target)) {
    return domains.some((domain) => ["textile", "design"].includes(domain)) || /textile|fashion|clothing|garment/.test(titleCorpus);
  }
  if (/法律|法学|知识产权|law|legal/.test(target)) {
    return domains.includes("law") || /law|legal|intellectual property/.test(titleCorpus);
  }
  if (/数据|人工智能|机器学习|\bai\b|data|analytics|machine learning/.test(target)) {
    return domains.some((domain) => ["data", "ai", "cs"].includes(domain));
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
  const majorTargetText = cleanText([profile.major, transcriptSummary.extractedMajor].join(" "));
  const rawTargetField = cleanText(profile.targetField);
  const weakTargetField = !rawTargetField || (/专业匹配|院校匹配|德国硕士|硕士申请|推荐/.test(rawTargetField) && !inferDomainsFromText(rawTargetField).some((domain) => !GENERIC_DOMAINS.has(domain)));
  const effectiveTargetText = weakTargetField ? majorTargetText || rawTargetField : cleanText([rawTargetField, majorTargetText].join(" "));
  const profileCorpus = normalizeText([
    profile.major,
    transcriptSummary.extractedMajor,
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
  const primaryTargetText = normalizeText(effectiveTargetText || profile.targetField || profile.major);
  const transcriptDomains = inferDomainsFromText([transcriptCorpus, transcriptSummary.extractedMajor].join(" ")).filter((domain) => domain !== "general");
  const transcriptRows = [
    ...(Array.isArray(transcriptSummary.rowsFromTemplate) ? transcriptSummary.rowsFromTemplate : []),
    ...(Array.isArray(transcriptSummary.rowsFromOcr) ? transcriptSummary.rowsFromOcr : []),
    ...(Array.isArray(transcriptSummary.rowsFromProfile) ? transcriptSummary.rowsFromProfile : []),
  ];
  const context = {
    domains: combinedSignals.domains,
    targetDomains: inferTargetDomains(effectiveTargetText || profile.targetField, majorTargetText || profile.major, combinedSignals.domains),
    transcriptDomains,
    transcriptRows,
    profileCorpus,
    transcriptCorpus,
    primaryTargetText,
    targetText: normalizeText([effectiveTargetText, profile.targetField, profile.major, transcriptSummary.extractedMajor].join(" ")),
    cityPrefs: splitPreference(profile.cityPreference),
    languagePref: normalizeText(profile.instructionLanguage),
    transcriptConfidence: transcriptSummary.confidence,
  };
  context.transcriptAreaProfile = buildTranscriptAreaProfile(context);
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
        scored.score = Math.max(scored.score, scored.audit?.strongTargetHit ? (context.transcriptConfidence === "低" ? 82 : 88) : 74);
      }
      return { program, ...scored };
    })
    .sort((a, b) => b.score - a.score || rankingPriority(b) - rankingPriority(a) || b.evidenceScore - a.evidenceScore)
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
    recommendations: ranked.map(({ program, score, evidenceScore, audit }, index) => {
      const programName = program.programDisplayName || program.programTitle || program.program;
      const targetEvidence = audit?.directFits?.length
        ? audit.directFits.map((fit) => fit.evidence).slice(0, 2)
        : audit?.relatedFits?.length
          ? audit.relatedFits.map((fit) => fit.evidence).slice(0, 2)
          : ["未形成目标方向强命中，作为低优先级候选保留"];
      const transcriptEvidence = audit?.transcriptHits?.length
        ? `课程/成绩单命中：${audit.transcriptHits.slice(0, 5).join("、")}`
        : transcriptSummary.keywords?.length
          ? `成绩单方向信号：${transcriptSummary.keywords.slice(0, 4).join("、")}`
          : "成绩单证据有限，已降低分数上限";
      const catalogEvidence = audit?.evidence?.labels?.length
        ? `专业库覆盖：${audit.evidence.labels.slice(0, 5).join("、")}`
        : "专业库覆盖有限";
      const courseEvidence = audit?.courseFit?.matchedLabels?.length
        ? `课程领域覆盖：${audit.courseFit.matchedLabels.slice(0, 3).join("；")}`
        : audit?.courseFit?.missingLabels?.length
          ? `待补关键课程：${audit.courseFit.missingLabels.slice(0, 3).join("、")}`
          : "";
      const reasonParts = [
        targetEvidence[0],
        audit?.exactTargetHits?.length ? `目标词命中：${audit.exactTargetHits.slice(0, 3).join("、")}` : "",
        courseEvidence,
        transcriptEvidence,
        catalogEvidence,
      ].filter(Boolean);

      return {
        rank: index + 1,
        university: program.university,
        program: programName,
        degree: profile.targetDegree || program.degree || "硕士",
        city: program.city || "",
        matchPercent: score,
        matchLevel: score >= 85 ? "高匹配" : score >= 74 ? "中高匹配" : score >= 62 ? "中匹配" : "初步候选",
        evaluation: score >= 82 ? "适合作为重点候选" : score >= 70 ? "可作为主申/补充候选" : "建议顾问复核后保留",
        reason: `${reasonParts.slice(0, 3).join("；")}。综合评分 ${score}%，已按方向冲突和证据覆盖做保守校准。`,
        detail: {
          matchReasonDetails: [
            `目标方向：${(audit?.targetDomains || context.targetDomains).map(domainLabel).slice(0, 5).join("、")}`,
            `项目方向：${(audit?.programDomains || []).map(domainLabel).slice(0, 5).join("、") || "未标注"}`,
            ...targetEvidence,
            courseEvidence,
            transcriptEvidence,
            catalogEvidence,
          ],
          fitHighlights: (program.strengths || []).slice(0, 3),
          riskHighlights: uniqueStrings([
            ...(audit?.risks || []),
            "正式递交前需核对课程匹配、语言要求、截止日期和 APS/uni-assist 要求。",
          ]).slice(0, 4),
          requirementHighlights: [program.prerequisites, program.languageRequirements].filter(Boolean).map((item) => cleanText(item).slice(0, 140)).slice(0, 2),
          sourceEvidence: audit?.evidence?.sourceUrls || [],
          facts: {
            duration: cleanText(program.duration),
            ects: cleanText(program.ects),
            languages: Array.isArray(program.languageOfInstruction) ? program.languageOfInstruction : [],
            applicationPeriod: cleanText(program.applicationPeriod),
            catalogCoverage: audit?.evidence?.coverage || (evidenceScore >= 80 ? "高覆盖" : evidenceScore >= 60 ? "中覆盖" : "基础覆盖"),
            catalogCoverageScore: evidenceScore,
            courseCoverageScore: audit?.courseFit?.score || 0,
            courseCoverage: audit?.courseFit?.matchedLabels || [],
            missingCourseAreas: audit?.courseFit?.missingLabels || [],
          },
        },
        qualityAudit: {
          status: audit?.strongTargetHit ? "目标方向证据明确" : "方向证据偏弱，需顾问复核",
          evidenceScore,
          level: evidenceScore >= 80 ? "高" : evidenceScore >= 60 ? "中" : "基础",
          scoreBreakdown: audit?.breakdown || [],
          targetDomains: audit?.targetDomains || context.targetDomains,
          programDomains: audit?.programDomains || [],
        },
      };
    }),
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
  testHelpers: {
    extractTranscriptRowsFromText,
  },
};
