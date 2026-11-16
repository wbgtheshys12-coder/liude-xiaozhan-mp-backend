const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'liude-services-'));
Object.assign(process.env,{PORT:'0',MP_DATA_DIR:dir,MP_COS_ENABLED:'false',MP_ALLOW_DEV_LOGIN:'true',MP_OPEN_LOGIN:'true',MP_DEV_OPENID:'service-test-a',MP_ADMIN_WEB_TOKEN:'fictional-service-admin',MP_PAYMENT_ENABLED:'false',MP_SERVICE_CHECKOUT_ENABLED:'false',MP_BOOKING_NOTIFY_ENABLED:'false'});
const server=require('../server');let base,token;
async function call(route,key,body){const res=await fetch(base+route,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(key?{Authorization:`Bearer ${key}`}:{})},body:body?JSON.stringify(body):undefined});return {status:res.status,data:await res.json()};}
test.before(async()=>{if(!server.listening)await new Promise(r=>server.once('listening',r));base='http://127.0.0.1:'+server.address().port;token=(await call('/api/mp/user/login','',{code:'fake'})).data.token;});
test('service endpoints keep payment closed, enforce roles, ignore client amount and cannot fake payment',async()=>{
  assert.equal((await call('/api/mp/service-orders')).status,401);
  assert.equal((await call('/api/mp/admin/service-orders',token)).status,403);
  const catalog=(await call('/api/mp/services/catalog')).data;assert.equal(catalog.enabled,false);
  const result=await call('/api/mp/service-orders',token,{productId:'cv_review',clientRequestId:'service-http-001',termsVersion:catalog.termsVersion,acceptedTerms:true,shareWithTeacher:true,amountFen:1,snapshot:{name:'测试同学'}});
  assert.equal(result.status,200);assert.equal(result.data.order.amountFen,19900);
  const order=result.data.order;
  assert.equal((await call('/api/mp/service-orders/checkout',token,{id:order.id})).status,503);
  assert.equal((await call('/api/mp/admin/service-orders','fictional-service-admin',{id:order.id,revision:1,status:'PAID',note:'假付款'})).status,409);
  assert.equal((await call('/api/mp/admin/service-orders','fictional-service-admin')).data.records.length,1);
});
test.after(async()=>{await new Promise(r=>server.close(r));fs.rmSync(dir,{recursive:true,force:true});});
