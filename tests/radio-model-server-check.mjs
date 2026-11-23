import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { createRadioServer } from '../末班电台服务.mjs';

const page = await readFile(new URL('../末班电台.html', import.meta.url));
let callCount = 0;
let upstreamContent = 'pattern';
let upstreamStatus = 200;
let lastRequest;
let waitForAbort = false;
const fakeToken = 'test-placeholder-not-a-modelscope-token';
const server = createRadioServer({ page, token: fakeToken, fetchModel: async (url, options) => {
  callCount++;
  assert.equal(url, 'https://api-inference.modelscope.cn/v1/chat/completions');
  assert.equal(options.headers.Authorization, `Bearer ${fakeToken}`);
  lastRequest = JSON.parse(options.body);
  if (waitForAbort) {
    await once(options.signal, 'abort');
    options.signal.throwIfAborted();
  }
  return Response.json({ choices: [{ message: { content: upstreamContent } }] }, { status: upstreamStatus });
} });
const offlineServer = createRadioServer({ page, fetchModel() { assert.fail('Token is absent.'); } });
const instances = [server, offlineServer];

async function serve(instance) {
  instance.listen(0, '127.0.0.1');
  await once(instance, 'listening');
  return `http://127.0.0.1:${instance.address().port}`;
}

async function readResult(response, status, expected) {
  assert.equal(response.status, status);
  assert.deepEqual(await response.json(), expected);
}

try {
  const [base, offline] = await Promise.all(instances.map(serve));
  const makeCall = (body, extra = {}) => fetch(`${base}/api/radio`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...extra }, body: JSON.stringify(body),
  });
  const question = { channel: 'caller', question: '红灯每一轮有几次是短闪？', quoteId: null };
  const firstPage = await fetch(base);
  assert.equal(firstPage.status, 200);
  assert.ok((await firstPage.text()).includes('id="free-question"'));
  await readResult(await fetch(`${base}/api/status`), 200, { available: true });
  await readResult(await fetch(`${offline}/api/status`), 200, { available: false });
  await readResult(await fetch(`${offline}/api/radio`, { method: 'POST' }), 503, { error: 'unconfigured' });

  await readResult(await makeCall(question, { Origin: 'https://example.invalid' }), 403, { error: 'forbidden' });
  await readResult(await makeCall({ ...question, channel: 'constructor' }), 400, { error: 'invalid_request' });
  await readResult(await makeCall({ ...question, quoteId: '__proto__' }), 400, { error: 'invalid_request' });
  await readResult(await makeCall({ ...question, question: '   ' }), 400, { error: 'invalid_request' });
  await readResult(await makeCall({ ...question, question: '问'.repeat(2000) }), 413, { error: 'invalid_request' });
  assert.equal(callCount, 0);

  await readResult(await makeCall(question, { Origin: base }), 200, { intent: 'pattern' });
  assert.equal(lastRequest.model, 'Qwen/Qwen3.5-35B-A3B');
  assert.equal(lastRequest.chat_template_kwargs.enable_thinking, false);
  assert.deepEqual(JSON.parse(lastRequest.messages[1].content), { question: question.question, quotedEvidenceTopic: null });

  upstreamContent = 'lookup';
  await readResult(await makeCall({ channel: 'archive', question: '这个节奏能排除哪里？', quoteId: 'signal' }), 200, { intent: 'lookup' });
  assert.deepEqual(JSON.parse(lastRequest.messages[1].content), { question: '这个节奏能排除哪里？', quotedEvidenceTopic: '求救者的现场闪灯节奏证词' });
  await readResult(await makeCall(question), 502, { error: 'invalid_output' });
  upstreamContent = '<think>reasoning</think>\nunknown';
  await readResult(await makeCall(question), 200, { intent: 'unknown' });
  upstreamContent = '直接派车。';
  await readResult(await makeCall(question), 502, { error: 'invalid_output' });
  upstreamStatus = 401;
  await readResult(await makeCall(question), 503, { error: 'authorization' });
  upstreamStatus = 429;
  await readResult(await makeCall(question), 429, { error: 'quota' });
  upstreamStatus = 200;
  waitForAbort = true;
  await readResult(await makeCall(question), 504, { error: 'timeout' });
  console.log('PASS service, same-origin guard, no-token fallback, quote context, role allowlist, provider auth/quota/timeout handling');
} finally {
  for (const instance of instances) {
    instance.closeAllConnections();
    if (instance.listening) await new Promise((done) => instance.close(done));
  }
}
