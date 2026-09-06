const api = require("../../utils/api");
const env = require("../../utils/env");
const materials = require("../../utils/materials");
const progress = require("../../utils/progress");

const UPLOAD_CATEGORIES = ["本科成绩单", "申请材料", "文书材料", "语言/APS", "其他材料"];
const CHECKLISTS = {
  bachelor: {
    title: "本科申请材料清单",
    items: ["高中毕业证/在读证明", "高中成绩单", "高考成绩或等效材料", "语言成绩", "护照", "动机信", "简历", "作品集/课程模块证明（按专业）"]
  },
  master: {
    title: "硕士申请材料清单",
    items: ["本科成绩单", "在读证明/毕业证/学位证", "APS 证书", "语言成绩", "护照", "简历", "动机信", "课程模块证明（按项目）", "推荐信/作品集（按项目）"]
  }
};

function groupByCategory(workspace) {
  const grouped = {};
  workspace.categories.forEach((category) => {
    grouped[category.key] = workspace.materials.filter((material) => material.category === category.key);
  });
  return grouped;
}

Page({
  data: {
    blocked: false,
    workspace: null,
    categories: [],
    statusOptions: [],
    materialsByCategory: {},
    draftingId: "",
    draftProgress: 0,
    draftProgressText: "",
    progress: { total: 0, completed: 0, percent: 0 },
    uploadCategories: UPLOAD_CATEGORIES,
    uploading: false,
    uploadedRecords: [],
    trainingConsent: false,
    checklistTabs: [
      { key: "bachelor", label: "本科" },
      { key: "master", label: "硕士" }
    ],
    activeChecklist: "master",
    checklist: CHECKLISTS.master
  },

  onUnload() {
    progress.stop(this, "draftProgressTimer");
  },

  onLoad() {
    const app = getApp();
    const profile = app.globalData.token ? app.globalData.latestProfile || wx.getStorageSync(env.scopedKey(env.STORAGE_KEYS.latestProfile)) || {} : {};
    const recommendation = app.globalData.token ? app.globalData.latestRecommendation || wx.getStorageSync(env.scopedKey(env.STORAGE_KEYS.latestRecommendation)) || {} : {};
    const workspace = materials.buildWorkspace(profile, recommendation);
    this.refresh(workspace);
    this.setData({
      uploadedRecords: app.globalData.token ? wx.getStorageSync(env.scopedKey("liude_user_uploaded_material_records")) || [] : [],
      trainingConsent: app.globalData.token && Boolean(wx.getStorageSync(env.scopedKey("liude_user_training_consent")))
    });
    if (!app.globalData.token) return;
    this.loadUploadedRecords();
    api
      .checkMaterialAccess()
      .then(() => this.setData({ blocked: false }))
      .catch(() => {
        this.setData({ blocked: true });
      });
  },

  refresh(workspace) {
    materials.saveWorkspace(workspace);
    this.setData({
      blocked: false,
      workspace,
      categories: workspace.categories,
      statusOptions: workspace.statusOptions,
      materialsByCategory: groupByCategory(workspace),
      progress: materials.progress(workspace.materials)
    });
  },

  switchChecklist(event) {
    const activeChecklist = event.currentTarget.dataset.key || "master";
    this.setData({
      activeChecklist,
      checklist: CHECKLISTS[activeChecklist] || CHECKLISTS.master
    });
  },

  updateTrainingConsent(event) {
    const trainingConsent = Boolean(event.detail.value);
    this.setData({ trainingConsent });
    wx.setStorageSync(env.scopedKey("liude_user_training_consent"), trainingConsent);
  },

  loadUploadedRecords() {
    api
      .getMyUploadedMaterials()
      .then((result) => {
        const records = result.records || [];
        wx.setStorageSync(env.scopedKey("liude_user_uploaded_material_records"), records);
        this.setData({ uploadedRecords: records });
      })
      .catch(() => {});
  },

  uploadMaterial() {
    if (!api.ensureLogin()) return;
    wx.showActionSheet({
      itemList: UPLOAD_CATEGORIES,
      success: (result) => {
        const category = UPLOAD_CATEGORIES[result.tapIndex] || "申请材料";
        this.setData({ uploading: true });
        api
          .chooseStudentMaterialFiles()
          .then((files) => {
            if (!files.length) return [];
            const app = getApp();
            const profile = app.globalData.latestProfile || wx.getStorageSync(env.scopedKey(env.STORAGE_KEYS.latestProfile)) || {};
            return Promise.all(
              files.map((file) =>
                api.uploadStudentMaterial({
                  category,
                  usage:
                    category === "本科成绩单" && this.data.trainingConsent
                      ? "ocr-training-consented"
                      : "application-review-only",
                  trainingConsent: category === "本科成绩单" && this.data.trainingConsent,
                  studentName: profile.name || "",
                  file
                })
              )
            );
          })
          .then((results) => {
            if (!results || !results.length) return;
            const nextRecords = [
              ...((results || []).map((item) => item.record).filter(Boolean)),
              ...this.data.uploadedRecords
            ].slice(0, 30);
            wx.setStorageSync(env.scopedKey("liude_user_uploaded_material_records"), nextRecords);
            this.setData({ uploadedRecords: nextRecords });
            wx.showToast({ title: "资料已上传", icon: "success" });
            this.loadUploadedRecords();
          })
          .catch((error) => wx.showToast({ title: error.message || "上传失败", icon: "none" }))
          .finally(() => this.setData({ uploading: false }));
      }
    });
  },

  openUploadedMaterial(event) {
    const id = event.currentTarget.dataset.id;
    const record = this.data.uploadedRecords.find((item) => item.id === id);
    if (!record) return;
    wx.showLoading({ title: "正在读取" });
    api
      .downloadMaterialFile(id, false)
      .then((filePath) => {
        if (/^image\//i.test(record.mimeType || "") || /\.(png|jpe?g|webp)$/i.test(record.name || "")) {
          wx.previewImage({ urls: [filePath], current: filePath });
          return;
        }
        const fileType = String(record.name || "").split(".").pop().toLowerCase();
        wx.openDocument({
          filePath,
          fileType: ["pdf", "doc", "docx", "xls", "xlsx"].includes(fileType) ? fileType : undefined,
          showMenu: true,
          fail: () => wx.showModal({ title: "预览未打开", content: "当前微信暂不支持预览此文件，可联系老师通过电脑后台查看；本次操作不代表已保存。", showCancel: false })
        });
      })
      .catch((error) => wx.showToast({ title: error.message || "读取失败", icon: "none" }))
      .finally(() => wx.hideLoading());
  },

  deleteUploadedMaterial(event) {
    const id = event.currentTarget.dataset.id;
    const record = this.data.uploadedRecords.find((item) => item.id === id);
    if (!record) return;
    wx.showModal({
      title: "删除上传资料",
      content: `确认删除“${record.name || "该资料"}”吗？老师资料库中的对应文件也会删除。`,
      confirmText: "删除",
      confirmColor: "#d93025",
      success: (result) => {
        if (!result.confirm) return;
        api
          .deleteStudentMaterial(id)
          .then(() => {
            this.setData({ uploadedRecords: this.data.uploadedRecords.filter((item) => item.id !== id) });
            wx.showToast({ title: "已删除", icon: "success" });
            this.loadUploadedRecords();
          })
          .catch((error) => wx.showToast({ title: error.message || "删除失败", icon: "none" }));
      }
    });
  },

  changeStatus(event) {
    const id = event.currentTarget.dataset.id;
    const status = this.data.statusOptions[Number(event.detail.value)];
    const workspace = this.data.workspace;
    workspace.materials = workspace.materials.map((material) => (material.id === id ? { ...material, status } : material));
    this.refresh(workspace);
  },

  generateDraft(event) {
    if (!api.ensureLogin()) return;
    const id = event.currentTarget.dataset.id;
    const workspace = this.data.workspace;
    const current = workspace.materials.find((material) => material.id === id);
    if (!current) return;

    this.setData({ draftingId: id });
    progress.start(this, {
      timerKey: "draftProgressTimer",
      progressKey: "draftProgress",
      textKey: "draftProgressText",
      from: 14,
      cap: 90,
      step: 5,
      text: "正在结合当前申请信息生成材料初稿。"
    });
    api
      .generateMaterialDraft({
        material: current,
        workspace: {
          profile: workspace.profile || {},
          context: workspace.context || {},
          recommendations: workspace.recommendations || []
        }
      })
      .then((result) => {
        progress.finish(this, {
          timerKey: "draftProgressTimer",
          progressKey: "draftProgress",
          textKey: "draftProgressText",
          text: "初稿已生成，正在写入材料卡片。"
        });
        workspace.materials = workspace.materials.map((material) => {
          if (material.id !== id) return material;
          return {
            ...material,
            status: material.status === "未开始" ? "准备中" : material.status,
            generatedDraft: result.draft || materials.buildDraft(material, workspace)
          };
        });
        this.refresh(workspace);
      })
      .catch(() => {
        progress.finish(this, {
          timerKey: "draftProgressTimer",
          progressKey: "draftProgress",
          textKey: "draftProgressText",
          text: "已切换本地模板生成初稿。"
        });
        workspace.materials = workspace.materials.map((material) => {
          if (material.id !== id) return material;
          return {
            ...material,
            status: material.status === "未开始" ? "准备中" : material.status,
            generatedDraft: materials.buildDraft(material, workspace)
          };
        });
        this.refresh(workspace);
      })
      .finally(() => {
        progress.reset(this, {
          timerKey: "draftProgressTimer",
          progressKey: "draftProgress",
          textKey: "draftProgressText"
        });
        this.setData({ draftingId: "" });
      });
  }
});
