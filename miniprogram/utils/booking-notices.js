const LONG_TERM_NOTICE_KEY_PREFIX = "teacher_booking_notice_long_term_";

function isLongTerm(config = {}) {
  return config.subscriptionMode === "long-term" || config.longTermAuthorization === true;
}

function acceptedStorageKey(templateId) {
  return `${LONG_TERM_NOTICE_KEY_PREFIX}${String(templateId || "default")}`;
}

function rememberLongTermAcceptance(config = {}) {
  if (isLongTerm(config) && config.templateId) {
    wx.setStorageSync(acceptedStorageKey(config.templateId), true);
  }
}

function hasRememberedLongTermAcceptance(config = {}) {
  return Boolean(isLongTerm(config) && config.templateId && wx.getStorageSync(acceptedStorageKey(config.templateId)));
}

function checkLongTermAcceptance(config = {}) {
  if (!isLongTerm(config) || !config.templateId) return Promise.resolve(false);
  const remembered = hasRememberedLongTermAcceptance(config);
  if (!wx.getSetting) return Promise.resolve(remembered);

  return new Promise((resolve) => {
    wx.getSetting({
      withSubscriptions: true,
      success(result) {
        const subscriptions = result.subscriptionsSetting || {};
        const itemSettings = subscriptions.itemSettings || {};
        const state = itemSettings[config.templateId];
        if (state === "accept") {
          rememberLongTermAcceptance(config);
          resolve(true);
          return;
        }
        if (state === "reject" || subscriptions.mainSwitch === false) {
          resolve(false);
          return;
        }
        resolve(remembered);
      },
      fail() {
        resolve(remembered);
      }
    });
  });
}

function getPresentation(config = {}, accepted = false) {
  if (isLongTerm(config)) {
    return {
      title: accepted ? "长期预约提醒已开启" : "开启长期预约提醒",
      description: accepted
        ? "当前微信号已完成长期订阅授权，后续学生提交预约时可持续接收微信服务通知。"
        : "当前模板配置为长期订阅。老师本人允许一次后即可持续接收预约提醒，无需每条预约重复授权。",
      buttonText: accepted ? "长期提醒已开启" : "一次开启长期提醒"
    };
  }

  if (Number(config.webhookCount || 0) > 0) {
    return {
      title: "持续预约提醒已配置",
      description: "企业群持续提醒无需重复授权；个人微信服务通知仍受一次性订阅规则限制。",
      buttonText: "授权下一条微信提醒"
    };
  }

  return {
    title: "微信预约提醒",
    description: "当前模板属于微信一次性订阅，一次授权只能发送一条通知。这是微信平台限制；如需一次开启后持续接收，请改用长期订阅模板。",
    buttonText: "授权下一条预约提醒"
  };
}

function requestAuthorization(config = {}) {
  return new Promise((resolve, reject) => {
    if (!wx.requestSubscribeMessage) {
      reject(new Error("当前微信版本不支持订阅消息，请升级微信后再试。"));
      return;
    }
    if (!config.templateId || !config.subscribeEnabled) {
      reject(new Error("订阅消息未正确配置，请检查后端模板 ID 和字段映射。"));
      return;
    }
    wx.requestSubscribeMessage({
      tmplIds: [config.templateId],
      success(result) {
        const accepted = result[config.templateId] === "accept";
        if (accepted) rememberLongTermAcceptance(config);
        resolve({ accepted, raw: result });
      },
      fail(error) {
        reject(new Error(error.errMsg || "授权失败，请稍后重试。"));
      }
    });
  });
}

module.exports = {
  checkLongTermAcceptance,
  getPresentation,
  isLongTerm,
  requestAuthorization
};
