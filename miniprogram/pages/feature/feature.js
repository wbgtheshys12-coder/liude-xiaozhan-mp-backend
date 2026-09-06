const env = require("../../utils/env");

const FEATURE_META = {
  member: {
    title: "会员权益",
    tag: "账户",
    summary: "查看当前账号可用的推荐、文书、材料和预约能力。"
  },
  orders: {
    title: "我的订单",
    tag: "记录",
    summary: "当前版本把预约记录作为服务记录管理，方便用户回看已提交的沟通需求。"
  },
  messages: {
    title: "我的消息",
    tag: "通知",
    summary: "集中查看咨询问题、预约提醒和需要人工确认的事项。"
  },
  group: {
    title: "我的拼团",
    tag: "活动",
    summary: "用于内部活动、课程或材料服务的意向登记。"
  },
  rights: {
    title: "我的权益",
    tag: "权限",
    summary: "查看账号当前可以使用的核心工具，并直接进入对应模块。"
  },
  gift: {
    title: "推广有礼",
    tag: "邀请",
    summary: "生成当前用户的邀请码和邀请说明，可复制给内部成员登记来源。"
  },
  mall: {
    title: "积分商城",
    tag: "积分",
    summary: "查看积分余额，并把想兑换的服务加入愿望清单。"
  }
};

const SHOP_ITEMS = [
  { key: "advisor-check", title: "顾问材料核对", points: 20 },
  { key: "cv-polish", title: "CV 结构优化", points: 30 },
  { key: "motivation-review", title: "动机信审阅", points: 50 }
];

function formatTime(value) {
  if (!value) return "未记录时间";
  const date = new Date(value);
  const pad = (num) => String(num).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function getInviteCode(session) {
  const stored = wx.getStorageSync("liude_invite_code");
  if (stored) return stored;
  const source = session?.user?.openid || String(Date.now());
  const code = `LDXZ-${source.slice(-6).toUpperCase()}`;
  wx.setStorageSync("liude_invite_code", code);
  return code;
}

function getSession() {
  return wx.getStorageSync(env.STORAGE_KEYS.session) || {};
}

Page({
  data: {
    type: "member",
    meta: FEATURE_META.member,
    cards: [],
    list: [],
    primaryText: "提交给顾问",
    secondaryText: "返回首页",
    wishlist: []
  },

  onLoad(options) {
    if (options.type === "messages") {
      wx.redirectTo({ url: "/pages/messages/messages" });
      return;
    }
    this.setType(options.type || "member");
  },

  onShow() {
    this.refresh();
  },

  setType(type) {
    const nextType = FEATURE_META[type] ? type : "member";
    this.setData({
      type: nextType,
      meta: FEATURE_META[nextType]
    });
    wx.setNavigationBarTitle({ title: FEATURE_META[nextType].title });
    this.refresh(nextType);
  },

  refresh(type = this.data.type) {
    const session = getSession();
    const bookings = wx.getStorageSync("booking_records") || [];
    const questions = wx.getStorageSync("consult_questions") || [];
    const groupJoined = Boolean(wx.getStorageSync("liude_group_joined"));
    const wishlist = wx.getStorageSync("liude_mall_wishlist") || [];
    const inviteCode = getInviteCode(session);
    const profile = wx.getStorageSync(env.scopedKey(env.STORAGE_KEYS.latestProfile)) || {};
    const recommendation = wx.getStorageSync(env.scopedKey(env.STORAGE_KEYS.latestRecommendation)) || {};

    const builders = {
      member: () => ({
        cards: [
          { title: "账号状态", value: session.user?.openid ? "微信账号已登录" : "内部账号已登录", desc: session.user?.openid || "未读取到 openid" },
          { title: "推荐能力", value: recommendation.recommendations?.length ? "已有推荐结果" : "可发起推荐", desc: "填写专业和申请目标即可匹配；成绩单可选。" },
          { title: "材料工具", value: "可用", desc: "动机信、CV 和材料清单均可填写保存。" }
        ],
        list: [],
        primaryText: "进入院校推荐",
        secondaryText: "打开设置"
      }),
      orders: () => ({
        cards: [
          { title: "服务记录", value: `${bookings.length} 条`, desc: bookings.length ? "最近预约记录如下。" : "暂无预约记录，可先提交一次顾问预约。" }
        ],
        list: bookings.map((item, index) => ({
          title: `预约记录 ${index + 1}`,
          desc: `${item.dateDisplay || item.date || ""} ${item.time || ""} · ${item.advisor || "顾问"}`,
          extra: item.note || "无备注"
        })),
        primaryText: "新增预约",
        secondaryText: "复制最近记录"
      }),
      messages: () => ({
        cards: [
          { title: "咨询问题", value: `${questions.length} 条`, desc: "已提交的问题会保存在本地，方便预约沟通时核对。" },
          { title: "预约提醒", value: bookings.length ? "有记录" : "暂无", desc: bookings.length ? "请复制预约信息并联系老师确认。" : "提交预约后会生成确认提醒。" }
        ],
        list: questions.map((item, index) => ({
          title: `${item.topic || "咨询"} · ${item.urgency || "普通"}`,
          desc: item.question,
          extra: formatTime(item.createdAt || Date.now())
        })),
        primaryText: "提交新问题",
        secondaryText: "清理消息"
      }),
      group: () => ({
        cards: [
          { title: "活动意向", value: groupJoined ? "已登记" : "未登记", desc: groupJoined ? "你已加入内部活动意向名单。" : "可登记后由顾问人工确认活动安排。" },
          { title: "适用场景", value: "课程 / 文书 / 材料", desc: "用于后续内部活动、课程或材料服务的批量安排。" }
        ],
        list: [
          { title: "德国申请材料共修", desc: "集中整理 CV、动机信和申请材料。", extra: groupJoined ? "已登记" : "可登记" },
          { title: "APS 面谈复盘小组", desc: "按专业方向整理课程问答和面谈提纲。", extra: "顾问确认后开放" }
        ],
        primaryText: groupJoined ? "取消登记" : "登记意向",
        secondaryText: "咨询顾问"
      }),
      rights: () => ({
        cards: [
          { title: "院校推荐", value: "可用", desc: profile.name ? `已读取 ${profile.name} 的申请资料。` : "可进入推荐页填写申请资料。" },
          { title: "文书工具", value: "可用", desc: "动机信和 CV 调查表可保存并生成德语或英语初稿。" },
          { title: "预约沟通", value: "可用", desc: "可选择顾问、日期和时间，并复制预约信息。" }
        ],
        list: [],
        primaryText: "使用权益",
        secondaryText: "查看材料清单"
      }),
      gift: () => ({
        cards: [
          { title: "我的邀请码", value: inviteCode, desc: "复制后发给内部成员，后续可由顾问人工登记来源。" },
          { title: "邀请说明", value: "可复制", desc: "当前小程序不自动发放奖励，但会保留邀请码用于人工核对。" }
        ],
        list: [],
        primaryText: "复制邀请文案",
        secondaryText: "咨询顾问"
      }),
      mall: () => ({
        cards: [
          { title: "当前积分", value: "0", desc: "积分接口尚未接入，当前可先把感兴趣的服务加入愿望清单。" },
          { title: "愿望清单", value: `${wishlist.length} 项`, desc: wishlist.length ? wishlist.join("、") : "还没有添加服务。" }
        ],
        list: SHOP_ITEMS.map((item) => ({
          title: item.title,
          desc: `${item.points} 积分`,
          extra: wishlist.includes(item.key) ? "已加入愿望清单" : "点击下方按钮加入"
        })),
        primaryText: "加入首项愿望",
        secondaryText: "清空愿望清单"
      })
    };

    const payload = builders[type]();
    this.setData({
      cards: payload.cards,
      list: payload.list,
      primaryText: payload.primaryText,
      secondaryText: payload.secondaryText,
      wishlist
    });
  },

  handlePrimary() {
    const type = this.data.type;
    if (type === "member" || type === "rights") {
      wx.navigateTo({ url: "/pages/advisor/advisor" });
      return;
    }
    if (type === "orders") {
      wx.switchTab({ url: "/pages/booking/booking" });
      return;
    }
    if (type === "messages") {
      wx.navigateTo({ url: "/pages/consult/consult" });
      return;
    }
    if (type === "group") {
      if (wx.getStorageSync("liude_group_joined")) {
        wx.removeStorageSync("liude_group_joined");
        wx.showToast({ title: "已取消", icon: "success" });
        this.refresh();
        return;
      }
      wx.setStorageSync("liude_group_joined", true);
      wx.showToast({ title: "已登记", icon: "success" });
      this.refresh();
      return;
    }
    if (type === "gift") {
      this.copyInvite();
      return;
    }
    if (type === "mall") {
      const wishlist = wx.getStorageSync("liude_mall_wishlist") || [];
      if (!wishlist.includes(SHOP_ITEMS[0].key)) wishlist.push(SHOP_ITEMS[0].key);
      wx.setStorageSync("liude_mall_wishlist", wishlist);
      wx.showToast({ title: "已加入", icon: "success" });
      this.refresh();
    }
  },

  handleSecondary() {
    const type = this.data.type;
    if (type === "member") {
      wx.navigateTo({ url: "/pages/settings/settings" });
      return;
    }
    if (type === "orders") {
      const bookings = wx.getStorageSync("booking_records") || [];
      if (!bookings.length) {
        wx.showToast({ title: "暂无记录", icon: "none" });
        return;
      }
      const item = bookings[0];
      wx.setClipboardData({
        data: `预约：${item.dateDisplay || item.date || ""} ${item.time || ""}，顾问：${item.advisor || ""}，备注：${item.note || "无"}`,
        success: () => wx.showToast({ title: "已复制", icon: "success" })
      });
      return;
    }
    if (type === "messages") {
      wx.removeStorageSync("consult_questions");
      wx.showToast({ title: "已清理", icon: "success" });
      this.refresh();
      return;
    }
    if (type === "group" || type === "gift") {
      wx.navigateTo({ url: "/pages/consult/consult" });
      return;
    }
    if (type === "rights") {
      wx.navigateTo({ url: "/pages/materials/materials" });
      return;
    }
    if (type === "mall") {
      wx.removeStorageSync("liude_mall_wishlist");
      wx.showToast({ title: "已清空", icon: "success" });
      this.refresh();
      return;
    }
    wx.switchTab({ url: "/pages/home/home" });
  },

  copyInvite() {
    const code = getInviteCode(getSession());
    wx.setClipboardData({
      data: `我正在使用留德小栈德国留学申请工具，邀请码：${code}。可用于登记内部转介绍来源。`,
      success: () => wx.showToast({ title: "邀请文案已复制", icon: "success" })
    });
  }
});
