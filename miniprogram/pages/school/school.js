const schoolData = require("../../utils/schools");
const catalog = require("../../utils/catalog");

Page({
  data: {
    school: null
  },

  onLoad(options) {
    const fallback = schoolData.getSchools()[0];
    const school = schoolData.getSchoolById(options.id) || fallback;
    this.setData({ school });
    wx.setNavigationBarTitle({ title: school.name });
    catalog.load().then((records) => {
      const selected = records.find((record) => record.id === options.program);
      const actualSchool = selected?.schoolId ? schoolData.getSchoolById(selected.schoolId) : school;
      const programs = selected && !selected.schoolId ? records.filter((record) => record.university === selected.university) : records.filter((record) => record.schoolId === actualSchool.id);
      this.setData({ school: selected && !selected.schoolId ? { name: selected.university, englishName: selected.university, logo: "/assets/logo.jpg", summary: "此院校的现有专业库资料见下方，完整介绍与最新条件请核对官网。", tags: ["学费待核实"], tuition: { label: "待核实", detail: "尚无已核实学费信息，请以项目官方信息为准。", sourceLabel: "现有专业库", sourceUrl: selected.sourceUrls?.[0] || "" }, website: selected.sourceUrls?.[0] || "" } : actualSchool, programs: selected ? [selected, ...programs.filter((record) => record.id !== selected.id)] : programs, visibleProgramCount: 6, catalogLoaded: true });
      wx.setNavigationBarTitle({ title: selected?.schoolName || actualSchool.name });
    }).catch(() => this.setData({ catalogError: "专业库暂未加载，请稍后重试。" }));
  },

  showMorePrograms() { this.setData({ visibleProgramCount: this.data.visibleProgramCount + 6 }); },

  copyWebsite() {
    const { school } = this.data;
    if (!school || !school.website) return;
    wx.setClipboardData({
      data: school.website,
      success: () => {
        wx.showToast({ title: "官网链接已复制", icon: "success" });
      }
    });
  },

  copyProgramSource(event) { const url = event.currentTarget.dataset.url; if (/^https:\/\//.test(url || "")) wx.setClipboardData({ data: url }); },

  copyTuitionSource() {
    const { school } = this.data;
    if (!school || !school.tuition || !school.tuition.sourceUrl) return;
    wx.setClipboardData({
      data: school.tuition.sourceUrl,
      success: () => {
        wx.showToast({ title: "学费来源已复制", icon: "success" });
      }
    });
  },

  goAdvisor() {
    wx.navigateTo({ url: "/pages/advisor/advisor" });
  },

  goTools() {
    wx.navigateTo({ url: "/pages/tools/tools" });
  }
});
