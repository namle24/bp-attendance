// Browser integration test: production UI + real HTTPS/SQLite with isolated Google/Sheets fixtures.
const {chromium}=require(process.env.BP_PLAYWRIGHT_MODULE||'playwright-core');
const assert=require('node:assert/strict');
const path=require('node:path');
const {startFixture}=require('../tests/helpers/browser-fixture.cjs');
(async()=>{
  const root=path.resolve(__dirname,'..'),fixture=await startFixture(),origin=fixture.origin;
  const taIdentity={email:'ta@school.example',sub:'g-ta'},studentIdentity={email:'a@school.example',sub:'g-a'};
  let browser;
  try{
    browser=await chromium.launch({headless:true,...(process.env.BP_CHROMIUM?{executablePath:process.env.BP_CHROMIUM}:{}),args:['--no-sandbox']});
    const errors=[],requests=[];
    const context=await fixture.context(browser,taIdentity);
    const admin=await context.newPage();admin.on('pageerror',e=>errors.push(e.message));admin.on('request',r=>requests.push(r.url()));
    await admin.goto(origin);await admin.locator('#google-button button').waitFor();
    await admin.screenshot({path:path.join(root,'docs/web-login.png'),fullPage:true});
    const narrowContext=await fixture.context(browser,studentIdentity,{width:390,height:844});
    const narrowLogin=await narrowContext.newPage();await narrowLogin.goto(origin);await narrowLogin.locator('#google-button button').waitFor();
    assert.ok(await narrowLogin.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await narrowLogin.screenshot({path:path.join(root,'docs/web-login-mobile.png'),fullPage:true});await narrowContext.close();
    await admin.locator('#google-button button').click();await admin.locator('#admin').waitFor();
    await admin.locator('#open').click();await admin.locator('#exit-project').waitFor();await admin.locator('#qr svg').waitFor();
    assert.equal(await admin.locator('#open').isVisible(),false,'Opening a session goes directly to projection');
    await admin.locator('#exit-project').click();
    const first=await admin.evaluate(()=>qrInfo.url);
    await admin.evaluate(()=>window.scrollTo(0,0));
    await admin.screenshot({path:path.join(root,'docs/web-session-open.png'),fullPage:true});
    await admin.getByText('Nhập danh sách lớp',{exact:true}).click();
    await admin.locator('#roster-csv').fill('MSSV,Họ tên,Email trường\n001,Nguyễn An,a@school.example\n002,Trần Bình,b@school.example');
    await admin.evaluate(()=>window.scrollTo(0,0));
    await admin.screenshot({path:path.join(root,'docs/web-roster.png'),fullPage:true});
    await admin.getByText('Nhập danh sách lớp',{exact:true}).click();
    const studentContext=await fixture.context(browser,studentIdentity,{width:390,height:844});
    const student=await studentContext.newPage();student.on('pageerror',e=>errors.push(e.message));student.on('request',r=>requests.push(r.url()));
    await student.goto(first);await student.locator('#google-button button').click();await student.locator('#student').waitFor();
    await student.screenshot({path:path.join(root,'docs/web-student-ready.png'),fullPage:true});
    assert.equal(await student.locator('#check-in').isEnabled(),true);
    let checkIns=0;
    await student.route('**/api/check-in',async route=>{
      checkIns++;
      if(checkIns===2)await route.fetch(); // Second attempt commits, but its response is lost.
      await route.abort('connectionreset');
    });
    await student.locator('#check-in').click();
    await student.waitForFunction(()=>document.getElementById('notice').textContent.includes('Chưa xác nhận được kết quả'));
    assert.equal(await student.locator('#receipt').isVisible(),false);
    await student.waitForFunction(()=>!document.getElementById('check-in').disabled);
    await student.locator('#check-in').click();await student.locator('#receipt').waitFor();
    await student.unroute('**/api/check-in');
    assert.match(await student.locator('#receipt').textContent(),/001/);
    assert.match(await student.locator('#receipt').textContent(),/được ghi nhận trước đó/);
    assert.equal(await student.evaluate(()=>location.hash),'');
    assert.ok(await student.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await student.screenshot({path:path.join(root,'docs/web-student.png'),fullPage:true});
    await admin.waitForFunction(()=>document.getElementById('count').textContent.includes('1 sinh viên'));
    await admin.evaluate(()=>window.scrollTo(0,0));
    await admin.screenshot({path:path.join(root,'docs/web-admin.png'),fullPage:true});
    await admin.locator('#open').click();await admin.locator('#exit-project').waitFor();await admin.setViewportSize({width:1000,height:780});
    assert.equal(await admin.locator('#open').isVisible(),false);
    assert.ok(await admin.evaluate(()=>document.getElementById('display-code').getBoundingClientRect().bottom<innerHeight));
    await admin.screenshot({path:path.join(root,'docs/web-projector.png'),fullPage:true});
    const desktopContext=await fixture.context(browser,{email:'b@school.example',sub:'g-b'});
    const desktop=await desktopContext.newPage();desktop.on('pageerror',e=>errors.push(e.message));
    await desktop.goto(origin+'/check-in');await desktop.locator('#google-button button').click();await desktop.locator('#student').waitFor();
    const code=await admin.evaluate(()=>qrInfo.code);
    await desktop.locator('#attendance-code').fill(code.slice(0,4)+' '+code.slice(4));
    await desktop.screenshot({path:path.join(root,'docs/web-student-desktop.png'),fullPage:true});
    await desktop.locator('#submit-code').click();await desktop.locator('#receipt').waitFor();
    assert.match(await desktop.locator('#receipt').textContent(),/002/);
    assert.equal(fixture.store.sessions()[0].count,2);
    // Observe a real server-clock rotation, not just a cosmetic countdown.
    await admin.waitForFunction(old=>typeof qrInfo!=='undefined'&&qrInfo&&qrInfo.url!==old,first,{timeout:35000});
    assert.notEqual(await admin.evaluate(()=>qrInfo.url),first);
    await admin.locator('#exit-project').click();await admin.getByText('Tùy chọn phiên điểm danh',{exact:true}).click();await admin.locator('#close').click();
    await admin.waitForFunction(()=>!document.querySelector('#qr svg'));
    assert.deepEqual(errors,[]);assert.ok(requests.every(url=>url.startsWith(origin)||url==='https://accounts.google.com/gsi/client'));
    assert.doesNotMatch(await admin.locator('body').innerText(),/demo|minh họa|dữ liệu giả/i);
    assert.equal(await admin.locator('#open').isEnabled(),false);
    console.log('Web UI passed: Google-provider fixture, one-click projection, mobile QR, desktop code, real 30s rotation, network loss before/after commit, close, responsive layout and screenshots.');
  }finally{
    if(browser)await browser.close();
    await fixture.close();
  }
})().catch(e=>{console.error(e);process.exitCode=1;});
