const { chromium } = require('playwright');
const { pathToFileURL } = require('node:url');
const { resolve } = require('node:path');
const { strict: assert } = require('node:assert');

async function main() {
  const browser = await chromium.launch({ channel: 'chrome' });
  try {
    const context = await browser.newContext({ offline: true, reducedMotion: 'no-preference' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(pathToFileURL(resolve(__dirname, '../末班电台.html')).href + '#intro=1');
    await page.locator('#answer-call').click();
    assert.match(page.url(), /^file:\/\//);
    assert.match(await page.title(), /末班电台/);
    assert.match(await page.locator('#current-transmission').innerText(), /我摔伤了/);
    assert.equal((await page.locator('#call-count').innerText()).trim(), '5');

    await page.getByRole('button', { name: '门檐灯是怎么闪的？' }).click();
    await page.getByRole('button', { name: '引用求救证词' }).click();
    await page.getByRole('button', { name: '灯号值守员', exact: true }).click();
    await page.getByRole('button', { name: '哪些站房用这个灯号？' }).click();
    await page.getByRole('button', { name: '维修电工', exact: true }).click();
    await page.getByRole('button', { name: '22:16 哪些门灯断电？' }).click();
    await page.getByRole('button', { name: '排水泵站', exact: true }).click();
    await page.getByRole('button', { name: '派车至排水泵站', exact: true }).click();
    await page.getByRole('button', { name: '确认派车', exact: true }).click();
    const inTransit = await page.locator('#outcome').evaluate((el) => ({
      phase: document.documentElement.dataset.phase,
      opacity: getComputedStyle(el).opacity,
    }));
    assert.deepEqual(inTransit, { phase: 'dispatching', opacity: '0' });
    await page.waitForFunction(() => document.documentElement.dataset.phase === 'outcome'
      && getComputedStyle(document.getElementById('outcome')).opacity === '1');
    assert.match(await page.locator('#outcome').innerText(), /救援抵达排水泵站/);
    assert.deepEqual(errors, []);
    console.log('Offline direct-file gameplay smoke passed.');
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
