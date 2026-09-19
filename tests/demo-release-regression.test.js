const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
test('electrical engineering recommendations do not repeat a programme with degree suffix',async()=>{
  const result=await require('../local-engine').createRecommendation({school:'南京农业大学',major:'农业电气化',targetDegree:'硕士',targetField:'电气工程',gpa:'82.4',recommendationCount:6,courses:'线性代数 88，计算机网络 91，模拟电子技术 70，数字电子技术 80'});
  assert.equal(result.recommendations.length,6);
  const keys=result.recommendations.map(r=>(r.university+'|'+r.program.replace(/\s*[,(-]?\s*(?:Master of Science|M\.?\s?Sc\.?)\s*\)?\s*$/i,'')).toLowerCase());
  assert.equal(new Set(keys).size,keys.length);
});
function page(file,modules={}) {
  let result;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../miniprogram/pages',file),'utf8'),{
    require:name=>modules[name]||{},Page:p=>{result=p},Date,console,
    getApp:()=>({globalData:{token:'test'}}),setInterval:()=>1,clearInterval(){},
    wx:{showModal:o=>o.success({confirm:true}),nextTick:f=>f(),showToast(){}}
  });
  result.setData=values=>{for(const [key,v] of Object.entries(values)){const parts=key.split('.');if(parts.length===2)result.data[parts[0]][parts[1]]=v;else result.data[key]=v;}};
  return result;
}
test('optional courses do not block next step',()=>{
  const p=page('advisor/advisor.js');p.data.currentStep=3;p.data.transcriptReviewed=false;p.nextStep();assert.equal(p.data.currentStep,4);
});
test('late OCR cannot restore deleted transcript or overwrite manually entered GPA',async()=>{
  let resolve;
  const p=page('advisor/advisor.js',{'../../utils/api':{previewTranscript:()=>new Promise(r=>resolve=r)},'../../utils/progress':{reset(){},finish(){}}});
  p.data.files=[{name:'sample.pdf'}];p.data.profile.gpa='82.19';
  let pending=p.previewTranscriptRows(p.data.files,[]);
  resolve({rows:[{course:'电路理论',grade:'77',credits:'4'}],transcriptSummary:{extractedScoreText:'2.92/4.0'}});await pending;
  assert.equal(p.data.profile.gpa,'82.19');
  pending=p.previewTranscriptRows(p.data.files,[]);
  p.removeFile({currentTarget:{dataset:{index:0}}});
  resolve({rows:[{course:'电路理论',grade:'77',credits:'4'}],transcriptSummary:{}});await pending;
  assert.equal(p.data.transcriptRows.length,0);assert.equal(p.data.files.length,0);
});
test('empty OCR rows stay empty instead of submitting placeholder courses',async()=>{
  const p=page('advisor/advisor.js',{'../../utils/api':{previewTranscript:async()=>({rows:[{course:'待校对课程',note:'补充课程'}],recognizedCourseCount:0})},'../../utils/progress':{finish(){}}});
  await p.previewTranscriptRows([], [{course:'待补充课程'}]);assert.equal(p.data.transcriptRows.length,0);assert.equal(p.data.message,'');
});
test('course feedback draft survives opening the chat page',()=>{
  const p=page('messages/messages.js',{'../../utils/profile':{normalize:x=>x},'../../utils/message-history':{clearedBefore:()=>0}});
  p.loadMessages=()=>Promise.resolve();p.onLoad({course:'T1'});p.onShow();assert.match(p.data.content,/课程反馈：T1/);
  p.data.content='尚未发送的问题';p.onHide();p.onShow();assert.equal(p.data.content,'尚未发送的问题');
});
