"use strict";
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { createFactualDraft } = require('./factual-drafts');
const PERSONAL_FIELDS = 'name latinName currentCity citizenship birthInfo'.split(' ');
const MOTIVATION_FIELDS = 'schoolMajor targetProgram germanyOrigin germanyMajorUnderstanding germanEducationUnderstanding interestedDirections relevantCourses projectsInternships furtherStudyPlan careerPlan'.split(' ');
const CV_FIELDS = 'education schooling exchange tests professionalExperience researchProjects publications honors activities skills gapExplanation'.split(' ');
function sourceSentences(value) {
  return String(value || '').split(/(?<=[。！？])\s*|(?<=[.!?])\s+(?=[A-Z])/u).map(part => part.trim()).filter(Boolean);
}
function selectMotivationSource(key, value, pageLimit) {
  const sentences = sourceSentences(value);
  if (sentences.length < 2) return value;
  if (pageLimit === 1 && ['germanyMajorUnderstanding', 'germanEducationUnderstanding'].includes(key)) return '';
  if (key === 'interestedDirections' && pageLimit !== 1) {
    const detail = sentences.find((sentence, index) => index > 0 && /^(?:我希望|I (?:want|hope|plan)|Ich möchte).*(?:课程|学习|实验|实践|course|study|research)/i.test(sentence))
      || sentences.find((sentence, index) => index > 0 && /课程|实验|实践|course|research/i.test(sentence));
    return [sentences[0], detail].filter(Boolean).join(' ');
  }
  if (key === 'projectsInternships' && pageLimit !== 1) {
    const work = sentences.find((sentence, index) => index > 0 && /工作|实习|供应商|work|intern/i.test(sentence));
    return [sentences[0], work].filter(Boolean).join(' ');
  }
  if (key === 'relevantCourses' && /包括/.test(sentences[0])) {
    const match=sentences[0].match(/^(.*?包括)([^。；]+)/);
    if(match) {
      const courses=match[2].split('、').map(part=>part.trim()).filter(Boolean);
      if(courses.length>3) return `${match[1]}${courses.slice(0,3).join('、')}等课程。`;
    }
  }
  return sentences[0];
}
const fail = (message, statusCode=503) => Object.assign(new Error(message),{statusCode});
function createOfflineTranslator({env=process.env, spawnImpl=spawn}={}) {
  let busy=false; const cache=new Map();
  async function generate(body,owner) {
    if (!owner) throw fail('请先登录。',401);
    if (body.documentTranslationConsent!==true || body.translationProvider!=='offline') throw fail('请更新小程序并确认本地模型翻译授权。',400);
    if (!['motivation','cv'].includes(body.toolKey)||!['de','en'].includes(body.language)) throw fail('请选择文书类型和目标语言。',400);
    const modelDir=env.MP_OFFLINE_MODEL_DIR||path.join(__dirname,'.offline-models');
    if (!fs.existsSync(path.join(modelDir,'zh-en'))) throw fail('免费翻译模型尚未部署，请联系管理员。');
    const source={}, original={};
    const fields=[...PERSONAL_FIELDS,...(body.toolKey==='motivation'?MOTIVATION_FIELDS:CV_FIELDS)];
    for(const key of fields){
      const value=String(body.form?.[key]||'').trim();
      if(value.length>5000) throw fail('单项内容超过5000字。',400);
      if(value) original[key]=value;
      const selected=body.toolKey==='motivation' && !['schoolMajor','targetProgram'].includes(key)
        ? selectMotivationSource(key,value,Number(body.form?.pageLimit)===1?1:2) : value;
      if(selected) source[key]=selected;
    }
    if(body.toolKey==='motivation') {
      const budget=Number(body.form?.pageLimit)===1?380:560;
      const selectedLength=()=>Object.values(source).reduce((sum,value)=>sum+value.length,0);
      for(const key of ['germanEducationUnderstanding','germanyMajorUnderstanding']) {
        if(selectedLength()<=budget) break;
        delete source[key];
      }
    }
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
      const condensed=Object.keys(original).some(key=>original[key]!==source[key]);
      const result={ok:true,draft:factual.draft,source:'offline-mt-template-v1',language:body.language,toolKey:body.toolKey,foreignLanguageReady:true,translationComplete:true,teacherReviewRequired:true,sourceReview:Object.keys(source).map(key=>({key,original:original[key],selected:source[key],translation:translated[key]})),reviewMessage:condensed?'为符合所选页数，初稿只选用了部分原文句子；完整填写内容仍保留。机器译文未经老师核对，正式使用前请核对事实、术语、日期与取舍。':'免费机器翻译＋固定模板初稿，尚未经老师核对。专业术语、语法、日期、成绩及所有经历必须逐项核对，不可直接递交。'};
      if(cache.size>=20) cache.delete(cache.keys().next().value);
      cache.set(cacheKey,{expires:Date.now()+1800000,result}); return result;
    } finally {busy=false;}
  }
  return {generate};
}
module.exports={createOfflineTranslator,selectMotivationSource};
