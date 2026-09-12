const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../miniprogram/pages/about/about.js'), 'utf8');
function setup(config, mode = 'success', reject = false) {
  let page;
  const calls = {};
  const wx = {
    showModal: (args) => { calls.modal = args; },
    setClipboardData: (args) => { calls.clipboard = args.data; }
  };
  if (mode !== 'missing') wx.openOfficialAccountProfile = (args) => {
    calls.username = args.username;
    if (mode === 'fail') args.fail();
    if (mode === 'throw') throw new Error('unsupported');
  };
  vm.runInNewContext(source, {
    Page: (value) => { page = value; }, wx,
    require: (id) => id.endsWith('/env') ? { API_BASE_URL: 'https://example.test' } : {
      getPublicConfig: () => reject ? Promise.reject(new Error('offline')) : Promise.resolve(config)
    }
  });
  page.setData = (value) => Object.assign(page.data, value);
  return { page, calls };
}
for (const config of [{}, { officialAccountUsername: '' }, { officialAccountUsername: 'invalid' }, null]) {
  test('keeps supplied original ID when config is empty or invalid: ' + JSON.stringify(config), async () => {
    const { page, calls } = setup(config);
    page.onLoad(); await new Promise(setImmediate);
    page.openOfficialAccount();
    assert.equal(calls.username, 'gh_654d500aae6b');
  });
}
test('offline config keeps default ID', async () => {
  const { page, calls } = setup(null, 'success', true);
  page.onLoad(); await new Promise(setImmediate); page.openOfficialAccount();
  assert.equal(calls.username, 'gh_654d500aae6b');
});
test('valid remote configuration can override default', async () => {
  const { page, calls } = setup({ officialAccountUsername: 'gh_test123' });
  page.onLoad(); await new Promise(setImmediate); page.openOfficialAccount();
  assert.equal(calls.username, 'gh_test123');
});
for (const mode of ['missing', 'fail', 'throw']) test('safe fallback: ' + mode, () => {
  const { page, calls } = setup({}, mode);
  page.openOfficialAccount();
  assert.ok(calls.modal);
  calls.modal.success({ confirm: false }); assert.equal(calls.clipboard, undefined);
  calls.modal.success({ confirm: true }); assert.equal(calls.clipboard, 'liudexiaozhan01');
});
