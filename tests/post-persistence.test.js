const test = require('node:test');
const assert = require('node:assert/strict');
const { createReleaseRoutes } = require('../release-routes');
function harness(fail = false) {
  let records = [], count = 0, usage = 0;
  const route = createReleaseRoutes({
    sendJson: (res, status, body) => Object.assign(res, { status, body }),
    readBody: async (req) => { if (req.wait) await req.wait; return JSON.stringify(req.body); },
    requireSession: () => ({}), isAdminSession: () => true,
    getSessionStorageKey: () => 'synthetic-admin', createRecordId: () => 'post-' + (++count),
    readJsonlFile: () => records.slice(),
    writeJsonlFile: (_, next) => { if (fail) return false; records = next; return true; },
    recordUsage: () => { usage++; }, postsFile: 'unused'
  });
  return { route, records: () => records, usage: () => usage };
}
const url = new URL('http://localhost/api/mp/admin/posts');
test('failed post persistence returns 503 without reporting success or usage', async () => {
  const h = harness(true), res = {};
  await h.route({ method: 'POST', body: { title: 'Test', content: 'Synthetic' } }, res, url);
  assert.equal(res.status, 503);
  assert.equal(res.body.ok, undefined);
  assert.equal(h.usage(), 0);
});
test('overlapping request bodies do not overwrite another newly saved post', async () => {
  const h = harness();
  let resume;
  const wait = new Promise(resolve => { resume = resolve; });
  const slow = {}, fast = {};
  const pending = h.route({ method: 'POST', wait, body: { title: 'Slow', content: 'Synthetic' } }, slow, url);
  await h.route({ method: 'POST', body: { title: 'Fast', content: 'Synthetic' } }, fast, url);
  resume(); await pending;
  assert.equal(slow.status, 200); assert.equal(fast.status, 200);
  assert.deepEqual(h.records().map(x => x.title).sort(), ['Fast', 'Slow']);
});
