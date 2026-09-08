// Optional browser smoke test. Start npm run demo first; requires playwright-core + Chromium.
const {chromium} = require(process.env.BP_PLAYWRIGHT_MODULE || 'playwright-core');
const assert = require('node:assert/strict');
const path = require('node:path');
(async () => {
  const browser = await chromium.launch({headless:true, ...(process.env.BP_CHROMIUM ? {executablePath:process.env.BP_CHROMIUM} : {}), args:['--no-sandbox']});
  try {
    const page = await browser.newPage({viewport:{width:1100,height:900}});
    const errors=[]; page.on('pageerror', e => errors.push(e.message));
    const requests=[]; page.on('request',r=>requests.push(r.url()));
    await page.goto('http://127.0.0.1:'+(process.env.BP_DEMO_PORT || 4173));
    await page.waitForFunction(()=>document.getElementById('roster-count').textContent.includes('700'));
    assert.match(await page.locator('#demo-banner').textContent(),/Không kết nối Google/);
    await page.locator('#open').click();
    await page.locator('#qr svg').waitFor();
    await page.locator('#sync').click();
    assert.match(await page.locator('#stats').textContent(),/137 hợp lệ/);
    await page.screenshot({path:path.resolve(__dirname,'../docs/demo-dashboard.png'),fullPage:true});
    await page.locator('#project').click();
    await page.setViewportSize({width:1000,height:780});
    assert.equal(await page.locator('#open').isVisible(),false);
    assert.equal(await page.locator('#session-code').textContent(),'BP26A9');
    assert.ok(await page.evaluate(()=>document.getElementById('session-code').getBoundingClientRect().bottom < innerHeight),'Session code must fit projector screen');
    await page.screenshot({path:path.resolve(__dirname,'../docs/demo-projector.png'),fullPage:true});
    await page.locator('#exit-project').click();
    await page.locator('#close').click();
    assert.equal(await page.locator('#qr svg').count(),0);
    assert.equal(await page.locator('#form-link').isVisible(),false);
    assert.equal(await page.locator('#open').isEnabled(),false);
    // Error text is rendered as text rather than interpreted HTML.
    await page.evaluate(()=>note('<img src=x onerror=alert(1)>',true));
    assert.equal(await page.locator('#notice img').count(),0);
    await page.setViewportSize({width:390,height:844});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
    assert.deepEqual(errors,[]);
    assert.ok(requests.every(url=>url.startsWith('http://127.0.0.1:')),'QR must not call external services');
    console.log('UI smoke passed: open, QR, sync, projection, close, mobile width, text escaping, no external QR calls.');
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
