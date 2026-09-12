"use strict";

const clean = (value, limit) => String(value || "").trim().slice(0, limit);
const httpError = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const POST_ACTIONS = { submit: ["draft", "pending"], approve: ["pending", "published"], reject: ["pending", "draft"], unpublish: ["published", "draft"] };

function transitionPost(post, action, actor, now) {
  const rule = POST_ACTIONS[action];
  if (!rule || post.status !== rule[0]) throw httpError("状态已变化，请刷新后再操作。", 409);
  return { ...post, status: rule[1], updatedAt: now, reviewedBy: action === "approve" ? actor : post.reviewedBy || "", publishedAt: action === "approve" ? now : post.publishedAt || "" };
}

function createReleaseRoutes(ctx) {
  const { sendJson, readBody, requireSession, isAdminSession, getSessionStorageKey, createRecordId, readJsonlFile, writeJsonlFile, appendBookingRecord, readBookingRecords, writeBookingRecords, recordUsage, readCourseRecords, sanitizeCourse, postsFile, catalog } = ctx;
  const known = new Set(["/api/mp/public/config", "/api/mp/public/catalog", "/api/mp/public/posts", "/api/mp/public/courses", "/api/mp/admin/posts", "/api/mp/booking-request", "/api/mp/admin/booking-request/status"]);
  return async function releaseRoutes(req, res, url) {
    if (!known.has(url.pathname)) return false;
    try {
      const route = url.pathname;
      if (route.startsWith("/api/mp/public/")) {
        if (req.method !== "GET") throw httpError("不支持此请求方式。", 405);
        if (route.endsWith("/config")) {
          sendJson(res, 200, { ok: true, serviceWechat: "liudexiaozhan", officialAccountUsername: /^gh_[a-zA-Z0-9]+$/.test(process.env.MP_OFFICIAL_ACCOUNT_USERNAME || "") ? process.env.MP_OFFICIAL_ACCOUNT_USERNAME : "", bookingMode: "contact-request", paymentsEnabled: false, liveIntegration: { status: "reserved", provider: "https-link" } });
        } else if (route.endsWith("/catalog")) {
          sendJson(res, 200, { ok: true, records: catalog(), notice: "以下为已有院校专业库资料，并非实时招生公告；具体条件、学费及截止日期以学校官方当期信息为准。" });
        } else if (route.endsWith("/posts")) {
          const records = readJsonlFile(postsFile).filter((post) => post.status === "published" && post.reviewedBy).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)).slice(0, 50).map(({ id, title, content, sourceUrl, publishedAt }) => ({ id, title, content, sourceUrl, publishedAt }));
          sendJson(res, 200, { ok: true, records });
        } else {
          const guest = { openid: "public-free-course-viewer" };
          const records = readCourseRecords().filter((course) => course.status === "published" && course.free === true && !(course.allowedStorageKeys || []).length).map((course) => sanitizeCourse(course, guest, false, req)).filter((course) => course.type === "live" ? Boolean(course.liveUrl) : course.hasVideo).map((course) => ({ ...course, boundToWechat: false, accessText: "免费公开学习" }));
          sendJson(res, 200, { ok: true, records, bindingNote: "免费公开课无需登录。登录后可向老师发送课程反馈。", protectNote: "课程仅供学习使用，请勿擅自传播。" });
        }
        return true;
      }
      const session = requireSession(req, res);
      if (!session) return true;
      if (route === "/api/mp/booking-request") {
        if (req.method !== "POST") throw httpError("不支持此请求方式。", 405);
        const body = JSON.parse((await readBody(req)) || "{}");
        const studentName = clean(body.studentName, 40);
        const contact = clean(body.contact, 100);
        const note = clean(body.note, 1000);
        if (!studentName || !contact || !note) throw httpError("请填写姓名、联系方式和咨询内容。");
        if (body.date || body.time) throw httpError("预约仅提交联系申请，无需指定日期或时段。");
        const storageKey = getSessionStorageKey(session);
        const pending = readBookingRecords().find((record) => record.requestOnly && record.user?.storageKey === storageKey && record.status === "pending");
        if (pending) { sendJson(res, 200, { ok: true, bookingId: pending.id, duplicate: true, message: "已有待联系的申请，请勿重复提交。补充信息可通过客服私信发送。" }); return true; }
        const advisorKey = ["a1", "a2"].includes(body.advisorKey) ? body.advisorKey : "a1";
        const booking = { id: createRecordId("bk"), requestOnly: true, advisorKey, advisorName: advisorKey === "a2" ? "陆老师" : "顾问老师", studentName, contact, note, date: "", time: "", dateDisplay: "待老师联系确认", dateTime: "", status: "pending", user: { storageKey }, createdAt: new Date().toISOString() };
        booking.bookingText = `咨询申请（未指定时间）\n学生：${studentName}\n联系方式：${contact}\n内容：${note}`;
        if (!appendBookingRecord(booking)) throw httpError("保存未成功，请稍后重试。", 503);
        recordUsage(session, "booking.request", { id: booking.id });
        const notification = await ctx.notifyContactRequest?.(booking).catch(() => ({ notified: false }));
        sendJson(res, 200, { ok: true, bookingId: booking.id, notification, message: "预约申请已保存。老师会通过你填写的联系方式联系你，本次未确认具体时间。" });
        return true;
      }
      if (!isAdminSession(session)) throw httpError("只有管理员可以编辑和审核资讯。", 403);
      if (route === "/api/mp/admin/booking-request/status") {
        if (req.method !== "POST") throw httpError("不支持此请求方式。", 405);
        const body = JSON.parse((await readBody(req)) || "{}");
        const bookings = readBookingRecords();
        const index = bookings.findIndex((item) => item.id === body.id && item.requestOnly);
        if (index < 0) throw httpError("咨询申请不存在。", 404);
        const booking = bookings[index];
        if (booking.status !== "pending" || !["contacted", "completed"].includes(body.status)) throw httpError("申请状态已变化，请刷新后查看。", 409);
        bookings[index] = { ...booking, status: body.status, updatedAt: new Date().toISOString(), handledBy: getSessionStorageKey(session) };
        if (!writeBookingRecords(bookings)) throw httpError("保存未成功，请稍后重试。", 503);
        recordUsage(session, "admin.booking.status", { id: booking.id, status: body.status });
        sendJson(res, 200, { ok: true, status: body.status });
        return true;
      }
      if (req.method === "GET") { sendJson(res, 200, { ok: true, records: readJsonlFile(postsFile) }); return true; }
      if (req.method !== "POST") throw httpError("不支持此请求方式。", 405);
      const body = JSON.parse((await readBody(req)) || "{}");
      const records = readJsonlFile(postsFile);
      const actor = getSessionStorageKey(session);
      const now = new Date().toISOString();
      let post = records.find((item) => item.id === body.id);
      if (body.id && !post) throw httpError("资讯不存在。", 404);
      if (post && body.updatedAt !== post.updatedAt) throw httpError("资讯已被更新，请刷新后编辑。", 409);
      if (!body.action || body.action === "save") {
        const title = clean(body.title, 80), content = clean(body.content, 12000), sourceUrl = clean(body.sourceUrl, 500);
        if (!title || !content) throw httpError("请填写标题和正文。");
        if (sourceUrl && !/^https:\/\//i.test(sourceUrl)) throw httpError("来源链接须使用 HTTPS。");
        post = { id: post?.id || createRecordId("post"), title, content, sourceUrl, status: "draft", createdAt: post?.createdAt || now, updatedAt: now, author: actor, reviewedBy: "", publishedAt: "" };
      } else {
        if (!post) throw httpError("请先保存草稿。");
        post = transitionPost(post, body.action, actor, now);
      }
      if (!writeJsonlFile(postsFile, [...records.filter((item) => item.id !== post.id), post])) {
        throw httpError("资讯保存未成功，请稍后重试。", 503);
      }
      recordUsage(session, `admin.post.${body.action || "save"}`, { id: post.id });
      sendJson(res, 200, { ok: true, record: post });
    } catch (error) {
      sendJson(res, error instanceof SyntaxError ? 400 : error.statusCode || 500, { error: error instanceof SyntaxError ? "请求内容格式错误。" : error.statusCode ? error.message : "暂时无法处理，请稍后重试。" });
    }
    return true;
  };
}
module.exports = { createReleaseRoutes, transitionPost };
