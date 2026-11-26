(() => {
  const callLimit = 5;
  const locations = {
    gate: '北闸',
    pump: '排水泵站',
    warehouse: '旧货栈',
  };
  // 列举站房时一律按这个顺序，免得从排列里看出答案。
  const stationOrder = ['gate', 'pump', 'warehouse'];
  const opening = {
    speaker: '求救者',
    channel: 'caller',
    clock: '22:16:00',
    message: '这里是河堤巡检线。我摔伤了，人在一间站房里。就在这间屋的门檐底下，有一盏红灯一直在闪。雨太大，我看不见门牌。',
  };
  // 灯号：s 短闪，l 长闪。heard 是求救者描述这种节奏的原话。
  const lampCodes = {
    ssl: { name: '两短一长', heard: '先是两下很快，第三下亮得久。每一轮都一样。' },
    sll: { name: '一短两长', heard: '先一下很快，接着两下都亮得久。每一轮都一样。' },
    lss: { name: '一长两短', heard: '先亮一下很久，接着两下很快。每一轮都一样。' },
    lls: { name: '两长一短', heard: '先两下都亮得久，最后一下很快。每一轮都一样。' },
  };
  // 停电时段都盖住来电的 22:16。
  const outageWindows = [['22:10', '22:20'], ['22:05', '22:25'], ['22:12', '22:30'], ['22:00', '22:18']];
  // 第一案固定不变：演示、录屏和检查脚本都认它。
  const firstCase = { answer: 'pump', dark: 'gate', odd: 'warehouse', seen: 'ssl', other: 'sll', outage: outageWindows[0] };

  // 一案的全部内容由六项决定：
  // answer 求救者所在站房；dark 灯号相同但当时断电的站房；odd 灯号不同的站房；
  // seen 求救者看到的灯号；other 第三处站房的灯号；outage 断电起止时间。
  // 规则、提问意图和台词句式不变，所以服务端和模型不用跟着改。
  function buildCase(spec) {
    const { answer, dark, odd, seen, other, outage: [from, to] } = spec;
    const [first, second] = stationOrder.filter((id) => id !== odd).map((id) => locations[id]);
    const seenName = lampCodes[seen].name;
    const otherName = lampCodes[other].name;
    const lampMarks = {};
    const powerMarks = {};
    stationOrder.forEach((id) => {
      lampMarks[id] = id === odd ? { code: other, label: otherName } : { code: seen, label: seenName };
      powerMarks[id] = id === dark ? { power: 'off', label: `${from}–${to} 断电` } : { power: 'on', label: '供电正常' };
    });
    return {
      spec,
      solution: answer,
      clues: {
        signal: {
          name: '求救证词',
          source: '求救者',
          text: `22:16，门檐红灯${seenName}。`,
          code: seen,
          codeLabel: seenName,
        },
        archive: {
          name: '灯号档案',
          source: '灯号值守员',
          text: `${first}、${second}${seenName}，${locations[odd]}${otherName}。`,
          marks: lampMarks,
        },
        outage: {
          name: '停电记录',
          source: '维修电工',
          text: `${locations[dark]}门灯 ${from}–${to} 断电，无备用供电。`,
          marks: powerMarks,
        },
      },
      // 结算时回放：哪份记录排除了哪里。
      proofs: [
        ['archive', `灯号档案排除${locations[odd]}。它的灯是${otherName}，求救者看到的是${seenName}。`],
        ['outage', `停电记录排除${locations[dark]}。22:16 ${locations[dark]}门灯断电，无备用供电。`],
      ],
      channels: {
        caller: {
          name: '求救者',
          unknownReply: '这我说不清。我能看见门檐下的红灯，你想问灯吗？',
          prompts: [
            {
              intent: 'pattern',
              topic: '闪灯节奏',
              question: '门檐灯是怎么闪的？',
              reply: lampCodes[seen].heard,
              cite: lampCodes[seen].heard.split('。')[0],
              clue: 'signal',
            },
            {
              intent: 'landmark',
              topic: '周围地标',
              question: '你能看到什么地标？',
              reply: '窗外全是雨，只看得见这间屋门檐下的红灯。它一直按同一个节奏闪。',
            },
          ],
        },
        archive: {
          name: '灯号值守员',
          unknownReply: '我手上是站房的灯号档案。你想查哪种灯号？',
          prompts: [
            {
              intent: 'lookup',
              topic: '按灯号查档',
              question: '哪些站房用这个灯号？',
              reply: `查到了。${first}和${second}都是${seenName}。${locations[odd]}是${otherName}。`,
              cite: `${first}和${second}都是${seenName}。${locations[odd]}是${otherName}`,
              needsQuote: 'signal',
              clue: 'archive',
            },
            {
              intent: 'outagesRedirect',
              topic: '今晚停电',
              question: '今晚哪些灯没亮？',
              reply: '我这里有三处站房的灯号档案。今晚哪儿停电，得问维修电工。',
            },
          ],
        },
        electric: {
          name: '维修电工',
          unknownReply: '我只能查今晚的灯路维修单。你想查哪个时候的供电？',
          prompts: [
            {
              intent: 'outage',
              topic: '停电记录',
              question: '22:16 哪些门灯断电？',
              reply: `${locations[dark]}门灯 ${from} 到 ${to} 断电，这盏灯没接备用电源。另两处门灯正常供电。`,
              cite: `${locations[dark]}门灯 ${from} 到 ${to} 断电，这盏灯没接备用电源`,
              clue: 'outage',
            },
            {
              intent: 'patternRedirect',
              topic: '灯号含义',
              question: '维修单上有灯号吗？',
              reply: '维修单只记灯路通断。各站房的闪灯节奏，请问灯号值守员。',
            },
          ],
        },
      },
    };
  }

  // 发下一案：答案一定换一处站房，其余随机。
  function dealCase(previous) {
    const pick = (list) => list[Math.floor(Math.random() * list.length)];
    const answer = pick(stationOrder.filter((id) => id !== previous.answer));
    const dark = pick(stationOrder.filter((id) => id !== answer));
    const odd = stationOrder.find((id) => id !== answer && id !== dark);
    const seen = pick(Object.keys(lampCodes));
    const other = pick(Object.keys(lampCodes).filter((code) => code !== seen));
    return { answer, dark, odd, seen, other, outage: pick(outageWindows) };
  }

  // 当前这一案。reset 时整体换掉，其余代码照旧读这几个名字。
  let scene = buildCase(firstCase);
  let { solution, clues, channels } = scene;
  // 本班战绩：每案只记第一次派车的结果。
  const shift = { number: 1, cases: 0, saved: 0 };

  function init() {
    const byId = (id) => document.getElementById(id);
    const elements = {
      callCount: byId('call-count'),
      radioStatus: byId('radio-status'),
      transmission: byId('current-transmission'),
      history: byId('call-history'),
      historyList: byId('call-history-list'),
      promptList: byId('prompt-list'),
      freeCallForm: byId('free-call-form'),
      freeQuestion: byId('free-question'),
      freeCallButton: byId('free-call-button'),
      freeCallNotice: byId('free-call-notice'),
      feedback: byId('radio-feedback'),
      evidenceList: byId('evidence-list'),
      activeQuote: byId('active-quote'),
      mapFeedback: byId('map-feedback'),
      excludeButton: byId('exclude-button'),
      dispatchButton: byId('dispatch-button'),
      dialog: byId('dispatch-dialog'),
      dialogTitle: byId('dispatch-dialog-title'),
      dialogCopy: byId('dispatch-dialog-copy'),
      cancelDispatch: byId('cancel-dispatch'),
      confirmDispatch: byId('confirm-dispatch'),
      outcome: byId('outcome'),
      evidenceCount: document.querySelector('[data-evidence-count]'),
      mapWitness: document.querySelector('[data-map-witness]'),
      caseNumber: document.querySelector('[data-case-number]'),
      dispatchCheck: document.querySelector('[data-dispatch-check]'),
    };
    const root = document.documentElement;
    const channelButtons = [...byId('radio-channels').querySelectorAll('button[data-channel]')];
    const mapButtons = [...byId('map-points').querySelectorAll('button[data-location]')];
    // 通话灯：顶栏（手机）和电台面板（桌面）各一排，同步亮灭。
    const lampRows = [...document.querySelectorAll('[data-call-lamps]')].map((row) => [...row.querySelectorAll('.call-lamp')]);
    const callReadouts = [...document.querySelectorAll('[data-calls-left]')];
    let state;
    let freeCallAvailable = false;
    let composing = false;
    let ignoreCompositionSubmit = false;

    function node(tag, className, content) {
      const element = document.createElement(tag);
      if (className) element.className = className;
      if (content) element.textContent = content;
      return element;
    }

    // 表现层（音效、动画、开场）只监听这些事件，不改游戏状态。
    function emit(name, detail = {}) {
      document.dispatchEvent(new CustomEvent(`radio:${name}`, { detail }));
    }

    // 逐字显示用。文字一次写入，朗读与 innerText 都拿得到整句。
    // cite 是构成证据的那几个字，包进 .cite 里划线，文字本身不变。
    function spell(text, cite = null) {
      const fragment = document.createDocumentFragment();
      const from = cite ? text.indexOf(cite) : -1;
      const to = from < 0 ? -1 : from + cite.length;
      let mark = null;
      [...text].forEach((character, index) => {
        const glyph = node('span', 'glyph', character);
        glyph.style.setProperty('--i', String(index));
        if (index === from) {
          mark = node('span', 'cite');
          fragment.append(mark);
        }
        if (index === to) mark = null;
        (mark ?? fragment).append(glyph);
      });
      return fragment;
    }

    // 灯号图形：s 短闪，l 长闪，文字说明由旁边的标签给出。
    // 一拍 0.26 秒：短闪 1 拍，长闪 3 拍，间隔 1 拍，每轮停 4 拍。每个记号的起点交给样式，按真实节奏亮。
    function lampCode(code) {
      const beat = 0.26;
      const lengths = [...code].map((kind) => (kind === 'l' ? 3 : 1));
      const units = lengths.reduce((sum, length) => sum + length, 0) + lengths.length - 1 + 4;
      const mark = node('span', 'lamp-code');
      mark.dataset.code = code;
      mark.dataset.units = String(units);
      mark.style.setProperty('--cycle', `${(units * beat).toFixed(2)}s`);
      mark.setAttribute('aria-hidden', 'true');
      let start = 0;
      lengths.forEach((length) => {
        const light = node('i', length === 3 ? 'beat is-long' : 'beat');
        light.style.setProperty('--at', `${((start - units) * beat).toFixed(2)}s`);
        mark.append(light);
        start += length + 1;
      });
      return mark;
    }

    function setButtonLabel(button, label) {
      (button.querySelector('[data-button-label]') ?? button).textContent = label;
    }

    function setRadioFeedback(message = '') {
      elements.feedback.hidden = !message;
      elements.feedback.textContent = message;
    }

    function remaining() {
      return callLimit - state.calls.length;
    }

    function canCall() {
      return !state.pendingCall && !state.outcome && remaining() > 0;
    }

    function canDispatch() {
      return !state.pendingCall && !state.outcome && Boolean(state.selected) && !state.excluded.has(state.selected);
    }

    function hasFullEvidence() {
      return state.evidence.has('archive') && state.evidence.has('outage');
    }

    function callTime(callNumber) {
      const elapsed = callNumber * 30;
      return `22:${16 + Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}`;
    }

    function updateCallControls() {
      const callsLeft = remaining();
      const busy = Boolean(state.pendingCall);
      const canContinue = !state.outcome && callsLeft > 0;
      if (elements.callCount.textContent !== String(callsLeft)) {
        elements.callCount.textContent = String(callsLeft);
      }
      root.dataset.calls = String(callsLeft);
      root.dataset.busy = String(busy);
      lampRows.forEach((lamps) => lamps.forEach((lamp, index) => {
        lamp.classList.toggle('is-used', index >= callsLeft);
        lamp.classList.toggle('is-next', index === callsLeft - 1);
        lamp.classList.toggle('is-last-used', index === callsLeft);
      }));
      callReadouts.forEach((readout) => {
        if (readout.textContent !== String(callsLeft)) readout.textContent = String(callsLeft);
      });
      channelButtons.forEach((button) => {
        button.setAttribute('aria-pressed', String(button.dataset.channel === state.channel));
        button.toggleAttribute('data-called', state.calls.some(({ channel }) => channel === button.dataset.channel));
        button.disabled = busy;
      });
      const callButtons = [
        ...elements.promptList.querySelectorAll('button'),
        ...elements.evidenceList.querySelectorAll('.quote-button'),
        ...elements.transmission.querySelectorAll('.reply-quote'),
        ...elements.activeQuote.querySelectorAll('.remove-quote'),
      ];
      callButtons.forEach((button) => {
        button.disabled = !canCall();
      });
      if (elements.freeCallForm) {
        elements.freeCallForm.setAttribute('aria-busy', String(busy));
        elements.freeQuestion.readOnly = busy;
        elements.freeQuestion.disabled = !canContinue;
        elements.freeCallButton.disabled = !canContinue;
        elements.freeCallButton.setAttribute('aria-disabled', String(busy || !canContinue));
      }
      let radioStatus;
      if (state.outcome) {
        radioStatus = '已派车';
      } else if (busy) {
        radioStatus = '通话中';
      } else if (!callsLeft) {
        radioStatus = '通话用尽';
      } else {
        radioStatus = state.calls.length ? '待命' : '接报';
      }
      if (elements.radioStatus.textContent !== radioStatus) {
        elements.radioStatus.textContent = radioStatus;
      }
    }

    async function fetchJson(path, { controller, timeout, ...options }) {
      const deadline = window.setTimeout(() => controller.abort(), timeout);
      try {
        const response = await fetch(path, {
          ...options,
          mode: 'same-origin',
          redirect: 'error',
          signal: controller.signal,
        });
        if (!response.ok) {
          const result = await response.json().catch(() => null);
          throw new Error(result?.error ?? 'unavailable');
        }
        return await response.json();
      } finally {
        window.clearTimeout(deadline);
      }
    }

    async function detectFreeCall() {
      if (!elements.freeCallForm) return;
      if (['http:', 'https:'].includes(window.location.protocol)) {
        try {
          const result = await fetchJson('/api/status', {
            controller: new AbortController(),
            timeout: 3500,
            cache: 'no-store',
          });
          freeCallAvailable = result?.available === true;
        } catch {
          freeCallAvailable = false;
        }
      }
      elements.freeCallForm.hidden = !freeCallAvailable;
      elements.freeCallNotice.hidden = freeCallAvailable;
    }

    async function submitFreeCall(event) {
      event.preventDefault();
      if (!freeCallAvailable || !canCall() || composing || ignoreCompositionSubmit || elements.dialog.open) return;
      const question = elements.freeQuestion.value;
      if (!question.trim()) {
        setRadioFeedback('请输入要问的问题。');
        return;
      }
      const channel = state.channel;
      const request = new AbortController();
      state.pendingCall = request;
      setRadioFeedback();
      updateCallControls();
      renderMap();
      let prompt;
      try {
        const result = await fetchJson('/api/radio', {
          controller: request,
          timeout: 16000,
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channel, question, quoteId: state.quote }),
        });
        const channelData = channels[channel];
        prompt = result?.intent === 'unknown'
          ? { reply: channelData.unknownReply, topic: '没听出能答的问题' }
          : channelData.prompts.find(({ intent }) => intent === result?.intent);
        if (!prompt) throw new Error('Unexpected radio intent');
      } catch (error) {
        if (state.pendingCall !== request) return;
        state.pendingCall = null;
        const notices = {
          authorization: '魔搭未接受令牌。请核对令牌和推理权限，或先用预设问题。',
          quota: '魔搭暂时限流或额度不足。可稍后重试或使用预设问题。',
          timeout: '通话超时。可重试或使用预设问题。',
        };
        const noticeKey = request.signal.aborted ? 'timeout' : error.message;
        setRadioFeedback(Object.hasOwn(notices, noticeKey) ? notices[noticeKey] : '通话未接通。可重试或使用预设问题。');
        updateCallControls();
        renderMap();
        emit('denied', { reason: 'failed' });
        return;
      }
      if (state.pendingCall !== request) return;
      state.pendingCall = null;
      const active = document.activeElement;
      const anchor = active === elements.freeQuestion || active === elements.freeCallButton ? active : null;
      if (completeCall(prompt, anchor, question, true)) {
        elements.freeQuestion.value = '';
      } else {
        updateCallControls();
      }
      renderMap();
    }

    // 回话下面直接引用这条证词：和证据板上的「引用」是同一件事。只带上证词，打给谁仍由玩家决定。
    function replyQuote(id, fresh) {
      const button = node('button', fresh ? 'reply-quote' : 'reply-quote is-known');
      button.type = 'button';
      button.dataset.replyQuote = id;
      const quoted = state.quote === id;
      button.setAttribute('aria-pressed', String(quoted));
      button.disabled = !canCall();
      button.append(
        node('span', 'reply-quote-action', quoted ? '已引用' : '引用这条证词'),
        node('span', 'reply-quote-tag', `${fresh ? '新证据' : '证据板已有'} · ${clues[id].name}`),
      );
      button.addEventListener('click', () => toggleQuote(id, 'reply'));
      return button;
    }

    function renderTransmission() {
      // 回看旧回答时显示那一通，其余时候显示最新一通。
      const review = state.review;
      const latest = review ? state.calls[review.index] : state.calls.at(-1) ?? opening;
      const head = node('div', 'transmission-head');
      const face = node('span', 'face');
      face.dataset.face = latest.channel;
      face.setAttribute('aria-hidden', 'true');
      head.append(
        face,
        node('span', 'transmission-speaker', latest.speaker),
        node('span', 'transmission-clock', latest.clock),
      );
      if (review) head.insertBefore(node('span', 'transmission-review', '回看'), head.lastChild);
      const parts = [head];
      if (latest.question) {
        const asked = node('p', 'transmission-question');
        asked.append(node('span', 'transmission-asked', '你问'), node('span', '', latest.question));
        parts.push(asked);
      }
      const message = node('p', 'transmission-message');
      message.append(spell(latest.message, latest.cite));
      parts.push(message);
      const heard = review ? review.heard : latest.heard;
      const notes = [
        latest.clue && replyQuote(latest.clue, latest.fresh && !review),
        review && node('span', 'transmission-note is-review', '回看原答 · 未扣通话'),
        heard && node('span', 'transmission-note is-heard', `模型听成 · ${heard}`),
      ].filter(Boolean);
      if (notes.length) {
        const footer = node('div', 'transmission-notes');
        footer.append(...notes);
        parts.push(footer);
      }
      elements.transmission.replaceChildren(...parts);
      const historyItems = [opening, ...state.calls].map((entry) => {
        const item = node('li', 'history-entry');
        item.append(
          node('div', 'history-speaker', `${entry.clock} · ${entry.speaker}`),
        );
        if (entry.question) item.append(node('div', 'history-question', entry.question));
        item.append(node('div', 'history-message', entry.message));
        return item;
      });
      elements.historyList.replaceChildren(...historyItems);
      elements.history.hidden = !state.calls.length;
    }

    // 问过的题标「已问」：再点只回看原答，不扣通话。按钮的可访问名称仍是问题原文。
    function markAsked(button) {
      if (!button || button.classList.contains('is-asked')) return;
      button.classList.add('is-asked');
      const mark = node('span', 'preset-asked', '已问 · 回看');
      mark.setAttribute('aria-hidden', 'true');
      button.append(mark);
      button.setAttribute('aria-description', '已问过，再点回看原答，不扣通话');
    }

    function renderPresets() {
      const buttons = channels[state.channel].prompts.map((prompt) => {
        const button = node('button', 'preset-button');
        button.type = 'button';
        button.append(node('span', 'preset-question', prompt.question));
        if (state.asked.has(askKey(state.channel, prompt))) markAsked(button);
        button.disabled = !canCall();
        button.addEventListener('click', () => completeCall(prompt, button));
        return button;
      });
      elements.promptList.replaceChildren(...buttons);
      if (elements.freeQuestion) elements.freeQuestion.placeholder = `用自己的话问${channels[state.channel].name}`;
    }

    function toggleQuote(id, from) {
      if (!canCall()) return;
      state.quote = state.quote === id ? null : id;
      setRadioFeedback();
      renderQuote();
      if (state.quote && window.matchMedia('(max-width: 760px)').matches) {
        elements.activeQuote.scrollIntoView({ block: 'nearest' });
      }
      emit('quote', { id: state.quote, from });
    }

    function renderQuote() {
      elements.evidenceList.querySelectorAll('.quote-button').forEach((button) => {
        const isQuoted = button.dataset.evidenceId === state.quote;
        button.setAttribute('aria-pressed', String(isQuoted));
        button.textContent = isQuoted ? '已引用' : '引用';
        button.disabled = !canCall();
      });
      elements.transmission.querySelectorAll('.reply-quote').forEach((button) => {
        const isQuoted = button.dataset.replyQuote === state.quote;
        button.setAttribute('aria-pressed', String(isQuoted));
        button.querySelector('.reply-quote-action').textContent = isQuoted ? '已引用' : '引用这条证词';
        button.disabled = !canCall();
      });
      elements.activeQuote.hidden = !state.quote;
      if (!state.quote) {
        elements.activeQuote.replaceChildren();
        return;
      }
      const clue = clues[state.quote];
      const clear = node('button', 'remove-quote', '移除');
      clear.type = 'button';
      clear.disabled = !canCall();
      clear.setAttribute('aria-label', `移除引用 ${clue.name}`);
      clear.addEventListener('click', () => {
        if (!canCall()) return;
        const button = elements.transmission.querySelector(`.reply-quote[data-reply-quote="${state.quote}"]`)
          ?? elements.evidenceList.querySelector(`.quote-button[data-evidence-id="${state.quote}"]`);
        state.quote = null;
        renderQuote();
        button?.focus();
        emit('quote', { id: null });
      });
      const chip = node('div', 'quote-chip');
      const text = node('span', 'quote-text');
      text.append(node('b', '', `已引用${clue.name}`), node('span', '', clue.text));
      chip.append(text, clear);
      elements.activeQuote.replaceChildren(
        chip,
        node('p', 'quote-note', '随下一次发问一起发出，换频道也带着。'),
      );
    }

    // 证据板按本案证据数留好固定空位：没到手的是空框，写着来源；到手的卡落进自己的位置。
    function renderEvidence(freshId = null) {
      const ids = Object.keys(clues);
      if (elements.evidenceCount) elements.evidenceCount.textContent = `${state.evidence.size} / ${ids.length}`;
      const lead = state.evidence.size ? [] : [node('p', 'evidence-empty', '尚未收到证据。')];
      const cards = ids.map((id) => {
        const clue = clues[id];
        if (!state.evidence.has(id)) {
          const slot = node('div', 'evidence-slot');
          slot.dataset.slot = id;
          slot.setAttribute('aria-hidden', 'true');
          slot.append(node('span', 'slot-source', clue.source), node('span', 'slot-mark', '？'));
          return slot;
        }
        const card = node('article', 'evidence-card');
        card.dataset.clue = id;
        if (id === freshId) card.classList.add('is-new');
        const quote = node('button', 'quote-button', '引用');
        quote.type = 'button';
        quote.dataset.evidenceId = id;
        quote.setAttribute('aria-label', `引用${clue.name}`);
        quote.addEventListener('click', () => toggleQuote(id, 'board'));
        const meta = node('div', 'evidence-meta');
        meta.append(node('span', 'evidence-name', clue.name), node('span', 'evidence-source', clue.source));
        if (clue.code) meta.append(lampCode(clue.code));
        card.append(meta, node('p', 'evidence-text', clue.text), quote);
        return card;
      });
      elements.evidenceList.replaceChildren(...lead, ...cards);
    }

    // 已取得的记录标到地图上：档案给出各站灯号，维修单给出供电。结论仍由玩家自己下。
    function renderMapFacts() {
      const archive = state.evidence.has('archive') ? clues.archive.marks : null;
      const outage = state.evidence.has('outage') ? clues.outage.marks : null;
      mapButtons.forEach((button) => {
        const holder = button.querySelector('[data-point-facts]');
        if (!holder) return;
        const id = button.dataset.location;
        const facts = [];
        if (archive) {
          const fact = node('span', 'fact fact-code');
          fact.append(lampCode(archive[id].code), node('span', 'fact-text', archive[id].label));
          facts.push(fact);
        }
        if (outage) facts.push(node('span', `fact fact-power is-${outage[id].power}`, outage[id].label));
        holder.replaceChildren(...facts);
      });
      if (!elements.mapWitness) return;
      const seen = state.evidence.has('signal');
      elements.mapWitness.hidden = !seen;
      elements.mapWitness.replaceChildren();
      if (seen) {
        elements.mapWitness.append(
          node('span', 'witness-label', '求救者眼前'),
          lampCode(clues.signal.code),
          node('span', 'witness-text', clues.signal.codeLabel),
        );
      }
      renderCheck();
    }

    // 派车前核对：选中一处站房后，把求救证词和这一站的两项记录并排放在派车按钮旁。
    // 只摆已取得的记录，没取得的写「未取得」。记号静止不闪，上下两行对齐，对不对得上由玩家自己看。
    function renderCheck() {
      const holder = elements.dispatchCheck;
      if (!holder) return;
      const id = state.outcome ? null : state.selected;
      holder.hidden = !id;
      holder.closest('.dispatch-toolbar')?.toggleAttribute('data-checking', Boolean(id));
      holder.replaceChildren();
      if (!id) return;
      holder.setAttribute('aria-label', `派车前核对：${locations[id]}`);
      const list = node('dl', 'check-list');
      [
        ['signal', clues.signal.codeLabel, clues.signal.code],
        ['archive', clues.archive.marks[id].label, clues.archive.marks[id].code],
        ['outage', clues.outage.marks[id].label, null, clues.outage.marks[id].power],
      ].forEach(([clue, label, code, power]) => {
        const held = state.evidence.has(clue);
        const value = node('dd', held && power ? `check-value is-${power}` : 'check-value');
        if (held && code) value.append(lampCode(code));
        value.append(node('span', 'check-text', held ? label : '未取得'));
        const row = node('div', held ? 'check-row' : 'check-row is-missing');
        row.append(node('dt', 'check-name', clues[clue].name), value);
        list.append(row);
      });
      holder.append(node('p', 'check-title', `${locations[id]} · 派车前核对`), list);
    }

    // 同一频道的同一问题只算一次：再问就回看原答，不扣通话、不动证词和剧情时间。
    function askKey(channel, prompt) {
      return prompt.intent ? `${channel}:${prompt.intent}` : null;
    }

    function reviewCall(index, button, viaModel, topic) {
      state.review = { index, heard: viaModel ? topic : null };
      setRadioFeedback();
      renderTransmission();
      renderQuote();
      const wasFocused = document.activeElement === button;
      updateCallControls();
      if (wasFocused) button.focus();
      emit('review', { channel: state.calls[index].channel, length: state.calls[index].message.length });
      return true;
    }

    function completeCall(prompt, button, question = prompt.question, viaModel = false) {
      if (!canCall()) return false;
      const key = askKey(state.channel, prompt);
      if (key && state.asked.has(key)) return reviewCall(state.asked.get(key), button, viaModel, prompt.topic);
      if (prompt.needsQuote && state.quote !== prompt.needsQuote) {
        setRadioFeedback(state.evidence.has(prompt.needsQuote)
          ? '先引用求救证词，再查询灯号。'
          : '先引用求救证词，再查询灯号。证据板上还没有这条证词，得先向求救者问到。');
        emit('denied', { reason: 'quote', needs: prompt.needsQuote, held: state.evidence.has(prompt.needsQuote) });
        return false;
      }
      const gotNewClue = Boolean(prompt.clue) && !state.evidence.has(prompt.clue);
      state.calls.push({
        speaker: channels[state.channel].name,
        channel: state.channel,
        clock: callTime(state.calls.length + 1),
        message: prompt.reply,
        cite: prompt.cite ?? null,
        question,
        heard: viaModel ? prompt.topic : null,
        clue: prompt.clue ?? null,
        fresh: gotNewClue,
      });
      state.review = null;
      if (key) {
        state.asked.set(key, state.calls.length - 1);
        markAsked(elements.promptList.children[channels[state.channel].prompts.indexOf(prompt)]);
      }
      if (gotNewClue) {
        state.evidence.add(prompt.clue);
        renderEvidence(prompt.clue);
        renderMapFacts();
      }
      state.quote = null;
      setRadioFeedback();
      renderQuote();
      renderTransmission();
      const wasFocused = document.activeElement === button;
      updateCallControls();
      if (!canCall() && wasFocused) {
        (canDispatch() ? elements.dispatchButton : mapButtons[0]).focus();
      }
      emit('call', {
        channel: state.channel,
        clue: gotNewClue ? prompt.clue : null,
        remaining: remaining(),
        ready: hasFullEvidence(),
        length: prompt.reply.length,
      });
      return true;
    }

    function renderMap() {
      mapButtons.forEach((button) => {
        const id = button.dataset.location;
        const dispatched = state.outcome?.target === id;
        const correct = Boolean(state.outcome && id === solution);
        const excluded = state.excluded.has(id) && !correct;
        const status = [
          dispatched && '派车点',
          correct && '正确地点',
          excluded && '已排除',
        ].filter(Boolean).join('，');
        button.setAttribute('aria-pressed', String(state.selected === id));
        button.setAttribute('aria-label', [locations[id], status].filter(Boolean).join('，'));
        button.classList.toggle('is-excluded', excluded);
        button.classList.toggle('is-correct', correct);
        button.classList.toggle('is-dispatched', dispatched);
        // 结算时，真正的那盏灯按求救者看到的节奏亮在地图上。
        if (correct) button.dataset.lamp = clues.signal.code;
        else delete button.dataset.lamp;
        button.disabled = Boolean(state.outcome);
        const marker = button.querySelector('[data-point-status]');
        if (marker) {
          // 地图上只放一个短标签，完整状态仍在 aria-label 里。
          const tag = correct ? '正确地点' : dispatched ? '派车点' : excluded ? '已排除' : '';
          marker.hidden = !tag;
          marker.textContent = tag;
        }
      });

      const selectedName = locations[state.selected];
      const selectedExcluded = state.excluded.has(state.selected);
      elements.excludeButton.hidden = !selectedName || Boolean(state.outcome);
      setButtonLabel(elements.excludeButton, selectedExcluded ? '取消排除' : '标记排除');
      setButtonLabel(elements.dispatchButton, selectedName ? `派车至${selectedName}` : '派车');
      elements.dispatchButton.disabled = !canDispatch();
      if (elements.mapFeedback) {
        let feedback = '';
        if (state.outcome) {
          feedback = `救援车已派往${locations[state.outcome.target]}。`;
        } else {
          if (!selectedName) feedback = '选择派车地点';
          if (selectedExcluded) feedback = '取消排除后可以派车。';
        }
        elements.mapFeedback.textContent = feedback;
      }
      renderCheck();
    }

    function openDispatch() {
      if (!canDispatch() || elements.dialog.open) return;
      elements.dialogTitle.textContent = `派车至${locations[state.selected]}？`;
      elements.dialogCopy.textContent = hasFullEvidence()
        ? '派车后本局结束。'
        : '目前证据不足，仍可派车。';
      elements.dialog.showModal();
      elements.cancelDispatch.focus();
    }

    function renderOutcome() {
      const result = state.outcome;
      const place = locations[solution];
      const headingText = result.correct
        ? result.fullEvidence ? `救援抵达${place}` : '救援抵达，证据不足'
        : '派车地点错误';
      const heading = node('h2', 'outcome-title', headingText);
      heading.tabIndex = -1;
      const used = state.calls.length;
      const explanation = result.correct
        ? result.fullEvidence ? `你用 ${used} 次通话锁定了地点，两处排除都有记录可查。` : `你选中了${place}，派车时还缺少完整的排查记录。`
        : `救援车开往${locations[result.target]}。求救者在${place}。`;
      const verdict = result.correct ? (result.fullEvidence ? '证据充分' : '证据不足') : '地点错误';
      const eyebrow = node('p', 'outcome-eyebrow');
      eyebrow.append(
        node('span', '', `结案 · 派车至${locations[result.target]}`),
        node('span', 'outcome-stamp', verdict),
      );
      const proof = node('ul', 'outcome-evidence');
      scene.proofs.forEach(([id, text]) => {
        const held = state.evidence.has(id);
        const item = node('li', held ? 'is-held' : 'is-missed');
        item.append(node('span', 'proof-text', text), node('span', 'proof-tag', held ? '已取得' : '未取得'));
        proof.append(item);
      });
      const stats = node('p', 'outcome-stats');
      stats.append(
        node('span', '', `通话 ${used} / ${callLimit}`),
        node('span', '', `证据 ${state.evidence.size} / ${Object.keys(clues).length}`),
      );
      if (shift.cases > 1) stats.append(node('span', '', `本班救出 ${shift.saved} / ${shift.cases}`));
      // 「下一通来电」发一个新案子；「重玩」还是这一案，从头再来。
      const next = node('button', 'next-case-button', '下一通来电');
      next.type = 'button';
      next.addEventListener('click', () => reset(true, true));
      const replay = node('button', 'replay-button', '重玩');
      replay.type = 'button';
      replay.addEventListener('click', () => reset(true));
      const actions = node('div', 'outcome-actions');
      actions.append(next, replay);
      elements.outcome.replaceChildren(eyebrow, heading);
      if (explanation) elements.outcome.append(node('p', 'outcome-copy', explanation));
      elements.outcome.append(proof, stats, actions);
      elements.outcome.classList.toggle('is-success', result.correct);
      elements.outcome.classList.toggle('is-failure', !result.correct);
      elements.outcome.hidden = false;
      heading.focus();
    }

    function dispatch() {
      if (!canDispatch()) return;
      state.outcome = {
        target: state.selected,
        correct: state.selected === solution,
        fullEvidence: hasFullEvidence(),
      };
      state.quote = null;
      if (!scene.settled) {
        scene.settled = true;
        shift.cases += 1;
        if (state.outcome.correct) shift.saved += 1;
      }
      setRadioFeedback();
      elements.dialog.close();
      root.dataset.phase = 'outcome';
      updateCallControls();
      renderQuote();
      renderMap();
      renderOutcome();
      // 结算已同步写入。表现层收到事件后可以先播派车动画，再露出结果。
      emit('outcome', { ...state.outcome });
    }

    function reset(moveFocus = false, fresh = false) {
      state?.pendingCall?.abort();
      composing = false;
      ignoreCompositionSubmit = false;
      if (fresh) {
        scene = buildCase(dealCase(scene.spec));
        ({ solution, clues, channels } = scene);
        shift.number += 1;
      }
      if (elements.caseNumber) {
        elements.caseNumber.hidden = shift.number < 2;
        elements.caseNumber.textContent = ` · 第 ${shift.number} 通来电`;
      }
      state = {
        channel: 'caller',
        calls: [],
        evidence: new Set(),
        quote: null,
        selected: null,
        excluded: new Set(),
        outcome: null,
        pendingCall: null,
        // 频道:意图 → 第几通。问过的题再点只回看。
        asked: new Map(),
        review: null,
      };
      if (elements.freeQuestion) elements.freeQuestion.value = '';
      setRadioFeedback();
      elements.history.open = false;
      elements.outcome.hidden = true;
      elements.outcome.classList.remove('is-success', 'is-failure');
      elements.outcome.replaceChildren();
      root.dataset.phase = 'play';
      renderTransmission();
      renderPresets();
      updateCallControls();
      renderEvidence();
      renderMapFacts();
      renderQuote();
      renderMap();
      emit('reset', { replay: moveFocus, fresh, lamp: clues.signal.code });
      if (moveFocus) channelButtons.find((button) => button.dataset.channel === 'caller')?.focus({ preventScroll: true });
    }

    channelButtons.forEach((button) => {
      button.addEventListener('click', () => {
        if (state.pendingCall || button.dataset.channel === state.channel) return;
        state.channel = button.dataset.channel;
        setRadioFeedback();
        renderPresets();
        updateCallControls();
        emit('channel', { channel: state.channel });
      });
    });
    mapButtons.forEach((button) => {
      button.addEventListener('click', () => {
        if (state.outcome) return;
        state.selected = button.dataset.location;
        renderMap();
        emit('select', { location: state.selected });
      });
    });
    elements.excludeButton.addEventListener('click', () => {
      if (!state.selected || state.outcome) return;
      if (!state.excluded.delete(state.selected)) {
        state.excluded.add(state.selected);
      }
      renderMap();
      emit('exclude', { location: state.selected, excluded: state.excluded.has(state.selected) });
    });
    elements.dispatchButton.addEventListener('click', openDispatch);
    elements.cancelDispatch.addEventListener('click', (event) => {
      event.preventDefault();
      elements.dialog.close();
    });
    elements.confirmDispatch.addEventListener('click', (event) => {
      event.preventDefault();
      dispatch();
    });
    elements.dialog.addEventListener('close', () => {
      if (canDispatch()) elements.dispatchButton.focus();
    });
    if (elements.freeCallForm) {
      elements.radioStatus.setAttribute('aria-live', 'polite');
      elements.freeCallForm.addEventListener('submit', submitFreeCall);
      elements.freeQuestion.addEventListener('compositionstart', () => { composing = true; });
      elements.freeQuestion.addEventListener('compositionend', () => { composing = false; });
      elements.freeQuestion.addEventListener('keydown', (event) => {
        if ((event.key === 'Enter' || event.keyCode === 229) && (composing || event.isComposing || event.keyCode === 229)) {
          ignoreCompositionSubmit = true;
          window.setTimeout(() => { ignoreCompositionSubmit = false; }, 0);
        }
      });
    }
    reset();
    detectFreeCall();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
