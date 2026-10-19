'use strict';
const $=id=>document.getElementById(id);
let page=1,requestId=0,totalPages=0;
function token(){return sessionStorage.getItem('liude_admin_token')||'';}
function requireLogin(){if(window.top===window)location.replace('/admin#catalog');else window.parent.postMessage({type:'catalog-auth-required'},location.origin);}
function node(tag,text){const element=document.createElement(tag);if(text)element.textContent=text;return element;}
function text(value){return Array.isArray(value)?value.join('；'):String(value||'').replace(/\[([^\]]+)\]\([^)]*\)/g,'$1').replace(/[*#_]/g,'').trim();}
function section(parent,title,value){if(!text(value))return;parent.append(node('h3',title),node('pre',text(value)));}
function render(record){
  const card=node('article');const title=record.title||record.name;card.append(node('h2',title));
  const meta=node('p',[record.schoolName||record.englishName,record.degree,record.city].filter(Boolean).join(' · '));meta.className='meta';card.append(meta);
  card.append(node('p',text(record.overview||record.summary)||'暂无详细介绍，请查看来源。'));
  const detail=node('details');detail.append(node('summary','展开申请要求与完整资料'));
  for(const [label,key] of [['学校德文名称','germanName'],['学制','duration'],['学分','ects'],['授课语言','languageOfInstruction'],['申请要求','prerequisites'],['语言要求','languageRequirements'],['申请时间','applicationPeriod'],['申请截止日期','applicationDeadline'],['申请说明','applicationInfo'],['职业方向','careerInfo'],['学校申请说明','application'],['学校语言说明','language'],['材料建议','materialTips'],['优势方向','strengths'],['学费原始标记','tuitionRaw'],['学费说明','tuitionNotice']])section(detail,label,record[key]);
  const sources=record.sourceUrls||[record.website].filter(Boolean);
  if(sources.length){detail.append(node('h3','资料来源（可能为采集快照，请继续核对当期官网）'));for(const url of sources){try{if(new URL(url).protocol!=='https:')continue;}catch{continue;}const a=node('a',url);a.href=url;a.target='_blank';a.rel='noopener noreferrer';detail.append(a,node('br'));}}
  const copy=node('button','复制此条资料');copy.className='copy';copy.type='button';copy.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(JSON.stringify(record,null,2));copy.textContent='已复制';}catch{copy.textContent='复制失败，请手动选中文字复制';}});detail.append(copy);card.append(detail);return card;
}
async function load(){
  const id=++requestId;const kind=$('kind').value;const params=new URLSearchParams({q:$('query').value.trim(),page:String(page),pageSize:'20'});
  if(kind==='programs'){if($('degree').value)params.set('degree',$('degree').value);if($('language').value)params.set('language',$('language').value);}
  $('degree').disabled=kind==='schools';$('language').disabled=kind==='schools';$('status').textContent='正在查询…';$('results').replaceChildren();$('previous').disabled=true;$('next').disabled=true;
  try{if(!token()){requireLogin();return;}const response=await fetch(`/api/catalog/v1/${kind}?${params}`,{headers:{Authorization:`Bearer ${token()}`},cache:'no-store'});if(response.status===401){requireLogin();return;}const result=await response.json();if(id!==requestId)return;if(!response.ok)throw new Error(result.error||'查询失败');totalPages=result.totalPages;$('status').textContent=`共 ${result.total} 条 · 数据版本 ${result.datasetVersion}（版本不代表资料已实时更新）`;$('results').replaceChildren(...result.records.map(render));if(!result.records.length)$('results').append(node('p','没有找到对应记录，请尝试英文专业名称或其他关键词。'));$('page').textContent=`第 ${page} 页 / 共 ${totalPages} 页`;$('previous').disabled=page<=1;$('next').disabled=page>=totalPages;}catch(error){if(id===requestId)$('status').textContent=`${error.message}，请稍后重试。`;}
}
$('search').addEventListener('submit',event=>{event.preventDefault();page=1;load();});$('kind').addEventListener('change',()=>{page=1;load();});$('previous').addEventListener('click',()=>{if(page>1){page--;load();}});$('next').addEventListener('click',()=>{if(page<totalPages){page++;load();}});load();
