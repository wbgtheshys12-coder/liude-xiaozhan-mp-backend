'use strict';
const crypto = require('crypto');
const TERMS_VERSION = '2026-11-16-v1';
const DISCLAIMER = '请以目标德国高校当期官网、文书格式及申请要求为准。推荐不是录取概率，不承诺录取或签证结果。文书仅使用学生真实资料，译稿和初稿须由老师核对后使用。';
const PLANS = [
  {id:'recommendation_10',title:'院校专业扩展推荐',amountFen:19900,scope:'单次最多10所；前2所免费，扩展推荐按单收费。',review:false},
  {id:'motivation_review',title:'动机信完整稿与老师核对',amountFen:58800,scope:'一段免费预览；一篇完整初稿及老师核对，逐段编辑不重复收费。价格及范围待确认。',review:true},
  {id:'cv_review',title:'留德简历与老师核对',amountFen:19900,scope:'一份简历初稿及老师核对；核对教育和经历时间线，不编造经历或空档。',review:true}
];
function createServiceOrders({read,write,file,enabled=()=>false}) {
  const fail=(message,statusCode=400)=>{throw Object.assign(new Error(message),{statusCode});};
  const all=()=>read(file);
  const save=records=>{if(!write(file,records))fail('订单保存失败，请稍后重试。',503);};
  const find=id=>all().find(o=>o.id===id);
  function create(owner,body) {
    const plan=PLANS.find(p=>p.id===body.productId);if(!plan)fail('服务项目不存在。');
    if(body.termsVersion!==TERMS_VERSION||body.acceptedTerms!==true||body.shareWithTeacher!==true)fail('请阅读服务范围、免责声明并同意向文书老师提供本单资料。');
    const key=String(body.clientRequestId||'');if(!/^[\w-]{8,80}$/.test(key))fail('请求标识无效。');
    const records=all(),existing=records.find(o=>o.owner===owner&&o.clientRequestId===key);
    if(existing){if(existing.productId!==plan.id)fail('请求标识已用于其他服务。',409);return existing;}
    const snapshot=body.snapshot;if(!snapshot||typeof snapshot!=='object'||Array.isArray(snapshot)||Buffer.byteLength(JSON.stringify(snapshot))>64000)fail('本单资料格式错误或超过64KB。');
    const order={id:'svc_'+crypto.randomUUID(),owner,clientRequestId:key,productId:plan.id,title:plan.title,amountFen:plan.amountFen,scope:plan.scope,termsVersion:TERMS_VERSION,status:'AWAITING_PAYMENT',snapshot,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),revision:1};
    save([...records,order]);return order;
  }
  function owned(owner,id){const order=find(id);if(!order||order.owner!==owner)fail('未找到当前账号的服务订单。',404);return order;}
  function paid({id,productId,amountFen,paymentId}) {
    const records=all(),order=records.find(o=>o.id===id);if(!order)fail('服务订单不存在。',404);
    if(order.productId!==productId||order.amountFen!==amountFen||!paymentId)fail('支付订单与服务订单不一致。',409);
    if(order.paymentId){if(order.paymentId!==paymentId)fail('重复支付请人工核查退款。',409);return order;}
    order.paymentId=paymentId;order.status='PAID';order.revision++;order.updatedAt=new Date().toISOString();save(records);return order;
  }
  function update(owner,id,body,admin=false){
    const records=all(),order=records.find(o=>o.id===id);if(!order||(!admin&&order.owner!==owner))fail('订单不存在。',404);
    if(body.revision!==order.revision)fail('订单已被更新，请刷新后重试。',409);
    if(admin){
      const allowed={PAID:['REVIEWING','REFUND_REQUESTED'],REVIEWING:['NEEDS_INFO','DELIVERED','REFUND_REQUESTED'],NEEDS_INFO:['REVIEWING','REFUND_REQUESTED'],DELIVERED:['REVIEWING','REFUND_REQUESTED']};
      if(!(allowed[order.status]||[]).includes(body.status))fail('不能执行该订单状态变更。',409);
      const note=String(body.note||'').trim();if(!note||note.length>4000)fail('请填写4000字以内处理说明。');
      order.status=body.status;order.teacherNote=note;
    }else{
      if(!['AWAITING_PAYMENT','NEEDS_INFO'].includes(order.status))fail('当前状态不可修改，联系老师退回补充资料。',409);
      if(!body.snapshot||typeof body.snapshot!=='object'||Array.isArray(body.snapshot)||Buffer.byteLength(JSON.stringify(body.snapshot))>64000)fail('资料格式错误。');
      order.snapshot=body.snapshot;if(order.status==='NEEDS_INFO')order.status='REVIEWING';
    }
    order.revision++;order.updatedAt=new Date().toISOString();save(records);return order;
  }
  function catalog(){return {ok:true,enabled:enabled(),termsVersion:TERMS_VERSION,disclaimer:DISCLAIMER,plans:PLANS.map(p=>({...p,priceText:`¥${(p.amountFen/100).toFixed(2)}`})),notice:'收费方案准备中，不会自动扣款。企业支付宝账号不等于微信小程序支付能力；资料齐备及验收后才开放收款。'};}
  return {create,owned,paid,update,catalog,list:owner=>all().filter(o=>owner===undefined||o.owner===owner),file};
}
module.exports={createServiceOrders,PLANS,TERMS_VERSION,DISCLAIMER};
