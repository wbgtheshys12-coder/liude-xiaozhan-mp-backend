const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const sharp = require('sharp');
const engine = require('../local-engine');

test('scanned column rows preserve semester, letter grades and ten-credit courses', () => {
  const text = '公证书 § 2020-2021 学 年 第 1 学 期 § 线性 代数 A 必修 3 88 § 计算 机 网 络 专业 选修 2 91 § 金工 实习 C 必修 1 B § 2021-2022 学 年 第 2 学 期 § 毕业 实习 与 毕业 设计 必修 10 86';
  const rows = engine.testHelpers.extractTranscriptRowsFromText(text);
  assert.equal(rows.length, 4);
  assert.equal(rows[0].course, '线性代数 A');
  assert.equal(rows[0].term, '2020-2021 第1学期');
  assert.equal(rows[2].grade, 'B');
  assert.equal(rows[3].credits, '10');
  assert.equal(rows[3].term, '2021-2022 第2学期');
});

test('a clipped single-digit OCR grade is excluded from scanned rows', () => {
  const rows = engine.testHelpers.extractTranscriptRowsFromText('课程名称 课程属性 学分 成绩 § 军事技能训练 必修 2 8 § 电路理论 必修 4 77 § 自动控制原理 必修 3 65 § 电机学 必修 3 67');
  assert.equal(rows.some(row => row.course === '军事技能训练' && row.grade === '8'), false);
  assert.equal(rows.some(row => row.course === '电路理论' && row.grade === '77'), true);
});

test('dense transcript pages outrank a sparse notarization cover', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'liude-transcript-page-rank-'));
  try {
    const files = [];
    for (const density of [0, 3, 2]) {
      const pixels = Buffer.alloc(200 * 280, 255);
      for (let y = 35; y < 250; y += 1) {
        for (let x = 20; x < 180; x += 1) {
          if (density && (x + y) % 5 < density) pixels[y * 200 + x] = 0;
        }
      }
      const file = path.join(dir, `page-${files.length + 1}.png`);
      await sharp(pixels, { raw: { width: 200, height: 280, channels: 1 } }).png().toFile(file);
      files.push(file);
    }
    const prioritized = await engine.testHelpers.prioritizeTranscriptPages(files);
    assert.deepEqual(prioritized, [files[1], files[2], files[0]]);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

function advisor() {
  let page, modal;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../miniprogram/pages/advisor/advisor.js'), 'utf8'), {
    require: () => ({}), Page: value => { page = value; },
    wx: { showModal: value => { modal = value; }, showToast() {} },
  });
  page.data = {files:[{name:'scan.pdf'}], transcriptRows:[{course:'待补充课程',grade:'',credits:''}], transcriptReviewed:false};
  page.setData = values => Object.assign(page.data, values);
  return {page, getModal: () => modal};
}

test('uploaded PDF and empty placeholder cannot be confirmed as recognized grades', () => {
  const {page, getModal} = advisor();
  page.confirmTranscriptReview();
  assert.equal(page.data.transcriptReviewed, false);
  assert.ok(getModal());
  getModal().success({confirm:true});
  assert.equal(page.data.transcriptNeedsManualEntry, true);
});

test('a real reviewed course can be confirmed and loading cannot be confirmed', () => {
  const {page} = advisor();
  page.data.transcriptRows = [{course:'线性代数',grade:'88',credits:'3'}];
  page.data.transcriptPreviewLoading = true;
  page.confirmTranscriptReview();
  assert.equal(page.data.transcriptReviewed, false);
  page.data.transcriptPreviewLoading = false;
  page.confirmTranscriptReview();
  assert.equal(page.data.transcriptReviewed, true);
  assert.equal(page.data.transcriptNeedsManualEntry, false);
});

test('all PDF loaders include JBIG2 wasm resources', () => {
  const source = fs.readFileSync(path.join(__dirname, '../local-engine.js'), 'utf8');
  assert.equal((source.match(/wasmUrl:/g) || []).length, 3);
});
