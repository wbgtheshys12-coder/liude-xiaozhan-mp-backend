const api = require("../../utils/api");

function formatSize(bytes) {
  const value = Number(bytes || 0);
  if (value > 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)}MB`;
  if (value > 1024) return `${Math.round(value / 1024)}KB`;
  return `${value}B`;
}

Page({
  data: {
    loading: true,
    records: [],
    count: 0,
    privacyNote: "",
    exportText: ""
  },

  onShow() {
    this.loadUploads();
  },

  loadUploads() {
    this.setData({ loading: true });
    api
      .getAdminUploads()
      .then((result) => {
        this.setData({
          count: result.count || 0,
          privacyNote: result.privacyNote || "",
          records: (result.records || []).map((item) => ({ ...item, sizeText: formatSize(item.size) }))
        });
      })
      .catch((error) => wx.showToast({ title: error.message || "资料读取失败", icon: "none" }))
      .finally(() => this.setData({ loading: false }));
  },

  exportData() {
    api
      .exportAdminData()
      .then((result) => {
        const text = JSON.stringify(result, null, 2);
        this.setData({ exportText: text.slice(0, 4000) });
        wx.setClipboardData({
          data: text,
          success: () => wx.showToast({ title: "导出数据已复制", icon: "success" })
        });
      })
      .catch((error) => wx.showToast({ title: error.message || "导出失败", icon: "none" }));
  },

  openMaterial(event) {
    const id = event.currentTarget.dataset.id;
    const record = this.data.records.find((item) => item.id === id);
    if (!record) return;
    wx.showLoading({ title: "正在读取" });
    api
      .downloadMaterialFile(id, true)
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
          fail: () => wx.showModal({ title: "预览未打开", content: "当前微信暂不支持打开此文件，请在电脑后台查看或保存原文件，不能将本次操作视为已保存。", showCancel: false })
        });
      })
      .catch((error) => wx.showToast({ title: error.message || "资料读取失败", icon: "none" }))
      .finally(() => wx.hideLoading());
  }
});
