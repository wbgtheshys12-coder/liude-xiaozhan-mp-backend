const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function setup() {
  let page, rendered;
  const scrolls = [];
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../miniprogram/pages/advisor/advisor.js"), "utf8"), {
    require: () => ({}),
    Page: value => { page = value; },
    wx: { pageScrollTo: options => scrolls.push(options) }
  });
  page.data = { ...page.data, profile: { name: "Test" }, files: [{ name: "test.pdf" }] };
  page.setData = (patch, callback) => { Object.assign(page.data, patch); rendered = callback; };
  return { page, scrolls, render: () => rendered() };
}

for (const [method, start, expected, event] of [
  ["nextStep", 0, 1],
  ["prevStep", 3, 2],
  ["goStep", 0, 4, { currentTarget: { dataset: { index: "4" } } }],
  ["nextStep", 4, 4],
  ["prevStep", 0, 0]
]) {
  test(method + " from " + start + " scrolls only after rendering and preserves input", () => {
    const { page, scrolls, render } = setup();
    page.data.currentStep = start;
    page[method](event);
    assert.equal(page.data.currentStep, expected);
    assert.equal(scrolls.length, 0);
    render();
    assert.equal(scrolls.length, 1);
    assert.equal(scrolls[0].scrollTop, 0);
    assert.equal(scrolls[0].duration, 0);
    assert.equal(page.data.profile.name, "Test");
    assert.equal(page.data.files[0].name, "test.pdf");
  });
}

test("invalid step is ignored", () => {
  const { page, scrolls } = setup();
  page.changeStep(NaN);
  assert.equal(page.data.currentStep, 0);
  assert.equal(scrolls.length, 0);
});
