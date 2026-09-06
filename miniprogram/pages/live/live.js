Page({
  data: {
    liveUrl: ""
  },

  onLoad(options) {
    let liveUrl = "";
    try {
      liveUrl = decodeURIComponent(options.url || "");
    } catch (error) {
      liveUrl = "";
    }
    if (!/^https:\/\//i.test(liveUrl)) {
      wx.showModal({
        title: "直播入口无效",
        content: "直播入口必须是已在微信公众平台配置业务域名的 HTTPS 地址。",
        showCancel: false,
        complete: () => wx.navigateBack()
      });
      return;
    }
    this.setData({ liveUrl });
    if (options.title) {
      try {
        wx.setNavigationBarTitle({ title: decodeURIComponent(options.title).slice(0, 20) || "课程直播" });
      } catch (error) {
        wx.setNavigationBarTitle({ title: "课程直播" });
      }
    }
  }
});
