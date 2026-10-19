const test=require('node:test');
const assert=require('node:assert/strict');
const {createCatalogRoutes}=require('../catalog-api');
const school={id:'tum',name:'慕尼黑工业大学',englishName:'Technical University of Munich',summary:'学校介绍',privateToken:'SECRET'};
const program={id:'electrical',university:'Technical University of Munich',title:'Electrical Engineering',degree:'Master',city:'Munich',overview:'<script>alert(1)</script>',languageOfInstruction:['english'],sourceUrls:['https://example.com/program'],studentFiles:['PRIVATE']};
function setup(authorize=()=> 'admin'){const route=createCatalogRoutes({authorize,getSchools:()=>[school],getPrograms:()=>[program,{...program,id:'mechanical',title:'Mechanical Engineering'}],sendJson:(res,status,body,headers)=>Object.assign(res,{status,body,headers})});return async(path,method='GET')=>{const res={writeHead(status,headers){this.status=status;this.headers=headers;},end(body){this.text=String(body);}};res.handled=await route({method},res,new URL(path,'https://example.com'));return res;};}
test('public catalog supports Chinese search, filters, detail and pagination',async()=>{
  const request=setup();
  const meta=await request('/api/catalog/v1');assert.deepEqual(meta.body.counts,{schools:1,programs:2});
  const chinese=await request('/api/catalog/v1/programs?q=电气工程&degree=Master&language=english&schoolId=tum');
  assert.equal(chinese.status,200);assert.equal(chinese.body.total,1);assert.equal(chinese.body.records[0].schoolName,'慕尼黑工业大学');
  const schools=await request('/api/catalog/v1/schools?q=慕尼黑');assert.equal(schools.body.total,1);
  assert.equal((await request('/api/catalog/v1/programs?city=Munich&pageSize=1&page=2')).body.records.length,1);
  assert.equal((await request('/api/catalog/v1/programs?q=nonexistent')).body.total,0);
  const detail=await request('/api/catalog/v1/programs/electrical');assert.equal(detail.body.record.id,'electrical');
  assert.ok(!JSON.stringify(detail.body).includes('PRIVATE'));assert.ok(!JSON.stringify(schools.body).includes('SECRET'));
  assert.equal(chinese.body.datasetVersion,detail.body.datasetVersion);
  assert.ok(detail.body.notice.includes('不是实时'));
});
test('invalid pages, unknown records and write methods are rejected',async()=>{
  const request=setup();
  for(const query of ['page=0','page=-1','page=NaN','pageSize=101','pageSize=Infinity','pageSize=2.5'])assert.equal((await request(`/api/catalog/v1/programs?${query}`)).status,400);
  assert.equal((await request('/api/catalog/v1/programs/missing')).status,404);
  assert.equal((await request('/api/catalog/v1/programs/%ZZ')).status,400);
  assert.equal((await request('/api/catalog/v1/students')).status,404);
  for(const method of ['POST','PUT','DELETE','PATCH'])assert.equal((await request('/api/catalog/v1/programs',method)).status,405);
  assert.equal((await request('/api/mp/admin/courses')).handled,false);
  assert.equal((await request('/api/catalog/v1/programs?q='+encodeURIComponent('a'.repeat(201)))).status,400);
});
test('query page is isolated and renders untrusted fields as text',async()=>{
  const request=setup();const old=await request('/database');assert.equal(old.status,302);assert.equal(old.headers.Location,'/admin#catalog');const page=await request('/admin/catalog');assert.equal(page.status,200);assert.match(page.text,/学校与专业资料库/);assert.match(page.headers['Content-Security-Policy'],/frame-ancestors 'self'/);
  const app=await request('/database/app.js');assert.ok(!app.text.includes('innerHTML'));assert.ok(app.text.includes('textContent'));assert.ok(app.text.includes('requestId'));
  assert.equal((await request('/database/style.css')).status,200);
  assert.equal((await request('/database','POST')).status,405);
  assert.equal((await request('/database/../../server.js')).handled,false);
  const admin=require('node:fs').readFileSync(require('node:path').join(__dirname,'../admin-web/index.html'),'utf8');
  assert.match(admin,/data-tab="catalog"/);
  assert.match(admin,/文书只读口令/);
  assert.match(app.text,/Authorization/);
});
test('catalog fails closed without authorization for lists, metadata and details',async()=>{
  const request=setup(()=>false);
  for(const route of ['/api/catalog/v1','/api/catalog/v1/schools','/api/catalog/v1/programs','/api/catalog/v1/programs/electrical']) {
    const res=await request(route);assert.equal(res.status,401);assert.ok(!JSON.stringify(res.body).includes('Technical University'));
  }
});
