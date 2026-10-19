const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createCatalogAuthorization}=require('../catalog-api');
const secret='test-catalog-readonly-secret-32-chars';
test('dedicated catalog token is optional, constant-length checked and not an admin token',()=>{
  const auth=createCatalogAuthorization({env:{MP_CATALOG_WEB_TOKEN:secret},isAdmin:req=>req.headers?.authorization==='Bearer test-admin'});
  assert.equal(auth({headers:{authorization:`Bearer ${secret}`}}),'catalog');
  assert.equal(auth({headers:{authorization:'Bearer test-admin'}}),'admin');
  assert.equal(auth({headers:{authorization:'Bearer wrong'}}),false);
  assert.equal(auth({}),false);
  assert.equal(createCatalogAuthorization({env:{}})({headers:{authorization:`Bearer ${secret}`}}),false);
  assert.equal(createCatalogAuthorization({env:{MP_CATALOG_WEB_TOKEN:'short'}})({headers:{authorization:'Bearer short'}}),false);
});
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'liude-catalog-auth-'));
process.env.PORT='0';process.env.MP_DATA_DIR=dir;process.env.MP_ADMIN_WEB_TOKEN='test-admin-web-key-strong';process.env.MP_CATALOG_WEB_TOKEN=secret;
process.env.MP_ALLOW_DEV_LOGIN='false';
const server=require('../server');
async function request(route,token,method='GET'){
  if(!server.listening)await new Promise(resolve=>server.once('listening',resolve));
  return fetch(`http://127.0.0.1:${server.address().port}${route}`,{method,headers:token?{Authorization:`Bearer ${token}`}:{},redirect:'manual'});
}
test('live HTTP rejects anonymous access and limits staff token to catalog reads',async()=>{
  for(const route of ['/api/catalog/v1','/api/catalog/v1/schools','/api/catalog/v1/programs']){
    assert.equal((await request(route)).status,401);
    assert.equal((await request(route,'wrong')).status,401);
  }
  const staff=await request('/api/catalog/v1',secret);assert.equal(staff.status,200);assert.equal((await staff.json()).role,'catalog');assert.equal(staff.headers.get('cache-control'),'no-store');
  const admin=await request('/api/catalog/v1',process.env.MP_ADMIN_WEB_TOKEN);assert.equal((await admin.json()).role,'admin');
  const records=await (await request('/api/catalog/v1/programs?q=electrical',secret)).json();assert.ok(records.total>0);
  assert.equal((await request('/api/mp/admin/courses',secret)).status,401);
  assert.equal((await request('/api/mp/admin/uploads',secret)).status,401);
  assert.equal((await request('/api/catalog/v1/programs',secret,'POST')).status,405);
  const old=await request('/database');assert.equal(old.status,302);assert.equal(old.headers.get('location'),'/admin#catalog');
  const adminPage=await request('/admin');assert.match(adminPage.headers.get('content-security-policy'),/frame-src 'self' blob:/);
  assert.match(await adminPage.text(),/id="catalogFrame"/);
  const mini=await request('/api/mp/public/catalog');assert.equal(mini.status,200);
});
test.after(async()=>{await new Promise(resolve=>server.close(resolve));fs.rmSync(dir,{recursive:true,force:true});});
