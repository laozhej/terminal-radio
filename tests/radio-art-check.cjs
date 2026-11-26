// Pixel stations give nothing away, the glass shows this case's rhythm, and the lamp waits for the truck.
const { chromium } = require('playwright');
const { pathToFileURL } = require('node:url');
const { resolve } = require('node:path');
const { strict: assert } = require('node:assert');

const file = pathToFileURL(resolve(__dirname, '../末班电台.html')).href;
const lit = () => [...document.querySelectorAll('.st-halo, .st-wash, .st-reflect rect')]
  .filter((node) => getComputedStyle(node).opacity !== '0').length;

async function main() {
  const browser = await chromium.launch({ channel: 'chrome' });
  const errors = [];
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`${file}#intro=1`);

    // three houses, the same lamp and the same hidden reflection, nothing lit
    const houses = await page.evaluate(() => [...document.querySelectorAll('.map-point')].map((point) => ({
      pixel: point.querySelectorAll('svg.station.is-pixel').length,
      lamp: point.querySelectorAll('.st-lamp').length,
      reflect: point.querySelectorAll('.st-reflect rect').length,
      chalk: point.querySelectorAll('svg.chalk').length,
    })));
    assert.equal(houses.length, 3);
    assert(houses.every((house) => house.pixel === 1 && house.chalk === 1 && house.lamp === houses[0].lamp
      && house.reflect === houses[0].reflect && house.lamp > 0), `stations must look alike: ${JSON.stringify(houses)}`);
    assert.equal(await page.evaluate(lit), 0, 'no lamp is lit while the case is open');

    // the line connects: the lamp shows on the glass in this case's rhythm
    assert.equal(await page.locator('.rx').getAttribute('data-glass'), null);
    await page.locator('#answer-call').click();
    await page.waitForFunction(() => document.querySelector('.rx').dataset.glass === 'ssl');

    // dispatch: nothing lights before the truck arrives
    await page.locator('#prompt-list').getByRole('button', { name: '门檐灯是怎么闪的？', exact: true }).click();
    await page.locator('#map-points [data-location="warehouse"]').click();
    await page.locator('#dispatch-button').click();
    await page.locator('#confirm-dispatch').click();
    assert.equal(await page.evaluate(() => document.documentElement.dataset.phase), 'dispatching');
    assert.equal(await page.evaluate(lit), 0, 'the lamp may not light before arrival');
    await page.waitForFunction(() => document.documentElement.dataset.phase === 'outcome');
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.map-point.is-correct .st-wash')).opacity === '1');
    assert.equal(await page.locator('.map-point.is-correct').getAttribute('data-location'), 'pump');
    assert.equal(await page.locator('.map-point.is-dispatched .st-wash').evaluate((node) => getComputedStyle(node).opacity), '0', 'only the true house lights');

    // a new case connects with its own rhythm
    await page.getByRole('button', { name: '下一通来电', exact: true }).click();
    const glass = await page.waitForFunction(() => document.querySelector('.rx').dataset.glass).then((handle) => handle.jsonValue());
    await page.locator('#prompt-list').getByRole('button', { name: '门檐灯是怎么闪的？', exact: true }).click();
    assert.equal(await page.locator('.evidence-card[data-clue="signal"] .lamp-code').getAttribute('data-code'), glass, 'glass follows this case');
    await context.close();

    // reduced motion: the lamp is simply on
    const calm = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
    const still = await calm.newPage();
    still.on('pageerror', (error) => errors.push(`reduced: ${error.message}`));
    await still.goto(`${file}#intro=0`);
    await still.locator('#map-points [data-location="pump"]').click();
    await still.locator('#dispatch-button').click();
    await still.locator('#confirm-dispatch').click();
    await still.waitForFunction(() => document.documentElement.dataset.phase === 'outcome');
    // 全局把过渡压成 0.01 毫秒，所以等下一帧再读。
    await still.waitForTimeout(100);
    const steady = await still.evaluate(() => [...document.querySelectorAll('.map-point.is-correct .st-reflect rect')]
      .map((node) => [getComputedStyle(node).opacity, getComputedStyle(node).animationName]));
    assert(steady.length && steady.every(([opacity, name]) => opacity === '1' && name === 'none'), `lamp should be steady: ${JSON.stringify(steady)}`);
    await calm.close();

    assert.deepEqual(errors, []);
    console.log('Art QA passed: alike pixel stations, glass lamp per case, lamp dark until arrival and only at the true house, reduced motion.');
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
