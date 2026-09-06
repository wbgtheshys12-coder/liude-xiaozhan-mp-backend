// Measure the real action bar, including wrapped labels and the device safe area.
// Each page owns its timer so a hidden/unloaded page cannot update the next page.
function measure(page, selector) {
  clearTimeout(page._footerLayoutTimer);
  page._footerLayoutTimer = setTimeout(() => {
    page._footerLayoutTimer = null;
    if (!page.createSelectorQuery) return;
    page.createSelectorQuery().select(selector).boundingClientRect((rect) => {
      if (!rect || !Number.isFinite(rect.height) || rect.height <= 0 || page._footerLayoutHidden) return;
      const footerInset = Math.ceil(rect.height) + 16;
      if (page.data.footerInset !== footerInset) page.setData({ footerInset });
    }).exec();
  }, 80);
}

function show(page, selector) {
  page._footerLayoutHidden = false;
  measure(page, selector);
}

function hide(page) {
  page._footerLayoutHidden = true;
  clearTimeout(page._footerLayoutTimer);
  page._footerLayoutTimer = null;
}

module.exports = { measure, show, hide };
