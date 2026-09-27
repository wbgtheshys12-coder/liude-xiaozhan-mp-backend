const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
test('results disclaimer shares one viewport container with recommendations', () => {
  const markup = fs.readFileSync(path.join(__dirname, '../miniprogram/pages/results/results.wxml'), 'utf8');
  assert.equal((markup.match(/class="screen-page\b/g) || []).length, 1);
  assert.match(markup, /^<view class="screen-page page/);
  assert.ok(markup.indexOf('results-disclaimer') < markup.indexOf('brand-card'));
  assert.match(markup, /不是录取概率/);
  const css = fs.readFileSync(path.join(__dirname, '../miniprogram/pages/results/results.wxss'), 'utf8');
  assert.doesNotMatch(css, /min-height:\s*100vh/);
  assert.match(css, /overflow-wrap: anywhere/);
});
