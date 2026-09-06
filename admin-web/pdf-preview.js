import { getDocument, GlobalWorkerOptions } from "/admin/pdf-vendor/pdf.mjs";

GlobalWorkerOptions.workerSrc = "/admin/pdf-vendor/pdf.worker.mjs";

export async function renderPdfPreview(host, blob, isOpen) {
  // Work only with bytes already fetched through the authenticated material API.
  // No document URL, token, or student data is sent to a third-party viewer.
  const task = getDocument({ data: new Uint8Array(await blob.arrayBuffer()), isEvalSupported: false });
  const pdf = await task.promise;
  if (!isOpen()) { await pdf.destroy(); return () => {}; }
  host.textContent = "";
  const controls = document.createElement("div"); controls.className = "preview-pages";
  const previous = document.createElement("button"); previous.className = "ghost"; previous.textContent = "上一页";
  const next = document.createElement("button"); next.className = "ghost"; next.textContent = "下一页";
  const status = document.createElement("span"); status.setAttribute("role", "status");
  const canvas = document.createElement("canvas"); canvas.className = "preview-canvas"; canvas.setAttribute("role", "img");
  controls.append(previous, status, next); host.append(controls, canvas);
  let pageNumber = 1, rendering = null, closed = false;
  const dispose = () => { closed = true; rendering?.cancel(); pdf.destroy().catch(() => {}); };
  async function render() {
    previous.disabled = next.disabled = true;
    status.textContent = `第 ${pageNumber} / ${pdf.numPages} 页 · 加载中`;
    try {
      const page = await pdf.getPage(pageNumber);
      if (closed || !isOpen()) { dispose(); return; }
      const unit = page.getViewport({ scale: 1 });
      const scale = Math.min(1.7, 1500 / unit.width, Math.sqrt(12000000 / (unit.width * unit.height)));
      const viewport = page.getViewport({ scale });
      canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
      canvas.setAttribute("aria-label", `PDF 第 ${pageNumber} 页`);
      rendering = page.render({ canvasContext: canvas.getContext("2d"), viewport });
      await rendering.promise;
      status.textContent = `第 ${pageNumber} / ${pdf.numPages} 页`;
    } catch (error) {
      if (!closed) status.textContent = "此页预览失败，请保存原文件查看。";
    } finally {
      rendering = null;
      if (!closed) { previous.disabled = pageNumber <= 1; next.disabled = pageNumber >= pdf.numPages; }
    }
  }
  previous.onclick = () => { if (pageNumber > 1 && !rendering) { pageNumber--; render(); } };
  next.onclick = () => { if (pageNumber < pdf.numPages && !rendering) { pageNumber++; render(); } };
  await render();
  return dispose;
}
