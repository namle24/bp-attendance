// Real engines, LAN HTTP, isolated SQLite, no Google or live attendance data.
const assert=require('node:assert/strict'),os=require('node:os'),fs=require('node:fs'),path=require('node:path');
const {startFixture}=require('../tests/helpers/lan-browser-fixture.cjs'),{today}=require('../web/security.cjs');
const engines=require(process.env.BP_PLAYWRIGHT_MODULE||'playwright');
async function run(name){
  const host=Object.values(os.networkInterfaces()).flat().find(a=>a.family==='IPv4'&&!a.internal&&/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a.address))?.address;
  assert.ok(host,'Private LAN IPv4 required');const f=await startFixture({studentHost:host});let browser;
  try{
    browser=await engines[name].launch({headless:true,...(name==='chromium'&&process.env.BP_CHROMIUM?{executablePath:process.env.BP_CHROMIUM}:{})});
    const errors=[],requests=[],measurements=[];
    async function context(options={}){
      const c=await browser.newContext({viewport:{width:390,height:844},...options});
      await c.addInitScript(()=>{
        window.fetch=undefined;window.AbortController=undefined;window.URLSearchParams=undefined;
        Object.defineProperty(window,'crypto',{value:undefined,configurable:true});
        Object.defineProperty(navigator,'geolocation',{value:undefined,configurable:true});
        Storage.prototype.getItem=Storage.prototype.setItem=function(){throw Error('Storage unavailable');};
      });
      // Even indefinitely pending external JS/CSS must not block the bundled page.
      await c.route(/\.(js|css)(\?|$)/,()=>new Promise(()=>{}));
      c.on('page',p=>{p.on('pageerror',e=>errors.push(e.message));p.on('request',r=>requests.push(r.url()));});return c;
    }
    const first=f.store.open(today(),8,'TA'),oneContext=await context();
    const link=()=>f.origin+'/#code='+f.store.currentQr().code;
    async function form(c,id){
      const p=await c.newPage(),start=Date.now();await p.goto(link(),{waitUntil:'domcontentloaded'});await p.locator('#attendance-form').waitFor({timeout:6000});measurements.push(Date.now()-start);
      assert.equal(await p.evaluate(()=>isSecureContext),false);assert.equal(await p.locator('#seat,#location-section').count(),0);
      await p.locator('#student-id').fill(id);await p.locator('#full-name').fill('Synthetic Student');return p;
    }
    const one=await form(oneContext,'001');
    for(const width of [320,390,768,1280]){await one.setViewportSize({width,height:844});assert.ok(await one.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
    await one.setViewportSize({width:390,height:844});
    if(process.env.BP_SCREENSHOT_DIR){fs.mkdirSync(process.env.BP_SCREENSHOT_DIR,{recursive:true});await one.screenshot({path:path.join(process.env.BP_SCREENSHOT_DIR,name+'-student.png'),fullPage:true});}
    await one.route('**/api/check-in',async route=>{await route.fetch();await route.abort();});
    await one.locator('#submit').click();await one.locator('#notice').filter({hasText:'Chưa xác nhận được'}).waitFor();assert.equal(f.store.entries().length,1);
    await one.unroute('**/api/check-in');await one.locator('#submit').click();await one.locator('#receipt').waitFor();assert.equal(f.store.entries().length,1);
    const tab=await oneContext.newPage();await tab.goto(link());await tab.locator('#receipt').waitFor();assert.equal(await tab.locator('#attendance-form').isVisible(),false);assert.match(await tab.locator('#receipt-fields').textContent(),/001/);
    const twoContext=await context(),duplicate=await form(twoContext,'001');await duplicate.locator('#submit').click();await duplicate.locator('#notice').filter({hasText:'MSSV này đã được ghi nhận'}).waitFor();assert.equal(f.store.entries().length,1);
    await duplicate.locator('#student-id').fill('002');await duplicate.locator('#submit').click();await duplicate.locator('#receipt').waitFor();assert.ok(f.store.entries().every(r=>r.peers===2&&r.status==='PENDING'));
    f.store.closeSession(first.id,'TA');f.store.reopen(first.id,8,'TA');await tab.goto(link());await tab.locator('#receipt').waitFor();assert.equal(f.store.entries().length,2);
    f.store.closeSession(first.id,'TA');const second=f.store.open(today(),8,'TA');
    const next=await form(oneContext,'001');await next.locator('#submit').click();await next.locator('#receipt').waitFor();assert.equal(f.store.entries(second.id).length,1);
    // One transient scan failure recovers automatically, without rescanning.
    const retryContext=await context(),retry=await retryContext.newPage();let failures=0;
    await retry.route('**/api/scan',r=>++failures===1?r.abort():r.continue());await retry.goto(link());await retry.locator('#attendance-form').waitFor({timeout:6000});assert.equal(failures,2);
    // No JavaScript: same QR/device checks through an ordinary HTML form.
    const basicContext=await context({javaScriptEnabled:false}),basic=await basicContext.newPage();await basic.goto(f.origin);await basic.locator('#fallback-help a').click();
    await basic.locator('[name=studentId]').fill('003');await basic.locator('[name=name]').fill('Nguyễn Minh');await basic.locator('[name=code]').fill(f.store.currentQr().code);
    await basic.locator('button').click();await basic.getByRole('heading',{name:'Đã lưu, chờ TA đối chiếu'}).waitFor({timeout:5000}).catch(async error=>{console.error(await basic.locator('body').innerText());throw error;});assert.equal(f.store.entries(second.id).length,2);
    await basic.goto(f.origin+'/simple');assert.equal(await basic.locator('form').count(),0);
    assert.deepEqual(errors,[]);assert.ok(requests.every(url=>url.startsWith(f.origin+'/')),'No external dependency');assert.ok(!requests.some(url=>/\.(js|css)(\?|$)/.test(url)),'No critical subresource requests');
    console.log(JSON.stringify({engine:name,formReadyMs:measurements,passed:'missing APIs/storage/crypto, stalled subresources, 320–1280px, lost response, same-browser lock, duplicate MSSV/IP, reopen/new round, automatic scan retry, no-JS form'}));
  }finally{if(browser)await browser.close();await f.close();}
}
(async()=>{for(const name of (process.env.BP_BROWSERS||'chromium,firefox,webkit').split(','))await run(name);})().catch(error=>{console.error(error);process.exitCode=1;});
