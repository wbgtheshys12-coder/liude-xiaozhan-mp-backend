const test = require("node:test"), assert = require("node:assert/strict"), vm = require("node:vm"), fs = require("node:fs"), path = require("node:path");
function setup() {
  const storage = {}, app = { globalData: {} }; let scope = "a", action;
  const env = { scopedKey: key => key + "_" + scope, STORAGE_KEYS: { latestProfile: "profile" } };
  const module = { exports: {} };
  const wx = { getStorageSync: key => storage[key] || "", setStorageSync: (key, value) => storage[key] = value,
    removeStorageSync: key => delete storage[key], showActionSheet: options => action = options,
    showToast() {}, disableAlertBeforeUnload() {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../miniprogram/utils/form-exit.js"), "utf8"), {
    module, wx, getApp: () => app, require: key => key === "./env" ? env : { getStored: () => storage.profile_a }
  });
  return { helper: module.exports, storage, choose: index => action.success({ tapIndex: index }), switchAccount: () => scope = "b" };
}
test("discard restores previous draft and removes new entries without touching uploaded materials", () => {
  const { helper, storage, choose } = setup(), page = {};
  storage.profile_a = { name: "Before" }; storage.materials_a = ["server-record"];
  helper.begin(page);
  storage.profile_a = { name: "After" }; storage["liude-shared-experience-v1_a"] = { education: [] };
  let left = false;
  helper.choose(page, () => assert.fail("must not save"), () => left = true);
  choose(1);
  assert.equal(storage.profile_a.name, "Before");
  assert.equal(storage["liude-shared-experience-v1_a"], undefined);
  assert.deepEqual(storage.materials_a, ["server-record"]);
  assert.equal(page.discardingDraft, true); assert.equal(left, true);
});
test("save occurs before leaving; cancelled sheet does nothing", () => {
  const { helper, choose } = setup(), page = {}, calls = [];
  helper.begin(page); helper.choose(page, () => calls.push("save"), () => calls.push("leave"));
  assert.deepEqual(calls, []); choose(0); assert.deepEqual(calls, ["save", "leave"]);
});
test("account switch prevents rollback and exit action", () => {
  const { helper, storage, choose, switchAccount } = setup(), page = {};
  helper.begin(page); switchAccount(); storage.profile_b = { name: "B" };
  helper.choose(page, () => assert.fail(), () => assert.fail()); choose(1);
  assert.equal(storage.profile_b.name, "B");
});
