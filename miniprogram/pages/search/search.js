const searchData = require("../../utils/search");
const catalog = require("../../utils/catalog");

const FILTERS = [
  { key: "all", label: "全部" },
  { key: "school", label: "院校" },
  { key: "program", label: "专业" },
  { key: "feature", label: "功能" },
  { key: "news", label: "资讯" }
];

Page({
  data: {
    query: "",
    filters: FILTERS,
    activeFilter: "all",
    hotKeywords: searchData.getPopularKeywords(),
    allResults: [],
    results: []
  },

  onLoad(options) {
    const query = decodeURIComponent(options.q || "");
    this.setData({ query });
    this.refreshResults(query);
    catalog.load().then((records) => { this.catalog = records; this.refreshResults(this.data.query); }).catch(() => this.setData({ catalogWarning: "专业库暂时未连接，当前显示本地院校参考，可稍后重试。" }));
  },

  updateQuery(event) {
    const query = event.detail.value || "";
    this.setData({ query });
    this.refreshResults(query);
  },

  submitSearch() {
    this.refreshResults(this.data.query);
  },

  chooseKeyword(event) {
    const query = event.currentTarget.dataset.keyword || "";
    this.setData({ query, activeFilter: "all" });
    this.refreshResults(query);
  },

  switchFilter(event) {
    const activeFilter = event.currentTarget.dataset.key || "all";
    this.setData({ activeFilter }, this.applyFilter);
  },

  refreshResults(query) {
    const allResults = [...catalog.results(this.catalog || [], query), ...searchData.search(query, 80)];
    this.setData({ allResults }, this.applyFilter);
  },

  applyFilter() {
    const { activeFilter, allResults } = this.data;
    const results = activeFilter === "all" ? allResults : allResults.filter((item) => item.type === activeFilter);
    this.setData({ results });
  },

  openResult(event) {
    const index = Number(event.currentTarget.dataset.index);
    const item = this.data.results[index];
    if (!item) return;
    if (item.tab) {
      wx.switchTab({ url: item.tab });
      return;
    }
    if (item.url) {
      wx.navigateTo({ url: item.url });
      return;
    }
    wx.navigateTo({ url: "/pages/consult/consult" });
  }
});
