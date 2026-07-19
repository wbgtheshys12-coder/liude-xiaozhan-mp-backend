const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "liude-mp-test-"));
process.env.PORT = "0";
process.env.MP_DATA_DIR = testDataDir;
process.env.MP_OPEN_LOGIN = "true";
process.env.MP_ALLOW_DEV_LOGIN = "true";
process.env.MP_DEV_OPENID = "test-student-openid";
process.env.MP_TEACHER_OPENIDS_JSON = JSON.stringify({ a1: ["demo-local"], a2: ["test-teacher-a2"] });
// Render users sometimes leave a single valid JSON string instead of a JSON array.
// The server must stay healthy while still treating that value as one owner openid.
process.env.MP_OWNER_OPENIDS_JSON = JSON.stringify("test-owner");
process.env.MP_ADMIN_OPENIDS_JSON = JSON.stringify(["test-student-openid"]);
process.env.MP_ADMIN_WEB_TOKEN = "test-admin-web-token-keep-secret";
process.env.MP_DOCUMENT_DOWNLOAD_FREE = "true";
process.env.MP_BOOKING_NOTIFY_ENABLED = "false";
process.env.MP_BOOKING_TEMPLATE_ID = "test-template-id";
process.env.MP_BOOKING_SUBSCRIPTION_MODE = "long-term";
process.env.MP_BOOKING_TEMPLATE_FIELDS_JSON = JSON.stringify({
  time1: "dateTime",
  thing2: "留学咨询预约",
  thing3: "studentName",
  thing4: "advisorName",
  thing5: "note",
});
process.env.MP_MEDIA_SIGNING_SECRET = "test-only-media-signing-secret-not-for-production";
process.env.MP_TRANSCRIPT_TEMPLATES_FILE = path.join(testDataDir, "transcript-templates.private.json");

const server = require("../server");
const localEngine = require("../local-engine");

async function waitForServer() {
  if (server.listening) return;
  await new Promise((resolve) => server.once("listening", resolve));
}

function baseUrl() {
  const address = server.address();
  return `http://127.0.0.1:${address.port}`;
}

async function requestJson(urlPath, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(`${baseUrl()}${urlPath}`, {
    method: options.method || (options.body === undefined ? "GET" : "POST"),
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

test("user, booking, transcript, recommendation, course, upload and PDF flows", async () => {
  await waitForServer();

  const rateLimitError = new Error("429 Too Many Requests");
  rateLimitError.statusCode = 429;
  assert.equal(server.testHelpers.shouldUseRecommendationFallback(rateLimitError), true);
  const forcedFallback = server.testHelpers.buildFallbackRecommendation({ targetField: "机械工程" }, rateLimitError);
  assert.equal(forcedFallback.recommendations.length, 6);
  assert.equal(forcedFallback.source, "mini-program-local-fallback");
  assert.doesNotMatch(JSON.stringify(forcedFallback), /无法识别|识别失败|识别不了|不可读|上游服务提示/);
  const gradeFirstRows = localEngine.testHelpers.extractTranscriptRowsFromText("材料力学 88 4.0 必修 2025-01");
  assert.equal(gradeFirstRows[0].course, "材料力学");
  assert.equal(gradeFirstRows[0].grade, "88");
  assert.equal(gradeFirstRows[0].credits, "4.0");
  const englishHeaderRows = localEngine.testHelpers.extractTranscriptRowsFromText(
    "OFFICIAL TRANSCRIPT Major Mechanical Engineering Course Credits Grade Semester Engineering Mathematics 5.0 88 2024-09 Thermodynamics 4.0 91 2025-01"
  );
  assert.equal(englishHeaderRows[0].course, "Engineering Mathematics");
  assert.equal(englishHeaderRows[0].grade, "88");
  const squashedCreditRows = localEngine.testHelpers.extractTranscriptRowsFromText(
    "本科成绩单 专业 机械工程 课程名称 学分 成绩 学期 高等数学 50 88 2024-09 材料力学 40 91 2025-01"
  );
  assert.ok(squashedCreditRows.some((row) => row.course === "高等数学" && row.credits === "5.0" && row.grade === "88"));

  const health = await requestJson("/health");
  assert.equal(health.response.status, 200);
  assert.equal(health.payload.bookingTeacherOpenidCount, 2);
  assert.equal(health.payload.bookingWebhookCount, 0);
  assert.equal(health.payload.bookingCancellationNotificationConfigured, false);
  assert.deepEqual(health.payload.bookingTeacherRoleCounts, { a1: 1, a2: 1 });
  assert.equal(health.payload.bookingOwnerOpenidCount, 1);
  assert.equal(health.payload.bookingAdminOpenidCount, 1);
  assert.equal(health.payload.customerMessagingEnabled, true);
  assert.deepEqual(health.payload.bookingTemplateFieldKeys, ["time1", "thing2", "thing3", "thing4", "thing5"]);
  assert.equal(health.payload.bookingTemplateFieldsValid, true);
  assert.equal(health.payload.courseMediaSigned, true);
  assert.equal(health.payload.studentUploadDownloadEnabled, true);
  assert.equal(health.payload.documentPdfExportEnabled, true);
  assert.equal(health.payload.documentDownloadFree, true);
  assert.equal(health.payload.adminWebEnabled, true);
  assert.equal(health.payload.externalPersistentDataDirConfigured, true);

  const adminLogin = await requestJson("/api/mp/demo/login", { method: "POST", body: {} });
  assert.equal(adminLogin.response.status, 200);
  assert.equal(adminLogin.payload.isTeacher, true);
  assert.equal(adminLogin.payload.canSubscribeBookingNotice, true);
  const adminToken = adminLogin.payload.token;

  const userLogin = await requestJson("/api/mp/user/login", { method: "POST", body: { code: "test-code" } });
  assert.equal(userLogin.response.status, 200);
  assert.equal(userLogin.payload.isAdmin, true);
  assert.equal(userLogin.payload.isTeacher, false);
  assert.equal(userLogin.payload.isPlatformAdmin, true);
  assert.equal(userLogin.payload.canSubscribeBookingNotice, false);
  assert.equal(userLogin.payload.canManageCourses, true);
  const userToken = userLogin.payload.token;

  const adminWebSession = await requestJson("/api/mp/session", { token: process.env.MP_ADMIN_WEB_TOKEN });
  assert.equal(adminWebSession.response.status, 200);
  assert.equal(adminWebSession.payload.isAdminWeb, true);
  assert.equal(adminWebSession.payload.isAdmin, true);
  const adminWebPage = await fetch(`${baseUrl()}/admin`);
  assert.equal(adminWebPage.status, 200);
  assert.match(await adminWebPage.text(), /电脑后台管理/);

  const adminBookingConfig = await requestJson("/api/mp/booking/config", { token: adminToken });
  assert.equal(adminBookingConfig.payload.canSubscribe, true);
  assert.equal(adminBookingConfig.payload.oneTimeAuthorization, false);
  assert.equal(adminBookingConfig.payload.longTermAuthorization, true);
  assert.equal(adminBookingConfig.payload.subscriptionMode, "long-term");
  assert.equal(adminBookingConfig.payload.templateId, "test-template-id");

  const miniProgramText = require(path.join(__dirname, "..", "..", "用户版小程序", "utils", "text"));
  const garbledConfirmation = Buffer.from("预约已提交成功", "utf8").toString("latin1");
  assert.equal(miniProgramText.repairMojibake(garbledConfirmation), "预约已提交成功");

  const userBookingConfig = await requestJson("/api/mp/booking/config", { token: userToken });
  assert.equal(userBookingConfig.payload.canSubscribe, false);
  assert.equal(userBookingConfig.payload.templateId, "");

  const sentMessage = await requestJson("/api/mp/messages", {
    token: userToken,
    body: { content: "请问机械工程匹配结果如何理解？" },
  });
  assert.equal(sentMessage.response.status, 200);
  assert.equal(sentMessage.payload.record.direction, "user");
  const adminMessages = await requestJson("/api/mp/admin/messages", { token: adminToken });
  assert.equal(adminMessages.response.status, 200);
  assert.equal(adminMessages.payload.conversations.length, 1);
  const messageStorageKey = adminMessages.payload.conversations[0].storageKey;
  const repliedMessage = await requestJson("/api/mp/admin/messages/reply", {
    token: adminToken,
    body: { storageKey: messageStorageKey, content: "老师已收到，会结合课程背景核验。" },
  });
  assert.equal(repliedMessage.response.status, 200);
  assert.equal(repliedMessage.payload.record.direction, "staff");
  const userMessages = await requestJson("/api/mp/messages", { token: userToken });
  assert.equal(userMessages.response.status, 200);
  assert.equal(userMessages.payload.records.length, 2);
  assert.equal(userMessages.payload.records[1].content, "老师已收到，会结合课程背景核验。");

  const transcript = await requestJson("/api/mp/transcript-preview", {
    token: userToken,
    body: {
      profile: {
        transcriptRows: [
          { course: "高等数学", grade: "88", credits: "5", term: "2025-01" },
          { course: "习近平新时代中国特色社会主义思想概论", grade: "90", credits: "2", term: "2025-01" },
        ],
      },
    },
  });
  assert.equal(transcript.response.status, 200);
  assert.equal(JSON.stringify(transcript.payload).includes("习近平"), false);
  assert.doesNotMatch(JSON.stringify(transcript.payload), /无法识别|识别失败|识别不了|未识别|不可读/);
  assert.match(transcript.payload.transcriptSummary.privacyNote, /敏感|隐藏/);

  const manualTranscript = await requestJson("/api/mp/transcript-preview", {
    token: userToken,
    body: {
      profile: { major: "机械工程" },
      files: [{ name: "模糊测试.pdf", type: "application/pdf", content: `data:application/pdf;base64,${Buffer.from("%PDF-1.4\n% blank test\n").toString("base64")}` }],
    },
  });
  assert.equal(manualTranscript.response.status, 200);
  assert.doesNotMatch(JSON.stringify(manualTranscript.payload), /无法识别|识别失败|识别不了|未识别|不可读/);

  const recommendation = await requestJson("/api/mp/recommend", {
    token: userToken,
    body: { targetField: "机械工程" },
  });
  assert.equal(recommendation.response.status, 200);
  assert.equal(recommendation.payload.recommendations.length, 6);
  recommendation.payload.recommendations.forEach((item) => {
    assert.ok(item.university);
    assert.ok(item.program);
    assert.ok(item.reason);
    assert.ok(item.detail);
  });
  const majorOnlyRecommendation = await requestJson("/api/mp/recommend", {
    token: userToken,
    body: { major: "计算机科学", recommendationCount: 6 },
  });
  assert.equal(majorOnlyRecommendation.response.status, 200);
  assert.equal(majorOnlyRecommendation.payload.recommendations.length, 6);
  assert.match(
    majorOnlyRecommendation.payload.recommendations.slice(0, 3).map((item) => item.program).join(" "),
    /Computer|Informatik|Data|Software/i
  );

  const savedProfile = await requestJson("/api/mp/profile", {
    token: userToken,
    body: { name: "测试学生", school: "测试大学", major: "机械工程", contact: "仅测试" },
  });
  assert.equal(savedProfile.response.status, 200);
  assert.equal(savedProfile.payload.locked, true);
  const lockedProfile = await requestJson("/api/mp/profile", {
    token: userToken,
    body: { name: "修改姓名" },
  });
  assert.equal(lockedProfile.response.status, 409);
  assert.equal(lockedProfile.payload.locked, true);

  const upload = await requestJson("/api/mp/material/upload", {
    token: userToken,
    body: {
      category: "本科成绩单",
      usage: "ocr-training-consented",
      trainingConsent: true,
      studentName: "测试学生",
      file: {
        name: "test-transcript.pdf",
        content: `data:application/pdf;base64,${Buffer.from("%PDF-1.4\n% test\n").toString("base64")}`,
      },
    },
  });
  assert.equal(upload.response.status, 200);
  const uploadId = upload.payload.record.id;

  const ownUploads = await requestJson("/api/mp/materials", { token: userToken });
  assert.equal(ownUploads.payload.count, 1);
  assert.equal(ownUploads.payload.records[0].trainingConsent, true);
  const adminUploads = await requestJson("/api/mp/admin/uploads", { token: adminToken });
  assert.equal(adminUploads.payload.count, 1);
  assert.equal(adminUploads.payload.records[0].trainingConsent, true);

  const ownFile = await fetch(`${baseUrl()}/api/mp/material-file/${encodeURIComponent(uploadId)}`, {
    headers: { Authorization: `Bearer ${userToken}` },
  });
  assert.equal(ownFile.status, 200);
  assert.match(ownFile.headers.get("content-type"), /application\/pdf/);
  const platformAdminFile = await fetch(`${baseUrl()}/api/mp/admin/material-file/${encodeURIComponent(uploadId)}`, {
    headers: { Authorization: `Bearer ${userToken}` },
  });
  assert.equal(platformAdminFile.status, 200);

  const courseVideoUpload = await requestJson("/api/mp/admin/course-video", {
    token: adminToken,
    body: {
      name: "test.mp4",
      content: `data:video/mp4;base64,${Buffer.from("test-video-bytes").toString("base64")}`,
    },
  });
  assert.equal(courseVideoUpload.response.status, 200);
  assert.match(courseVideoUpload.payload.videoUrl, /^\/api\/mp\/course-video\//);

  const saveCourse = await requestJson("/api/mp/admin/courses", {
    token: adminToken,
    body: {
      type: "recorded",
      title: "账号绑定测试课",
      videoUrl: courseVideoUpload.payload.videoUrl,
      status: "published",
      allowedStorageKeys: [userLogin.payload.user.storageKey],
    },
  });
  assert.equal(saveCourse.response.status, 200);

  const courses = await requestJson("/api/mp/courses", { token: userToken });
  const boundCourse = courses.payload.records.find((item) => item.title === "账号绑定测试课");
  assert.ok(boundCourse);
  assert.match(boundCourse.videoUrl, /[?&]u=/);
  assert.match(boundCourse.videoUrl, /[?&]e=/);
  assert.match(boundCourse.videoUrl, /[?&]s=/);
  const videoResponse = await fetch(boundCourse.videoUrl, { headers: { Range: "bytes=0-3" } });
  assert.equal(videoResponse.status, 206);
  assert.equal((await videoResponse.arrayBuffer()).byteLength, 4);
  const tamperedVideoUrl = new URL(boundCourse.videoUrl);
  tamperedVideoUrl.searchParams.set("s", "0".repeat(64));
  const tamperedVideo = await fetch(tamperedVideoUrl);
  assert.equal(tamperedVideo.status, 403);

  const bookingBody = {
    advisorKey: "a1",
    advisorName: "张老师",
    studentName: Buffer.from("测试学生", "utf8").toString("latin1"),
    contact: "13800000000",
    major: "机械工程",
    applicationLevel: "硕士",
    date: "2099-12-30",
    dateDisplay: "2099年12月30日 周三",
    time: "09:00",
    note: "自动化测试",
  };
  const incompleteBooking = await requestJson("/api/mp/booking", {
    token: userToken,
    body: { ...bookingBody, contact: "" },
  });
  assert.equal(incompleteBooking.response.status, 400);
  const booking = await requestJson("/api/mp/booking", { token: userToken, body: bookingBody });
  assert.equal(booking.response.status, 200);
  assert.ok(booking.payload.bookingId);
  const bookingConflict = await requestJson("/api/mp/booking", { token: userToken, body: bookingBody });
  assert.equal(bookingConflict.response.status, 409);
  const adminBookings = await requestJson("/api/mp/admin/bookings?status=all", { token: adminToken });
  const storedBooking = adminBookings.payload.records.find((item) => item.id === booking.payload.bookingId);
  assert.equal(storedBooking.studentName, "测试学生");
  assert.equal(storedBooking.contact, "13800000000");
  assert.equal(storedBooking.major, "机械工程");
  assert.equal(storedBooking.applicationLevel, "硕士");
  assert.equal(storedBooking.dateTime, "2099年12月30日 09:00");
  const cancellationWebhookText = server.testHelpers.buildBookingWebhookContent(storedBooking, "cancelled");
  assert.match(cancellationWebhookText, /留德小栈预约已取消/);
  assert.match(cancellationWebhookText, /原预约时间：2099年12月30日 周三 09:00/);
  assert.match(cancellationWebhookText, new RegExp(`预约编号：${booking.payload.bookingId}`));
  const cancel = await requestJson("/api/mp/booking/cancel", {
    token: userToken,
    body: { bookingId: booking.payload.bookingId },
  });
  assert.equal(cancel.response.status, 200);
  assert.equal(cancel.payload.booking.status, "cancelled");
  assert.equal(cancel.payload.cancelNotificationConfigured, false);
  assert.equal(cancel.payload.cancelNotified, false);

  const pdfPreview = await requestJson("/api/mp/document/pdf", {
    token: userToken,
    body: {
      kind: "draft",
      title: "测试动机信",
      fileName: "test-motivation.pdf",
      content: "这是一份用于自动化校验的长文书内容。".repeat(80),
    },
  });
  assert.equal(pdfPreview.response.status, 200);
  assert.equal(pdfPreview.payload.preview, false);
  const pdfBuffer = Buffer.from(pdfPreview.payload.contentBase64, "base64");
  assert.equal(pdfBuffer.slice(0, 5).toString("ascii"), "%PDF-");
  const pdfJs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const parsedPdf = await pdfJs.getDocument({ data: new Uint8Array(pdfBuffer) }).promise;
  assert.ok(parsedPdf.numPages >= 1);

  const deleteUpload = await requestJson("/api/mp/material/delete", {
    token: userToken,
    body: { id: uploadId },
  });
  assert.equal(deleteUpload.response.status, 200);
  const uploadsAfterDelete = await requestJson("/api/mp/materials", { token: userToken });
  assert.equal(uploadsAfterDelete.payload.count, 0);
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(testDataDir, { recursive: true, force: true });
});
