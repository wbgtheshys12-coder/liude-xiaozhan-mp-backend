const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm');
const policy=require('../course-policy');
test('legacy visibility is preserved while explicit empty assignments deny access',()=>{
  assert.equal(policy.mode({free:true}),'public');assert.equal(policy.mode({free:false}),'members');
  assert.equal(policy.mode({free:true,allowedStorageKeys:['student']}),'assigned');
  assert.equal(policy.canView({status:'published',accessMode:'assigned',allowedStorageKeys:[]},'student'),false);
  assert.equal(policy.canView({status:'published',accessMode:'members'},'guest',true),false);
  assert.throws(()=>policy.normalize({accessMode:'assigned',status:'published',allowedStorageKeys:[]}),/至少选择/);
  assert.throws(()=>policy.normalize({accessMode:'public',allowedStorageKeys:['student']}),/公开课/);
  assert.equal(policy.normalize({accessMode:'assigned',status:'draft',allowedStorageKeys:[],category:' A1全阶段 '}).category,'A1全阶段');
});
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'liude-course-acl-'));
Object.assign(process.env,{PORT:'0',MP_DATA_DIR:dir,MP_COS_ENABLED:'false',MP_OPEN_LOGIN:'true',MP_ALLOW_DEV_LOGIN:'true',MP_DEV_OPENID:'course-student-a',MP_ADMIN_WEB_TOKEN:'test-course-admin-token',MP_ADMIN_OPENIDS_JSON:'[]',MP_TEACHER_OPENIDS_JSON:'{}',MP_OWNER_OPENIDS_JSON:'[]',MP_BOOKING_NOTIFY_ENABLED:'false'});
const server=require('../server');let base,a,b,admin=process.env.MP_ADMIN_WEB_TOKEN;
async function json(route,token,body){const response=await fetch(base+route,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:body===undefined?undefined:JSON.stringify(body)});return {status:response.status,data:await response.json()};}
test.before(async()=>{
  if(!server.listening)await new Promise(resolve=>server.once('listening',resolve));base='http://127.0.0.1:'+server.address().port;
  a=(await json('/api/mp/user/login','',{code:'fake'})).data;b=(await json('/api/mp/demo/login','',{})).data;
  fs.writeFileSync(path.join(dir,'profiles.jsonl'),JSON.stringify({storageKey:a.user.storageKey,name:'测试学生甲',school:'测试大学',phone:'13800001234',email:'private@example.com'})+'\n');
});
test('assignment, revocation, guest links and category persist through real endpoints',async()=>{
  assert.equal((await json('/api/mp/admin/course-students')).status,401);
  assert.equal((await json('/api/mp/admin/course-students',a.token)).status,403);
  const students=await json('/api/mp/admin/course-students',admin);assert.equal(students.data.records[0].name,'测试学生甲');assert.equal(students.data.records[0].contactHint,'尾号1234');assert.ok(!JSON.stringify(students.data).includes('private@example.com'));
  const video=await json('/api/mp/admin/course-video',admin,{name:'private-lesson.mp4',content:'data:video/mp4;base64,'+Buffer.from('test-private-video-bytes').toString('base64')});assert.equal(video.status,200);
  const data={title:'A1测试',category:'A1全阶段',type:'recorded',status:'published',accessMode:'assigned',allowedStorageKeys:[a.user.storageKey],videoUrl:video.data.videoUrl};
  const saved=await json('/api/mp/admin/courses',admin,data);assert.equal(saved.status,200);data.id=saved.data.course.id;
  assert.equal(saved.data.course.free,false);assert.equal(saved.data.course.category,'A1全阶段');
  const aCourse=(await json('/api/mp/courses',a.token)).data.records.find(c=>c.id===data.id);assert.ok(aCourse);assert.ok(!('allowedStorageKeys' in aCourse));
  assert.ok(!(await json('/api/mp/courses',b.token)).data.records.some(c=>c.id===data.id));
  assert.ok(!(await json('/api/mp/public/courses')).data.records.some(c=>c.id===data.id));
  assert.equal((await fetch(aCourse.videoUrl,{headers:{Range:'bytes=0-3'}})).status,206);
  assert.equal((await json('/api/mp/admin/courses',a.token,data)).status,403);
  data.allowedStorageKeys=[b.user.storageKey];assert.equal((await json('/api/mp/admin/courses',admin,data)).status,200);
  assert.equal((await fetch(aCourse.videoUrl,{headers:{Range:'bytes=0-3'}})).status,403);
  const bCourse=(await json('/api/mp/courses',b.token)).data.records.find(c=>c.id===data.id);assert.ok(bCourse);assert.equal((await fetch(bCourse.videoUrl,{headers:{Range:'bytes=0-3'}})).status,206);
  assert.equal((await json('/api/mp/admin/courses',admin,{...data,accessMode:'public',allowedStorageKeys:[]})).status,200);
  const publicCourse=(await json('/api/mp/public/courses')).data.records.find(c=>c.id===data.id);assert.ok(publicCourse);
  assert.equal((await json('/api/mp/admin/courses',admin,data)).status,200);assert.equal((await fetch(publicCourse.videoUrl)).status,403);
  assert.equal((await json('/api/mp/admin/courses',admin,{...data,status:'draft'})).status,200);assert.equal((await fetch(bCourse.videoUrl)).status,404);
  assert.equal((await json('/api/mp/admin/courses',admin,{...data,allowedStorageKeys:[]})).status,400);
  assert.equal((await json('/api/mp/admin/courses',admin,{...data,videoUrl:'https://example.com/private.mp4'})).status,400);
  assert.equal((await json('/api/mp/admin/courses',admin,{...data,status:'draft',allowedStorageKeys:[]})).status,200);
});
test('teacher chat is right aligned and student category selection filters only available records',async()=>{
  for(const file of ['admin-web/styles.css','miniprogram/pages/admin/messages.wxss']){
    const css=fs.readFileSync(path.join(__dirname,'..',file),'utf8');assert.match(css,/\.(?:message-line|message)\.staff\s*\{[^}]*margin-left:\s*auto/);assert.match(css,/\.(?:message-line|message)\.user\s*\{[^}]*margin-right:\s*auto/);
  }
  let page;vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../miniprogram/pages/courses/courses.js'),'utf8'),{Page:p=>page=p,require:()=>({getCourses:async()=>({records:[{id:'a',category:'A1全阶段',videoUrl:'/video',type:'recorded'},{id:'b',category:'A2',videoUrl:'/video2',type:'recorded'}]})}),wx:{showToast(){}}});
  page.setData=v=>Object.assign(page.data,v);page.onShow();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(page.data.courses.length,2);page.chooseCategory({currentTarget:{dataset:{category:'A1全阶段'}}});assert.equal(page.data.courses.length,1);assert.equal(page.data.courses[0].id,'a');
});
test.after(async()=>{await new Promise(resolve=>server.close(resolve));fs.rmSync(dir,{recursive:true,force:true});});
