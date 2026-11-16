const test=require('node:test'),assert=require('node:assert/strict');
const {createServiceOrders,TERMS_VERSION}=require('../service-orders');
let records=[];const service=createServiceOrders({file:'test',read:()=>structuredClone(records),write:(_,r)=>{records=structuredClone(r);return true;}});
const body={productId:'motivation_review',clientRequestId:'unique-request-001',termsVersion:TERMS_VERSION,acceptedTerms:true,shareWithTeacher:true,snapshot:{name:'虚构同学',note:'目标高校要求待核对'}};
test('catalog is disabled by default and does not promise admissions',()=>{assert.equal(service.catalog().enabled,false);assert.match(service.catalog().disclaimer,/不承诺/);assert.equal(service.catalog().plans.length,3);});
test('consent required, fixed server prices, idempotent and owner isolated',()=>{
  assert.throws(()=>service.create('a',{...body,acceptedTerms:false}));
  assert.throws(()=>service.create('a',{...body,termsVersion:'old'}));
  const order=service.create('a',{...body,amountFen:1});assert.equal(order.amountFen,58800);
  assert.equal(service.create('a',body).id,order.id);assert.equal(service.list('b').length,0);assert.throws(()=>service.owned('b',order.id));
});
test('only trusted payment adapter may mark paid, amount checked, repeated notification safe',()=>{
  const order=service.list('a')[0];
  assert.throws(()=>service.update('a',order.id,{revision:1,status:'PAID'},true));
  assert.throws(()=>service.paid({id:order.id,productId:order.productId,amountFen:1,paymentId:'pay1'}));
  service.paid({id:order.id,productId:order.productId,amountFen:58800,paymentId:'pay1'});
  service.paid({id:order.id,productId:order.productId,amountFen:58800,paymentId:'pay1'});
  assert.equal(service.list('a')[0].revision,2);
  assert.throws(()=>service.paid({id:order.id,productId:order.productId,amountFen:58800,paymentId:'pay2'}));
});
test('teacher review, supplementary input and delivery follow revision-checked transitions',()=>{
  const id=service.list('a')[0].id;
  assert.throws(()=>service.update('a',id,{revision:1,status:'REVIEWING',note:'开始'},true));
  service.update('staff',id,{revision:2,status:'REVIEWING',note:'核对高校要求'},true);
  service.update('staff',id,{revision:3,status:'NEEDS_INFO',note:'请确认毕业时间'},true);
  service.update('a',id,{revision:4,snapshot:{note:'已确认'}},false);
  service.update('staff',id,{revision:5,status:'DELIVERED',note:'已完成人工核对'},true);
  assert.equal(service.list('a')[0].status,'DELIVERED');
  assert.throws(()=>service.update('a',id,{revision:6,snapshot:{}},false));
});
test('failed persistence never reports a successfully created order',()=>{
  const broken=createServiceOrders({file:'',read:()=>[],write:()=>false});assert.throws(()=>broken.create('a',body),/保存失败/);
});
