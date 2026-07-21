const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const miniRoot = path.resolve(__dirname, "..", "..", "用户版小程序");

function walkFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    return entry.isDirectory() ? walkFiles(fullPath) : [fullPath];
  });
}

function read(relativePath) {
  return fs.readFileSync(path.join(miniRoot, relativePath), "utf8");
}

function assertBalancedWxml(relativePath, source) {
  const structuralTags = new Set(["view", "text", "button", "block", "label", "picker", "scroll-view", "checkbox-group", "video"]);
  const stack = [];
  const tags = source.match(/<\/?[a-z][^>]*>/gi) || [];
  tags.forEach((rawTag) => {
    const match = /^<\/?([a-z][\w-]*)/i.exec(rawTag);
    if (!match || !structuralTags.has(match[1])) return;
    const name = match[1];
    if (rawTag.startsWith("</")) {
      assert.equal(stack.pop(), name, `${relativePath} 的 <${name}> 标签嵌套不匹配`);
      return;
    }
    if (!rawTag.endsWith("/>")) stack.push(name);
  });
  assert.deepEqual(stack, [], `${relativePath} 存在未闭合 WXML 标签`);
}

test("mini program pages, bindings, JSON, layout guards and package size", () => {
  const app = JSON.parse(read("app.json"));
  assert.equal(app.pages.includes("pages/live/live"), true);
  assert.equal(JSON.parse(read("project.config.json")).appid, "wxd03d251346000689");
  assert.match(read("utils/env.js"), /https:\/\/liude-xiaozhan-mp-backend\.onrender\.com/);
  assert.equal(app.pages.includes("pages/onboarding/onboarding"), true);
  assert.match(read("pages/onboarding/onboarding.wxml"), /首次登录 · 一次设置/);
  assert.match(read("pages/onboarding/onboarding.wxml"), /联系方式/);
  assert.match(read("pages/onboarding/onboarding.wxml"), /申请本科/);
  assert.match(read("pages/onboarding/onboarding.wxml"), /申请硕士/);
  assert.match(read("utils/profile.js"), /hasAccountScope/);
  assert.match(read("utils/profile.js"), /session\.user\?\.storageKey/);
  assert.match(read("pages/booking/booking.wxml"), /已绑定学生资料/);
  assert.doesNotMatch(read("pages/booking/booking.wxml"), /bindinput="update(?:StudentName|Contact|Major)"/);
  assert.match(read("pages/tools/tools.wxml"), /\* 必填/);
  assert.match(read("pages/results/results.wxml"), /导出匹配报告 PDF/);
  assert.match(read("pages/advisor/advisor.wxml"), /填写匹配度调查表/);
  const advisorCopy = `${read("pages/advisor/advisor.wxml")}\n${read("pages/advisor/advisor.js")}`;
  assert.match(advisorCopy, /成绩单为可选项/);
  assert.match(advisorCopy, /按现有信息推荐/);
  assert.doesNotMatch(advisorCopy, /无法识别|识别失败|识别不了|上游服务|兜底/);
  assert.equal(app.pages.includes("pages/messages/messages"), true);
  assert.equal(app.pages.includes("pages/admin/messages"), true);
  assert.match(read("pages/messages/messages.wxml"), /客服对话/);
  assert.match(read("pages/messages/messages.wxml"), /本次咨询身份/);
  assert.match(read("pages/messages/messages.wxml"), /scroll-into-view/);
  assert.match(read("pages/messages/messages.wxml"), />发送</);
  assert.match(read("pages/admin/messages.wxml"), /发送回复/);
  assert.match(read("utils/api.js"), /\/api\/mp\/admin\/messages\/reply/);
  assert.match(read("pages/admin/courses.wxml"), /视频已配置/);
  assert.match(read("pages/admin/courses.wxml"), /bindtap="removeVideo"/);
  assert.match(read("pages/admin/courses.wxml"), /bindtap="deleteCourse"/);
  assert.match(read("utils/api.js"), /\/api\/mp\/admin\/course-video\/delete/);
  assert.match(read("utils/api.js"), /\/api\/mp\/admin\/course\/delete/);
  assert.doesNotMatch(read("pages/course/course.js"), /先上传成绩单/);

  app.pages.forEach((pagePath) => {
    ["js", "json", "wxml", "wxss"].forEach((extension) => {
      assert.equal(fs.existsSync(path.join(miniRoot, `${pagePath}.${extension}`)), true, `${pagePath}.${extension} 缺失`);
    });
    const js = read(`${pagePath}.js`);
    const wxml = read(`${pagePath}.wxml`);
    assertBalancedWxml(`${pagePath}.wxml`, wxml);
    const handlers = Array.from(
      new Set(Array.from(wxml.matchAll(/\b(?:bind|catch)[\w:-]*="([A-Za-z_$][\w$]*)"/g), (match) => match[1]))
    );
    handlers.forEach((handler) => {
      assert.match(js, new RegExp(`\\b${handler}\\s*\\(`), `${pagePath}.wxml 引用了未实现事件 ${handler}`);
    });
  });

  const files = walkFiles(miniRoot);
  const packageBytes = files.reduce((sum, file) => sum + fs.statSync(file).size, 0);
  assert.ok(packageBytes < 2 * 1024 * 1024, `小程序原始包体 ${packageBytes} bytes 已超过 2MB`);

  files
    .filter((file) => /\.(js|json|wxml|wxss)$/i.test(file))
    .forEach((file) => {
      const source = fs.readFileSync(file, "utf8");
      assert.equal(source.includes("\ufffd"), false, `${file} 含 UTF-8 替换字符`);
      assert.equal(/oWfx13[A-Za-z0-9_-]+/.test(source), false, `${file} 不应包含真实 openid`);
    });

  files
    .filter((file) => file.endsWith(".wxss"))
    .forEach((file) => {
      const source = fs.readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
      const opens = (source.match(/{/g) || []).length;
      const closes = (source.match(/}/g) || []).length;
      assert.equal(opens, closes, `${file} 的 WXSS 花括号不匹配`);
    });

  const appWxss = read("app.wxss");
  assert.match(appWxss, /max-width:\s*100vw/);
  assert.match(appWxss, /overflow-x:\s*hidden/);
  assert.match(appWxss, /overflow-wrap:\s*anywhere/);
  assert.match(appWxss, /button[\s\S]*min-width:\s*0/);

  const schools = require(path.join(miniRoot, "utils", "schools.js")).getSchools();
  assert.ok(schools.length >= 35, `院校数量只有 ${schools.length}`);
  schools.forEach((school) => {
    assert.ok(school.name && school.summary && school.tags?.length, `${school.id} 院校信息不完整`);
    assert.equal(fs.existsSync(path.join(miniRoot, String(school.logo || "").replace(/^\//, ""))), true, `${school.id} Logo 缺失`);
  });
});

test("student profile cache stays isolated by WeChat account", () => {
  const env = require(path.join(miniRoot, "utils", "env.js"));
  const storage = {
    [env.STORAGE_KEYS.session]: { user: { storageKey: "current-user" } },
    [env.STORAGE_KEYS.latestProfile]: { name: "previous-user", contact: "previous-contact" },
  };
  global.wx = {
    getStorageSync(key) {
      return storage[key];
    },
    setStorageSync(key, value) {
      storage[key] = value;
    },
  };
  const modulePath = path.join(miniRoot, "utils", "profile.js");
  delete require.cache[require.resolve(modulePath)];
  const studentProfile = require(modulePath);
  assert.equal(studentProfile.getStored().name, "");
  storage[env.scopedKey(env.STORAGE_KEYS.latestProfile)] = {
    name: "current-user",
    contact: "current-contact",
    school: "current-school",
    major: "current-major",
    applicationLevel: "硕士",
  };
  assert.equal(studentProfile.getStored().name, "current-user");
  assert.equal(studentProfile.getStored().contact, "current-contact");
  delete global.wx;
});
