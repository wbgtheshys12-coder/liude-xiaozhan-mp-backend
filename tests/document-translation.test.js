const test = require('node:test');
const assert = require('node:assert/strict');
const { createDocumentTranslator } = require('../document-translation');
const input = { toolKey: 'motivation', language: 'de', documentTranslationConsent: true, form: { latinName: 'TEST Applicant', schoolMajor: '我于2024年毕业。', email: 'private@example.com' } };
test('translation preserves template, excludes contact details and caches preview/export', async () => {
  let calls = 0;
  const service = createDocumentTranslator({ env: { OPENAI_API_KEY: 'fake' }, fetchImpl: async (url, options) => {
    calls++;
    assert.equal(url, 'https://api.openai.com/v1/responses');
    assert.ok(!options.body.includes('private@example.com'));
    assert.equal(JSON.parse(options.body).store, false);
    return { ok: true, json: async () => ({ status: 'completed', output: [{ content: [{ type: 'output_text', text: JSON.stringify({ latinName: 'TEST Applicant', schoolMajor: 'Ich habe mein Studium 2024 abgeschlossen.' }) }] }] }) };
  } });
  const first = await service.generate(input, 'student1');
  assert.match(first.draft, /Studium 2024 abgeschlossen/);
  assert.match(first.draft, /private@example.com/);
  assert.deepEqual(await service.generate(input, 'student1'), first);
  assert.equal(calls, 1);
  await service.generate(input, 'student2'); assert.equal(calls, 2);
});
test('consent, key and incomplete response fail closed without template substitution', async () => {
  const service = createDocumentTranslator({ env: {} });
  await assert.rejects(service.generate({ ...input, documentTranslationConsent: false }, 'x'), /授权/);
  await assert.rejects(service.generate(input, 'x'), /尚未配置/);
  const broken = createDocumentTranslator({ env: { OPENAI_API_KEY: 'fake' }, fetchImpl: async () => ({ ok: true, json: async () => ({ status: 'incomplete' }) }) });
  await assert.rejects(broken.generate(input, 'x'), /完整/);
});
