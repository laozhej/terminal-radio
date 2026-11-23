// Plays many dealt cases, solving each only from what the evidence cards say.
const { chromium } = require('playwright');
const { pathToFileURL } = require('node:url');
const { resolve } = require('node:path');
const { strict: assert } = require('node:assert');

const names = { 北闸: 'gate', 排水泵站: 'pump', 旧货栈: 'warehouse' };
const codeNames = ['两短一长', '一短两长', '一长两短', '两长一短'];

async function main() {
  const htmlPath = resolve(__dirname, '../末班电台.html');
  const browser = await chromium.launch({ channel: 'chrome' });
  const errors = [];
  try {
    for (const [tag, width, height] of [['shuffle', 1440, 900], ['shuffle-m', 320, 720]]) {
      const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, reducedMotion: 'reduce' });
      const page = await context.newPage();
      page.on('pageerror', (error) => errors.push(`${tag}: ${error.message}`));
      const preset = (text) => page.locator('#prompt-list').getByRole('button', { name: text, exact: true }).click();
      const channel = (id) => page.locator(`#radio-channels [data-channel="${id}"]`).click();
      const cardText = (id) => page.locator(`.evidence-card[data-clue="${id}"] .evidence-text`).innerText();
      await page.goto(`${pathToFileURL(htmlPath).href}#intro=0`);

      const seen = { answers: new Set(), codes: new Set(), windows: new Set() };
      let previousAnswer = null;
      const total = tag === 'shuffle' ? 40 : 8;
      for (let round = 1; round <= total; round += 1) {
        // gather the three records the normal way
        await preset('门檐灯是怎么闪的？');
        const signal = await cardText('signal');
        const heard = /门檐红灯(.+)。/.exec(signal)[1];
        assert(codeNames.includes(heard), `unknown code name: ${signal}`);
        const spoken = await page.locator('#current-transmission .transmission-message').innerText();
        await page.getByRole('button', { name: '引用求救证词', exact: true }).click();
        await channel('archive');
        await preset('哪些站房用这个灯号？');
        const archive = await cardText('archive');
        const match = /^(.+?)、(.+?)(两短一长|一短两长|一长两短|两长一短)，(.+?)(两短一长|一短两长|一长两短|两长一短)。$/.exec(archive);
        assert(match, `archive text does not parse: ${archive}`);
        const [, first, second, sameCode, oddStation, oddCode] = match;
        assert.equal(sameCode, heard, 'archive disagrees with what the caller saw');
        assert.notEqual(oddCode, heard, 'odd station must use a different code');
        await channel('electric');
        await preset('22:16 哪些门灯断电？');
        const outage = await cardText('outage');
        const dark = /^(.+?)门灯 (\d\d:\d\d)–(\d\d:\d\d) 断电/.exec(outage);
        assert(dark, `outage text does not parse: ${outage}`);
        assert(dark[2] <= '22:16' && '22:16' <= dark[3], `outage window misses 22:16: ${outage}`);
        assert([first, second].includes(dark[1]), `dark station must share the caller's code: ${archive} / ${outage}`);
        const answerName = [first, second].find((name) => name !== dark[1]);
        const answer = names[answerName];
        assert(answer && names[oddStation] && new Set([first, second, oddStation]).size === 3, 'stations must be three distinct known names');

        // the map shows the same facts
        const facts = await page.locator('#map-points [data-point-facts]').allInnerTexts();
        assert.equal(facts.filter((text) => text.includes('断电')).length, 1, 'exactly one station marked as cut off');
        const marks = await page.evaluate(() => [...document.querySelectorAll('.lamp-code')].map((mark) => ({
          units: mark.dataset.units,
          code: mark.dataset.code,
          cycle: mark.style.getPropertyValue('--cycle'),
          beats: mark.children.length,
        })));
        assert(marks.length >= 5 && marks.every((mark) => ['11', '13'].includes(mark.units) && mark.beats === 3 && mark.cycle), `lamp marks malformed: ${JSON.stringify(marks)}`);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        assert(overflow <= 0, `horizontal overflow ${overflow}px in round ${round}`);

        if (round === 1) {
          assert.equal(answer, 'pump', 'first case must be the fixed one');
          assert.equal(spoken, '先是两下很快，第三下亮得久。每一轮都一样。');
        } else {
          assert.notEqual(answer, previousAnswer, 'a new case must move the answer');
          assert.equal((await page.locator('[data-case-number]').innerText()).trim(), `· 第 ${round} 通来电`);
        }
        seen.answers.add(answer);
        seen.codes.add(`${heard}/${oddCode}`);
        seen.windows.add(`${dark[2]}-${dark[3]}`);

        // every fifth round: go to the wrong place on purpose
        const wrong = round % 5 === 0;
        const target = wrong ? names[oddStation] : answer;
        await page.locator(`#map-points [data-location="${target}"]`).click();
        await page.locator('#dispatch-button').click();
        await page.locator('#confirm-dispatch').click();
        const outcome = await page.locator('#outcome').innerText();
        if (wrong) {
          assert.match(outcome, /派车地点错误/);
          assert(outcome.includes(`求救者在${answerName}`), `wrong-dispatch copy names the real place: ${outcome}`);
          assert.equal(await page.locator(`#map-points [data-location="${answer}"]`).getAttribute('aria-label'), `${answerName}，正确地点`);
        } else {
          assert(outcome.includes(`救援抵达${answerName}`), `success title names the place: ${outcome}`);
          assert.match(outcome, /证据充分/);
        }
        assert(outcome.includes(`灯号档案排除${oddStation}`) && outcome.includes(`停电记录排除${dark[1]}`), `proof lines match the case: ${outcome}`);
        assert(await page.locator(`#map-points [data-location="${answer}"]`).getAttribute('data-lamp'), 'the true station carries the lamp code at the end');

        // "重玩" stays on this case; "下一通来电" deals a new one
        if (round === 2) {
          await page.getByRole('button', { name: '重玩', exact: true }).click();
          await preset('门檐灯是怎么闪的？');
          assert.equal(await cardText('signal'), signal, 'replay must keep the same case');
          await page.locator(`#map-points [data-location="${answer}"]`).click();
          await page.locator('#dispatch-button').click();
          await page.locator('#confirm-dispatch').click();
          assert.match(await page.locator('#outcome').innerText(), /救援抵达，证据不足/);
        }
        previousAnswer = answer;
        if (round < total) {
          await page.getByRole('button', { name: '下一通来电', exact: true }).click();
          assert.equal((await page.locator('#call-count').innerText()).trim(), '5');
          assert.equal(await page.locator('.evidence-card').count(), 0, 'a new case starts with an empty board');
        }
      }
      const tally = await page.locator('.outcome-stats').innerText();
      console.log(`${tag}: ${total} cases · answers ${[...seen.answers].sort().join(',')} · ${seen.codes.size} code pairs · ${seen.windows.size} outage windows · tally "${tally.replace(/\s+/g, ' ')}"`);
      if (tag === 'shuffle') {
        assert.equal(seen.answers.size, 3, 'all three stations should turn up as the answer');
        assert(seen.codes.size >= 6, 'expected a good spread of lamp codes');
      }
      await context.close();
    }
    assert.deepEqual(errors, []);
    console.log('shuffle run passed');
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
