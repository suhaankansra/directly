/** Offline integration check of the built MV3 worker and document-start content script. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { setImmediate as tick } from 'node:timers/promises';
import { JSDOM, VirtualConsole } from 'jsdom';

const workerCode = await readFile(new URL('../apps/extension/dist/chrome/background.js', import.meta.url), 'utf8');
const contentCode = await readFile(new URL('../apps/extension/dist/chrome/content.js', import.meta.url), 'utf8');
const session = {};
const settings = { allowStories: true, storiesAutoAdvance: false, allowReelsFromDms: true };
let listeners;
const redirects = [];
const area = (data) => ({
  async get(key) { return typeof key === 'string' ? { [key]: data[key] } : data; },
  async set(values) { Object.assign(data, values); },
  async remove(keys) { for (const key of Array.isArray(keys) ? keys : [keys]) delete data[key]; },
});
function worker() {
  listeners = {};
  const listener = (name) => ({ addListener(fn) { listeners[name] = fn; } });
  const chrome = {
    runtime: { id: 'directly-test', onInstalled: listener('install'), onMessage: listener('message'), openOptionsPage() {} },
    storage: { local: area({ settings }), session: area(session) },
    tabs: { onRemoved: listener('removed'), async update(id, value) { redirects.push({ id, ...value }); } },
    webNavigation: { onBeforeNavigate: listener('before'), onHistoryStateUpdated: listener('history'), onCommitted: listener('commit') },
  };
  vm.runInNewContext(workerCode, { chrome, URL, console });
}
const sender = { id: 'directly-test', frameId: 0, tab: { id: 1 }, url: 'https://www.instagram.com/direct/inbox/' };
async function message(value, from = sender) {
  return await new Promise((resolve) => { if (!listeners.message(value, from, resolve)) resolve(undefined); });
}
async function navigate(path, kind = 'before') {
  redirects.length = 0;
  listeners[kind]({ frameId: 0, tabId: 1, url: `https://www.instagram.com${path}` });
  await tick(); await tick();
  return redirects.length;
}
worker();
const selection = { v: 1, type: 'di:story', user: 'alice', users: [{ username: 'alice', seen: false }, { username: 'bob', seen: false }] };
assert.equal((await message(selection)).ok, true);
assert.equal(await navigate('/stories/alice/1/'), 0);
assert.equal(await navigate('/stories/bob/1/'), 1);
worker(); // MV3 suspension/restart must retain only session-scoped context.
assert.equal((await message({ type: 'di:story-context' })).user, 'alice');
assert.equal(await navigate('/stories/alice/2/'), 0);
settings.storiesAutoAdvance = true;
assert.equal(await navigate('/stories/bob/1/'), 0);
assert.equal(await navigate('/stories/unlisted/1/'), 1);
assert.equal(await navigate('/explore/', 'history'), 1);
assert.equal((await message(selection, { ...sender, url: 'https://www.instagram.com/stories/alice/1/' })).ok, false);
assert.equal(await message(selection, { ...sender, frameId: 1 }), undefined);
assert.equal((await message({ ...selection, users: Array(31).fill(selection.users[0]) })).ok, false);
await navigate('/direct/inbox/', 'history');
assert.equal((await message({ type: 'di:story-context' })).user, null);

async function contentFixture(url, context) {
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (error) => { if (!error.message.includes('navigation')) errors.push(error); });
  const dom = new JSDOM('<!doctype html><html><body><main><textarea></textarea></main></body></html>', { url, runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole });
  let reply;
  dom.window.chrome = {
    storage: { local: area({ settings }), onChanged: { addListener() {} } },
    runtime: { sendMessage: () => new Promise((resolve) => { reply = resolve; }) },
  };
  dom.window.eval(contentCode);
  assert.equal(dom.window.getComputedStyle(dom.window.document.documentElement).visibility, 'hidden');
  reply(context);
  await tick(); await tick();
  const core = dom.window.__directly?.api;
  assert.ok(core, 'the built content script booted');
  const allowed = core.guard.lastVerdict().action === 'allow';
  assert.equal(dom.window.getComputedStyle(dom.window.document.documentElement).visibility === 'hidden', !allowed);
  assert.equal(errors.length, 0, errors.map((error) => error.message).join('\n'));
  core.destroy(); dom.window.close();
  return allowed;
}
assert.equal(await contentFixture('https://www.instagram.com/stories/alice/1/', { user: 'alice', users: ['alice', 'bob'] }), true);
assert.equal(await contentFixture('https://www.instagram.com/stories/unlisted/1/', { user: 'alice', users: ['alice', 'bob'] }), false);
assert.equal(await contentFixture('https://www.instagram.com/stories/alice/1/', { user: null, users: [] }), false);
console.log('PASS: built extension selection, worker restart, known-person continuation, cross-person rejection, SPA blocking, exit clearing, and document-start handshake.');
