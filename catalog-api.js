"use strict";
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const NOTICE = '仅供申请资料检索，不是实时招生公告。项目条件、授课语言、学费及截止日期请逐项核对学校当期官网；缺失字段不代表没有要求。';
const TERMS = { '电气': 'electrical', '电子': 'electronic electronics', '计算机': 'computer informatics', '数据': 'data', '机械': 'mechanical', '自动化': 'automation control', '通信': 'communication', '工程': 'engineering', '商科': 'business', '管理': 'management', '经济': 'economics', '金融': 'finance', '生物': 'biology biotechnology', '化学': 'chemistry', '医学': 'medicine medical', '数学': 'mathematics', '物理': 'physics', '能源': 'energy', '环境': 'environmental', '建筑': 'architecture', '土木': 'civil', '心理': 'psychology', '纺织': 'textile', '时尚': 'fashion' };
Object.assign(TERMS, {'信息':'information informatics','科学':'science','硕士':'master msc','本科':'bachelor bsc'});
const norm = value => String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9\u3400-\u9fff]+/g, ' ').trim();
const plain = value => String(value || '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[*#_]/g, '').trim();
const take = (object, keys) => Object.fromEntries(keys.map(key => [key, object[key] ?? '']));
function createCatalogRoutes({ getPrograms, getSchools, sendJson }) {
  // Only existing public data is projected here. No sessions, uploads or admin data.
  const schools = getSchools().map(s => take(s, ['id','name','englishName','germanName','city','state','type','website','summary','strengths','application','language','materialTips']));
  const names = new Map();
  for (const s of schools) for (const name of [s.name,s.englishName,s.germanName]) if (name) names.set(norm(name),s);
  const aliases = { 'tu berlin':'tu-berlin', 'tu darmstadt':'tu-darmstadt', 'tu dresden':'tu-dresden' };
  const programs = getPrograms().map(p => {
    const school = names.get(norm(p.university)) || schools.find(s => s.id === aliases[norm(p.university)]);
    return { ...take(p,['id','university','title','overview','prerequisites','applicationPeriod','applicationDeadline','degree','city','keywords','domains','sourceUrls','duration','ects','languageOfInstruction','languageRequirements','applicationInfo','careerInfo','tuitionRaw']), schoolId:school?.id || '', schoolName:school?.name || p.university, tuitionNotice:'原始学费标记不等于免费；具体学费及学期杂费以学校当期公告为准。' };
  });
  const version = crypto.createHash('sha256').update(JSON.stringify([schools,programs])).digest('hex').slice(0,16);
  const searchText = item => {
    let text = norm(Object.values(item).flat().map(v=>typeof v === 'string'?plain(v):'').join(' '));
    for (const [cn,en] of Object.entries(TERMS)) if(en.split(' ').some(word=>text.split(' ').includes(word))) text += ` ${cn}`;
    return text;
  };
  const indexed = new Map([...schools,...programs].map(item=>[item,searchText(item)]));
  function integer(params,key,fallback,max) {
    const raw=params.get(key);
    if(raw===null)return fallback;
    if(!/^[1-9]\d{0,6}$/.test(raw)||Number(raw)>max)throw Object.assign(new Error(`${key} 必须是 1 至 ${max} 的整数。`),{statusCode:400});
    return Number(raw);
  }
  return async function catalogRoutes(req,res,url) {
    const base='/api/catalog/v1';
    if(url.pathname==='/database' || url.pathname==='/database/') {
      if(req.method!=='GET'){sendJson(res,405,{error:'只支持 GET。'},{Allow:'GET'});return true;}
      res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'",'X-Content-Type-Options':'nosniff'});
      res.end(fs.readFileSync(path.join(__dirname,'catalog-web/index.html')));return true;
    }
    if(['/database/app.js','/database/style.css'].includes(url.pathname)) {
      if(req.method!=='GET'){sendJson(res,405,{error:'只支持 GET。'},{Allow:'GET'});return true;}
      const file=url.pathname.endsWith('app.js')?'app.js':'style.css';
      res.writeHead(200,{'Content-Type':file.endsWith('.js')?'text/javascript; charset=utf-8':'text/css; charset=utf-8','X-Content-Type-Options':'nosniff'});
      res.end(fs.readFileSync(path.join(__dirname,'catalog-web',file)));return true;
    }
    if(url.pathname!==base && !url.pathname.startsWith(`${base}/`))return false;
    try {
      if(req.method!=='GET') {sendJson(res,405,{error:'只读接口仅支持 GET，不支持新增、修改或删除。'},{Allow:'GET'});return true;}
      const tail=url.pathname.slice(base.length);
      const common={ok:true,apiVersion:'v1',datasetVersion:version,notice:NOTICE};
      if(tail===''||tail==='/') {sendJson(res,200,{...common,counts:{schools:schools.length,programs:programs.length},endpoints:['/api/catalog/v1/schools','/api/catalog/v1/schools/{id}','/api/catalog/v1/programs','/api/catalog/v1/programs/{id}'],authentication:'none-public-readonly',documentation:'/database'});return true;}
      const match=tail.match(/^\/(schools|programs)(?:\/([^/]+))?$/);
      if(!match)throw Object.assign(new Error('接口不存在。'),{statusCode:404});
      const type=match[1],all=type==='schools'?schools:programs;
      if(match[2]){
        let id;try{id=decodeURIComponent(match[2]);}catch{throw Object.assign(new Error('无效的记录编号。'),{statusCode:400});}
        const record=all.find(item=>item.id===id);
        if(!record)throw Object.assign(new Error('记录不存在。'),{statusCode:404});
        sendJson(res,200,{...common,record});return true;
      }
      const params=url.searchParams,page=integer(params,'page',1,1000000),pageSize=integer(params,'pageSize',20,100);
      const q=params.get('q')||'';if(q.length>200)throw Object.assign(new Error('搜索词最多200个字符。'),{statusCode:400});
      let tokenized=norm(q);
      for(const term of Object.keys(TERMS))tokenized=tokenized.replaceAll(term,` ${term} `);
      const terms=tokenized.split(/\s+/).filter(Boolean);
      const records=all.filter(item=>terms.every(term=>indexed.get(item).includes(term)))
        .filter(item=>!params.get('schoolId')||(type==='schools'?item.id:item.schoolId)===params.get('schoolId'))
        .filter(item=>!params.get('city')||norm(item.city).includes(norm(params.get('city'))))
        .filter(item=>!params.get('degree')||norm(item.degree)===norm(params.get('degree')))
        .filter(item=>!params.get('language')||(item.languageOfInstruction||[]).some(lang=>norm(lang)===norm(params.get('language'))))
        .sort((a,b)=>String(a.id).localeCompare(String(b.id),'en'));
      sendJson(res,200,{...common,total:records.length,page,pageSize,totalPages:Math.ceil(records.length/pageSize),records:records.slice((page-1)*pageSize,page*pageSize)});
    }catch(error){sendJson(res,error.statusCode||500,{ok:false,error:error.statusCode?error.message:'资料查询暂不可用。'});}
    return true;
  };
}
module.exports={createCatalogRoutes};
