const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const birth = require('../miniprogram/utils/birth');
const { createOfflineTranslator } = require('../offline-document-translation');
const { createDocumentTranslator } = require('../document-translation');

test('birthday validates calendar dates and migrates legacy input without duplication', () => {
  for (const input of ['2002-03-18', '2002年3月18日', '18.03.2002']) assert.equal(birth.parseDate(input), '2002-03-18');
  assert.equal(birth.parseDate('2000-02-29'), '2000-02-29');
  for (const input of ['2001-02-29', '2002-13-18', '2002-04-31', '2999-01-01', '03/18/2002']) assert.equal(birth.parseDate(input), '');
  const migrated = birth.normalizeForm({ birthInfo: '出生日期：2002-03-18，出生地：Hangzhou, Zhejiang, China' });
  assert.equal(migrated.birthDate, '2002-03-18');
  assert.equal(migrated.birthPlace, 'Hangzhou, Zhejiang, China');
  assert.equal(birth.formatInfo(birth.details(migrated), 'de'), '18.03.2002, Hangzhou, Zhejiang, China');
  assert.equal(birth.normalizeForm({ ...migrated, birthDate: '' }).birthDate, '');
  assert.equal(birth.normalizeForm({ ...migrated, birthPlace: '' }).birthPlace, '');
  assert.equal(birth.knownPlace('杭州市'), 'Hangzhou');
  assert.equal(birth.knownPlace('中国杭州'), 'Hangzhou, China');
  assert.equal(birth.knownPlace('石门县'), '石门县');
});

test('offline CV preserves birthday and place even when model returns an apology', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'birth-test-'));
  fs.mkdirSync(path.join(dir, 'zh-en'));
  try {
    const service = createOfflineTranslator({ env: { MP_OFFLINE_MODEL_DIR: dir }, spawnImpl: () => {
      const child = new EventEmitter();
      child.stdout = new EventEmitter(); child.stderr = new EventEmitter(); child.stdin = new EventEmitter(); child.kill = () => {};
      child.stdin.end = data => {
        const { fields } = JSON.parse(data);
        assert.equal(fields.birthInfo, 'Hangzhou, Zhejiang, China');
        assert.ok(!data.includes('2002-03-18'));
        queueMicrotask(() => { child.stdout.emit('data', JSON.stringify({ ...fields, birthInfo: 'Es tut mir leid.' })); child.emit('close', 0); });
      };
      return child;
    } });
    for (const language of ['en', 'de']) {
      const result = await service.generate({ toolKey: 'cv', language, translationProvider: 'offline', documentTranslationConsent: true,
        form: { latinName: 'Test Applicant', birthDate: '2002-03-18', birthPlace: 'Hangzhou, Zhejiang, China', education: '2019-2023 University' } }, 'test');
      assert.match(result.draft, language === 'de' ? /18\.03\.2002, Hangzhou, Zhejiang, China/ : /2002-03-18, Hangzhou, Zhejiang, China/);
      assert.ok(!result.draft.includes('Es tut mir leid'));
    }
    await assert.rejects(service.generate({ toolKey: 'cv', language: 'de', translationProvider: 'offline', documentTranslationConsent: true, form: { birthDate: '2001-02-29', birthPlace: 'Hangzhou' } }, 'test'), /有效的出生日期/);
    await assert.rejects(service.generate({ toolKey: 'cv', language: 'de', translationProvider: 'offline', documentTranslationConsent: true, form: { birthDate: '2002-03-18', birthPlace: '石门县' } }, 'test'), /英文或拼音/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('API adapter does not translate date, ignores invented place and distinguishes birthday cache', async () => {
  let calls = 0;
  const service = createDocumentTranslator({ env: { OPENAI_API_KEY: 'fake' }, fetchImpl: async (_, options) => {
    calls++;
    const request = JSON.parse(options.body);
    const { fields } = JSON.parse(request.input);
    assert.equal(fields.birthInfo, 'Hangzhou');
    assert.ok(!request.input.includes('2002-03-'));
    return { ok: true, json: async () => ({ status: 'completed', output: [{ content: [{ type: 'output_text', text: JSON.stringify({ ...fields, birthInfo: 'Es tut mir leid.' }) }] }] }) };
  } });
  for (const day of ['18', '19']) {
    const result = await service.generate({ toolKey: 'cv', language: 'de', documentTranslationConsent: true, form: { latinName: 'Test Applicant', birthDate: `2002-03-${day}`, birthPlace: '杭州' } }, 'test');
    assert.ok(result.draft.includes(`${day}.03.2002, Hangzhou`));
    assert.ok(!result.draft.includes('Es tut mir leid'));
  }
  assert.equal(calls, 2);
});
