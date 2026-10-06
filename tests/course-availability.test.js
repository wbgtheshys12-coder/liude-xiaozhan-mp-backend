const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
test('empty courses show closed notice and published courses restore it automatically', async () => {
  let page;
  let records = [];
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../miniprogram/pages/courses/courses.js'), 'utf8'), {
    Page: value => { page = value; }, require: () => ({ getCourses: async () => ({ records }) }), wx: { showToast() {} }
  });
  page.setData = value => Object.assign(page.data, value);
  page.data.currentCourse = { id: 'previous-video' };
  page.onShow();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(page.data.currentCourse, null);
  assert.equal(page.data.courses.length, 0);
  assert.equal(page.data.notice, '该功能暂未开放');
  records = [{ id: 'published-video', type: 'recorded', videoUrl: '/video.mp4' }];
  page.onShow();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(page.data.courses.length, 1);
  assert.ok(!page.data.notice.includes('暂未开放'));
  records = [];
  page.onShow();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(page.data.notice, '该功能暂未开放');
});
