const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function setup(){
 const storage={},app={globalData:{}};
 const wx={getStorageSync:k=>storage[k],setStorageSync:(k,v)=>storage[k]=v};
 const env={STORAGE_KEYS:{session:'session',latestProfile:'profile'},scopedKey:k=>k+'_'+(storage.session?.user?.storageKey||'anonymous')};
 const module={exports:{}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../miniprogram/utils/profile.js'),'utf8'),{require:()=>env,module,wx,getApp:()=>app});
 return {p:module.exports,storage,app};
}
test('unsent edits are reused and delayed server responses do not overwrite them',()=>{
 const {p,storage}=setup();storage.session={user:{storageKey:'a'}};
 p.store({name:'Old',school:'School'});p.saveLocal({name:'New',major:'Engineering',targetDegree:'硕士'});
 p.store({name:'Old'});
 assert.equal(p.getStored().name,'New');assert.equal(p.getStored().major,'Engineering');assert.equal(p.getStored().applicationLevel,'硕士');
});
test('clearing a personal field is retained and profiles remain account scoped',()=>{
 const {p,storage}=setup();storage.session={user:{storageKey:'a'}};
 p.store({name:'A',phone:'123456789',contact:'123456789'});p.saveLocal({phone:''});
 assert.equal(p.getStored().phone,'');assert.equal(p.getStored().contact,'');
 storage.session={user:{storageKey:'b'}};assert.equal(p.getStored().name,'');
 p.saveLocal({name:'B'});storage.session={user:{storageKey:'a'}};assert.equal(p.getStored().name,'A');
 storage.session={};p.saveLocal({name:'Guest'});assert.equal(p.getStored().name,'');
});
