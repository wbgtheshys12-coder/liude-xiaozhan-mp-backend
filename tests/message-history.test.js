const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

test('local chat clearing survives reload, is account scoped, and allows new messages', () => {
  const storage = new Map();
  let account = 'a';
  const load = () => {
    const context = { module:{exports:{}}, Date,
      require: () => ({scopedKey: key => `${key}_${account}`}),
      wx:{getStorageSync:key=>storage.get(key), setStorageSync:(key,value)=>storage.set(key,value)} };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../miniprogram/utils/message-history.js'),'utf8'), context);
    return context.module.exports;
  };
  const old = {id:'old',createdAt:'2020-01-01T00:00:00Z'};
  assert.equal(load().visible([old]).length,1);
  const cutoff = load().clear();
  const fresh = {id:'new',createdAt:new Date(cutoff+1000).toISOString()};
  assert.equal(load().visible([old,fresh]).length,1);
  assert.equal(load().visible([old,fresh])[0].id,'new');
  account = 'b';
  assert.equal(load().visible([old,fresh]).length,2);
  account = 'a';
  assert.equal(load().visible([old]).length,0);
});
