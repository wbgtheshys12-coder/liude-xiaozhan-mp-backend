const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
test('template disclosures are visible and state translation limits', () => {
  const read = p => fs.readFileSync(path.join(__dirname, '../miniprogram', p), 'utf8');
  const tools = read('pages/tools/tools.wxml');
  assert.match(tools, /智能辅助翻译/);
  assert.match(tools, /人工智能生成/);
  assert.match(tools, /OpenAI/);
  assert.ok(tools.indexOf('模板整理初稿预览') < tools.indexOf('class="document-preview"'));
  const materials = read('pages/materials/materials.wxml');
  assert.match(materials, /模板整理 · 申请材料初稿/);
  assert.match(materials, /class="draft-box"><text class="ai-generated-badge">模板整理初稿/);
  assert.match(read('app.wxss'), /\.ai-review-title\{[^}]*font-size:32rpx/);
});
