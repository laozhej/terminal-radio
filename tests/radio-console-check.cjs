// Quoting straight from the reply, free review of asked questions, one-screen calling on phones.
const { chromium } = require('playwright');
const { pathToFileURL } = require('node:url');
const { resolve } = require('node:path');
const { strict: assert } = require('node:assert');

const file = pathToFileURL(resolve(__dirname, '../末班电台.html')).href;

async function main() {
  const browser = await chromium.launch({ channel: 'chrome' });
  const errors = [];
  try {
    // ---------- desktop: quote from the reply, review without spending a call ----------
    const desk = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await desk.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    const preset = (text) => page.locator('#prompt-list').getByRole('button', { name: text, exact: true });
    const channel = (id) => page.locator(`#radio-channels [data-channel="${id}"]`).click();
    const count = async () => (await page.locator('#call-count').innerText()).trim();
    await page.goto(`${file}#intro=0`);

    assert.equal(await page.locator('.reply-quote').count(), 0, 'opening carries no evidence');
    await preset('门檐灯是怎么闪的？').click();
    assert.equal(await count(), '4');
    assert.equal(await page.getByRole('button', { name: /引用这条证词/ }).count(), 1);
    const replyQuote = page.locator('.reply-quote[data-reply-quote="signal"]');
    assert.match(await replyQuote.innerText(), /新证据\s*·\s*求救证词/);
    await replyQuote.click();
    assert.equal(await replyQuote.getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('.quote-button[data-evidence-id="signal"]').getAttribute('aria-pressed'), 'true', 'board shows the same quote');
    assert(await page.locator('#active-quote').isVisible());
    assert.equal(await page.locator('#radio-channels [aria-pressed="true"]').getAttribute('data-channel'), 'caller', 'quoting does not pick a channel for the player');
    await replyQuote.click();
    assert(!(await page.locator('#active-quote').isVisible()), 'second press removes the quote');
    await replyQuote.click();

    await channel('archive');
    await preset('哪些站房用这个灯号？').click();
    assert.equal(await count(), '3');
    assert(!(await page.locator('#active-quote').isVisible()), 'a call spends the quote');

    await channel('caller');
    const asked = preset('门檐灯是怎么闪的？');
    assert.equal(await asked.count(), 1, 'accessible name stays the question itself');
    assert(await asked.evaluate((button) => button.classList.contains('is-asked')));
    assert(!(await preset('你能看到什么地标？').evaluate((button) => button.classList.contains('is-asked'))));
    const clock = await page.locator('[data-story-clock]').innerText();
    // 回话下方此时是灯号档案；求救证词从证据板上引用。
    assert.equal(await page.locator('.reply-quote').getAttribute('data-reply-quote'), 'archive');
    await page.locator('.quote-button[data-evidence-id="signal"]').click();
    await asked.click();
    assert.equal(await count(), '3', 'reviewing an asked question is free');
    assert.match(await page.locator('#current-transmission').innerText(), /回看[\s\S]*先是两下很快[\s\S]*未扣通话/);
    assert.equal(await page.locator('[data-story-clock]').innerText(), clock, 'review does not move story time');
    assert.equal(await page.locator('.evidence-card').count(), 2);
    assert(await page.locator('#active-quote').isVisible(), 'review keeps the quote for the next real call');
    assert.match(await page.getByRole('button', { name: /证据板已有\s*·\s*求救证词/ }).innerText(), /已引用/);

    await channel('electric');
    await preset('22:16 哪些门灯断电？').click();
    assert.equal(await count(), '2');
    assert.doesNotMatch(await page.locator('#current-transmission').innerText(), /回看/, 'a new call ends the review');

    // the review never leaks into the outcome: a new case starts with nothing asked
    await page.locator('#map-points [data-location="pump"]').click();
    await page.locator('#dispatch-button').click();
    await page.locator('#confirm-dispatch').click();
    assert.match(await page.locator('#outcome').innerText(), /救援抵达排水泵站/);
    await page.getByRole('button', { name: '重玩', exact: true }).click();
    assert.equal(await count(), '5');
    assert.equal(await page.locator('#prompt-list .is-asked').count(), 0, 'replay forgets what was asked');
    await desk.close();

    // ---------- phone: reply, quote and questions on one screen ----------
    const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const mobile = await phone.newPage();
    mobile.on('pageerror', (error) => errors.push(`phone: ${error.message}`));
    await mobile.goto(`${file}#intro=0`);
    await mobile.locator('#prompt-list').getByRole('button', { name: '门檐灯是怎么闪的？', exact: true }).tap();
    await mobile.getByRole('button', { name: /引用这条证词/ }).tap();
    await mobile.waitForTimeout(700);
    const onScreen = await mobile.evaluate(() => {
      // 吸顶栏下面才算看得见。
      const top = document.querySelector('.masthead').getBoundingClientRect().bottom;
      return ['.transmission-message', '.reply-quote', '#active-quote', '#prompt-list button'].map((selector) => {
        const box = document.querySelector(selector).getBoundingClientRect();
        return [selector, box.top >= top && box.bottom <= innerHeight];
      });
    });
    assert(onScreen.every(([, visible]) => visible), `reply, quote and questions share one screen: ${JSON.stringify(onScreen)}`);
    await mobile.locator('#prompt-list').getByRole('button', { name: '门檐灯是怎么闪的？', exact: true }).tap();
    assert.equal((await mobile.locator('#call-count').innerText()).trim(), '4', 'review is free on phones too');
    const overflow = await mobile.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    assert(overflow <= 0, `phone overflows by ${overflow}px`);
    await phone.close();

    assert.deepEqual(errors, []);
    console.log('Console QA passed: quote from the reply, free review of asked questions, replay resets them, one-screen calling on phones.');
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
