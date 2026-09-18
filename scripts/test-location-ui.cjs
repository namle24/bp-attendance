// Synthetic data only. Set BP_LOCATION_LIVE_HELPER=1 to verify the published
// HTTPS helper; otherwise intercept it with local assets before publication.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {startFixture}=require('../tests/helpers/lan-browser-fixture.cjs');
const {HELPER_URL}=require('../web/location.cjs');
const {chromium}=require(process.env.BP_PLAYWRIGHT_MODULE||'playwright');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function main(){
  const liveHelper=process.env.BP_LOCATION_LIVE_HELPER==='1';
  const host=Object.values(os.networkInterfaces()).flat().find(a=>a.family==='IPv4'&&!a.internal&&/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a.address))?.address;
  if(!host)throw Error('A private LAN IPv4 is required to test a genuinely insecure HTTP parent.');
  const f=await startFixture({studentHost:host});
  const browser=await chromium.launch({executablePath:process.env.BP_CHROMIUM,headless:true});
  const screenshotDir=process.env.BP_SCREENSHOT_DIR||'/tmp/bp-location-ui';fs.mkdirSync(screenshotDir,{recursive:true});
  try{
    const admin=await browser.newPage();await admin.goto(f.adminOrigin);
    await admin.locator('#location-config-status').filter({hasText:'Đang tắt'}).waitFor({state:'attached'});
    await admin.getByText('Kiểm tra vị trí lớp',{exact:true}).click();
    await admin.locator('#location-enabled').check();
    await admin.locator('#location-latitude').fill('21');await admin.locator('#location-longitude').fill('105');await admin.locator('#location-accuracy').fill('5');
    await admin.locator('#location-save').click();await admin.locator('#notice').filter({hasText:'Đã lưu thiết lập vị trí'}).waitFor();
    await admin.locator('#open').click();
    for(let i=0;i<30&&!f.store.activeSession();i++)await pause(100);
    assert.ok(f.store.activeSession());
    async function client(id,kind){
      const context=await browser.newContext({viewport:{width:390,height:844},geolocation:{latitude:kind==='OUTSIDE'?21.01:21,longitude:105,accuracy:kind==='UNCERTAIN'?1000:8}});
      try{
        if(!liveHelper)await context.route(HELPER_URL+'**',async route=>{
          const file=new URL(route.request().url()).pathname.split('/').at(-1)||'index.html';
          if(!['index.html','location.js','style.css'].includes(file))return route.abort();
          await route.fulfill({path:path.join(__dirname,'../site/location',file),contentType:file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html'});
        });
        if(kind!=='DENIED')await context.grantPermissions(['geolocation'],{origin:new URL(HELPER_URL).origin});
        if(['DENIED','TIMEOUT','UNAVAILABLE','RECOVERED'].includes(kind))await context.addInitScript(kind=>{
          if(location.protocol!=='https:')return;
          const getPosition=navigator.geolocation.getCurrentPosition.bind(navigator.geolocation);let attempts=0;
          navigator.geolocation.getCurrentPosition=(ok,error,options)=>{
            if(kind==='RECOVERED'&&attempts++>0)return getPosition(ok,error,options);
            error({code:kind==='TIMEOUT'?3:kind==='UNAVAILABLE'?2:1,message:'Synthetic browser error'});
          };
        },kind);
        const page=await context.newPage(),qr=f.store.currentQr();
        await page.goto(f.origin+'/#code='+qr.code);await page.locator('#attendance-form').waitFor({state:'visible'});
        assert.equal(await page.evaluate(()=>isSecureContext),false);
        if(kind!=='MISSING'){
          const opened=page.waitForEvent('popup');await page.locator('#location-button').click();const popup=await opened;
          await popup.locator('#locate').waitFor();assert.equal(await popup.evaluate(()=>isSecureContext),true);
          await page.evaluate(origin=>window.dispatchEvent(new MessageEvent('message',{origin,source:window,data:{type:'bp-location-result',state:'wrong',sample:{status:'OK',latitude:21,longitude:105,accuracy:0,ageMs:0}}})),new URL(HELPER_URL).origin);
          assert.match(await page.locator('#location-status').textContent(),/Cho phép/);
          const closed=popup.waitForEvent('close');await popup.locator('#locate').click();
          if(['DENIED','TIMEOUT','UNAVAILABLE','RECOVERED'].includes(kind)){
            await popup.locator('#permission-help').waitFor({state:'visible'});
            assert.equal(popup.isClosed(),false,'A location error must keep its recovery instructions open');
            assert.match(await page.locator('#location-status').textContent(),/Cho phép/,'A failed position must not be delivered until the user chooses TA review');
            assert.equal(f.store.entries().some(r=>r.student_id===id),false);
            assert.equal(await popup.locator('#locate').isEnabled(),true);
            if(kind==='RECOVERED')await popup.locator('#locate').click();
            else await popup.locator('#continue-review').click();
          }
          await closed;
          const expectedText={DENIED:'chặn quyền vị trí',TIMEOUT:'quá thời gian',UNAVAILABLE:'Không lấy được vị trí'}[kind]||'Đã lấy vị trí';
          await page.locator('#location-status').filter({hasText:expectedText}).waitFor();
        }
        await page.locator('#student-id').fill(id);await page.locator('#full-name').fill('Synthetic Student');await page.locator('#seat').fill('B-12');
        await page.locator('#submit').click();await page.locator('#receipt').waitFor({state:'visible'});
        const row=f.store.entries().find(r=>r.student_id===id);assert.equal(row.location_status,kind==='RECOVERED'?'INSIDE':kind);assert.equal(row.status,kind==='INSIDE'?'RECORDED':'PENDING');
        if(kind==='OUTSIDE'){assert.match(await page.locator('#receipt-fields').textContent(),/ngoài phạm vi/);await page.screenshot({path:path.join(screenshotDir,'location-student.png'),fullPage:true});}
      }finally{await context.close();}
    }
    for(const [i,kind] of ['INSIDE','OUTSIDE','UNCERTAIN','DENIED','MISSING','TIMEOUT','UNAVAILABLE','RECOVERED'].entries())await client('GEO00'+i,kind);
    await admin.reload();await admin.getByRole('link',{name:'Cần xử lý',exact:true}).click();await admin.locator('#issues-entries').filter({hasText:'GEO001'}).waitFor();
    await admin.screenshot({path:path.join(screenshotDir,'location-review.png'),fullPage:true});
    const outside=f.store.entries().find(r=>r.student_id==='GEO001');
    await admin.locator('#issues-entries tr[data-entry-id="'+outside.id+'"] button').click();
    await admin.locator('#review-note').fill('Đã đối chiếu tại ghế; sai số thiết bị.');await admin.locator('#save-review').click();
    await admin.locator('#review-dialog').waitFor({state:'hidden'});assert.equal(f.store.entries().find(r=>r.id===outside.id).status,'CONFIRMED');
    console.log('HTTP parent → HTTPS helper → permission/retry/review fallback → exact-origin message → geofence → review: passed.');
    console.log('Helper: '+(liveHelper?'published HTTPS page (no interception)':'local assets intercepted at HTTPS URL')+'. GPS: simulated.');
    console.log('Synthetic screenshots: '+screenshotDir);
  }finally{await browser.close();await f.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
