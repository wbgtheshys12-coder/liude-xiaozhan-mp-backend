const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
test('source review preserves Chinese inputs and clears when inputs invalidate the draft', () => {
  let page;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../miniprogram/pages/tools/tools.js'), 'utf8'), {
    require: () => ({}), Page: value => { page = value; }, console,
  });
  page.setData = values => Object.assign(page.data, values);
  const form = {latinName:'Demo Student', projectsInternships:'仅有课程作业，无实习'};
  page.refresh(page.data.tools[0], form, 'MOTIVATION LETTER\nStructured draft');
  assert.equal(page.data.sourceReview.find(row => row.key === 'projectsInternships').original, form.projectsInternships);
  page.refresh(page.data.tools[0], form, '');
  assert.equal(page.data.sourceReview.length, 0);
});
