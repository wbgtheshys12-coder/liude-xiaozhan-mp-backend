const env = require("../../utils/env");
const api = require("../../utils/api");
const userSettings = require("../../utils/settings");
const studentProfileUtils = require("../../utils/profile");

const STATS = [
  { key: "bookings", icon: "/assets/me/icon-booking.png", title: "预约", value: "记录", url: "/pages/bookings/bookings" },
  { key: "materials", icon: "/assets/home/icon-cv.png", title: "资料", value: "清单", url: "/pages/materials/materials" },
  { key: "courses", icon: "/assets/home/icon-course.png", title: "网课", value: "学习", url: "/pages/courses/courses" }
];

const MENU_ROWS = [
  [
    { key: "booking", icon: "/assets/me/icon-booking.png", title: "预约记录", url: "/pages/bookings/bookings" },
    { key: "materials", icon: "/assets/home/icon-cv.png", title: "我的材料", url: "/pages/materials/materials" },
    { key: "courses", icon: "/assets/home/icon-course.png", title: "我的网课", url: "/pages/courses/courses" },
    { key: "results", icon: "/assets/home/icon-school.png", title: "推荐结果", url: "/pages/results/results" }
  ],
  [
    { key: "account", icon: "/assets/me/icon-setting.png", title: "账户与付费", url: "/pages/account/account" },
    { key: "messages", icon: "/assets/me/icon-messages.png", title: "联系客服", url: "/pages/messages/messages" },
    { key: "rights", icon: "/assets/me/icon-rights.png", title: "服务权益", url: "/pages/feature/feature?type=rights" },
    { key: "setting", icon: "/assets/me/icon-setting.png", title: "设置", action: "setting" }
  ]
];

const ADMIN_MENU_ROW = [
  { key: "admin-bookings", icon: "/assets/me/icon-booking.png", title: "预约管理", url: "/pages/admin/bookings" },
  { key: "admin-courses", icon: "/assets/home/icon-course.png", title: "课程管理", url: "/pages/admin/courses" },
  { key: "admin-uploads", icon: "/assets/home/icon-cv.png", title: "学生资料库", url: "/pages/admin/uploads" },
  { key: "admin-messages", icon: "/assets/me/icon-messages.png", title: "客服消息", url: "/pages/admin/messages" },
  { key: "admin-stats", icon: "/assets/me/icon-points.png", title: "使用统计", url: "/pages/admin/stats" }
];

function buildMenuSections(isAdmin) {
  const sections = [];
  if (isAdmin) {
    sections.push({ key: "admin", title: "内部管理", desc: "老师和负责人可查看预约、课程与学生资料。", items: ADMIN_MENU_ROW });
  }
  sections.push(
    { key: "service", title: "申请服务", desc: "常用申请工具和进度记录集中在这里。", items: MENU_ROWS[0] },
    { key: "account", title: "账户与设置", desc: "管理账户、消息、权益和本机偏好。", items: MENU_ROWS[1] }
  );
  return sections;
}

function normalizeWechatProfile(profile) {
  return {
    avatarUrl: profile?.avatarUrl || "",
    nickName: profile?.nickName || "",
    updatedAt: profile?.updatedAt || ""
  };
}

function normalizeStudentProfile(profile) {
  return studentProfileUtils.normalize(profile);
}

function getStoredWechatProfile() {
  const session = wx.getStorageSync(env.STORAGE_KEYS.session) || {};
  return normalizeWechatProfile(
    wx.getStorageSync(env.scopedKey(env.STORAGE_KEYS.wechatProfile)) ||
      (session.user?.storageKey ? {} : wx.getStorageSync(env.STORAGE_KEYS.wechatProfile) || {}) ||
      {}
  );
}

function getStoredStudentProfile() {
  return normalizeStudentProfile(studentProfileUtils.getStored());
}

function getSession() {
  const app = getApp();
  return app.globalData.session || wx.getStorageSync(env.STORAGE_KEYS.session) || {};
}

function getUserLabel(session, profile, studentProfile) {
  const studentName = (studentProfile?.name || "").trim();
  if (studentName) return studentName;
  const nickName = (profile?.nickName || "").trim();
  if (nickName) return nickName;
  const user = session.user || {};
  const fallbackName = user.nickName || user.nickname || user.name || "";
  if (fallbackName) return fallbackName;
  if (user.openid) return `微信用户 ${String(user.openid).slice(-6)}`;
  return "内部用户";
}

Page({
  data: {
    userLabel: "内部用户",
    wechatProfile: {
      avatarUrl: "",
      nickName: ""
    },
    studentProfile: {
      name: "",
      school: "",
      major: "",
      contact: "",
      phone: "",
      email: "",
      applicationLevel: ""
    },
    profileLocked: false,
    avatarDraft: "",
    nicknameDraft: "",
    studentDraft: {
      name: "",
      school: "",
      major: "",
      contact: "",
      phone: "",
      email: "",
      applicationLevel: ""
    },
    hasWechatProfile: false,
    hasStudentProfile: false,
    profileComplete: false,
    showBindDialog: false,
    showProfileDialog: false,
    dialogKeyboardHeight: 0,
    dialogScrollTarget: "",
    stats: STATS,
    menuSections: buildMenuSections(false),
    isAdmin: false,
    settingsClass: ""
  },

  onDialogKeyboardHeightChange(event) {
    if (!this.data.showBindDialog && !this.data.showProfileDialog) return;
    const height = Number(event.detail && event.detail.height);
    this.setData({
      dialogKeyboardHeight: Number.isFinite(height) ? Math.max(0, height) : 0,
      dialogScrollTarget: ""
    }, () => {
      if (height > 0 && this._dialogFocusId) this.setData({ dialogScrollTarget: this._dialogFocusId });
    });
  },

  onDialogFieldFocus(event) {
    this._dialogFocusId = event.currentTarget.id;
    this.setData({ dialogScrollTarget: this._dialogFocusId || "" });
  },

  onShow() {
    const app = getApp();
    const session = getSession();
    if (!app.globalData.token && !wx.getStorageSync(env.STORAGE_KEYS.token)) {
      this.setData({ guest: true, userLabel: "游客", isAdmin: false, wechatProfile: {}, studentProfile: {}, hasStudentProfile: false, hasWechatProfile: false });
      return;
    }
    this.setData({ guest: false });
    const profile = getStoredWechatProfile();
    const studentProfile = getStoredStudentProfile();
    app.globalData.wechatProfile = profile;
    app.globalData.latestProfile = studentProfile;
    this.setData({
      userLabel: getUserLabel(session, profile, studentProfile),
      wechatProfile: profile,
      studentProfile,
      nicknameDraft: profile.nickName,
      avatarDraft: profile.avatarUrl,
      studentDraft: {
        name: studentProfile.name,
        school: studentProfile.school,
        major: studentProfile.major,
        contact: studentProfile.contact,
        phone: studentProfile.phone,
        email: studentProfile.email,
        applicationLevel: studentProfile.applicationLevel
      },
      profileLocked: Boolean(studentProfile.lockedAt && studentProfileUtils.isComplete(studentProfile)),
      profileComplete: studentProfileUtils.isComplete(studentProfile),
      hasWechatProfile: Boolean(profile.avatarUrl || profile.nickName),
      hasStudentProfile: Boolean(studentProfile.name || studentProfile.school || studentProfile.major || studentProfile.contact),
      isAdmin: Boolean(session.isAdmin || session.user?.isAdmin),
      menuSections: buildMenuSections(Boolean(session.isAdmin || session.user?.isAdmin)),
      settingsClass: userSettings.getPageClass()
    });
    userSettings.applyRuntimeSettings();
    this.loadServerProfile();
  },

  openPendingWechatBind(profile) {
    const pending =
      wx.getStorageSync(env.scopedKey(env.STORAGE_KEYS.pendingWechatBind)) ||
      wx.getStorageSync(env.STORAGE_KEYS.pendingWechatBind);
    if (!pending || profile.avatarUrl || profile.nickName) return;
    wx.removeStorageSync(env.STORAGE_KEYS.pendingWechatBind);
    wx.removeStorageSync(env.scopedKey(env.STORAGE_KEYS.pendingWechatBind));
    setTimeout(() => {
      this.openBindDialog();
    }, 240);
  },

  guestLogin() { wx.navigateTo({ url: "/pages/login/login" }); },
  guestHome() { wx.switchTab({ url: "/pages/home/home" }); },

  loadServerProfile() {
    api
      .getProfile()
      .then((result) => {
        const profile = normalizeStudentProfile(result.profile || {});
        if (typeof result.isAdmin === "boolean") {
          const app = getApp();
          const currentSession = getSession();
          const nextSession = {
            ...currentSession,
            isAdmin: result.isAdmin,
            isTeacher: Boolean(result.isTeacher),
            isOwner: Boolean(result.isOwner),
            isPlatformAdmin: Boolean(result.isPlatformAdmin),
            canSubscribeBookingNotice: Boolean(result.canSubscribeBookingNotice),
            canManageCourses: Boolean(result.canManageCourses),
            teacherAdvisorKeys: result.teacherAdvisorKeys || [],
            user: {
              ...(currentSession.user || {}),
              ...(result.user || {}),
              isAdmin: result.isAdmin,
              isTeacher: Boolean(result.isTeacher),
              isOwner: Boolean(result.isOwner),
              isPlatformAdmin: Boolean(result.isPlatformAdmin),
              canSubscribeBookingNotice: Boolean(result.canSubscribeBookingNotice),
              canManageCourses: Boolean(result.canManageCourses),
              teacherAdvisorKeys: result.teacherAdvisorKeys || []
            }
          };
          app.globalData.session = nextSession;
          wx.setStorageSync(env.STORAGE_KEYS.session, nextSession);
          this.setData({
            isAdmin: result.isAdmin,
            menuSections: buildMenuSections(result.isAdmin)
          });
        }
        if (profile.name || profile.school || profile.major || profile.contact || profile.applicationLevel || profile.companyAccount || profile.lockedAt) {
          studentProfileUtils.store(profile);
          this.applyStudentProfile(profile);
        }
        const complete = Boolean(result.complete || studentProfileUtils.isComplete(profile));
        this.setData({ profileLocked: Boolean((result.locked || profile.lockedAt) && complete), profileComplete: complete });
      })
      .catch(() => {});
  },

  applyWechatProfile(profile) {
    const nextProfile = normalizeWechatProfile(profile);
    const studentProfile = this.data.studentProfile || {};
    const session = getSession();
    const app = getApp();
    app.globalData.wechatProfile = nextProfile;
    this.setData({
      userLabel: getUserLabel(session, nextProfile, studentProfile),
      wechatProfile: nextProfile,
      nicknameDraft: nextProfile.nickName,
      avatarDraft: nextProfile.avatarUrl,
      hasWechatProfile: Boolean(nextProfile.avatarUrl || nextProfile.nickName)
    });
  },

  applyStudentProfile(profile) {
    const nextProfile = normalizeStudentProfile(profile);
    const session = getSession();
    const app = getApp();
    app.globalData.latestProfile = nextProfile;
    this.setData({
      userLabel: getUserLabel(session, this.data.wechatProfile, nextProfile),
      studentProfile: nextProfile,
      studentDraft: {
        name: nextProfile.name,
        school: nextProfile.school,
        major: nextProfile.major,
        contact: nextProfile.contact,
        phone: nextProfile.phone,
        email: nextProfile.email,
        applicationLevel: nextProfile.applicationLevel
      },
      profileLocked: Boolean(nextProfile.lockedAt && studentProfileUtils.isComplete(nextProfile)),
      profileComplete: studentProfileUtils.isComplete(nextProfile),
      hasStudentProfile: Boolean(nextProfile.name || nextProfile.school || nextProfile.major || nextProfile.contact)
    });
  },

  confirmOpenBindDialog() {
    this.openBindDialog();
  },

  openBindDialog() {
    this._dialogFocusId = "";
    this.setData({
      dialogKeyboardHeight: 0,
      dialogScrollTarget: "",
      showBindDialog: true,
      avatarDraft: this.data.wechatProfile.avatarUrl,
      nicknameDraft: this.data.wechatProfile.nickName
    });
  },

  closeBindDialog() {
    this._dialogFocusId = "";
    this.setData({
      dialogKeyboardHeight: 0,
      dialogScrollTarget: "",
      showBindDialog: false,
      avatarDraft: "",
      nicknameDraft: this.data.wechatProfile.nickName
    });
  },

  noop() {},

  openProfileDialog() {
    if (this.data.profileLocked) {
      wx.showModal({
        title: "个人信息已锁定",
        content: "个人信息提交后不可自行修改。如确需更正，请联系顾问或管理员处理。",
        showCancel: false
      });
      return;
    }
    this._dialogFocusId = "";
    this.setData({
      showProfileDialog: true,
      dialogKeyboardHeight: 0,
      dialogScrollTarget: "",
      studentDraft: {
        name: this.data.studentProfile.name || "",
        school: this.data.studentProfile.school || "",
        major: this.data.studentProfile.major || "",
        contact: this.data.studentProfile.contact || "",
        phone: this.data.studentProfile.phone || "",
        email: this.data.studentProfile.email || "",
        applicationLevel: this.data.studentProfile.applicationLevel || ""
      }
    });
  },

  closeProfileDialog() {
    this._dialogFocusId = "";
    this.setData({ showProfileDialog: false, dialogKeyboardHeight: 0, dialogScrollTarget: "" });
  },

  updateStudentDraft(event) {
    const field = event.currentTarget.dataset.field;
    if (!field) return;
    this.setData({ [`studentDraft.${field}`]: event.detail.value || "" });
  },

  selectStudentLevel(event) {
    const applicationLevel = event.currentTarget.dataset.value;
    if (studentProfileUtils.APPLICATION_LEVELS.includes(applicationLevel)) {
      this.setData({ "studentDraft.applicationLevel": applicationLevel });
    }
  },

  onChooseAvatar(event) {
    const avatarUrl = event.detail?.avatarUrl || "";
    if (!avatarUrl) {
      wx.showToast({ title: "未选择头像", icon: "none" });
      return;
    }
    const updateAvatar = (nextAvatarUrl) => {
      this.setData({ avatarDraft: nextAvatarUrl });
    };
    wx.saveFile({
      tempFilePath: avatarUrl,
      success: (res) => updateAvatar(res.savedFilePath || avatarUrl),
      fail: () => updateAvatar(avatarUrl)
    });
  },

  updateNickname(event) {
    this.setData({ nicknameDraft: event.detail.value || "" });
  },

  saveWechatProfile() {
    const nickName = (this.data.nicknameDraft || "").trim();
    const avatarUrl = this.data.avatarDraft || "";
    if (!nickName && !avatarUrl) {
      wx.showToast({ title: "请先选择头像或填写昵称", icon: "none" });
      return;
    }
    const profile = {
      avatarUrl,
      nickName,
      updatedAt: new Date().toISOString()
    };
    wx.setStorageSync(env.STORAGE_KEYS.wechatProfile, profile);
    wx.setStorageSync(env.scopedKey(env.STORAGE_KEYS.wechatProfile), profile);
    this.applyWechatProfile(profile);
    this.setData({ showBindDialog: false });
    wx.removeStorageSync(env.STORAGE_KEYS.pendingWechatBind);
    wx.removeStorageSync(env.scopedKey(env.STORAGE_KEYS.pendingWechatBind));
    wx.showToast({ title: "微信资料已保存", icon: "success" });
  },

  saveStudentProfile() {
    const payload = studentProfileUtils.normalize(this.data.studentDraft);
    if (!studentProfileUtils.isValidPhone(payload.phone)) {
      wx.showToast({ title: "请检查手机号格式", icon: "none" });
      return;
    }
    if (!studentProfileUtils.isValidEmail(payload.email)) {
      wx.showToast({ title: "请检查邮箱格式", icon: "none" });
      return;
    }
    const missingFields = studentProfileUtils.getMissingFields(payload);
    if (missingFields.length) {
      wx.showToast({ title: `请补充${studentProfileUtils.FIELD_LABELS[missingFields[0]]}`, icon: "none" });
      return;
    }
    wx.showModal({
      title: "确认提交个人信息",
      content: "提交后资料将绑定当前微信账号，预约和客服会自动使用。请确认姓名、手机号/邮箱、学校、专业和申请层次无误。",
      confirmText: "确认提交",
      cancelText: "再检查",
      success: (result) => {
        if (!result.confirm) return;
        api
          .saveProfile(payload)
          .then((response) => {
            const profile = normalizeStudentProfile(response.profile || payload);
            studentProfileUtils.store(profile);
            this.applyStudentProfile(profile);
            this.setData({ showProfileDialog: false, profileLocked: true });
            wx.showToast({ title: "已提交并锁定", icon: "success" });
          })
          .catch((error) => {
            if (error.payload?.profile) {
              const profile = normalizeStudentProfile(error.payload.profile);
              studentProfileUtils.store(profile);
              this.applyStudentProfile(profile);
              this.setData({
                showProfileDialog: false,
                profileLocked: Boolean(profile.lockedAt && studentProfileUtils.isComplete(profile))
              });
            }
            wx.showToast({ title: error.message || "提交失败", icon: "none" });
          });
      }
    });
  },

  openItem(event) {
    const { tab, action, url } = event.currentTarget.dataset;
    if (tab) {
      wx.switchTab({ url: tab });
      return;
    }
    if (url) {
      wx.navigateTo({ url });
      return;
    }
    if (action === "setting") {
      wx.navigateTo({ url: "/pages/settings/settings" });
      return;
    }
    wx.navigateTo({ url: "/pages/feature/feature?type=member" });
  },

  openStat(event) {
    const { url } = event.currentTarget.dataset;
    if (url) wx.navigateTo({ url });
  },

  openMember() {
    wx.navigateTo({ url: "/pages/feature/feature?type=member" });
  },

  logout() {
    const scopedWechatProfileKey = env.scopedKey(env.STORAGE_KEYS.wechatProfile);
    const scopedLatestProfileKey = env.scopedKey(env.STORAGE_KEYS.latestProfile);
    wx.removeStorageSync(env.STORAGE_KEYS.token);
    wx.removeStorageSync(env.STORAGE_KEYS.session);
    wx.removeStorageSync(env.STORAGE_KEYS.wechatProfile);
    wx.removeStorageSync(env.STORAGE_KEYS.latestProfile);
    wx.removeStorageSync(scopedWechatProfileKey);
    wx.removeStorageSync(scopedLatestProfileKey);
    const app = getApp();
    app.globalData.token = "";
    app.globalData.session = null;
    app.globalData.wechatProfile = null;
    app.globalData.latestProfile = null;
    app.globalData.latestRecommendation = null;
    app.globalData.onboardingProfile = null;
    wx.switchTab({ url: "/pages/home/home" });
  }
});
