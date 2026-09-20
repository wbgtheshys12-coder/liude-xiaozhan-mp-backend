const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
test('AI creation notices are unconditional and visible before forms and generated drafts', () => {
  const read = p => fs.readFileSync(path.join(__dirname, '../miniprogram', p), 'utf8');
  const tools = read('pages/tools/tools.wxml');
  assert.ok(tools.indexOf('AI生成 · 人工智能生成') < tools.indexOf('tool-tabs'));
  assert.ok(tools.indexOf('AI生成内容预览') < tools.indexOf('class="document-preview"'));
  const materials = read('pages/materials/materials.wxml');
  assert.ok(materials.indexOf('AI生成 · 申请材料初稿') < materials.indexOf('brand-card'));
  assert.match(materials, /class="draft-box"><text class="ai-generated-badge">AI生成/);
  assert.match(read('app.wxss'), /\.ai-review-title\{[^}]*font-size:32rpx/);
});
