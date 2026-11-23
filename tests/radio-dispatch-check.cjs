// 派车前核对条：选中站房后，证词和这一站的两项记录要并排出现在派车按钮旁，手机竖屏上尤其要对得上。
const { chromium } = require('playwright');
const { pathToFileURL } = require('node:url');
const { resolve } = require('node:path');
const { strict: assert } = require('node:assert');

async function main() {
  const browser = await chromium.launch({ channel: 'chrome' });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(pathToFileURL(resolve(__dirname, '../末班电台.html')).href + '#intro=0');

    const point = (id) => page.locator(`#map-points [data-location="${id}"]`);
    const rows = () => page.locator('[data-dispatch-check] .check-row').evaluateAll((list) => list.map((row) => ({
      name: row.querySelector('.check-name').textContent,
      text: row.querySelector('.check-text').textContent,
      code: row.querySelector('.lamp-code')?.dataset.code ?? null,
      missing: row.classList.contains('is-missing'),
    })));
    const chips = (id) => point(id).locator('[data-point-facts] .fact').allInnerTexts();
    const ask = async (channel, question) => {
      await page.locator(`#radio-channels [data-channel="${channel}"]`).tap();
      await page.locator('#prompt-list').getByRole('button', { name: question, exact: true }).tap();
    };

    // 没选站房时不出现
    assert(await page.locator('[data-dispatch-check]').isHidden(), '没选站房时核对条应隐藏');

    // 一条证据都没有：三行都写未取得，不泄露任何内容
    await point('pump').tap();
    assert.deepEqual(await rows(), [
      { name: '求救证词', text: '未取得', code: null, missing: true },
      { name: '灯号档案', text: '未取得', code: null, missing: true },
      { name: '停电记录', text: '未取得', code: null, missing: true },
    ]);
    assert.equal(await page.locator('[data-dispatch-check] .check-value[class*="is-o"]').count(), 0, '未取得的记录不能带供电状态');
    assert.match(await page.locator('[data-dispatch-check] .check-title').innerText(), /^排水泵站/);

    // 问到证词后，第一行跟证据卡一致
    await ask('caller', '门檐灯是怎么闪的？');
    let [signal, lamp, power] = await rows();
    assert.equal(signal.text, '两短一长');
    assert.equal(signal.code, 'ssl');
    assert(lamp.missing && power.missing);

    // 带证词查档、再问电工：后两行跟地图上这一站的标注一致
    await page.getByRole('button', { name: '引用求救证词', exact: true }).tap();
    await ask('archive', '哪些站房用这个灯号？');
    await ask('electric', '22:16 哪些门灯断电？');
    for (const id of ['pump', 'gate', 'warehouse']) {
      await point(id).tap();
      [signal, lamp, power] = await rows();
      const [lampChip, powerChip] = await chips(id);
      assert.equal(signal.text, '两短一长', '证词行不随站房变');
      assert.equal(lamp.text, lampChip.trim(), `${id} 的灯号应与地图标注一致`);
      assert.equal(power.text, powerChip.trim(), `${id} 的供电应与地图标注一致`);
      assert.equal(lamp.code === signal.code, lamp.text === signal.text, '记号和文字要说同一件事');
    }
    assert.equal(await page.locator('[data-dispatch-check] .check-value.is-off').count(), 0, '旧货栈供电正常');
    await point('gate').tap();
    assert.equal(await page.locator('[data-dispatch-check] .check-value.is-off').count(), 1, '北闸断电要标出来');

    // 手机竖屏：核对条、两个按钮都在地图面板里，不横向溢出；窄到 320 也一样
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      assert(!(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)), `${width}px 横向溢出`);
      const fits = await page.evaluate(() => {
        const panel = document.querySelector('.map-panel').getBoundingClientRect();
        return [...document.querySelectorAll('[data-dispatch-check] .check-row, #dispatch-button, #exclude-button')]
          .every((item) => { const box = item.getBoundingClientRect(); return box.left >= panel.left && box.right <= panel.right + 0.5; });
      });
      assert(fits, `${width}px 核对条或按钮超出地图面板`);
    }

    // 问完话去地图的入口：地图在证据条下面，点了要展开整张，地图和派车钮都滚进屏幕
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: '收起地图', exact: true }).tap();
    assert((await page.locator('.survey-map').boundingBox()).height <= 130, '收起后地图应是缩略带');
    assert.equal(await page.locator('#map-points [data-location="gate"]').getAttribute('aria-pressed'), 'true', '收起地图不改选中');
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.locator('[data-to-map]').tap();
    await page.waitForFunction(() => {
      const map = document.querySelector('.survey-map').getBoundingClientRect();
      const button = document.querySelector('#dispatch-button').getBoundingClientRect();
      return map.height > 200 && map.top >= 0 && button.bottom <= window.innerHeight;
    }, null, { timeout: 3000 });

    // 派车后核对条收起
    await point('pump').tap();
    await page.locator('#dispatch-button').tap();
    await page.locator('#confirm-dispatch').tap();
    assert(await page.locator('[data-dispatch-check]').isHidden(), '派车后核对条应收起');
    assert.match(await page.locator('#outcome').innerText(), /救援抵达排水泵站/);

    // 桌面上不显示回地图入口，核对条仍在
    await page.getByRole('button', { name: '重玩', exact: true }).tap();
    await page.setViewportSize({ width: 1440, height: 900 });
    assert(await page.locator('[data-to-map]').isHidden(), '桌面不需要回地图入口');
    await point('warehouse').click();
    assert.equal((await rows()).length, 3);

    assert.deepEqual(errors, []);
    console.log('Dispatch check passed: empty, partial and full evidence, map agreement, 390/320 px fit, jump to map, hidden after dispatch.');
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
