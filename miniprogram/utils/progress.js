function stop(page, timerKey) {
  if (page && page[timerKey]) {
    clearInterval(page[timerKey]);
    page[timerKey] = null;
  }
}

function start(page, options) {
  if (!page || !options) return;
  const timerKey = options.timerKey;
  const progressKey = options.progressKey;
  const textKey = options.textKey;
  const from = Number(options.from || 8);
  const cap = Number(options.cap || 88);
  const step = Number(options.step || 4);
  const interval = Number(options.interval || 420);

  stop(page, timerKey);
  page.setData({
    [progressKey]: from,
    [textKey]: options.text || ""
  });

  page[timerKey] = setInterval(() => {
    const current = Number(page.data[progressKey] || 0);
    if (current >= cap) return;
    const next = Math.min(cap, current + Math.max(1, Math.ceil(Math.random() * step)));
    page.setData({ [progressKey]: next });
  }, interval);
}

function finish(page, options) {
  if (!page || !options) return;
  stop(page, options.timerKey);
  page.setData({
    [options.progressKey]: 100,
    [options.textKey]: options.text || ""
  });
}

function reset(page, options) {
  if (!page || !options) return;
  stop(page, options.timerKey);
  page.setData({
    [options.progressKey]: 0,
    [options.textKey]: ""
  });
}

module.exports = {
  start,
  finish,
  reset,
  stop
};
