const env = require("./env");

const DEFAULT_SETTINGS = {
  largeText: false,
  highContrast: true,
  defaultAdvisor: "a1",
  bookingReminder: true,
  evidenceAuditExpanded: true
};

function loadSettings() {
  const stored = wx.getStorageSync(env.STORAGE_KEYS.settings) || {};
  return {
    ...DEFAULT_SETTINGS,
    ...stored
  };
}

function saveSettings(patch) {
  const settings = {
    ...loadSettings(),
    ...patch
  };
  wx.setStorageSync(env.STORAGE_KEYS.settings, settings);
  applyRuntimeSettings(settings);
  return settings;
}

function resetSettings() {
  wx.setStorageSync(env.STORAGE_KEYS.settings, DEFAULT_SETTINGS);
  applyRuntimeSettings(DEFAULT_SETTINGS);
  return DEFAULT_SETTINGS;
}

function getPageClass() {
  const settings = loadSettings();
  return [
    settings.largeText ? "font-large" : "",
    settings.highContrast ? "contrast-strong" : ""
  ].filter(Boolean).join(" ");
}

function applyRuntimeSettings(settings = loadSettings()) {
  if (wx.setNavigationBarColor) {
    wx.setNavigationBarColor({
      frontColor: "#ffffff",
      backgroundColor: settings.highContrast ? "#1f58a7" : "#276aa2"
    });
  }
  if (wx.setTabBarStyle) {
    wx.setTabBarStyle({
      color: settings.highContrast ? "#526174" : "#657188",
      selectedColor: "#0b705e",
      backgroundColor: "#ffffff",
      borderStyle: "white"
    });
  }
}

module.exports = {
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  resetSettings,
  getPageClass,
  applyRuntimeSettings
};
