const test = require("node:test");
const assert = require("node:assert/strict");
const { cleanObjectKey, createCosStorage } = require("../cos-storage");
test('file uploads use SDK multipart and finite request timeouts', async () => {
  const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
  let options, upload;
  class FakeCOS {
    constructor(value) { options = value; }
    uploadFile(params, callback) { upload = params; callback(null, {}); }
  }
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../cos-storage.js'), 'utf8'), {
    module, process, Buffer,
    require: name => name === 'cos-nodejs-sdk-v5' ? FakeCOS : require(name)
  });
  const storage = module.exports.createCosStorage({ MP_COS_ENABLED:'true', TENCENT_COS_SECRET_ID:'test', TENCENT_COS_SECRET_KEY:'test', TENCENT_COS_BUCKET:'test-123' });
  await storage.putFile('course-videos/test.mp4', '/synthetic/test.mp4', 'video/mp4');
  assert.equal(options.Timeout, 60000);
  assert.equal(options.ChunkRetryTimes, 1);
  assert.equal(upload.FilePath, '/synthetic/test.mp4');
  assert.equal(upload.ChunkSize, 2 * 1024 * 1024);
  assert.equal(upload.ContentType, 'video/mp4');
});

test("cleanObjectKey removes traversal and normalizes separators", () => {
  assert.equal(cleanObjectKey("/student-materials\\abc/../file.pdf"), "student-materials/abc/file.pdf");
  assert.equal(cleanObjectKey("course-videos//lesson.mp4"), "course-videos/lesson.mp4");
});

test("COS stays inactive until explicitly enabled with complete secrets", () => {
  const disabled = createCosStorage({
    MP_COS_ENABLED: "false",
    TENCENT_COS_SECRET_ID: "id",
    TENCENT_COS_SECRET_KEY: "key",
    TENCENT_COS_BUCKET: "bucket-123",
    TENCENT_COS_REGION: "ap-shanghai",
  });
  assert.equal(disabled.configured, true);
  assert.equal(disabled.active, false);

  const incomplete = createCosStorage({ MP_COS_ENABLED: "true" });
  assert.equal(incomplete.configured, false);
  assert.equal(incomplete.active, false);
});

test("COS object keys remain scoped under the configured root prefix", () => {
  const storage = createCosStorage({
    MP_COS_ENABLED: "true",
    TENCENT_COS_SECRET_ID: "id",
    TENCENT_COS_SECRET_KEY: "key",
    TENCENT_COS_BUCKET: "bucket-123",
    TENCENT_COS_REGION: "ap-shanghai",
    MP_COS_ROOT_PREFIX: "production/",
  });
  assert.equal(storage.active, true);
  assert.equal(storage.objectKey("student-materials/user/file.pdf"), "production/student-materials/user/file.pdf");
});
