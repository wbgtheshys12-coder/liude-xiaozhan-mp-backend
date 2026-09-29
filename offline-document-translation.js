"use strict";
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { createFactualDraft } = require('./factual-drafts');
const FIELDS = 'name latinName currentCity citizenship birthInfo schoolMajor targetProgram germanyOrigin germanyMajorUnderstanding germanEducationUnderstanding interestedDirections relevantCourses projectsInternships furtherStudyPlan careerPlan education schooling exchange tests professionalExperience researchProjects publications honors activities skills gapExplanation'.split(' ');
const fail = (message, statusCode=503) => Object.assign(new Error(message),{statusCode});
function createOfflineTranslator({env=process.env, spawnImpl=spawn}={}) {
  let busy=false; const cache=new Map();
  async function generate(body,owner) {
    if (!owner) throw fail('请先登录。',401);
    if (body.documentTranslationConsent!==true || body.translationProvider!=='offline') throw fail('请更新小程序并确认本地模型翻译授权。',400);
    if (!['motivation','cv'].includes(body.toolKey)||!['de','en'].includes(body.language)) throw fail('请选择文书类型和目标语言。',400);
    const modelDir=env.MP_OFFLINE_MODEL_DIR||path.join(__dirname,'.offline-models');
    if (!fs.existsSync(path.join(modelDir,'zh-en'))) throw fail('免费翻译模型尚未部署，请联系管理员。');
    const source={};
    for(const key of FIELDS){ const value=String(body.form?.[key]||'').trim(); if(value.length>5000) throw fail('单项内容超过5000字。',400); if(value) source[key]=value; }
    if(!Object.keys(source).length||JSON.stringify(source).length>20000) throw fail('请检查文书内容长度。',400);
    const cacheKey=require('crypto').createHash('sha256').update(JSON.stringify([owner,body.toolKey,body.language,body.form])).digest('hex');
    for(const [k,v] of cache) if(v.expires<Date.now()) cache.delete(k);
    if(cache.has(cacheKey)) return cache.get(cacheKey).result;
    if(busy) throw fail('免费翻译正在处理另一份文书，请稍后重试；填写内容已保留。',429);
    busy=true;
    try {
      const translated=await new Promise((resolve,reject)=>{
        const child=spawnImpl(env.MP_OFFLINE_PYTHON||'python3',[path.join(__dirname,'scripts/offline_translate.py')],{env:{...env,MP_OFFLINE_MODEL_DIR:modelDir,PYTHONPATH:env.MP_OFFLINE_PYTHONPATH||path.join(__dirname,'.offline-deps'),OMP_NUM_THREADS:'1',CT2_PACKED_GEMM:'0',PYTHONIOENCODING:'utf-8'},windowsHide:true,stdio:['pipe','pipe','pipe']});
        let output='', tooLarge=false;
        const timer=setTimeout(()=>{child.kill();reject(fail('免费翻译超时，请缩短较长段落后重试。'));},110000);
        child.stdout.on('data',chunk=>{output+=chunk; if(output.length>200000){tooLarge=true;child.kill();}});
        child.stderr.on('data',()=>{});
        child.on('error',()=>{clearTimeout(timer);reject(fail('免费翻译运行环境不可用。'));});
        child.on('close',code=>{clearTimeout(timer); if(code!==0||tooLarge) return reject(fail('翻译暂未完成，请稍后重试或联系老师；填写内容已保留。'));try{resolve(JSON.parse(output));}catch{reject(fail('翻译输出格式异常。'));}});
        child.stdin.on('error',()=>{});
        child.stdin.end(JSON.stringify({language:body.language,fields:source}));
      });
      for(const key of Object.keys(source)) if(typeof translated[key]!=='string'||!translated[key].trim()||/[\u3400-\u9fff]/.test(translated[key])) throw fail('译文不完整，请老师核对。');
      const factual=createFactualDraft({...translated,email:body.form.email,phone:body.form.phone},body.language,body.toolKey,new Date().toISOString().slice(0,10),{translated:true});
      const result={ok:true,draft:factual.draft,source:'offline-mt-template-v1',language:body.language,toolKey:body.toolKey,foreignLanguageReady:true,translationComplete:true,teacherReviewRequired:true,sourceReview:Object.keys(source).map(key=>({key,original:source[key],translation:translated[key]})),reviewMessage:'免费机器翻译＋固定模板初稿，尚未经老师核对。专业术语、语法、日期、成绩及所有经历必须逐项核对，不可直接递交。'};
      if(cache.size>=20) cache.delete(cache.keys().next().value);
      cache.set(cacheKey,{expires:Date.now()+1800000,result}); return result;
    } finally {busy=false;}
  }
  return {generate};
}
module.exports={createOfflineTranslator};
