const { chromium } = require('playwright');
const { strict: assert } = require('node:assert');
const { readFile } = require('node:fs/promises');
const { resolve } = require('node:path');

const origin = 'http://radio.test';
const ids = {
  form: '#free-call-form',
  question: '#free-question',
  submit: '#free-call-button',
  quote: '#active-quote',
  callCount: '#call-count',
  dispatch: '#dispatch-button',
};

async function main() {
  const html = await readFile(resolve(__dirname, '../末班电台.html'), 'utf8');
  const browser = await chromium.launch({ channel: 'chrome' });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const requests = [];
    const external = [];
    const browserErrors = [];
    let statusAvailable = true;
    let pending;
    await context.route('**/*', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.origin !== origin) {
        external.push(url.href);
        return route.abort();
      }
      if (url.pathname === '/') {
        return route.fulfill({ contentType: 'text/html; charset=utf-8', body: html });
      }
      if (url.pathname === '/favicon.ico') return route.fulfill({ status: 204 });
      if (url.pathname === '/api/status') return route.fulfill({ json: { available: statusAvailable } });
      if (url.pathname !== '/api/radio') return route.fulfill({ status: 404 });
      const body = request.postDataJSON();
      requests.push({ method: request.method(), body });
      if (body.question === '服务暂时断开') return route.fulfill({ status: 502, json: { error: 'unavailable' } });
      if (body.question === '故障意图') return route.fulfill({ json: { intent: 'arbitrary' } });
      if (body.question === '角色错位') return route.fulfill({ json: { intent: 'outage' } });
      if (body.question === '令牌无效') return route.fulfill({ status: 503, json: { error: 'authorization' } });
      if (body.question === '推理限流') return route.fulfill({ status: 429, json: { error: 'quota' } });
      if (body.question === '请求超时') return route.fulfill({ status: 504, json: { error: 'timeout' } });
      if (body.question === '这是刚刚那盏灯的记录，名单有谁？') {
        pending = {};
        await new Promise((release) => { pending.release = release; });
      }
      const intents = {
        caller: 'pattern',
        archive: 'lookup',
        electric: 'outage',
      };
      return route.fulfill({ json: { intent: intents[body.channel] } });
    });

    const page = await context.newPage();
    page.on('pageerror', (error) => browserErrors.push(error.message));
    const locator = (selector) => page.locator(selector);
    const button = (label) => page.getByRole('button', { name: label, exact: true });
    const channel = (id) => locator(`#radio-channels [data-channel="${id}"]`).click();
    const question = () => locator(ids.question).inputValue();
    const callCount = async () => (await locator(ids.callCount).innerText()).trim();
    const assertCount = async (count) => assert.equal(await callCount(), String(count));
    const assertProof = async (id) => assert(await locator(`[data-evidence-id="${id}"]`).isVisible(), `Missing known proof ${id}`);
    const setQuestion = (text) => locator(ids.question).fill(text);
    const submit = () => locator(ids.submit).click();
    const postAndReply = async (text) => {
      await setQuestion(text);
      const reply = page.waitForResponse((res) => res.url() === `${origin}/api/radio`);
      await submit();
      await reply;
      await page.waitForFunction((selector) => {
        const field = document.querySelector(selector);
        return !field.disabled && !field.readOnly;
      }, ids.question);
    };

    await page.goto(origin);
    await locator(ids.form).waitFor({ state: 'visible' });
    await assertCount(5);
    assert.equal(await question(), '');
    await setQuestion('候选词测试');
    await locator(ids.question).dispatchEvent('compositionstart');
    await locator(ids.question).press('Enter');
    await locator(ids.question).dispatchEvent('compositionend');
    await assertCount(5);
    assert.equal(requests.length, 0, 'Input method confirmation submitted a call');
    await channel('archive');
    await postAndReply('那个闪法对应哪几个点？');
    await assertCount(5);
    assert.equal(await question(), '那个闪法对应哪几个点？');
    assert.match(await locator('#radio-feedback').innerText(), /引用/);
    assert.equal(await locator('[data-evidence-id="archive"]').count(), 0);

    await channel('caller');
    await postAndReply('你能数数那盏门灯亮多久、亮几遍吗？');
    await assertCount(4);
    await assertProof('signal');
    assert.equal(await question(), '');
    await button('引用求救证词').click();
    await channel('archive');
    assert(await locator(ids.quote).isVisible(), 'Quote did not follow channel switch');
    await setQuestion('这是刚刚那盏灯的记录，名单有谁？');

    for (const [failingQuestion, notice] of [
      ['服务暂时断开', /通话未接通/],
      ['故障意图', /通话未接通/],
      ['角色错位', /通话未接通/],
      ['令牌无效', /未接受令牌/],
      ['推理限流', /限流或额度不足/],
      ['请求超时', /通话超时/],
    ]) {
      await postAndReply(failingQuestion);
      await assertCount(4);
      assert.equal(await question(), failingQuestion);
      assert.match(await locator('#radio-feedback').innerText(), notice);
      assert(await locator(ids.quote).isVisible(), 'Failure removed evidence citation');
      assert(await button('哪些站房用这个灯号？').isEnabled(), 'Failure disabled the offline choices');
    }

    await locator('#map-points [data-location="pump"]').click();
    assert(await locator(ids.dispatch).isEnabled(), 'Selection did not permit dispatch');
    await setQuestion('这是刚刚那盏灯的记录，名单有谁？');
    const archiveRequest = page.waitForRequest(`${origin}/api/radio`);
    await submit();
    await archiveRequest;
    await page.waitForFunction((selector) => document.querySelector(selector).getAttribute('aria-disabled') === 'true', ids.submit);
    assert(await locator(ids.dispatch).isDisabled(), 'Dispatch remained enabled while resolving a call');
    assert(await button('哪些站房用这个灯号？').isDisabled(), 'Preset remained enabled during pending call');
    const requestCount = requests.length;
    await page.keyboard.press('Enter');
    assert.equal(requests.length, requestCount, 'Pending call submitted twice');
    const archivedReply = page.waitForResponse((res) => res.url() === `${origin}/api/radio`);
    assert(pending?.release, 'Expansion test did not intercept pending request');
    const typedArchive = requests.at(-1);
    assert.equal(typedArchive.method, 'POST');
    assert.deepEqual(typedArchive.body, {
      channel: 'archive', question: '这是刚刚那盏灯的记录，名单有谁？', quoteId: 'signal',
    });
    pending.release();
    await archivedReply;
    await locator('[data-evidence-id="archive"]').waitFor({ state: 'visible' });
    await assertCount(3);
    assert.equal(await question(), '');
    assert(!(await locator(ids.quote).isVisible()), 'Completed call did not consume quote');
    assert(await locator(ids.dispatch).isEnabled(), 'Completed call did not restore dispatch');

    await channel('electric');
    await postAndReply('服务暂时断开');
    await assertCount(3);
    await button('22:16 哪些门灯断电？').click();
    await assertProof('outage');
    await assertCount(2);
    await locator(ids.dispatch).click();
    await button('确认派车').click();
    assert.match(await locator('#outcome').innerText(), /救援抵达排水泵站/);
    assert(await locator(ids.submit).isDisabled(), 'Call stayed available after dispatch');

    await button('重玩').click();
    await assertCount(5);
    assert.equal(await question(), '');
    await page.setViewportSize({ width: 390, height: 844 });
    assert(await locator(ids.question).isVisible());
    assert(await locator(ids.submit).isVisible());
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      assert(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)), `Page overflows at ${width}px`);
    }
    statusAvailable = false;
    const unavailableStatus = page.waitForResponse((res) => res.url() === `${origin}/api/status`);
    await page.reload();
    await unavailableStatus;
    assert(!(await locator(ids.form).isVisible()) || await locator(ids.submit).isDisabled(), 'Unavailable model left a live input');
    await button('门檐灯是怎么闪的？').click();
    await assertCount(4);
    await assertProof('signal');
    assert.deepEqual(browserErrors, []);
    assert.deepEqual(external, []);
    console.log('Model UI browser QA passed: bracketed citation, paraphrases, maintenance and invalid action fallback, pending lock, verified dispatch, replay, offline-status fallback, 320/390 px layout.');
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
