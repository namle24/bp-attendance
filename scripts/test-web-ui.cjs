// Optional browser integration test: starts an isolated DEMO with temporary SQLite.
const {chromium}=require(process.env.BP_PLAYWRIGHT_MODULE||'playwright-core');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
(async()=>{
  const root=path.resolve(__dirname,'..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'bp-web-ui-'));
  const origin='http://127.0.0.1:4181';
  const child=spawn(process.execPath,['web/server.cjs'],{cwd:root,env:{...process.env,BP_MODE:'demo',PORT:'4181',BIND_HOST:'127.0.0.1',PUBLIC_ORIGIN:origin,BP_DATABASE:path.join(temp,'demo.sqlite'),GOOGLE_CLIENT_ID:'',GOOGLE_SHEET_ID:'',CAMPUS_CIDRS:'',TRUSTED_PROXY_CIDRS:''},stdio:['ignore','pipe','pipe']});
  let browser;
  try{
    await new Promise((resolve,reject)=>{child.stdout.once('data',resolve);child.once('error',reject);child.once('exit',code=>reject(Error('Demo exit '+code)));});
    browser=await chromium.launch({headless:true,...(process.env.BP_CHROMIUM?{executablePath:process.env.BP_CHROMIUM}:{}),args:['--no-sandbox']});
    const errors=[],requests=[];
    const context=await browser.newContext({viewport:{width:1140,height:950}});
    const admin=await context.newPage();admin.on('pageerror',e=>errors.push(e.message));admin.on('request',r=>requests.push(r.url()));
    await admin.goto(origin);await admin.locator('#demo-admin').waitFor();
    await admin.screenshot({path:path.join(root,'docs/web-login.png'),fullPage:true});
    const narrowContext=await browser.newContext({viewport:{width:390,height:844}});
    const narrowLogin=await narrowContext.newPage();await narrowLogin.goto(origin);await narrowLogin.locator('#demo-admin').waitFor();
    assert.ok(await narrowLogin.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await narrowLogin.screenshot({path:path.join(root,'docs/web-login-mobile.png'),fullPage:true});await narrowContext.close();
    await admin.locator('#demo-admin').click();await admin.locator('#admin').waitFor();
    await admin.getByText('Mở buổi mới',{exact:true}).click();await admin.locator('#open').click();await admin.locator('#qr svg').waitFor();
    const first=await admin.evaluate(()=>qrInfo.url);
    await admin.evaluate(()=>window.scrollTo(0,0));
    await admin.screenshot({path:path.join(root,'docs/web-session-open.png'),fullPage:true});
    await admin.getByText('Mở buổi mới',{exact:true}).click();
    await admin.getByText('Nhập danh sách lớp',{exact:true}).click();
    await admin.locator('#roster-csv').fill('MSSV,Họ tên,Email trường\n001,Sinh viên minh họa A,a@school.example\n002,Sinh viên minh họa B,b@school.example');
    await admin.evaluate(()=>window.scrollTo(0,0));
    await admin.screenshot({path:path.join(root,'docs/web-roster.png'),fullPage:true});
    await admin.getByText('Nhập danh sách lớp',{exact:true}).click();
    const studentContext=await browser.newContext({viewport:{width:390,height:844}});
    const student=await studentContext.newPage();student.on('pageerror',e=>errors.push(e.message));student.on('request',r=>requests.push(r.url()));
    await student.goto(first);await student.locator('#demo-student').click();await student.locator('#student').waitFor();
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
    await admin.locator('#project').click();await admin.setViewportSize({width:1000,height:780});
    assert.equal(await admin.locator('#open').isVisible(),false);
    assert.ok(await admin.evaluate(()=>document.getElementById('qr-expiry').getBoundingClientRect().bottom<innerHeight));
    await admin.screenshot({path:path.join(root,'docs/web-projector.png'),fullPage:true});
    // Observe a real server-clock rotation, not just a cosmetic countdown.
    await admin.waitForFunction(old=>typeof qrInfo!=='undefined'&&qrInfo&&qrInfo.url!==old,first,{timeout:35000});
    assert.notEqual(await admin.evaluate(()=>qrInfo.url),first);
    await admin.locator('#exit-project').click();await admin.locator('#close').click();
    await admin.waitForFunction(()=>!document.querySelector('#qr svg'));
    assert.deepEqual(errors,[]);assert.ok(requests.every(url=>url.startsWith(origin)),'Demo must not call Google or a third-party QR generator.');
    console.log('Web UI passed: network failure without false success, lost receipt recovered from SQLite, TA/student logins, real 30s QR rotation, close, mobile, projection and no external calls in demo.');
  }finally{
    if(browser)await browser.close();
    if(child.exitCode===null){child.kill('SIGTERM');await new Promise(resolve=>child.once('exit',resolve));}
    fs.rmSync(temp,{recursive:true,force:true});
  }
})().catch(e=>{console.error(e);process.exitCode=1;});
