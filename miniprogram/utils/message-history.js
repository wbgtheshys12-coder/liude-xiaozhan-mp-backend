const env = require('./env');

function key() { return env.scopedKey('liude_customer_messages_cleared_before'); }
function clearedBefore() { return Number(wx.getStorageSync(key())) || 0; }
function clear() {
  const cutoff = Date.now();
  wx.setStorageSync(key(), cutoff);
  return cutoff;
}
function visible(records) {
  const cutoff = clearedBefore();
  return (records || []).filter(record => !cutoff || Date.parse(record.createdAt) > cutoff);
}
module.exports = { clear, visible, clearedBefore };
