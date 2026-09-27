const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const experience=require('../miniprogram/utils/experience');
test('CV uses shared structured rows without duplicate text fields and clears removed rows',()=>{
  let page;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../miniprogram/pages/tools/tools.js'),'utf8'),{
    require:n=>n.includes('experience')?{...experience,save(){}}:{},Page:p=>page=p,console,getApp:()=>({globalData:{}})
  });
  page.setData=v=>Object.assign(page.data,v);
  page.persistCurrent=()=>{};
  const data={education:[{name:'Example University',start:'2020-09',end:'2024-06',major:'Engineering'}]};
  page.data.experienceData=data;
  const cv=page.data.tools.find(t=>t.key==='cv');
  page.refresh(cv,{...experience.toForm(data),latinName:'Demo'},'');
  assert.ok(!page.data.visibleSections.flatMap(s=>s.fields).some(f=>f.key==='education'));
  assert.ok(page.data.form.education.includes('Example University'));
  page.applyExperience({detail:{value:{education:[]}}});
  assert.equal(page.data.form.education,'');
});
test('matching removes duplicate thesis entry and motivation suppresses duplicate source list',()=>{
  const read=p=>fs.readFileSync(path.join(__dirname,'../miniprogram',p),'utf8');
  assert.doesNotMatch(read('pages/advisor/advisor.wxml'),/data-field="thesisTopic"/);
  assert.doesNotMatch(read('utils/experience.js'),/中小学经历（单独填写）/);
  assert.match(read('pages/tools/tools.wxml'),/activeTool.key != 'motivation' && sourceReview.length/);
});
