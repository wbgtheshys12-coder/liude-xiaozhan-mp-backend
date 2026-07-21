const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const videoPath = path.resolve(process.argv[2] || "");
if (!videoPath || !fs.existsSync(videoPath)) {
  throw new Error("请传入存在的视频文件路径。");
}

const testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "liude-course-video-smoke-"));
process.env.PORT = "0";
process.env.MP_DATA_DIR = testDataDir;
process.env.MP_OPEN_LOGIN = "true";
process.env.MP_ALLOW_DEV_LOGIN = "true";
process.env.MP_DEV_OPENID = "course-video-smoke-student";
process.env.MP_TEACHER_OPENIDS_JSON = JSON.stringify({ a1: ["demo-local"] });
process.env.MP_ADMIN_OPENIDS_JSON = "[]";
process.env.MP_OWNER_OPENIDS_JSON = "[]";
process.env.MP_MEDIA_SIGNING_SECRET = "local-course-video-smoke-signing-key";

const server = require("../server");

async function waitForServer() {
  if (server.listening) return;
  await new Promise((resolve) => server.once("listening", resolve));
}

function baseUrl() {
  return `http://127.0.0.1:${server.address().port}`;
}

async function requestJson(urlPath, { token = "", body, method } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(`${baseUrl()}${urlPath}`, {
    method: method || (body === undefined ? "GET" : "POST"),
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  assert.equal(response.ok, true, payload.error || `${urlPath} 请求失败：${response.status}`);
  return payload;
}

async function run() {
  await waitForServer();
  const video = fs.readFileSync(videoPath);
  const adminLogin = await requestJson("/api/mp/demo/login", { method: "POST", body: {} });
  const studentLogin = await requestJson("/api/mp/user/login", { method: "POST", body: { code: "video-smoke" } });

  const upload = await requestJson("/api/mp/admin/course-video", {
    token: adminLogin.token,
    body: {
      name: path.basename(videoPath),
      content: `data:video/mp4;base64,${video.toString("base64")}`,
    },
  });
  assert.equal(upload.videoExists, true);
  assert.equal(upload.size, video.length);

  const saved = await requestJson("/api/mp/admin/courses", {
    token: adminLogin.token,
    body: {
      type: "recorded",
      title: "真实视频上传验证课",
      summary: "使用网课视频.mp4执行上传、回显、学生可见和播放验证。",
      tags: ["录播课", "上传验证"],
      status: "published",
      videoUrl: upload.videoUrl,
      duration: "测试视频",
      allowedStorageKeys: [],
    },
  });

  const adminCourses = await requestJson("/api/mp/admin/courses", { token: adminLogin.token });
  const adminCourse = adminCourses.records.find((item) => item.id === saved.course.id);
  assert.ok(adminCourse);
  assert.equal(adminCourse.videoUrl, upload.videoUrl);
  assert.equal(adminCourse.videoExists, true);
  assert.equal(adminCourse.videoSize, video.length);
  assert.match(adminCourse.videoPreviewUrl, /[?&]s=/);

  const studentCourses = await requestJson("/api/mp/courses", { token: studentLogin.token });
  const studentCourse = studentCourses.records.find((item) => item.id === saved.course.id);
  assert.ok(studentCourse);
  assert.equal(studentCourse.hasVideo, true);
  assert.match(studentCourse.videoUrl, /[?&]s=/);

  const playback = await fetch(studentCourse.videoUrl, { headers: { Range: "bytes=0-1023" } });
  assert.equal(playback.status, 206);
  assert.match(playback.headers.get("content-type") || "", /^video\/mp4/);
  const playbackBytes = Buffer.from(await playback.arrayBuffer());
  assert.deepEqual(playbackBytes, video.subarray(0, playbackBytes.length));

  const deleted = await requestJson("/api/mp/admin/course/delete", {
    token: adminLogin.token,
    body: { id: saved.course.id, deleteVideo: true },
  });
  assert.equal(deleted.fileDeleted, true);
  const afterDelete = await requestJson("/api/mp/courses", { token: studentLogin.token });
  assert.equal(afterDelete.records.some((item) => item.id === saved.course.id), false);

  return {
    ok: true,
    sourceFile: path.basename(videoPath),
    sourceBytes: video.length,
    uploadConfirmed: true,
    adminEditConfirmed: true,
    studentVisible: true,
    rangePlaybackConfirmed: true,
    deleteConfirmed: true,
  };
}

run()
  .then((result) => {
    console.log(JSON.stringify(result));
  })
  .catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  })
  .finally(() => {
    server.close();
    fs.rmSync(testDataDir, { recursive: true, force: true });
  });
