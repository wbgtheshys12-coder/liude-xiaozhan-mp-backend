const env = require("./env");
const BASES = ["liude-shared-profile-draft-v1", "liude-shared-personal-v1", "liude-shared-experience-v1", "liude-shared-advisor-draft-v1", "liude_user_tool_form_cv", "liude_user_tool_form_motivation", env.STORAGE_KEYS.latestProfile];
const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
function begin(page) {
  page.exitScope = env.scopedKey("");
  page.exitSnapshot = BASES.map(base => {
    const key = env.scopedKey(base);
    return { key, value: clone(wx.getStorageSync(key)) };
  });
  page.discardingDraft = false;
  if (wx.enableAlertBeforeUnload) wx.enableAlertBeforeUnload({ message: "内容会自动暂存。如不想保存，请取消返回，使用页面内的“退出填写”选择不保存。" });
}
function rollback(page) {
  if (page.exitScope !== env.scopedKey("")) return;
  (page.exitSnapshot || []).forEach(({ key, value }) => {
    if (value === undefined || value === "") wx.removeStorageSync(key);
    else wx.setStorageSync(key, clone(value));
  });
  getApp().globalData.latestProfile = require("./profile").getStored();
}
function choose(page, save, leave) {
  wx.showActionSheet({
    itemList: ["保存草稿并退出", "不保存本次修改并退出"],
    success(result) {
      if (page.exitScope !== env.scopedKey("")) return;
      try {
        if (result.tapIndex === 0) save();
        else { rollback(page); page.discardingDraft = true; }
        if (wx.disableAlertBeforeUnload) wx.disableAlertBeforeUnload();
        leave();
      } catch (_) {
        wx.showToast({ title: "保存失败，请重试", icon: "none" });
      }
    }
  });
}
function leave() {
  wx.navigateBack({ fail: () => wx.switchTab({ url: "/pages/home/home" }) });
}
module.exports = { begin, choose, leave, rollback };
