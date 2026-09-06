const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");

const root = fs.existsSync(path.resolve(__dirname, "../../用户版小程序/app.json")) ? path.resolve(__dirname, "../../用户版小程序") : path.resolve(__dirname, "../miniprogram");
const options = { skip: fs.existsSync(path.join(root, "app.json")) ? false : "standalone backend checkout" };
const completeProfile = { name: "测试学生", phone: "13800138000", school: "测试大学", major: "机械工程", applicationLevel: "硕士" };

function harness(pagePath, seed = {}) {
  const storage = { ...seed };
  const app = { globalData: {} };
  const calls = { home: 0, profile: 0, login: 0, save: [], redirects: [], modals: 0, toast: [] };
  const wx = {
    getStorageSync: (key) => storage[key],
    setStorageSync: (key, value) => { storage[key] = value; },
    removeStorageSync: (key) => { delete storage[key]; },
    switchTab: () => { calls.home++; },
    redirectTo: ({ url }) => { calls.redirects.push(url); },
    navigateTo: ({ url }) => { calls.redirects.push(url); },
    showModal: () => { calls.modals++; },
    showToast: (args) => { calls.toast.push(args.title); }
  };
  const modules = {};
  const api = {
    getProfile: async () => { calls.profile++; return { profile: {} }; },
    loginUser: async () => { calls.login++; return { profile: completeProfile }; },
    saveProfile: async (value) => { calls.save.push(value); return { profile: value }; }
  };
  function load(file) {
    if (modules[file]) return modules[file].exports;
    const module = { exports: {} };
    modules[file] = module;
    vm.runInNewContext(fs.readFileSync(file, "utf8"), {
      module, exports: module.exports, wx, getApp: () => app,
      require: (id) => load(path.resolve(path.dirname(file), `${id}.js`))
    }, { filename: file });
    return module.exports;
  }
  const env = load(path.join(root, "utils/env.js"));
  const profile = load(path.join(root, "utils/profile.js"));
  let definition;
  vm.runInNewContext(fs.readFileSync(path.join(root, pagePath), "utf8"), {
    Page: (value) => { definition = value; }, wx, getApp: () => app,
    require: (id) => id.endsWith("/api") ? api : id.endsWith("/env") ? env : id.endsWith("/profile") ? profile :
      { start() {}, finish() {}, reset() {}, stop() {} }
  }, { filename: pagePath });
  const page = { ...definition, data: JSON.parse(JSON.stringify(definition.data)), setData(patch) {
    Object.entries(patch).forEach(([key, value]) => {
      const parts = key.split(".");
      let target = this.data;
      while (parts.length > 1) target = target[parts.shift()];
      target[parts[0]] = value;
    });
  } };
  return { page, calls, api, app, wx, storage, env, profile };
}

test("first login requires explicit privacy consent and duplicate taps do not start extra logins", options, async () => {
  const h = harness("pages/login/login.js");
  h.page.onLoad();
  h.page.login();
  assert.equal(h.calls.login, 0);
  assert.equal(h.page.data.privacyAccepted, false);
  h.page.togglePrivacy({ detail: { value: ["accepted"] } });
  const pending = h.page.login();
  h.page.login();
  await pending;
  assert.equal(h.calls.login, 1);
  assert.equal(h.calls.home, 1);
  assert.equal(h.calls.modals, 0);
  assert.equal(h.calls.profile, 0);
});

test("returning student with account-scoped profile enters without another login or avatar prompt", options, async () => {
  const h = harness("pages/login/login.js");
  h.storage[h.env.STORAGE_KEYS.token] = "existing-session";
  h.storage[h.env.STORAGE_KEYS.session] = { user: { storageKey: "student-a" } };
  h.storage[h.env.scopedKey(h.env.STORAGE_KEYS.latestProfile)] = completeProfile;
  await h.page.onLoad();
  assert.equal(h.calls.home, 1);
  assert.equal(h.calls.profile, 0);
  assert.equal(h.calls.login, 0);
  assert.equal(h.calls.modals, 0);
});

test("new student can enter home without mandatory onboarding", options, async () => {
  const h = harness("pages/login/login.js", { profile: { name: "测试学生" } });
  h.page.setData({ privacyAccepted: true });
  h.api.loginUser = async () => ({ profile: { name: "测试学生" } });
  await h.page.login();
  assert.equal(h.calls.home, 1);
  assert.equal(h.calls.redirects.length, 0);
});

test("temporary profile network errors do not force users to re-enter saved information", options, async () => {
  const h = harness("pages/login/login.js");
  h.storage[h.env.STORAGE_KEYS.token] = "existing-session";
  h.api.getProfile = async () => { throw new Error("offline"); };
  await h.page.onLoad();
  assert.equal(h.calls.redirects.length, 0);
  assert.equal(h.page.data.isError, true);
  assert.equal(h.page.data.loading, false);
});

test("teacher login skips student onboarding", options, async () => {
  const h = harness("pages/login/login.js");
  await h.page.goAfterLogin({ user: { isTeacher: true } });
  assert.equal(h.calls.home, 1);
  assert.equal(h.calls.profile, 0);
});

test("onboarding accepts one valid contact and submits once without redundant confirmation", options, async () => {
  const h = harness("pages/onboarding/onboarding.js");
  h.page.setData({ loading: false, draft: { ...completeProfile, contact: "", email: "draft-not-an-email" } });
  const pending = h.page.submit();
  h.page.submit();
  await pending;
  assert.equal(h.calls.save.length, 1);
  assert.equal(h.calls.save[0].phone, completeProfile.phone);
  assert.equal(h.calls.save[0].email, "");
  assert.equal(h.calls.modals, 0);
  assert.equal(h.calls.home, 1);
});

test("onboarding email selection validates contact and retains existing locked phone", options, async () => {
  const h = harness("pages/onboarding/onboarding.js");
  h.page.setData({ loading: false, draft: { ...completeProfile, email: "wrong" }, lockedFields: { phone: true } });
  h.page.selectContactType({ currentTarget: { dataset: { type: "email" } } });
  await h.page.submit();
  assert.equal(h.calls.save.length, 0);
  h.page.updateDraft({ currentTarget: { dataset: { field: "email" } }, detail: { value: "student@example.com" } });
  await h.page.submit();
  assert.equal(h.calls.save.length, 1);
  assert.equal(h.calls.save[0].phone, completeProfile.phone);
  assert.equal(h.calls.save[0].email, "student@example.com");
});

test("onboarding read failure offers retry and cannot overwrite a profile while unknown", options, async () => {
  const h = harness("pages/onboarding/onboarding.js");
  h.page.applyProfile(completeProfile);
  h.api.getProfile = async () => { throw new Error("offline"); };
  await h.page.loadProfile();
  await h.page.submit();
  assert.equal(h.calls.save.length, 0);
  assert.equal(h.page.data.draft.name, completeProfile.name);
  assert.ok(h.page.data.loadError);
});

test("about page preserves original poster preview and copies the expected contact", options, () => {
  const h = harness("pages/about/about.js");
  let copied, preview;
  h.wx.setClipboardData = (args) => { copied = args.data; };
  h.wx.previewImage = (args) => { preview = args; };
  h.page.copyContact({ currentTarget: { dataset: { value: "liudexiaozhan" } } });
  h.page.previewPoster();
  assert.equal(copied, "liudexiaozhan");
  assert.match(preview.current, /\/api\/mp\/public\/about-poster\.jpg\?v=20260830$/);
  assert.equal(h.page.data.strengths.length, 4);
});

test("privacy links use the WeChat privacy contract, not the unrelated talent policy page", options, () => {
  for (const [file, method] of [["pages/login/login.js", "openPrivacyContract"], ["pages/about/about.js", "openPolicy"]]) {
    const h = harness(file);
    let opened = 0;
    h.wx.openPrivacyContract = () => { opened++; };
    h.page[method]();
    assert.equal(opened, 1);
    assert.equal(h.calls.redirects.length, 0);
    delete h.wx.openPrivacyContract;
    h.page[method]();
    assert.equal(h.calls.modals, 1);
    assert.equal(h.calls.redirects.length, 0);
  }
});

test("API account switch clears in-memory data and missing WeChat code never reaches the backend", options, async () => {
  const storage = {};
  const app = { globalData: {
    session: { user: { storageKey: "student-a" } },
    latestProfile: { name: "previous account" }, latestRecommendation: { private: true },
    wechatProfile: { nickName: "previous account" }, onboardingProfile: { name: "previous account" }
  } };
  let code = "test-code";
  let requests = 0;
  const wx = {
    getStorageSync: key => storage[key],
    setStorageSync: (key, value) => { storage[key] = value; },
    login: ({ success }) => success({ code }),
    request: ({ success }) => {
      requests++;
      success({ statusCode: 200, data: { token: "new-token", user: { storageKey: "student-b" } } });
    }
  };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, "utils/api.js"), "utf8"), {
    module, exports: module.exports, wx, getApp: () => app, console,
    require: id => id === "./env" ? { API_BASE_URL: "https://example.test", STORAGE_KEYS: { token: "token", session: "session" } } : { repairTextDeep: value => value }
  });
  await module.exports.loginUser();
  assert.equal(app.globalData.session.user.storageKey, "student-b");
  for (const key of ["latestProfile", "latestRecommendation", "wechatProfile", "onboardingProfile"]) {
    assert.equal(app.globalData[key], null);
  }
  code = "";
  await assert.rejects(module.exports.loginUser(), /微信登录未完成/);
  assert.equal(requests, 1);
});
