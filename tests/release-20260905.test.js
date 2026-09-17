const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "liude-release-test-"));
Object.assign(process.env, { PORT:"0", MP_DATA_DIR:dir, MP_COS_ENABLED:"false", MP_OPEN_LOGIN:"true", MP_ALLOW_DEV_LOGIN:"true", MP_DEV_OPENID:"synthetic-release-student", MP_ADMIN_WEB_TOKEN:"synthetic-release-admin", MP_ADMIN_OPENIDS_JSON:"[]", MP_TEACHER_OPENIDS_JSON:"{}", MP_OWNER_OPENIDS_JSON:"[]", MP_BOOKING_NOTIFY_ENABLED:"false", MP_DOCUMENT_DOWNLOAD_FREE:"true", MP_PAYMENT_ENABLED:"false" });
const server = require("../server");
const engine = require("../local-engine");
let base, student, other;
test.before(async () => {
  if (!server.listening) await new Promise(resolve => server.once("listening", resolve));
  base = "http://127.0.0.1:" + server.address().port;
  student = (await json("/api/mp/user/login", "", {code:"synthetic-code"})).data.token;
  other = (await json("/api/mp/demo/login", "", {})).data.token;
});
test.after(async () => { await new Promise(resolve => server.close(resolve)); fs.rmSync(dir, {recursive:true,force:true}); });
async function json(route, token="", body) {
  const response = await fetch(base + route, {method: body === undefined ? "GET" : "POST", headers:{"Content-Type":"application/json", ...(token ? {Authorization:"Bearer " + token} : {})}, body:body === undefined ? undefined : JSON.stringify(body)});
  return {status:response.status, data:await response.json()};
}
const admin = "synthetic-release-admin";

test("guests can browse catalog and free video, but cannot read private modules", async () => {
  for (const endpoint of ["config","catalog","courses","posts"]) assert.equal((await json("/api/mp/public/" + endpoint)).status,200);
  const catalog = (await json("/api/mp/public/catalog")).data.records;
  assert.ok(catalog.length > 30);
  assert.ok(catalog.every(item => item.title && !("user" in item)));
  assert.ok(catalog.some(item => item.overview.length > 80));
  const courses = (await json("/api/mp/public/courses")).data.records;
  assert.ok(courses.some(item => item.free && item.hasVideo));
  assert.ok(courses.every(item => !("allowedStorageKeys" in item) && item.boundToWechat === false));
  const video = courses.find(item => item.hasVideo);
  const bytes = await fetch(video.videoUrl, {headers:{Range:"bytes=0-31"}});
  assert.equal(bytes.status,206);
  assert.equal((await bytes.arrayBuffer()).byteLength,32);
  for (const route of ["/api/mp/materials","/api/mp/admin/uploads","/api/mp/admin/stats","/api/mp/messages"]) assert.equal((await json(route)).status,401);
  assert.equal((await json("/api/mp/public/posts","",{})).status,405);
});

test("only administrators write posts and draft/review/publish cannot be bypassed", async () => {
  assert.equal((await json("/api/mp/admin/posts",student,{title:"Unauthorized",content:"x"})).status,403);
  let response = await json("/api/mp/admin/posts",admin,{title:"合成测试公告",content:"仅测试数据，不是正式招生政策。",sourceUrl:"https://example.com"});
  assert.equal(response.status,200);
  let post = response.data.record;
  const stale = post.updatedAt;
  assert.equal((await json("/api/mp/public/posts")).data.records.length,0);
  assert.equal((await json("/api/mp/admin/posts",admin,{id:post.id,updatedAt:post.updatedAt,action:"approve"})).status,409);
  post = (await json("/api/mp/admin/posts",admin,{id:post.id,updatedAt:post.updatedAt,action:"submit"})).data.record;
  assert.equal(post.status,"pending");
  assert.equal((await json("/api/mp/public/posts")).data.records.length,0);
  assert.equal((await json("/api/mp/admin/posts",admin,{id:post.id,updatedAt:stale,action:"approve"})).status,409);
  post = (await json("/api/mp/admin/posts",admin,{id:post.id,updatedAt:post.updatedAt,action:"approve"})).data.record;
  assert.equal(post.status,"published");
  const visible = (await json("/api/mp/public/posts")).data.records;
  assert.equal(visible.length,1);
  assert.equal("reviewedBy" in visible[0],false);
  post = (await json("/api/mp/admin/posts",admin,{id:post.id,updatedAt:post.updatedAt,action:"save",title:"修改后的测试",content:"编辑后必须重新审核"})).data.record;
  assert.equal(post.status,"draft");
  assert.equal((await json("/api/mp/public/posts")).data.records.length,0);
  assert.equal((await json("/api/mp/admin/posts",admin,{title:"bad",content:"bad",sourceUrl:"javascript:alert(1)"})).status,400);
});

test("contact requests need no slot or completed profile, remain private, and can be handled", async () => {
  const body = {studentName:"合成测试学生",contact:"synthetic@example.com",note:"课程反馈与选校咨询",advisorKey:"a2"};
  assert.equal((await json("/api/mp/booking-request","",body)).status,401);
  assert.equal((await json("/api/mp/booking-request",student,{...body,date:"2030-09-01"})).status,400);
  assert.equal((await json("/api/mp/booking-request",student,{...body,contact:""})).status,400);
  const first = await json("/api/mp/booking-request",student,body);
  assert.equal(first.status,200);
  const duplicate = await json("/api/mp/booking-request",student,body);
  assert.equal(duplicate.data.duplicate,true);
  assert.equal(duplicate.data.bookingId,first.data.bookingId);
  const bookings = (await json("/api/mp/bookings",student)).data.records;
  assert.equal(bookings[0].date,"");
  assert.equal(bookings[0].canCancel,true);
  assert.equal(bookings[0].statusText,"待老师联系");
  assert.equal((await json("/api/mp/bookings",other)).data.records.length,0);
  assert.equal((await json("/api/mp/admin/booking-request/status",student,{id:first.data.bookingId,status:"contacted"})).status,403);
  assert.equal((await json("/api/mp/admin/booking-request/status",admin,{id:first.data.bookingId,status:"contacted"})).status,200);
  assert.equal((await json("/api/mp/bookings",student)).data.records[0].statusText,"老师已联系");
  const again = await json("/api/mp/booking-request",student,body);
  assert.notEqual(again.data.bookingId,first.data.bookingId);
  assert.equal((await json("/api/mp/booking/cancel",student,{bookingId:again.data.bookingId})).data.booking.status,"cancelled");
});

test("student course feedback can be sent before profile completion; administrator replies privately", async () => {
  const sent = await json("/api/mp/messages",student,{content:"【课程反馈】合成课程：希望增加课后练习"});
  assert.equal(sent.status,200);
  const conversations = (await json("/api/mp/admin/messages",admin)).data.conversations;
  assert.equal(conversations.length,1);
  assert.equal((await json("/api/mp/admin/messages/reply",admin,{storageKey:conversations[0].storageKey,content:"合成回复：建议已收到"})).status,200);
  assert.equal((await json("/api/mp/messages",student)).data.records.length,2);
  assert.equal((await json("/api/mp/messages",other)).data.records.length,0);
});

test("original student transcript bytes are available only to owner and administrator", async () => {
  for(const asset of ["pdf-preview.js","pdf-vendor/pdf.mjs","pdf-vendor/pdf.worker.mjs"]) {
    const response=await fetch(base+"/admin/"+asset);
    assert.equal(response.status,200);assert.match(response.headers.get("content-type"),/javascript/);
    await response.arrayBuffer();
  }
  assert.equal((await fetch(base+"/admin/pdf-vendor/package.json")).status,404);
  const buffer = await server.testHelpers.createWatermarkedPdf("Synthetic transcript","Mathematics 90 / 100; Credits 5.0","TEST");
  const upload = await json("/api/mp/material/upload",student,{category:"成绩单",usage:"合成测试",file:{name:"synthetic-transcript.pdf",mimeType:"application/pdf",size:buffer.length,content:"data:application/pdf;base64,"+buffer.toString("base64")}});
  assert.equal(upload.status,200,JSON.stringify(upload.data));
  const id = upload.data.record.id;
  for (const [token,route] of [[student,"/api/mp/material-file/"],[admin,"/api/mp/admin/material-file/"]]) {
    const response = await fetch(base + route + id,{headers:{Authorization:"Bearer "+token}});
    assert.equal(response.status,200);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()),buffer);
  }
  assert.equal((await fetch(base+"/api/mp/material-file/"+id,{headers:{Authorization:"Bearer "+other}})).status,404);
  assert.equal((await fetch(base+"/api/mp/admin/material-file/"+id,{headers:{Authorization:"Bearer "+student}})).status,404);
  assert.equal((await json("/api/mp/material/delete",student,{id})).status,200);
  assert.equal((await fetch(base+"/api/mp/admin/material-file/"+id,{headers:{Authorization:"Bearer "+admin}})).status,404);
});

test("free course publication, private ACL and storage origin remain explicit", async () => {
  const courseFile=path.join(dir,"courses.jsonl");
  const prior=fs.existsSync(courseFile) ? fs.readFileSync(courseFile) : null;
  const legacy={id:"course_recorded_german_sample",title:"Legacy bundled demo",type:"recorded",status:"published",videoUrl:"/api/mp/course-video/german-course.mp4"};
  const bundled=(await json("/api/mp/admin/courses",admin)).data.records.find(item=>item.id===legacy.id);
  legacy.videoUrl=bundled.videoUrl;
  try {
    for(const [overrides,expected] of [[{},true],[{free:false},false],[{allowedStorageKeys:["restricted"]},false],[{status:"draft"},false],[{deleted:true},false],[{videoUrl:"https://example.com/private.mp4"},false]]) {
      fs.writeFileSync(courseFile,JSON.stringify({...legacy,...overrides})+"\n");
      const visible=(await json("/api/mp/public/courses")).data.records.some(item=>item.id===legacy.id);
      assert.equal(visible,expected,"Legacy public demo must preserve explicit access restrictions");
    }
  } finally {
    if(prior) fs.writeFileSync(courseFile,prior); else fs.unlinkSync(courseFile);
  }
  const body={title:"Synthetic free course",type:"recorded",videoUrl:"https://example.com/lesson.mp4",free:true,status:"published"};
  const saved = await json("/api/mp/admin/courses",admin,body);
  assert.equal(saved.status,200);
  const courses=(await json("/api/mp/public/courses")).data.records;
  assert.ok(courses.some(item=>item.title===body.title));
  assert.equal((await json("/api/mp/admin/courses",admin,{...body,allowedStorageKeys:["restricted"]})).status,400);
  const listed=(await json("/api/mp/admin/courses",admin)).data.records;
  assert.ok(listed.some(item=>item.videoStorage==="bundled"));
  assert.ok(listed.some(item=>item.title===body.title && item.videoStorage==="external"));
});

test("factual drafts preserve entered target-language facts and flag untranslated input without inventions", () => {
  const form={latinName:"Synthetic Applicant",education:"2020-09 - 2024-06 Example University",schooling:"2008-09 - 2020-06 Example School",professionalExperience:"2024-07 - present | Example Lab | Maintained a public test dataset",pageLimit:2};
  const cv=engine.createMaterialDraft({toolKey:"cv",language:"en",form});
  assert.equal(cv.translationComplete,true);
  assert.ok(cv.draft.includes(form.professionalExperience));
  assert.match(cv.draft,/PRIMARY AND SECONDARY EDUCATION/);
  assert.doesNotMatch(cv.draft,/cloud model|ANP|invented achievement/);
  const cn=engine.createMaterialDraft({toolKey:"motivation",language:"de",form:{latinName:"Synthetic Applicant",targetProgram:"Example University",projectsInternships:"仅有课程作业，无实习"}});
  assert.equal(cn.translationComplete,false);
  assert.ok(cn.untranslatedFields.includes("projectsInternships"));
  assert.equal(cn.sourceReview.find(item => item.key === "projectsInternships").original, "仅有课程作业，无实习");
  assert.match(cn.draft,/Originalangaben/);
  assert.doesNotMatch(cn.draft,/BIM|ANP|Praktikum absolvierte/);
});

test("motivation page limits reject overflow without truncation and embed CJK/Latin fonts", async () => {
  for(const limit of [1,2]) {
    const pdf=await server.testHelpers.createWatermarkedPdf("Motivation","Dear Admissions Committee,\n\nMy academic goal is to study verified engineering methods.\n\nYours faithfully,\nSynthetic Applicant","AI", "2026-09-05","en","motivation",limit);
    assert.match(pdf.toString("latin1"),/\/FontFile2/);
    const {getDocument}=await import("pdfjs-dist/legacy/build/pdf.mjs");
    const doc=await getDocument({data:new Uint8Array(pdf),useSystemFonts:false}).promise;
    assert.ok(doc.numPages<=limit);
    await doc.destroy();
  }
  await assert.rejects(server.testHelpers.createWatermarkedPdf("Motivation","Verified original content. ".repeat(3000),"AI","2026-09-05","en","motivation",1),/超过所选 1 页/);
});

test("long CV sections paginate without dropping their last content or splitting month/year", async () => {
  const text="CURRICULUM VITAE\nEDUCATION\n10/2022 - present | Example University\n"+("Verified research evidence with clear documented results. ".repeat(220))+"\nFINAL-CV-MARKER";
  const bytes=await server.testHelpers.createWatermarkedPdf("Curriculum Vitae",text,"QA","2026-09-06","en","cv");
  const {getDocument}=await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc=await getDocument({data:new Uint8Array(bytes),useSystemFonts:false}).promise;
  try {
    assert.ok(doc.numPages>1);
    let content="";
    for(let i=1;i<=doc.numPages;i++) content+=(await (await doc.getPage(i)).getTextContent()).items.map(x=>x.str).join(" ");
    assert.match(content,/10\/2022 - present/);assert.match(content,/FINAL-CV-MARKER/);
  } finally { await doc.destroy(); }
});
const mini=fs.existsSync(path.resolve(__dirname,"../../用户版小程序/app.json")) ? path.resolve(__dirname,"../../用户版小程序") : path.resolve(__dirname,"../miniprogram");
test("shared CV chronology detects real gaps and uses bis heute only for ongoing rows", {skip:!fs.existsSync(mini)}, () => {
  const module={exports:{}};
  vm.runInNewContext(fs.readFileSync(path.join(mini,"utils/experience.js"),"utf8"),{module,exports:module.exports,require:()=>({}),getApp:()=>({globalData:{}}),wx:{}});
  const exp=module.exports;
  const data={education:[{name:"Example University",start:"2020-09",end:"2024-06"}],professionalExperience:[{name:"Example Lab",start:"2024-07",ongoing:true}]};
  assert.equal(exp.validate(data,new Date(2026,8,5)).length,0);
  assert.match(exp.toForm(data).professionalExperience,/bis heute/);
  assert.match(exp.toForm(data,"en").professionalExperience,/present/);
  assert.doesNotMatch(exp.toForm(data).education,/bis heute/);
  assert.ok(exp.validate({education:data.education},new Date(2026,8,5)).some(text=>text.includes("空档")));
  assert.equal(exp.validate({education:data.education,gapExplanation:"2024-07 至今：如实备考说明"},new Date(2026,8,5)).length,0);
  assert.ok(exp.validate({education:[{name:"Example",start:"2024-09",end:"2020-06"}]}).length);
});
