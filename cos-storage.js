const fs = require("fs");
const path = require("path");

function cleanObjectKey(value) {
  return String(value || "")
    .replace(/\\/g, "/")
    .split("/")
    .filter((part) => part && part !== "." && part !== "..")
    .join("/");
}

function createCosStorage(env = process.env) {
  const enabled = String(env.MP_COS_ENABLED || "").trim().toLowerCase() === "true";
  const secretId = String(env.TENCENT_COS_SECRET_ID || "").trim();
  const secretKey = String(env.TENCENT_COS_SECRET_KEY || "").trim();
  const bucket = String(env.TENCENT_COS_BUCKET || "").trim();
  const region = String(env.TENCENT_COS_REGION || "ap-shanghai").trim();
  const rootPrefix = cleanObjectKey(env.MP_COS_ROOT_PREFIX || "");
  const configured = Boolean(secretId && secretKey && bucket && region);
  let client = null;

  function objectKey(value) {
    const clean = cleanObjectKey(value);
    return [rootPrefix, clean].filter(Boolean).join("/");
  }

  function getClient() {
    if (!enabled || !configured) return null;
    if (!client) {
      const COS = require("cos-nodejs-sdk-v5");
      client = new COS({ SecretId: secretId, SecretKey: secretKey, Timeout: 60000, ChunkRetryTimes: 1, ChunkParallelLimit: 2 });
    }
    return client;
  }

  function call(method, params) {
    const cos = getClient();
    if (!cos) return Promise.reject(new Error("COS storage is not configured"));
    return new Promise((resolve, reject) => {
      cos[method]({ Bucket: bucket, Region: region, ...params }, (error, data) => {
        if (error) reject(error);
        else resolve(data || {});
      });
    });
  }

  function isMissingObject(error) {
    return Boolean(
      error &&
        (Number(error.statusCode || error.status) === 404 ||
          ["NoSuchKey", "NoSuchResource", "NotFound"].includes(String(error.code || error.name || "")))
    );
  }

  async function putBuffer(key, buffer, contentType = "application/octet-stream") {
    const Key = objectKey(key);
    await call("putObject", {
      Key,
      Body: Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || ""),
      ContentType: contentType,
    });
    return { key: Key, provider: "tencent-cos" };
  }

  async function putFile(key, filePath, contentType = "application/octet-stream") {
    const Key = objectKey(key);
    await call("uploadFile", {
      Key,
      FilePath: filePath,
      SliceSize: 5 * 1024 * 1024,
      ChunkSize: 2 * 1024 * 1024,
      ContentType: contentType,
    });
    return { key: Key, provider: "tencent-cos" };
  }

  async function getBuffer(key) {
    const data = await call("getObject", { Key: objectKey(key) });
    if (Buffer.isBuffer(data.Body)) return data.Body;
    if (typeof data.Body === "string") return Buffer.from(data.Body);
    return Buffer.from(data.Body || "");
  }

  async function head(key) {
    try {
      const data = await call("headObject", { Key: objectKey(key) });
      const headers = data.headers || {};
      return {
        exists: true,
        size: Number(data.ContentLength || headers["content-length"] || 0),
        contentType: String(data.ContentType || headers["content-type"] || "application/octet-stream"),
      };
    } catch (error) {
      if (isMissingObject(error)) return { exists: false, size: 0, contentType: "" };
      throw error;
    }
  }

  async function streamTo(key, output, range = "") {
    const params = { Key: objectKey(key), Output: output };
    if (range) params.Range = range;
    return call("getObject", params);
  }

  async function remove(key) {
    try {
      await call("deleteObject", { Key: objectKey(key) });
      return true;
    } catch (error) {
      if (isMissingObject(error)) return false;
      throw error;
    }
  }

  async function restoreFile(key, filePath) {
    try {
      const body = await getBuffer(key);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      const temporary = `${filePath}.restore-${process.pid}-${Date.now()}`;
      fs.writeFileSync(temporary, body);
      fs.renameSync(temporary, filePath);
      return true;
    } catch (error) {
      if (isMissingObject(error)) return false;
      throw error;
    }
  }

  return {
    enabled,
    configured,
    active: enabled && configured,
    bucket,
    region,
    rootPrefix,
    objectKey,
    putBuffer,
    putFile,
    getBuffer,
    head,
    streamTo,
    remove,
    restoreFile,
    isMissingObject,
  };
}

module.exports = {
  cleanObjectKey,
  createCosStorage,
};
