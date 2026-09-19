const env = require("./env");
const text = require("./text");

const MAX_LOCAL_FILE_BYTES = 18 * 1024 * 1024;
const MAX_STUDENT_MATERIAL_BYTES = 12 * 1024 * 1024;
const MAX_COURSE_VIDEO_BYTES = 512 * 1024 * 1024;
const IMAGE_COMPRESS_THRESHOLD_BYTES = 16 * 1024 * 1024;

let reauthPromise = null;
let loginRedirectPending = false;

function getToken() {
  const app = getApp();
  return app.globalData.token || wx.getStorageSync(env.STORAGE_KEYS.token) || "";
}

function setSession(payload) {
  const app = getApp();
  const previousScope = (app.globalData.session || wx.getStorageSync(env.STORAGE_KEYS.session))?.user?.storageKey;
  if (previousScope !== payload.user?.storageKey) {
    app.globalData.latestProfile = null;
    app.globalData.latestRecommendation = null;
    app.globalData.wechatProfile = null;
    app.globalData.onboardingProfile = null;
  }
  app.globalData.token = payload.token || "";
  app.globalData.session = payload;
  wx.setStorageSync(env.STORAGE_KEYS.token, app.globalData.token);
  wx.setStorageSync(env.STORAGE_KEYS.session, payload);
}

function clearSession() {
  const app = getApp();
  app.globalData.token = "";
  app.globalData.session = null;
  app.globalData.latestProfile = null;
  app.globalData.latestRecommendation = null;
  app.globalData.wechatProfile = null;
  app.globalData.onboardingProfile = null;
  wx.removeStorageSync(env.STORAGE_KEYS.token);
  wx.removeStorageSync(env.STORAGE_KEYS.session);
}

function redirectToLoginOnce() {
  if (loginRedirectPending) return;
  loginRedirectPending = true;
  const pages = typeof getCurrentPages === "function" ? getCurrentPages() : [];
  const currentRoute = pages.length ? String(pages[pages.length - 1].route || "") : "";
  if (currentRoute === "pages/login/login") {
    loginRedirectPending = false;
    return;
  }
  wx.navigateTo({
    url: "/pages/login/login",
    complete() {
      loginRedirectPending = false;
    }
  });
}

function rawRequest(options) {
  const token = getToken();
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${env.API_BASE_URL}${options.url}`,
      method: options.method || "GET",
      data: options.data || {},
      timeout: options.timeout || 60000,
      header: {
        "Content-Type": "application/json; charset=utf-8",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.header || {})
      },
      success(res) {
        const data = text.repairTextDeep(res.data || {});
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(data);
          return;
        }
        const message =
          res.statusCode === 429
            ? data.error || "当前请求较多，请稍后再试。"
            : data.error || `请求失败：${res.statusCode}`;
        const error = new Error(message);
        error.statusCode = res.statusCode;
        error.payload = data;
        reject(error);
      },
      fail(error) {
        console.warn("request failed", error?.errMsg || "unknown");
        reject(new Error("服务连接暂时不可用，请检查网络后重试。"));
      }
    });
  });
}

function refreshSession() {
  if (!reauthPromise) {
    reauthPromise = loginUser().finally(() => {
      reauthPromise = null;
    });
  }
  return reauthPromise;
}

function request(options) {
  const hadSession = Boolean(getToken());
  return rawRequest(options).catch((error) => {
    if (error?.statusCode === 401 && !hadSession) {
      const loginError = new Error("此操作需要登录，请主动点击登录后继续。");
      loginError.statusCode = 401;
      throw loginError;
    }
    if (error?.statusCode !== 401 || options.skipAuthRecovery || options.authRetried) {
      throw error;
    }
    return refreshSession()
      .catch((loginError) => {
        clearSession();
        const authError = new Error("登录状态已更新，请重新登录后继续。");
        authError.statusCode = 401;
        authError.cause = loginError;
        throw authError;
      })
      .then(() => rawRequest({ ...options, authRetried: true }));
  });
}

function loginUser() {
  return new Promise((resolve, reject) => {
    wx.login({
      success(loginResult) {
        if (!loginResult.code) {
          reject(new Error("微信登录未完成，请点击重试。"));
          return;
        }
        request({
          url: "/api/mp/user/login",
          method: "POST",
          data: { code: loginResult.code },
          skipAuthRecovery: true
        })
          .then((payload) => {
            setSession(payload);
            resolve(payload);
          })
          .catch(reject);
      },
      fail(error) {
        console.warn("wx.login failed", error?.errMsg || "unknown");
        reject(new Error("微信登录未完成，请检查网络后重试。"));
      }
    });
  });
}

function recommend(payload) {
  const safePayload = {
    ...(payload || {}),
    transcriptFileCount:
      Number(payload?.transcriptFileCount || 0) ||
      (Array.isArray(payload?.files) ? payload.files.length : 0),
    files: []
  };
  return request({
    url: "/api/mp/recommend",
    method: "POST",
    data: safePayload
  }).catch((error) => {
    if (![408, 502, 503, 504].includes(Number(error?.statusCode || 0))) {
      throw error;
    }
    return request({
      url: "/api/mp/recommend",
      method: "POST",
      data: {
        ...safePayload,
        retryWithoutFiles: true
      }
    });
  });
}

function previewTranscript(payload) {
  return request({
    url: "/api/mp/transcript-preview",
    method: "POST",
    timeout: 120000,
    data: payload
  });
}

function checkMaterialAccess() {
  return request({ url: "/api/mp/material-access" });
}

function generateMaterialDraft(payload) {
  return request({
    url: "/api/mp/material-draft",
    method: "POST",
    data: payload
  });
}

function submitBooking(payload) {
  return request({
    url: "/api/mp/booking",
    method: "POST",
    data: payload
  });
}

function getBookingSlots(payload) {
  return request({
    url: "/api/mp/booking/slots",
    method: "GET",
    data: payload
  });
}

function getBookingConfig() {
  return request({ url: "/api/mp/booking/config" });
}

function getMyBookings(payload = {}) {
  return request({
    url: "/api/mp/bookings",
    method: "GET",
    data: payload
  });
}

function cancelBooking(bookingId) {
  return request({
    url: "/api/mp/booking/cancel",
    method: "POST",
    data: { bookingId }
  });
}

function getProfile() {
  return request({ url: "/api/mp/profile" });
}

function saveProfile(payload) {
  return request({
    url: "/api/mp/profile",
    method: "POST",
    data: payload
  });
}

function getCourses() {
  return request({ url: getToken() ? "/api/mp/courses" : "/api/mp/public/courses", skipAuthRecovery: !getToken() });
}

function ensureLogin() {
  if (getToken()) return true;
  wx.showModal({ title: "登录后继续", content: "此操作涉及你的个人资料。公开内容可以继续浏览，是否现在登录？", confirmText: "去登录", cancelText: "继续浏览", success: (result) => { if (result.confirm) redirectToLoginOnce(); } });
  return false;
}

function getPublicCatalog() { return request({ url: "/api/mp/public/catalog", skipAuthRecovery: true }); }
function getPublicPosts() { return request({ url: "/api/mp/public/posts", skipAuthRecovery: true }); }
function getPublicConfig() { return request({ url: "/api/mp/public/config", skipAuthRecovery: true }); }

function getAdminCourses() {
  return request({ url: "/api/mp/admin/courses" });
}

function saveAdminCourse(payload) {
  return request({
    url: "/api/mp/admin/courses",
    method: "POST",
    data: payload
  });
}

function rawBinaryRequest(options) {
  const token = getToken();
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${env.API_BASE_URL}${options.url}`,
      method: options.method || "POST",
      data: options.data,
      header: {
        "Content-Type": "application/octet-stream",
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      success(res) {
        const data = text.repairTextDeep(res.data || {});
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(data);
          return;
        }
        const error = new Error(data.error || `上传失败：${res.statusCode}`);
        error.statusCode = res.statusCode;
        error.payload = data;
        reject(error);
      },
      fail(error) {
        reject(new Error(error?.errMsg || "视频分片上传失败，请检查网络后重试。"));
      }
    });
  });
}

function binaryRequest(options) {
  return rawBinaryRequest(options).catch((error) => {
    if (error?.statusCode !== 401 || options.authRetried) throw error;
    return refreshSession().then(() => rawBinaryRequest({ ...options, authRetried: true }));
  });
}

function readCourseVideoChunk(filePath, position, length) {
  const fs = wx.getFileSystemManager();
  return new Promise((resolve, reject) => {
    fs.readFile({
      filePath,
      position,
      length,
      success(result) {
        resolve(result.data);
      },
      fail(error) {
        reject(new Error(error.errMsg || "视频文件读取中断，请重新选择。"));
      }
    });
  });
}

function uploadAdminCourseVideo(file, onProgress) {
  if (file?.content) {
    return request({ url: "/api/mp/admin/course-video", method: "POST", data: file });
  }
  const filePath = normalizeLocalPath(file || {});
  const size = Number(file?.size || 0);
  if (!filePath || !size) return Promise.reject(new Error("无法读取视频文件，请重新选择。"));
  let uploadId = "";
  const report = (value, received = 0) => {
    if (typeof onProgress === "function") onProgress(Math.max(0, Math.min(100, Math.round(value))), received, size);
  };
  report(0, 0);
  return request({
    url: "/api/mp/admin/course-video/init",
    method: "POST",
    data: { name: file.name, size, mimeType: file.type || inferMimeType(file.name) }
  })
    .then((init) => {
      uploadId = init.uploadId;
      const chunkSize = Number(init.chunkSize || 4 * 1024 * 1024);
      let offset = 0;
      const sendNext = () => {
        if (offset >= size) return Promise.resolve();
        const length = Math.min(chunkSize, size - offset);
        return readCourseVideoChunk(filePath, offset, length)
          .then((data) =>
            binaryRequest({
              url: `/api/mp/admin/course-video/chunk?uploadId=${encodeURIComponent(uploadId)}&offset=${offset}`,
              data
            })
          )
          .then((result) => {
            offset = Number(result.received || offset + length);
            report(result.progress || (offset / size) * 100, offset);
            return sendNext();
          });
      };
      return sendNext();
    })
    .then(() => request({
      url: "/api/mp/admin/course-video/complete",
      method: "POST",
      data: { uploadId }
    }))
    .then((result) => {
      report(100, size);
      return result;
    })
    .catch((error) => {
      if (uploadId) {
        request({
          url: "/api/mp/admin/course-video/abort",
          method: "POST",
          data: { uploadId },
          skipAuthRecovery: true
        }).catch(() => {});
      }
      throw error;
    });
}

function deleteAdminCourseVideo(payload) {
  return request({
    url: "/api/mp/admin/course-video/delete",
    method: "POST",
    data: payload
  });
}

function deleteAdminCourse(id, deleteVideo = true) {
  return request({
    url: "/api/mp/admin/course/delete",
    method: "POST",
    data: { id, deleteVideo }
  });
}

function getAdminStats() {
  return request({ url: "/api/mp/admin/stats" });
}

function recordUsage(action, detail = {}) {
  if (!getToken()) return Promise.resolve({ ok: true, recorded: false });
  return request({
    url: "/api/mp/usage",
    method: "POST",
    data: { action, detail }
  });
}

function uploadStudentMaterial(payload) {
  return request({
    url: "/api/mp/material/upload",
    method: "POST",
    data: payload
  });
}

function getMyUploadedMaterials() {
  return request({ url: "/api/mp/materials" });
}

function deleteStudentMaterial(id) {
  return request({
    url: "/api/mp/material/delete",
    method: "POST",
    data: { id }
  });
}

function downloadMaterialFile(id, admin = false, authRetried = false) {
  const token = getToken();
  return new Promise((resolve, reject) => {
    wx.downloadFile({
      url: `${env.API_BASE_URL}${admin ? "/api/mp/admin/material-file/" : "/api/mp/material-file/"}${encodeURIComponent(id)}`,
      header: token ? { Authorization: `Bearer ${token}` } : {},
      success(result) {
        if (result.statusCode >= 200 && result.statusCode < 300 && result.tempFilePath) {
          resolve(result.tempFilePath);
          return;
        }
        if (result.statusCode === 401 && token && !authRetried) {
          refreshSession().then(() => downloadMaterialFile(id, admin, true)).then(resolve, reject);
          return;
        }
        reject(new Error(result.statusCode === 404 ? "资料文件不存在或已迁移，请联系管理员核对存储" : result.statusCode === 401 ? "登录已失效，请重新登录后查看资料" : result.statusCode === 403 ? "当前账号没有查看该资料的权限" : `资料下载失败：${result.statusCode}`));
      },
      fail(error) {
        reject(new Error(error.errMsg || "资料下载失败"));
      }
    });
  });
}

function exportDocumentPdf(payload) {
  return request({
    url: "/api/mp/document/pdf",
    method: "POST",
    data: payload
  });
}

function exportDocumentWord(payload) {
  return request({
    url: "/api/mp/document/word",
    method: "POST",
    data: payload
  });
}

function getAdminUploads() {
  return request({ url: "/api/mp/admin/uploads" });
}

function exportAdminData() {
  return request({ url: "/api/mp/admin/export" });
}

function getAdminBookings(payload = {}) {
  return request({
    url: "/api/mp/admin/bookings",
    method: "GET",
    data: payload
  });
}

function getMessages() {
  return request({ url: "/api/mp/messages" });
}

function sendMessage(content) {
  return request({
    url: "/api/mp/messages",
    method: "POST",
    data: { content }
  });
}

function getAdminMessages() {
  return request({ url: "/api/mp/admin/messages" });
}

function replyAdminMessage(storageKey, content) {
  return request({
    url: "/api/mp/admin/messages/reply",
    method: "POST",
    data: { storageKey, content }
  });
}

function createPayment(productId, clientRequestId) {
  return request({
    url: "/api/mp/payment/create",
    method: "POST",
    data: { productId, clientRequestId }
  });
}

function getPaymentStatus() {
  return request({ url: "/api/mp/payment/status" });
}

function getPaymentOrder(outTradeNo) {
  return request({ url: `/api/mp/payment/order?outTradeNo=${encodeURIComponent(outTradeNo || "")}` });
}

function inferMimeType(name) {
  const lower = String(name || "").toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".mp4")) return "video/mp4";
  if (lower.endsWith(".mov")) return "video/quicktime";
  if (lower.endsWith(".m4v")) return "video/x-m4v";
  return "application/octet-stream";
}

function normalizeLocalPath(file) {
  return file.path || file.tempFilePath || "";
}

function guessImageName(file, index) {
  const sourceName = file.name || normalizeLocalPath(file).split("/").pop() || "";
  const lower = sourceName.toLowerCase();
  if (/\.(png|jpg|jpeg|webp)$/.test(lower)) return sourceName;
  return `成绩单照片${index + 1}.jpg`;
}

function compressImageIfNeeded(file) {
  const filePath = normalizeLocalPath(file);
  if (!filePath || !wx.compressImage) return Promise.resolve(file);
  if (!file.size || file.size <= IMAGE_COMPRESS_THRESHOLD_BYTES) return Promise.resolve(file);
  return new Promise((resolve) => {
    wx.compressImage({
      src: filePath,
      quality: 92,
      success(result) {
        resolve({
          ...file,
          path: result.tempFilePath,
          tempFilePath: result.tempFilePath,
          size: 0,
          name: file.name || guessImageName(file, 0),
          type: "image/jpeg"
        });
      },
      fail() {
        resolve(file);
      }
    });
  });
}

function readLocalFileWithLimit(file, maxBytes, oversizedMessage) {
  const fs = wx.getFileSystemManager();
  return new Promise((resolve, reject) => {
    const filePath = normalizeLocalPath(file);
    if (!filePath) {
      reject(new Error("未找到本地文件路径，请重新选择文件"));
      return;
    }
    if (file.size && file.size > maxBytes) {
      reject(new Error(oversizedMessage));
      return;
    }
    fs.readFile({
      filePath,
      encoding: "base64",
      success(result) {
        const name = file.name || filePath.split("/").pop() || "成绩单";
        const type = file.type || inferMimeType(name);
        resolve({
          name,
          size: file.size || 0,
          type,
          content: `data:${type};base64,${result.data}`
        });
      },
      fail(error) {
        reject(new Error(error.errMsg || "文件读取失败"));
      }
    });
  });
}

function readLocalFile(file) {
  return readLocalFileWithLimit(file, MAX_LOCAL_FILE_BYTES, "单个成绩单文件过大，请压缩到 18MB 以内，或改传清晰 PDF。");
}

function ensurePrivacyAuthorization() {
  return new Promise((resolve, reject) => {
    if (!wx.requirePrivacyAuthorize) {
      resolve();
      return;
    }
    wx.requirePrivacyAuthorize({
      success() {
        resolve();
      },
      fail(error) {
        reject(new Error(error.errMsg || "请先同意用户隐私保护指引后再选择文件"));
      }
    });
  });
}

function chooseTranscriptPdfFiles() {
  return ensurePrivacyAuthorization().then(
    () =>
      new Promise((resolve, reject) => {
        wx.chooseMessageFile({
          count: 3,
          type: "file",
          extension: ["pdf"],
          success(result) {
            Promise.all((result.tempFiles || []).map(readLocalFile)).then(resolve).catch(reject);
          },
          fail(error) {
            if (String(error.errMsg || "").includes("cancel")) {
              resolve([]);
              return;
            }
            reject(new Error(error.errMsg || "文件选择失败"));
          }
        });
      })
  );
}

function chooseTranscriptImages() {
  return ensurePrivacyAuthorization().then(
    () =>
      new Promise((resolve, reject) => {
        const handleFiles = (rawFiles) => {
          const files = (rawFiles || []).map((file, index) => ({
            ...file,
            path: normalizeLocalPath(file),
            name: guessImageName(file, index),
            type: inferMimeType(guessImageName(file, index)) || "image/jpeg"
          }));
          Promise.all(files.map(compressImageIfNeeded))
            .then((compressedFiles) => Promise.all(compressedFiles.map(readLocalFile)))
            .then(resolve)
            .catch(reject);
        };

        if (wx.chooseMedia) {
          wx.chooseMedia({
            count: 3,
            mediaType: ["image"],
            sourceType: ["album", "camera"],
            sizeType: ["original"],
            success(result) {
              handleFiles(result.tempFiles || []);
            },
            fail(error) {
              if (String(error.errMsg || "").includes("cancel")) {
                resolve([]);
                return;
              }
              reject(new Error(error.errMsg || "照片选择失败"));
            }
          });
          return;
        }

        wx.chooseImage({
          count: 3,
          sizeType: ["original"],
          sourceType: ["album", "camera"],
          success(result) {
            handleFiles((result.tempFilePaths || []).map((tempFilePath) => ({ path: tempFilePath, tempFilePath })));
          },
          fail(error) {
            if (String(error.errMsg || "").includes("cancel")) {
              resolve([]);
              return;
            }
            reject(new Error(error.errMsg || "照片选择失败"));
          }
        });
      })
  );
}

function chooseTranscriptFiles() {
  return new Promise((resolve, reject) => {
    wx.showActionSheet({
      itemList: ["上传成绩单照片", "上传 PDF 文件"],
      success(result) {
        const task = result.tapIndex === 0 ? chooseTranscriptImages() : chooseTranscriptPdfFiles();
        task.then(resolve).catch(reject);
      },
      fail(error) {
        if (String(error.errMsg || "").includes("cancel")) {
          resolve([]);
          return;
        }
        reject(new Error(error.errMsg || "请选择上传方式"));
      }
    });
  });
}

function chooseStudentMaterialFiles() {
  return ensurePrivacyAuthorization().then(
    () =>
      new Promise((resolve, reject) => {
        wx.chooseMessageFile({
          count: 5,
          type: "all",
          extension: ["pdf", "doc", "docx", "xls", "xlsx", "png", "jpg", "jpeg"],
          success(result) {
            Promise.all(
              (result.tempFiles || []).map((file) =>
                readLocalFileWithLimit(file, MAX_STUDENT_MATERIAL_BYTES, "单个申请资料不能超过 12MB，请压缩后再上传。")
              )
            )
              .then(resolve)
              .catch(reject);
          },
          fail(error) {
            if (String(error.errMsg || "").includes("cancel")) {
              resolve([]);
              return;
            }
            reject(new Error(error.errMsg || "材料文件选择失败"));
          }
        });
      })
  );
}

function chooseCourseVideoFile() {
  return ensurePrivacyAuthorization().then(
    () =>
      new Promise((resolve, reject) => {
        const handleFiles = (rawFiles) => {
          const file = (rawFiles || [])[0];
          if (!file) {
            resolve(null);
            return;
          }
          const filePath = normalizeLocalPath(file);
          const name = file.name || filePath.split("/").pop() || "网课视频.mp4";
          const type = file.type || inferMimeType(name) || "video/mp4";
          const finish = (size) => {
            if (!/\.(mp4|mov|m4v)$/i.test(name) || !/^video\//i.test(type)) {
              reject(new Error("课程视频仅支持 MP4、MOV、M4V。"));
              return;
            }
            if (!size || size > MAX_COURSE_VIDEO_BYTES) {
              reject(new Error("单个视频不能超过 512MB；更长的正式课程请使用云点播链接。"));
              return;
            }
            resolve({ ...file, path: filePath, tempFilePath: filePath, name, type, size });
          };
          if (Number(file.size || 0) > 0) {
            finish(Number(file.size));
            return;
          }
          wx.getFileSystemManager().getFileInfo({
            filePath,
            success(result) {
              finish(Number(result.size || 0));
            },
            fail(error) {
              reject(new Error(error.errMsg || "无法读取视频大小，请重新选择。"));
            }
          });
        };

        const cancelled = (error) => String(error?.errMsg || "").toLowerCase().includes("cancel");
        const chooseFromAlbum = () => {
          if (wx.chooseMedia) {
            wx.chooseMedia({
              count: 1,
              mediaType: ["video"],
              sourceType: ["album"],
              maxDuration: 600,
              success(result) {
                handleFiles(result.tempFiles || []);
              },
              fail(error) {
                if (cancelled(error)) {
                  resolve(null);
                  return;
                }
                reject(new Error(error.errMsg || "无法打开手机相册，请检查微信的照片权限后重试"));
              }
            });
            return;
          }
          if (wx.chooseVideo) {
            wx.chooseVideo({
              sourceType: ["album"],
              compressed: true,
              maxDuration: 600,
              success(result) {
                handleFiles([{ ...result, path: result.tempFilePath, tempFilePath: result.tempFilePath }]);
              },
              fail(error) {
                if (cancelled(error)) {
                  resolve(null);
                  return;
                }
                reject(new Error(error.errMsg || "无法打开手机相册，请检查微信的照片权限后重试"));
              }
            });
            return;
          }
          reject(new Error("当前微信版本不支持从手机相册选择视频，请尝试从微信聊天文件选择"));
        };
        const chooseFromMessage = () => {
          if (!wx.chooseMessageFile) {
            reject(new Error("当前微信版本不支持聊天文件选择，请升级微信后重试"));
            return;
          }
          wx.chooseMessageFile({
            count: 1,
            type: "all",
            extension: ["mp4", "mov", "m4v"],
            success(result) {
              handleFiles(result.tempFiles || []);
            },
            fail(error) {
              if (cancelled(error)) {
                resolve(null);
                return;
              }
              reject(new Error(error.errMsg || "无法打开微信聊天文件，请升级微信后重试"));
            }
          });
        };
        const choices = [];
        if (wx.chooseMedia || wx.chooseVideo) choices.push({ label: "从手机相册选择视频", run: chooseFromAlbum });
        if (wx.chooseMessageFile) choices.push({ label: "从微信聊天文件选择", run: chooseFromMessage });
        if (!choices.length) {
          reject(new Error("当前微信版本不支持选择视频，请升级微信后重试"));
          return;
        }
        if (choices.length === 1 || !wx.showActionSheet) {
          choices[0].run();
          return;
        }
        wx.showActionSheet({
          itemList: choices.map((choice) => choice.label),
          success(result) {
            const choice = choices[Number(result.tapIndex)];
            if (!choice) {
              resolve(null);
              return;
            }
            choice.run();
          },
          fail(error) {
            if (cancelled(error)) {
              resolve(null);
              return;
            }
            reject(new Error(error.errMsg || "视频来源选择失败，请重试"));
          }
        });
      })
  );
}

function openPrivacyContract() {
  return new Promise((resolve, reject) => {
    if (!wx.openPrivacyContract) {
      resolve();
      return;
    }
    wx.openPrivacyContract({
      success: resolve,
      fail: reject
    });
  });
}

module.exports = {
  clearSession,
  ensureLogin,
  getPublicCatalog,
  getPublicPosts,
  getPublicConfig,
  env,
  request,
  loginUser,
  recommend,
  previewTranscript,
  checkMaterialAccess,
  generateMaterialDraft,
  submitBooking,
  getBookingSlots,
  getBookingConfig,
  getMyBookings,
  cancelBooking,
  getProfile,
  saveProfile,
  getCourses,
  getAdminCourses,
  saveAdminCourse,
  uploadAdminCourseVideo,
  deleteAdminCourseVideo,
  deleteAdminCourse,
  getAdminStats,
  recordUsage,
  uploadStudentMaterial,
  getMyUploadedMaterials,
  deleteStudentMaterial,
  downloadMaterialFile,
  exportDocumentPdf,
  exportDocumentWord,
  getAdminUploads,
  exportAdminData,
  getAdminBookings,
  getMessages,
  sendMessage,
  getAdminMessages,
  replyAdminMessage,
  createPayment,
  getPaymentOrder,
  getPaymentStatus,
  openPrivacyContract,
  chooseTranscriptFiles,
  chooseStudentMaterialFiles,
  chooseCourseVideoFile
};
