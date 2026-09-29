const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "liude-offline-job-"));
const missingModelDir = fs.mkdtempSync(path.join(os.tmpdir(), "liude-missing-model-"));
Object.assign(process.env, {
  PORT: "0",
  MP_DATA_DIR: dataDir,
  MP_COS_ENABLED: "false",
  MP_OPEN_LOGIN: "true",
  MP_ALLOW_DEV_LOGIN: "true",
  MP_DEV_OPENID: "synthetic-offline-student",
  MP_DOCUMENT_DOWNLOAD_FREE: "true",
  MP_DOCUMENT_TRANSLATION_MODE: "offline",
  MP_OFFLINE_MODEL_DIR: missingModelDir,
  MP_PAYMENT_ENABLED: "false"
});

const server = require("../server");
let base;
let studentToken;

test.before(async () => {
  if (!server.listening) await new Promise(resolve => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  const login = await request("/api/mp/user/login", { code: "synthetic-offline-login" });
  assert.equal(login.status, 200);
  studentToken = login.data.token;
});

test.after(async () => {
  await new Promise(resolve => server.close(resolve));
  fs.rmSync(dataDir, { recursive: true, force: true });
  fs.rmSync(missingModelDir, { recursive: true, force: true });
});

async function request(route, body, token = studentToken) {
  const response = await fetch(base + route, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return { status: response.status, data: await response.json() };
}

test("offline draft generation queues quickly, is owner-scoped, and never returns entered text in errors", async () => {
  const privateMarker = "PRIVATE-SYNTHETIC-NOT-FOR-LOGGING";
  const accepted = await request("/api/mp/material-draft", {
    toolKey: "motivation", language: "de", translationProvider: "offline", documentTranslationConsent: true,
    form: { latinName: "TEST Applicant", schoolMajor: `${privateMarker}，2020年完成本科。` }
  });
  assert.equal(accepted.status, 202);
  assert.equal(accepted.data.status, "pending");
  assert.ok(accepted.data.jobId);
  assert.doesNotMatch(JSON.stringify(accepted.data), new RegExp(privateMarker));

  const forbidden = await request(`/api/mp/document-draft-jobs/${accepted.data.jobId}`, undefined, "");
  assert.equal(forbidden.status, 401);

  let status;
  for (let i = 0; i < 30; i += 1) {
    status = await request(`/api/mp/document-draft-jobs/${accepted.data.jobId}`);
    if (status.data.status !== "pending") break;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.equal(status.status, 200);
  assert.equal(status.data.status, "failed");
  assert.match(status.data.error, /尚未部署/);
  assert.doesNotMatch(JSON.stringify(status.data), new RegExp(privateMarker));
});

test("legacy mini-program receives an update instruction instead of an unusable queued response", async () => {
  const privateMarker = "PRIVATE-LEGACY-DRAFT";
  const response = await request("/api/mp/material-draft", {
    toolKey: "motivation", language: "de", documentTranslationConsent: true,
    form: { latinName: "TEST Applicant", schoolMajor: privateMarker }
  });
  assert.equal(response.status, 409);
  assert.match(response.data.error, /更新小程序/);
  assert.equal(response.data.jobId, undefined);
  assert.doesNotMatch(JSON.stringify(response.data), new RegExp(privateMarker));
});
