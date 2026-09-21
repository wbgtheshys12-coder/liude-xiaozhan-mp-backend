(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const state = { token: sessionStorage.getItem("liude_admin_token") || "", courses: [], posts: [] };
  const loginPanel = $("loginPanel");
  const appPanel = $("appPanel");
  const globalMessage = $("globalMessage");

  function setMessage(message, ok = false) {
    globalMessage.textContent = message || "";
    globalMessage.className = `message${ok ? " ok" : ""}`;
  }

  async function api(path, options = {}) {
    const response = await fetch(path, {
      ...options,
      headers: { "Content-Type": "application/json; charset=utf-8", Authorization: `Bearer ${state.token}`, ...(options.headers || {}) },
    });
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

  function formatBytes(size) {
    const bytes = Number(size || 0);
    if (!bytes) return "";
    return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`;
  }

  function setVideoStatus(meta = {}) {
    const url = String(meta.videoUrl ?? $("courseVideoUrl").value ?? "").trim();
    const status = $("courseVideoStatus");
    let stateName = "empty";
    let text = "尚未配置视频。";
    if (meta.uploading) {
      stateName = "uploading";
      text = "正在上传视频，请勿关闭页面…";
    } else if (url && meta.videoStorage === "local" && meta.videoExists === false) {
      stateName = "missing";
      text = "课程记录存在，但视频文件已失效，请重新上传。";
    } else if (url) {
      stateName = "ready";
      const kind = ({ "tencent-cos": "腾讯云 COS 视频", bundled: "随后端发布的视频（不在COS）", local: "当前服务器本地视频", external: "外部视频链接" })[meta.videoStorage] || "视频地址已配置";
      const detail = [meta.name || meta.videoFileName, formatBytes(meta.size || meta.videoSize)].filter(Boolean).join(" · ");
      text = `${kind}${detail ? `：${detail}` : ""}。${meta.justUploaded ? "请继续保存课程，保存后学生端才会显示。" : ""}`;
    }
    status.className = `media-status ${stateName}`;
    status.textContent = text;
    $("removeVideoButton").disabled = !url || Boolean(meta.uploading);
  }

  function courseHtml(course) {
    const mediaText = course.type === "live"
      ? course.liveUrl ? "直播入口已配置" : "直播入口待配置"
      : course.videoStorage === "local" && !course.videoExists
        ? "视频文件已失效，请重新上传"
        : course.videoUrl
          ? `视频已配置${course.videoSize ? ` · ${formatBytes(course.videoSize)}` : ""}`
          : "视频待配置";
    const preview = course.videoPreviewUrl ? `<button class="ghost preview-course" data-id="${escapeHtml(course.id)}" type="button">测试播放</button>` : "";
    return `<article class="card"><div class="card-head"><h3>${escapeHtml(course.title)}</h3><span class="badge">${course.type === "live" ? "直播" : "录播"} · ${escapeHtml(course.status)}</span></div><p class="meta">${escapeHtml(course.summary || "暂无简介")}</p><p class="meta">${escapeHtml(course.startAt || course.duration || "")}</p><p class="media-line ${course.videoStorage === "local" && !course.videoExists ? "missing" : ""}">${escapeHtml(mediaText)} · ${escapeHtml(({bundled:"后端内置（不在腾讯云）","tencent-cos":"腾讯云 COS",local:"服务器本地",external:"外部链接",none:"未上传"})[course.videoStorage] || "待核实")} · ${course.free ? "免费公开" : "登录 / 授权课程"}</p><div class="card-actions"><button class="ghost edit-course" data-id="${escapeHtml(course.id)}" type="button">编辑</button>${preview}${course.status === "published" ? `<button class="ghost hide-course" data-id="${escapeHtml(course.id)}" type="button">下架（保留视频）</button>` : `<span class="badge">仅后台可见</span>`}<button class="danger-button delete-course" data-id="${escapeHtml(course.id)}" type="button">删除课程</button></div></article>`;
  }

  async function loadCourses() {
    const payload = await api("/api/mp/admin/courses");
    state.courses = payload.records || [];
    $("courseStorageNote").textContent = `${payload.storageNote || "课程管理与小程序使用同一数据源。"} 上传时会显示真实进度；正式长课建议使用云点播。`;
    $("coursesList").innerHTML = state.courses.length ? state.courses.map(courseHtml).join("") : '<p class="meta">暂无课程。</p>';
  }

  async function loadBookings() {
    const payload = await api("/api/mp/admin/bookings?status=all");
    $("bookingsList").innerHTML = (payload.records || []).map((item) => `<article class="card"><div class="card-head"><h3>${escapeHtml(item.studentName || "微信用户")}</h3><span class="badge">${escapeHtml(item.statusText || item.status || "confirmed")}</span></div><p class="meta">${escapeHtml(item.dateDisplay || item.date)} ${escapeHtml(item.time)} · ${escapeHtml(item.advisorName)}</p><p class="meta">联系方式：${escapeHtml(item.contact || "未填写")}</p><p class="meta">学校：${escapeHtml(item.school || "未填写")}</p><p class="meta">专业 / 层次：${escapeHtml(item.major || "未填写")} · ${escapeHtml(item.applicationLevel || "未填写")}</p><p class="meta">备注：${escapeHtml(item.note || "无")}</p>${item.requestOnly && item.status === "pending" ? `<button class="booking-contacted" data-id="${escapeHtml(item.id)}">标记已联系</button>` : ""}</article>`).join("") || '<p class="meta">暂无预约。</p>';
  }

  async function loadUploads() {
    const payload = await api("/api/mp/admin/uploads");
    $("uploadsList").innerHTML = (payload.records || []).map((item) => `<article class="card"><div class="card-head"><h3>${escapeHtml(item.name)}</h3><span class="badge">${escapeHtml(item.category)}</span></div><p class="meta">学生：${escapeHtml(item.studentName || item.user?.storageKey || "未填写")}</p><p class="meta">用途：${escapeHtml(item.usage || "未填写")} · ${Math.round(Number(item.size || 0) / 1024)} KB</p><div class="card-actions"><button class="ghost download-upload" data-id="${escapeHtml(item.id)}" data-name="${escapeHtml(item.name)}" type="button">保存资料</button><button class="ghost preview-upload" data-id="${escapeHtml(item.id)}" data-name="${escapeHtml(item.name)}" type="button">查看资料</button></div></article>`).join("") || '<p class="meta">暂无学生资料。</p>';
  }

  async function loadMessages() {
    const payload = await api("/api/mp/admin/messages");
    $("messagesList").innerHTML = (payload.conversations || []).map((conversation) => {
      const history = (conversation.messages || []).slice(-20).map((item) => `<div class="message-line ${item.direction === "staff" ? "staff" : "user"}"><strong>${escapeHtml(item.senderLabel)}</strong><span>${escapeHtml(item.content)}</span><small>${escapeHtml(item.createdAt)}</small></div>`).join("");
      return `<article class="card"><div class="card-head"><h3>${escapeHtml(conversation.studentName || "微信用户")}</h3><span class="badge">${escapeHtml(conversation.contact || "未填写联系方式")}</span></div><p class="meta">${escapeHtml(conversation.school || "未填写学校")} · ${escapeHtml(conversation.major || "未填写专业")} · ${escapeHtml(conversation.applicationLevel ? `申请${conversation.applicationLevel}` : "未填写申请层次")}</p><p class="meta">用户标识：${escapeHtml(conversation.storageKey)}</p><div class="message-history">${history}</div><textarea class="message-reply-input" data-storage-key="${escapeHtml(conversation.storageKey)}" maxlength="1000" placeholder="输入回复内容"></textarea><div class="card-actions"><button class="primary reply-message" data-storage-key="${escapeHtml(conversation.storageKey)}" type="button">发送回复</button></div></article>`;
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
    $("statsList").innerHTML = `<p class="fine-print">${escapeHtml(payload.measurementNote || "")}</p><div class="stats-grid">${Object.entries(labels).map(([key, label]) => `<div class="stat"><strong>${escapeHtml(summary[key] || 0)}</strong><span>${label}</span></div>`).join("")}</div>`;
  }

  async function loadPayments() {
    const payload = await api("/api/mp/admin/payment-orders");
    const statusLabels = { PAID: "已支付", PENDING: "待确认", CREATED: "创建中", CREATE_FAILED: "创建失败" };
    $("paymentsList").innerHTML = (payload.records || []).map((item) => `<article class="card"><div class="card-head"><h3>${escapeHtml(item.productTitle || item.productId || "支付订单")}</h3><span class="badge">${escapeHtml(statusLabels[item.status] || item.status || "未知")}</span></div><p class="meta">金额：${escapeHtml(item.priceText || "-")} · 用户标识：${escapeHtml(item.storageKey || "-")}</p><p class="meta">商户订单号：${escapeHtml(item.outTradeNo || "-")}</p><p class="meta">创建：${escapeHtml(item.createdAt || "-")}${item.paidAt ? ` · 支付：${escapeHtml(item.paidAt)}` : ""}</p></article>`).join("") || '<p class="meta">暂无支付订单。</p>';
  }

  async function loadResource(resource) {
    setMessage("正在读取数据…", true);
    try {
      if (resource === "courses") await loadCourses();
      if (resource === "bookings") await loadBookings();
      if (resource === "uploads") await loadUploads();
      if (resource === "messages") await loadMessages();
      if (resource === "payments") await loadPayments();
      if (resource === "stats") await loadStats();
      if (resource === "posts") await loadPosts();
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
    setVideoStatus({ videoUrl: "" });
  }

  function editCourse(id) {
    const course = state.courses.find((item) => item.id === id);
    if (!course) return;
    $("courseId").value = course.id || "";
    $("courseType").value = course.type || "recorded";
    $("courseFree").checked = course.free === true;
    $("courseTitle").value = course.title || "";
    $("courseSummary").value = course.summary || "";
    $("courseTags").value = (course.tags || []).join(", ");
    $("courseStatus").value = course.status || "draft";
    $("courseVideoUrl").value = course.videoUrl || "";
    $("courseLiveUrl").value = course.liveUrl || "";
    $("courseStartAt").value = course.startAt || "";
    $("courseDuration").value = course.duration || "";
    $("courseAllowedKeys").value = (course.allowedStorageKeys || []).join(", ");
    setVideoStatus(course);
    setMessage("已载入课程，可修改后保存。", true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function apiBinary(path, data) {
    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream", Authorization: `Bearer ${state.token}` },
      body: data,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `上传失败：${response.status}`);
    return payload;
  }

  async function uploadVideo() {
    const file = $("courseVideoFile").files[0];
    if (!file) throw new Error("请先选择本地视频。" );
    if (file.size > 512 * 1024 * 1024) throw new Error("单个视频不能超过 512MB；正式长课请使用云点播链接。" );
    if (!/\.(mp4|mov|m4v)$/i.test(file.name)) throw new Error("课程视频仅支持 MP4、MOV、M4V。" );
    setMessage("正在建立分片上传任务…", true);
    setVideoStatus({ uploading: true });
    let uploadId = "";
    try {
      const init = await api("/api/mp/admin/course-video/init", {
        method: "POST",
        body: JSON.stringify({ name: file.name, size: file.size, mimeType: file.type || "video/mp4" }),
      });
      uploadId = init.uploadId;
      const chunkSize = Number(init.chunkSize || 4 * 1024 * 1024);
      let offset = 0;
      while (offset < file.size) {
        const chunk = await file.slice(offset, Math.min(file.size, offset + chunkSize)).arrayBuffer();
        const chunkResult = await apiBinary(`/api/mp/admin/course-video/chunk?uploadId=${encodeURIComponent(uploadId)}&offset=${offset}`, chunk);
        offset = Number(chunkResult.received || offset + chunk.byteLength);
        const progress = Math.min(100, Math.round((offset / file.size) * 100));
        setMessage(`正在上传视频 ${progress}%（${formatBytes(offset)} / ${formatBytes(file.size)}）`, true);
        setVideoStatus({ uploading: true });
      }
      const payload = await api("/api/mp/admin/course-video/complete", {
        method: "POST",
        body: JSON.stringify({ uploadId }),
      });
      $("courseVideoUrl").value = payload.videoUrl || "";
      setVideoStatus({ ...payload, justUploaded: true });
      $("courseVideoFile").value = "";
      setMessage(payload.storagePersistent === false
        ? "视频已上传。请保存课程；当前未配置持久化存储，重新部署后文件可能丢失。"
        : "视频已上传并填入课程地址。请继续保存课程。", true);
    } catch (error) {
      if (uploadId) {
        api("/api/mp/admin/course-video/abort", { method: "POST", body: JSON.stringify({ uploadId }) }).catch(() => {});
      }
      setVideoStatus({ videoUrl: $("courseVideoUrl").value });
      throw error;
    }
  }

  async function removeVideo() {
    const videoUrl = $("courseVideoUrl").value.trim();
    if (!videoUrl) return;
    if (!window.confirm("移除视频？上传到本系统的视频文件会一并删除；外部链接只从课程中移除。")) return;
    await api("/api/mp/admin/course-video/delete", {
      method: "POST",
      body: JSON.stringify({ courseId: $("courseId").value, videoUrl }),
    });
    $("courseVideoUrl").value = "";
    setVideoStatus({ videoUrl: "" });
    await loadCourses();
    setMessage("视频已移除。", true);
  }

  async function deleteCourse(id) {
    const course = state.courses.find((item) => item.id === id);
    if (!course || !window.confirm(`确定删除“${course.title}”吗？本系统内上传的视频也会一并清理。`)) return;
    await api("/api/mp/admin/course/delete", { method: "POST", body: JSON.stringify({ id, deleteVideo: true }) });
    if ($("courseId").value === id) resetCourseForm();
    await loadCourses();
    setMessage("课程已删除。", true);
  }

  function previewCourse(id) {
    const course = state.courses.find((item) => item.id === id);
    if (!course?.videoPreviewUrl) throw new Error("当前课程没有可播放的视频。" );
    window.open(course.videoPreviewUrl, "_blank", "noopener,noreferrer");
  }

  async function saveCourse(event) {
    event.preventDefault();
    const payload = {
      id: $("courseId").value,
      type: $("courseType").value,
      title: $("courseTitle").value.trim(),
      summary: $("courseSummary").value.trim(),
      tags: $("courseTags").value.split(/[,，]/).map((item) => item.trim()).filter(Boolean),
      status: $("courseStatus").value,
      free: $("courseFree").checked,
      videoUrl: $("courseVideoUrl").value.trim(),
      liveUrl: $("courseLiveUrl").value.trim(),
      startAt: $("courseStartAt").value.trim(),
      duration: $("courseDuration").value.trim(),
      allowedStorageKeys: $("courseAllowedKeys").value.split(/[,，\n]/).map((item) => item.trim()).filter(Boolean),
    };
    if (!payload.title) throw new Error("请填写课程名称。" );
    if (payload.free && payload.allowedStorageKeys.length) throw new Error("免费公开课不能限定学生，请取消勾选免费或清空限定名单。");
    await api("/api/mp/admin/courses", { method: "POST", body: JSON.stringify(payload) });
    resetCourseForm();
    await loadCourses();
    setMessage("课程已保存。", true);
  }

  async function downloadUpload(id, name, preview = false) {
    const response = await fetch(`/api/mp/admin/material-file/${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${state.token}` } });
    if (!response.ok) { const error = await response.json().catch(() => ({})); throw new Error(error.error || `资料读取失败：${response.status}`); }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name || "student-material";
    document.body.appendChild(link);
    if (preview && /^(application\/pdf|image\/)/i.test(blob.type)) {
      const dialog = document.createElement("dialog"); dialog.className = "material-preview";
      const toolbar = document.createElement("div"); toolbar.className = "preview-toolbar";
      const close = document.createElement("button"); close.className = "ghost"; close.textContent = "关闭预览"; close.onclick = () => dialog.close();
      link.textContent = "保存原文件"; link.className = "preview-save";
      const title = document.createElement("strong"); title.textContent = name || "学生资料预览";
      toolbar.append(title, link, close);
      const content = document.createElement("div"); content.className = "preview-content";
      let dispose;
      dialog.append(toolbar, content); document.body.appendChild(dialog);
      dialog.onclose = () => { dispose?.(); URL.revokeObjectURL(url); dialog.remove(); };
      dialog.showModal();
      if (/^application\/pdf/i.test(blob.type)) {
        content.textContent = "正在加载 PDF 页面……";
        try {
          const { renderPdfPreview } = await import("/admin/pdf-preview.js");
          if (dialog.open) dispose = await renderPdfPreview(content, blob, () => dialog.open);
        } catch (error) { if (dialog.open) content.textContent = "此文件暂时无法在线预览，请点击上方“保存原文件”后使用 PDF 阅读器打开。"; }
      } else {
        const img = document.createElement("img"); img.src = url; img.alt = name || "学生资料图片"; img.className = "material-image"; content.append(img);
      }
    } else { link.click(); setTimeout(() => URL.revokeObjectURL(url), 60000); }
    if (!preview || !/^(application\/pdf|image\/)/i.test(blob.type)) link.remove();
  }

  async function login() {
    state.token = $("tokenInput").value.trim();
    if (!state.token) { $("loginMessage").textContent = "请输入后台访问令牌。"; return; }
    try {
      const session = await api("/api/mp/session");
      if (!session.authenticated || !session.isAdmin) throw new Error("请使用有效的管理员登录令牌。");
      sessionStorage.setItem("liude_admin_token", state.token);
      $("tokenInput").value = "";
      $("loginMessage").textContent = "";
      showApp(true);
      await loadResource("courses");
    } catch (error) {
      state.token = "";
      $("loginMessage").textContent = "令牌无效或后台未启用。";
    }
  }

  function logout() {
    state.token = "";
    state.courses = [];
    sessionStorage.removeItem("liude_admin_token");
    showApp(false);
  }

  async function loadPosts() {
    const payload = await api("/api/mp/admin/posts"); state.posts = payload.records || [];
    $("postsList").innerHTML = state.posts.map((post) => {
      const actions = post.status === "draft" ? [["submit","提交审核"]] : post.status === "pending" ? [["approve","审核发布"],["reject","退回草稿"]] : [["unpublish","下架"]];
      return `<article class="card"><h3>${escapeHtml(post.title)}</h3><p>${escapeHtml({draft:"草稿",pending:"待审核",published:"已发布"}[post.status])}</p><p class="meta post-content">${escapeHtml(post.content)}</p><p class="meta">${escapeHtml(post.sourceUrl)}</p><button data-id="${escapeHtml(post.id)}" data-post-action="edit">编辑</button>${actions.map(([action,label]) => `<button data-id="${escapeHtml(post.id)}" data-post-action="${action}">${label}</button>`).join("")}</article>`;
    }).join("") || "<p>暂无资讯。请先新建草稿。</p>";
  }
  async function actOnPost(id, action) {
    const post = state.posts.find((item) => item.id === id); if (!post) return;
    if (action === "edit") { $("postId").value = post.id; $("postUpdatedAt").value = post.updatedAt; $("postTitle").value = post.title; $("postContent").value = post.content; $("postSource").value = post.sourceUrl || ""; $("postForm").scrollIntoView({behavior:"smooth"}); return; }
    if (action === "approve" && !confirm("请确认事实、日期、来源及隐私内容已经人工核对。审核发布后所有用户可见，确定发布？")) return;
    await api("/api/mp/admin/posts", { method:"POST", body: JSON.stringify({ id, action, updatedAt:post.updatedAt }) });
    await loadPosts(); setMessage("资讯状态已更新。",true);
  }
  $("postForm").addEventListener("submit", (event) => {
    event.preventDefault();
    api("/api/mp/admin/posts", {method:"POST",body:JSON.stringify({id:$("postId").value,updatedAt:$("postUpdatedAt").value,action:"save",title:$("postTitle").value,content:$("postContent").value,sourceUrl:$("postSource").value})}).then(() => { $("postForm").reset(); return loadPosts(); }).then(() => setMessage("已保存草稿，尚未发布。",true)).catch((error) => setMessage(error.message));
  });
  $("resetPost").addEventListener("click", () => $("postForm").reset());
  $("loginButton").addEventListener("click", login);
  $("tokenInput").addEventListener("keydown", (event) => { if (event.key === "Enter") login(); });
  $("logoutButton").addEventListener("click", logout);
  $("resetCourseButton").addEventListener("click", resetCourseForm);
  $("uploadVideoButton").addEventListener("click", () => uploadVideo().catch((error) => {
    setVideoStatus({});
    setMessage(error.message);
  }));
  $("removeVideoButton").addEventListener("click", () => removeVideo().catch((error) => setMessage(error.message)));
  $("courseVideoUrl").addEventListener("input", () => setVideoStatus({}));
  $("courseForm").addEventListener("submit", (event) => saveCourse(event).catch((error) => setMessage(error.message)));
  document.addEventListener("click", (event) => {
    const tab = event.target.closest(".tab");
    if (tab) {
      document.querySelectorAll(".tab").forEach((item) => item.classList.toggle("active", item === tab));
      document.querySelectorAll(".view").forEach((item) => item.classList.add("hidden"));
      $(`${tab.dataset.tab}View`).classList.remove("hidden");
      loadResource(tab.dataset.tab);
    }
    const refresh = event.target.closest(".refresh");
    if (refresh) loadResource(refresh.dataset.resource);
    const edit = event.target.closest(".edit-course");
    const hide = event.target.closest(".hide-course");
    if (hide && confirm("下架后所有小程序用户均不可见，已上传视频保留，后台仍可预览。恢复公开前请确认已具备对应服务类目和资质。是否下架？")) {
      api("/api/mp/admin/course-hide", { method: "POST", body: JSON.stringify({ id: hide.dataset.id }) })
        .then(async () => { await loadCourses(); setMessage("已下架，视频保留且仅后台可见。", true); })
        .catch(error => setMessage(error.message));
    }
    if (edit) editCourse(edit.dataset.id);
    const preview = event.target.closest(".preview-course");
    if (preview) {
      try { previewCourse(preview.dataset.id); } catch (error) { setMessage(error.message); }
    }
    const removeCourse = event.target.closest(".delete-course");
    if (removeCourse) deleteCourse(removeCourse.dataset.id).catch((error) => setMessage(error.message));
    const download = event.target.closest(".download-upload");
    if (download) downloadUpload(download.dataset.id, download.dataset.name).catch((error) => setMessage(error.message));
    const viewUpload = event.target.closest(".preview-upload");
    if (viewUpload) downloadUpload(viewUpload.dataset.id, viewUpload.dataset.name, true).catch((error) => setMessage(error.message));
    const postAction = event.target.closest("[data-post-action]");
    if (postAction) actOnPost(postAction.dataset.id, postAction.dataset.postAction).catch((error) => setMessage(error.message));
    const contacted = event.target.closest(".booking-contacted");
    if (contacted && confirm("确认已经通过学生留下的联系方式联系过本人？")) api("/api/mp/admin/booking-request/status", { method:"POST", body:JSON.stringify({id:contacted.dataset.id,status:"contacted"}) }).then(loadBookings).catch((error) => setMessage(error.message));
    const reply = event.target.closest(".reply-message");
    if (reply) replyMessage(reply.dataset.storageKey).catch((error) => setMessage(error.message));
  });

  if (state.token) {
    api("/api/mp/session").then((session) => {
      if (!session.authenticated || !session.isAdmin) throw new Error("管理员登录已失效");
      showApp(true); loadResource("courses");
    }).catch(logout);
  }
})();
