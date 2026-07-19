(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const state = { token: sessionStorage.getItem("liude_admin_token") || "", courses: [] };
  const loginPanel = $("loginPanel");
  const appPanel = $("appPanel");
  const globalMessage = $("globalMessage");

  function setMessage(message, ok = false) {
    globalMessage.textContent = message || "";
    globalMessage.className = `message${ok ? " ok" : ""}`;
  }

  async function api(path, options = {}) {
    const response = await fetch(path, { ...options, headers: { "Content-Type": "application/json; charset=utf-8", Authorization: `Bearer ${state.token}`, ...(options.headers || {}) } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `请求失败：${response.status}`);
    return payload;
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
  }

  function showApp(show) {
    loginPanel.classList.toggle("hidden", show);
    appPanel.classList.toggle("hidden", !show);
    $("logoutButton").classList.toggle("hidden", !show);
  }

  function courseHtml(course) {
    return `<article class="card"><div class="card-head"><h3>${escapeHtml(course.title)}</h3><span class="badge">${course.type === "live" ? "直播" : "录播"} · ${escapeHtml(course.status)}</span></div><p class="meta">${escapeHtml(course.summary || "暂无简介")}</p><p class="meta">${escapeHtml(course.startAt || course.duration || "")}</p><div class="card-actions"><button class="ghost edit-course" data-id="${escapeHtml(course.id)}" type="button">编辑</button></div></article>`;
  }

  async function loadCourses() {
    const payload = await api("/api/mp/admin/courses");
    state.courses = payload.records || [];
    $("coursesList").innerHTML = state.courses.length ? state.courses.map(courseHtml).join("") : '<p class="meta">暂无课程。</p>';
  }

  async function loadBookings() {
    const payload = await api("/api/mp/admin/bookings?status=all");
    $("bookingsList").innerHTML = (payload.records || []).map((item) => `<article class="card"><div class="card-head"><h3>${escapeHtml(item.studentName || "微信用户")}</h3><span class="badge">${escapeHtml(item.status || "confirmed")}</span></div><p class="meta">${escapeHtml(item.dateDisplay || item.date)} ${escapeHtml(item.time)} · ${escapeHtml(item.advisorName)}</p><p class="meta">联系方式：${escapeHtml(item.contact || "未填写")}</p><p class="meta">专业 / 层次：${escapeHtml(item.major || "未填写")} · ${escapeHtml(item.applicationLevel || "未填写")}</p><p class="meta">备注：${escapeHtml(item.note || "无")}</p></article>`).join("") || '<p class="meta">暂无预约。</p>';
  }

  async function loadUploads() {
    const payload = await api("/api/mp/admin/uploads");
    $("uploadsList").innerHTML = (payload.records || []).map((item) => `<article class="card"><div class="card-head"><h3>${escapeHtml(item.name)}</h3><span class="badge">${escapeHtml(item.category)}</span></div><p class="meta">学生：${escapeHtml(item.studentName || item.user?.storageKey || "未填写")}</p><p class="meta">用途：${escapeHtml(item.usage || "未填写")} · ${Math.round(Number(item.size || 0) / 1024)} KB</p><div class="card-actions"><button class="ghost download-upload" data-id="${escapeHtml(item.id)}" data-name="${escapeHtml(item.name)}" type="button">安全下载</button></div></article>`).join("") || '<p class="meta">暂无学生资料。</p>';
  }

  async function loadMessages() {
    const payload = await api("/api/mp/admin/messages");
    $("messagesList").innerHTML = (payload.conversations || []).map((conversation) => {
      const history = (conversation.messages || []).slice(-20).map((item) => `<div class="message-line ${item.direction === "staff" ? "staff" : "user"}"><strong>${escapeHtml(item.senderLabel)}</strong><span>${escapeHtml(item.content)}</span><small>${escapeHtml(item.createdAt)}</small></div>`).join("");
      return `<article class="card"><div class="card-head"><h3>${escapeHtml(conversation.studentName || "微信用户")}</h3><span class="badge">${escapeHtml(conversation.contact || "未填写联系方式")}</span></div><p class="meta">用户标识：${escapeHtml(conversation.storageKey)}</p><div class="message-history">${history}</div><textarea class="message-reply-input" data-storage-key="${escapeHtml(conversation.storageKey)}" maxlength="1000" placeholder="输入回复内容"></textarea><div class="card-actions"><button class="primary reply-message" data-storage-key="${escapeHtml(conversation.storageKey)}" type="button">发送回复</button></div></article>`;
    }).join("") || '<p class="meta">暂无客服消息。</p>';
  }

  async function replyMessage(storageKey) {
    const input = document.querySelector(`.message-reply-input[data-storage-key="${storageKey}"]`);
    const content = String(input?.value || "").trim();
    if (!content) throw new Error("请填写回复内容。" );
    await api("/api/mp/admin/messages/reply", { method: "POST", body: JSON.stringify({ storageKey, content }) });
    await loadMessages();
    setMessage("回复已发送。", true);
  }

  async function loadStats() {
    const payload = await api("/api/mp/admin/stats");
    const summary = payload.summary || {};
    const labels = { bookings: "预约", activeBookings: "有效预约", uploads: "资料", profiles: "学生档案", courses: "课程", publishedCourses: "已发布课程", messages: "客服消息", messageConversations: "客服会话", usage: "使用事件", activeUsers: "活跃用户" };
    $("statsList").innerHTML = `<div class="stats-grid">${Object.entries(labels).map(([key, label]) => `<div class="stat"><strong>${escapeHtml(summary[key] || 0)}</strong><span>${label}</span></div>`).join("")}</div>`;
  }

  async function loadResource(resource) {
    setMessage("正在读取数据…", true);
    try {
      if (resource === "courses") await loadCourses();
      if (resource === "bookings") await loadBookings();
      if (resource === "uploads") await loadUploads();
      if (resource === "messages") await loadMessages();
      if (resource === "stats") await loadStats();
      setMessage("数据已更新。", true);
    } catch (error) {
      setMessage(error.message);
      if (/登录|401|令牌/.test(error.message)) logout();
    }
  }

  function resetCourseForm() {
    $("courseForm").reset();
    $("courseId").value = "";
    $("courseStatus").value = "published";
  }

  function editCourse(id) {
    const course = state.courses.find((item) => item.id === id);
    if (!course) return;
    $("courseId").value = course.id || "";
    $("courseType").value = course.type || "recorded";
    $("courseTitle").value = course.title || "";
    $("courseSummary").value = course.summary || "";
    $("courseTags").value = (course.tags || []).join(", ");
    $("courseStatus").value = course.status || "published";
    $("courseVideoUrl").value = course.videoUrl || "";
    $("courseLiveUrl").value = course.liveUrl || "";
    $("courseStartAt").value = course.startAt || "";
    $("courseDuration").value = course.duration || "";
    $("courseAllowedKeys").value = (course.allowedStorageKeys || []).join(", ");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("视频读取失败。"));
      reader.readAsDataURL(file);
    });
  }

  async function uploadVideo() {
    const file = $("courseVideoFile").files[0];
    if (!file) throw new Error("请先选择本地视频。" );
    if (file.size > 35 * 1024 * 1024) throw new Error("测试视频不能超过 35MB。" );
    setMessage("正在上传视频，请勿关闭页面…", true);
    const content = await fileToDataUrl(file);
    const payload = await api("/api/mp/admin/course-video", { method: "POST", body: JSON.stringify({ name: file.name, content }) });
    $("courseVideoUrl").value = payload.videoUrl || "";
    setMessage("视频已上传并填入课程地址。请继续保存课程。", true);
  }

  async function saveCourse(event) {
    event.preventDefault();
    const payload = {
      id: $("courseId").value, type: $("courseType").value, title: $("courseTitle").value.trim(), summary: $("courseSummary").value.trim(),
      tags: $("courseTags").value.split(/[,，]/).map((item) => item.trim()).filter(Boolean), status: $("courseStatus").value,
      videoUrl: $("courseVideoUrl").value.trim(), liveUrl: $("courseLiveUrl").value.trim(), startAt: $("courseStartAt").value.trim(), duration: $("courseDuration").value.trim(),
      allowedStorageKeys: $("courseAllowedKeys").value.split(/[,，\n]/).map((item) => item.trim()).filter(Boolean),
    };
    if (!payload.title) throw new Error("请填写课程名称。" );
    await api("/api/mp/admin/courses", { method: "POST", body: JSON.stringify(payload) });
    resetCourseForm(); await loadCourses(); setMessage("课程已保存。", true);
  }

  async function downloadUpload(id, name) {
    const response = await fetch(`/api/mp/admin/material-file/${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${state.token}` } });
    if (!response.ok) throw new Error("资料下载失败或无权限。" );
    const blob = await response.blob(); const url = URL.createObjectURL(blob); const link = document.createElement("a");
    link.href = url; link.download = name || "student-material"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function login() {
    state.token = $("tokenInput").value.trim();
    if (!state.token) { $("loginMessage").textContent = "请输入后台访问令牌。"; return; }
    try { await api("/api/mp/session"); sessionStorage.setItem("liude_admin_token", state.token); $("tokenInput").value = ""; $("loginMessage").textContent = ""; showApp(true); await loadResource("courses"); }
    catch (error) { state.token = ""; $("loginMessage").textContent = "令牌无效或后台未启用。"; }
  }

  function logout() { state.token = ""; state.courses = []; sessionStorage.removeItem("liude_admin_token"); showApp(false); }

  $("loginButton").addEventListener("click", login);
  $("tokenInput").addEventListener("keydown", (event) => { if (event.key === "Enter") login(); });
  $("logoutButton").addEventListener("click", logout);
  $("resetCourseButton").addEventListener("click", resetCourseForm);
  $("uploadVideoButton").addEventListener("click", () => uploadVideo().catch((error) => setMessage(error.message)));
  $("courseForm").addEventListener("submit", (event) => saveCourse(event).catch((error) => setMessage(error.message)));
  document.addEventListener("click", (event) => {
    const tab = event.target.closest(".tab");
    if (tab) { document.querySelectorAll(".tab").forEach((item) => item.classList.toggle("active", item === tab)); document.querySelectorAll(".view").forEach((item) => item.classList.add("hidden")); $(`${tab.dataset.tab}View`).classList.remove("hidden"); loadResource(tab.dataset.tab); }
    const refresh = event.target.closest(".refresh"); if (refresh) loadResource(refresh.dataset.resource);
    const edit = event.target.closest(".edit-course"); if (edit) editCourse(edit.dataset.id);
    const download = event.target.closest(".download-upload"); if (download) downloadUpload(download.dataset.id, download.dataset.name).catch((error) => setMessage(error.message));
    const reply = event.target.closest(".reply-message"); if (reply) replyMessage(reply.dataset.storageKey).catch((error) => setMessage(error.message));
  });
  if (state.token) api("/api/mp/session").then(() => { showApp(true); loadResource("courses"); }).catch(logout);
})();
