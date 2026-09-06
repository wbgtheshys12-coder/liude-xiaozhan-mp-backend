const api = require("../../utils/api");

const TYPE_OPTIONS = ["录播课", "直播课"];
const VIDEO_PICKER_NOTE = "支持 MP4/MOV/M4V 分片上传，单个不超过 512MB；正式长课建议使用云点播链接。";

function blankForm() {
  return {
    id: "",
    type: "recorded",
    title: "",
    summary: "",
    tagsText: "",
    videoUrl: "",
    liveUrl: "",
    allowedStorageKeysText: "",
    startAt: "",
    duration: "",
    status: "published"
  };
}

function formatBytes(size) {
  const bytes = Number(size || 0);
  if (!bytes) return "";
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`;
}

function enrichCourse(course) {
  let mediaText = "未配置视频";
  let mediaState = "empty";
  if (course.type === "live") {
    mediaText = course.liveUrl ? "直播入口已配置" : "直播入口待配置";
    mediaState = course.liveUrl ? "ready" : "empty";
  } else if (course.videoStorage === "local" && course.videoExists) {
    mediaText = `视频已上传${course.videoSize ? ` · ${formatBytes(course.videoSize)}` : ""}`;
    mediaState = "ready";
  } else if (course.videoStorage === "local" && !course.videoExists) {
    mediaText = "视频文件已失效，请重新上传";
    mediaState = "missing";
  } else if (course.videoUrl) {
    mediaText = "外部视频链接已配置";
    mediaState = "ready";
  }
  return { ...course, mediaText, mediaState };
}

Page({
  data: {
    loading: true,
    saving: false,
    deletingVideo: false,
    uploadingVideo: false,
    uploadProgress: 0,
    videoUploadNote: VIDEO_PICKER_NOTE,
    videoStatus: "empty",
    videoFileName: "",
    videoSizeText: "",
    storagePersistent: false,
    storageNote: "正在检查课程存储状态…",
    typeOptions: TYPE_OPTIONS,
    records: [],
    form: blankForm()
  },

  onShow() {
    this.loadCourses();
  },

  loadCourses() {
    this.setData({ loading: true });
    api
      .getAdminCourses()
      .then((result) => this.setData({
        records: (result.records || []).map(enrichCourse),
        storagePersistent: Boolean(result.storagePersistent),
        storageNote: result.storageNote || "课程管理与电脑后台使用同一数据源。"
      }))
      .catch((error) => wx.showToast({ title: error.message || "课程读取失败", icon: "none" }))
      .finally(() => this.setData({ loading: false }));
  },

  editCourse(event) {
    const id = event.currentTarget.dataset.id;
    const course = this.data.records.find((item) => item.id === id);
    if (!course) return;
    const missing = course.videoStorage === "local" && !course.videoExists;
    const hasVideo = Boolean(course.videoUrl);
    this.setData({
      form: {
        ...blankForm(),
        ...course,
        tagsText: (course.tags || []).join("，"),
        allowedStorageKeysText: (course.allowedStorageKeys || []).join("，")
      },
      videoStatus: missing ? "missing" : hasVideo ? "ready" : "empty",
      videoFileName: course.videoFileName || "",
      videoSizeText: formatBytes(course.videoSize),
      videoUploadNote: missing
        ? "课程记录仍在，但视频文件已不在当前后端，请重新上传并保存课程。"
        : hasVideo
          ? course.videoStorage === "local"
            ? "已读取已上传的视频，可替换或移除。"
            : "已读取外部 HTTPS 视频链接，可编辑或移除。"
          : VIDEO_PICKER_NOTE
    });
  },

  updateField(event) {
    const field = event.currentTarget.dataset.field;
    const value = event.detail.value || "";
    const changes = { [`form.${field}`]: value };
    if (field === "videoUrl") {
      changes.videoStatus = value.trim() ? "ready" : "empty";
      changes.videoFileName = "";
      changes.videoSizeText = "";
      changes.videoUploadNote = value.trim() ? "已填写视频地址，保存课程后学生端生效。" : "尚未配置视频。";
    }
    this.setData(changes);
  },

  changeType(event) {
    this.setData({ "form.type": Number(event.detail.value) === 1 ? "live" : "recorded" });
  },

  resetForm() {
    this.setData({
      form: blankForm(),
      videoUploadNote: VIDEO_PICKER_NOTE,
      uploadProgress: 0,
      videoStatus: "empty",
      videoFileName: "",
      videoSizeText: ""
    });
  },

  saveCourse() {
    const form = this.data.form;
    if (!form.title.trim()) {
      wx.showToast({ title: "请填写课程标题", icon: "none" });
      return;
    }
    this.setData({ saving: true });
    api
      .saveAdminCourse({
        ...form,
        tags: form.tagsText.split(/[，,]/).map((item) => item.trim()).filter(Boolean),
        allowedStorageKeys: form.allowedStorageKeysText.split(/[，,\s]+/).map((item) => item.trim()).filter(Boolean)
      })
      .then(() => {
        wx.showToast({ title: "课程已保存", icon: "success" });
        this.resetForm();
        this.loadCourses();
      })
      .catch((error) => wx.showToast({ title: error.message || "保存失败", icon: "none" }))
      .finally(() => this.setData({ saving: false }));
  },

  chooseVideo() {
    if (this.data.uploadingVideo) return;
    this.setData({ uploadingVideo: true, uploadProgress: 0, videoStatus: "uploading", videoUploadNote: "正在选择视频文件。" });
    api
      .chooseCourseVideoFile()
      .then((file) => {
        if (!file) {
          this.setData({
            uploadingVideo: false,
            videoStatus: this.data.form.videoUrl ? "ready" : "empty",
            videoUploadNote: this.data.form.videoUrl ? "已取消选择，当前视频保持不变。" : VIDEO_PICKER_NOTE
          });
          return null;
        }
        this.setData({ videoUploadNote: "正在分片上传视频，上传期间请不要离开页面。" });
        return api.uploadAdminCourseVideo(file, (progress, received, total) => {
          this.setData({
            uploadProgress: progress,
            videoUploadNote: `正在上传 ${progress}%（${formatBytes(received)} / ${formatBytes(total)}）`
          });
        });
      })
      .then((result) => {
        if (!result) return;
        this.setData({
          "form.type": "recorded",
          "form.videoUrl": result.videoUrl || "",
          videoStatus: result.videoExists === false ? "missing" : "ready",
          videoFileName: result.name || "",
          videoSizeText: formatBytes(result.size),
          uploadProgress: 100,
          videoUploadNote: result.storagePersistent === false
            ? "视频上传成功。请保存课程；当前未配置持久化存储，重新部署后文件可能丢失。"
            : "视频上传成功。请点击“保存课程”，保存后学生端才能看到。"
        });
        wx.showToast({ title: "上传成功", icon: "success" });
      })
      .catch((error) => {
        wx.showToast({ title: error.message || "视频上传失败", icon: "none" });
        this.setData({ uploadProgress: 0, videoStatus: "missing", videoUploadNote: error.message || "上传未完成，可重试或填写 HTTPS 视频链接。" });
      })
      .finally(() => this.setData({ uploadingVideo: false }));
  },

  removeVideo() {
    const form = this.data.form;
    if (!form.videoUrl || this.data.deletingVideo) return;
    wx.showModal({
      title: "移除课程视频",
      content: "已上传到本系统的视频文件会一并删除；外部链接只会从课程中移除。是否继续？",
      success: (result) => {
        if (!result.confirm) return;
        this.setData({ deletingVideo: true, videoUploadNote: "正在移除视频。" });
        api
          .deleteAdminCourseVideo({ courseId: form.id, videoUrl: form.videoUrl })
          .then(() => {
            this.setData({
              "form.videoUrl": "",
              videoStatus: "empty",
              videoFileName: "",
              videoSizeText: "",
              videoUploadNote: form.id ? "视频已移除，课程记录已同步更新。" : "刚上传的视频已删除。"
            });
            this.loadCourses();
            wx.showToast({ title: "视频已移除", icon: "success" });
          })
          .catch((error) => wx.showToast({ title: error.message || "移除失败", icon: "none" }))
          .finally(() => this.setData({ deletingVideo: false }));
      }
    });
  },

  deleteCourse(event) {
    const id = event.currentTarget.dataset.id;
    const course = this.data.records.find((item) => item.id === id);
    if (!course) return;
    wx.showModal({
      title: "删除课程",
      content: `确定删除“${course.title}”吗？本系统内上传的视频也会一并清理。`,
      success: (result) => {
        if (!result.confirm) return;
        api
          .deleteAdminCourse(id, true)
          .then(() => {
            if (this.data.form.id === id) this.resetForm();
            this.loadCourses();
            wx.showToast({ title: "课程已删除", icon: "success" });
          })
          .catch((error) => wx.showToast({ title: error.message || "删除失败", icon: "none" }));
      }
    });
  }
});
