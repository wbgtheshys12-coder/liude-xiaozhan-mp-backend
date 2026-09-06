const api = require("../../utils/api");
const env = require("../../utils/env");
const studentProfile = require("../../utils/profile");

function emptyDraft() {
  return {
    name: "",
    contact: "",
    phone: "",
    email: "",
    school: "",
    major: "",
    applicationLevel: ""
  };
}

Page({
  data: {
    loading: true,
    saving: false,
    loadError: "",
    contactType: "phone",
    draft: emptyDraft(),
    lockedFields: {},
    isLegacyLocked: false,
    missingText: ""
  },

  onLoad() {
    const app = getApp();
    const session = app.globalData.session || wx.getStorageSync(env.STORAGE_KEYS.session) || {};
    if (!app.globalData.token && !wx.getStorageSync(env.STORAGE_KEYS.token)) {
      wx.redirectTo({ url: "/pages/login/login" });
      return;
    }
    if (studentProfile.isInternalSession(session)) {
      wx.switchTab({ url: "/pages/home/home" });
      return;
    }
    const handedProfile = app.globalData.onboardingProfile;
    app.globalData.onboardingProfile = null;
    if (handedProfile) {
      this.applyProfile(handedProfile, Boolean(handedProfile.lockedAt));
      this.setData({ loading: false });
    } else {
      this.applyProfile(studentProfile.getStored());
      return this.loadProfile();
    }
  },

  applyProfile(profile, locked = false) {
    const current = studentProfile.normalize(profile);
    const missingFields = studentProfile.getMissingFields(current);
    const lockedFields = {};
    studentProfile.PROFILE_FIELDS.forEach((field) => {
      lockedFields[field] = Boolean(locked && current[field]);
    });
    this.setData({
      draft: {
        name: current.name,
        contact: current.contact,
        phone: current.phone,
        email: current.email,
        school: current.school,
        major: current.major,
        applicationLevel: current.applicationLevel
      },
      lockedFields,
      contactType: current.email && !current.phone ? "email" : "phone",
      isLegacyLocked: Boolean(locked && missingFields.length),
      missingText: missingFields.map((field) => studentProfile.FIELD_LABELS[field]).join("、")
    });
  },

  loadProfile() {
    this.setData({ loading: true, loadError: "" });
    return api
      .getProfile()
      .then((result) => {
        const profile = studentProfile.store(result.profile || {});
        if (result.complete || studentProfile.isComplete(profile)) {
          wx.switchTab({ url: "/pages/home/home" });
          return;
        }
        this.applyProfile(profile, Boolean(result.locked || profile.lockedAt));
      })
      .catch(() => this.setData({ loadError: "暂时未能读取已保存的资料，请重试。你已填写的内容不会被清空。" }))
      .finally(() => this.setData({ loading: false }));
  },

  updateDraft(event) {
    const field = event.currentTarget.dataset.field;
    if (!field || this.data.lockedFields[field]) return;
    this.setData({ [`draft.${field}`]: event.detail.value || "" });
  },

  selectContactType(event) {
    const type = event.currentTarget.dataset.type;
    if (["phone", "email"].includes(type)) this.setData({ contactType: type });
  },

  selectLevel(event) {
    if (this.data.lockedFields.applicationLevel) return;
    const applicationLevel = event.currentTarget.dataset.value;
    if (studentProfile.APPLICATION_LEVELS.includes(applicationLevel)) {
      this.setData({ "draft.applicationLevel": applicationLevel });
    }
  },

  submit() {
    if (this.data.saving || this.data.loading || this.data.loadError) return;
    const draft = { ...this.data.draft };
    const otherContact = this.data.contactType === "phone" ? "email" : "phone";
    if (!this.data.lockedFields[otherContact]) draft[otherContact] = "";
    const payload = studentProfile.normalize(draft);
    if (!studentProfile.isValidPhone(payload.phone)) {
      wx.showToast({ title: "请检查手机号格式", icon: "none" });
      return;
    }
    if (!studentProfile.isValidEmail(payload.email)) {
      wx.showToast({ title: "请检查邮箱格式", icon: "none" });
      return;
    }
    const missingFields = studentProfile.getMissingFields(payload);
    if (missingFields.length) {
      wx.showToast({
        title: `请补充${studentProfile.FIELD_LABELS[missingFields[0]]}`,
        icon: "none"
      });
      return;
    }
    this.setData({ saving: true });
    return api
          .saveProfile(payload)
          .then((response) => {
            studentProfile.store(response.profile || payload);
            wx.showToast({ title: "资料设置完成", icon: "success" });
            wx.switchTab({ url: "/pages/home/home" });
          })
          .catch((error) => {
            if (error.payload?.profile) {
              const current = studentProfile.store(error.payload.profile);
              this.applyProfile(current, Boolean(error.payload.locked || current.lockedAt));
            }
            wx.showToast({ title: error.message || "提交失败", icon: "none" });
          })
          .finally(() => this.setData({ saving: false }));
  }
});
