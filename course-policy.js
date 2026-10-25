'use strict';
const MODES=['public','members','assigned'];
function mode(course={}){
  if(MODES.includes(course.accessMode))return course.accessMode;
  if((course.allowedStorageKeys||[]).filter(Boolean).length)return 'assigned';
  return course.free===true?'public':'members';
}
function canView(course,key,guest=false){
  if(course.status!=='published')return false;
  const access=mode(course);
  if(access==='public')return true;
  if(guest||!key)return false;
  return access==='members'||(course.allowedStorageKeys||[]).includes(key);
}
function normalize(body,existing={}){
  const error=message=>Object.assign(new Error(message),{statusCode:400});
  if(body.accessMode!==undefined&&!MODES.includes(body.accessMode))throw error('请选择有效的课程观看范围。');
  const raw=body.allowedStorageKeys===undefined?existing.allowedStorageKeys||[]:body.allowedStorageKeys;
  if(!Array.isArray(raw)||raw.length>500||raw.some(key=>typeof key!=='string'||key.length>100||/[\s<>]/.test(key)))throw error('学员名单格式不正确，每门课程最多授权500个账号。');
  let keys=[...new Set(raw.map(key=>key.trim()).filter(Boolean))];
  const access=body.accessMode||((body.free===true)?'public':keys.length?'assigned':existing.accessMode||'members');
  if(access==='public'&&keys.length)throw error('公开课不能同时限定学生，请选择仅指定学生可见或清空名单。');
  if(access==='members'&&keys.length)throw error('全部登录学生可见不能同时限定名单，请清空名单或选择仅指定学生可见。');
  if(access==='assigned'&&(body.status||existing.status)==='published'&&!keys.length)throw error('指定学生课程至少选择一位学生后才能发布；暂未选学生可先保存为草稿。');
  const category=String(body.category===undefined?existing.category||'':body.category).trim();
  if(category.length>40||/[<>\r\n]/.test(category))throw error('课程分类最多40个字符，不能包含换行或尖括号。');
  return {accessMode:access,free:access==='public',allowedStorageKeys:keys,category:category||'未分类'};
}
module.exports={mode,canView,normalize};
