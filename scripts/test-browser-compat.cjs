// Real browser engines, synthetic records, private LAN HTTP and isolated SQLite.
const assert=require('node:assert/strict'),os=require('node:os');
const {startFixture}=require('../tests/helpers/lan-browser-fixture.cjs');
const {today}=require('../web/security.cjs');
const engines=require(process.env.BP_PLAYWRIGHT_MODULE||'playwright');
async function run(name){
  const host=Object.values(os.networkInterfaces()).flat().find(a=>a.family==='IPv4'&&!a.internal&&/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a.address))?.address;
  assert.ok(host,'Private LAN IPv4 required');
  const f=await startFixture({studentHost:host});let browser;
  try{
    browser=await engines[name].launch({headless:true,...(name==='chromium'&&process.env.BP_CHROMIUM?{executablePath:process.env.BP_CHROMIUM}:{})});
    const context=await browser.newContext({viewport:{width:390,height:844}}),errors=[],requests=[];
    await context.addInitScript(()=>{
      window.fetch=undefined;window.AbortController=undefined;window.AbortSignal=undefined;window.URLSearchParams=undefined;
      Object.defineProperty(navigator,'geolocation',{value:undefined,configurable:true});
      Storage.prototype.getItem=Storage.prototype.setItem=function(){throw Error('Storage unavailable');};
    });
    // Optional location code may fail to load; normal attendance must still work.
    await context.route('**/location-client.js',r=>r.abort());
    const first=f.store.open(today(),8,'TA');
    async function form(id){
      const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
      await page.goto(f.origin+'/#code='+f.store.currentQr().code);await page.locator('#attendance-form').waitFor();
      assert.equal(await page.evaluate(()=>isSecureContext),false);assert.equal(await page.locator('#location-section').isVisible(),false);
      await page.locator('#student-id').fill(id);await page.locator('#full-name').fill('Synthetic Student');await page.locator('#seat').fill('A-01');return page;
    }
    const one=await form('001');
    await one.route('**/api/check-in',async route=>{await route.fetch();await route.abort();});
    await one.locator('#submit').click();await one.locator('#notice').filter({hasText:'Chưa xác nhận được'}).waitFor();assert.equal(f.store.entries().length,1);
    await one.unroute('**/api/check-in');await one.locator('#submit').click();await one.locator('#receipt').waitFor();assert.equal(f.store.entries().length,1);
    // Another tab/QR/request ID cannot create another record for the same MSSV.
    const duplicate=await form('001');await duplicate.locator('#submit').click();await duplicate.locator('#notice').filter({hasText:'MSSV này đã được ghi nhận'}).waitFor();assert.equal(f.store.entries().length,1);
    const two=await form('002');await two.locator('#submit').click();await two.locator('#receipt').waitFor();assert.ok(f.store.entries().every(r=>r.peers===2&&r.status==='PENDING'));
    f.store.closeSession(first.id,'TA');f.store.reopen(first.id,8,'TA');
    const reopened=await form('001');await reopened.locator('#submit').click();await reopened.locator('#notice').filter({hasText:'MSSV này đã được ghi nhận'}).waitFor();assert.equal(f.store.entries().length,2);
    f.store.closeSession(first.id,'TA');const second=f.store.open(today(),8,'TA');
    const next=await form('001');await next.locator('#submit').click();await next.locator('#receipt').waitFor();assert.equal(f.store.entries(second.id).length,1);
    assert.deepEqual(errors,[]);assert.ok(requests.every(url=>url.startsWith(f.origin+'/')),'No HTTPS helper or external dependency while location is off');
    console.log(name+': LAN HTTP, GPS off, optional script unavailable, restricted storage, response-loss retry, duplicate MSSV, duplicate IP, reopened/new rounds passed.');
  }finally{if(browser)await browser.close();await f.close();}
}
(async()=>{for(const name of (process.env.BP_BROWSERS||'chromium,firefox,webkit').split(','))await run(name);})().catch(error=>{console.error(error);process.exitCode=1;});
