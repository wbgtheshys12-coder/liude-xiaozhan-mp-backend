const test = require("node:test");
const assert = require("node:assert/strict");
const { cleanObjectKey, createCosStorage } = require("../cos-storage");

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
