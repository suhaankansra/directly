/**
 * Fixture server for manual and scripted verification.
 *
 * It is NOT Instagram: it is a page shaped like Instagram mobile web (bottom nav
 * with feed/explore/reels links, a "Use the app" banner, a DM inbox, a reel
 * overlay with sibling slides), served with the real built `dist/inpage.js` at
 * `document_start`. That lets every claim about the guard, the reel lock, the
 * cleanup and the injected nav be checked in a real Chromium without logging
 * into an account.
 *
 *   node packages/core/test/fixtures/serve.mjs   # http://127.0.0.1:4319
 */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const coreRoot = path.resolve(here, '../..');
const requested = Number.parseInt(process.env.PORT ?? '', 10);
const PORT = Number.isFinite(requested) && requested > 0 ? requested : 4319;

const INBOX_VIEW = `
  <div id="inbox-view">
    <h1 class="hdr">alice <span aria-hidden="true">▾</span></h1>
    <input class="search" placeholder="Search" />
    <ul class="threads">
      <li><a href="/direct/t/42/" id="thread-42"><span class="avatar"></span> bob <em>You: yo wassup · 1d</em></a></li>
      <li><a href="/direct/t/43/" id="thread-43"><span class="avatar"></span> carol <em>Sent a reel</em></a></li>
    </ul>
  </div>`;

const REEL_VIEW = `
  <div id="reel-view">
    <article data-id="first"><video muted playsinline></video><p class="cap">first reel · sent by bob</p></article>
    <article data-id="second"><video muted playsinline></video><p class="cap">second reel</p></article>
    <article data-id="third"><video muted playsinline></video><p class="cap">third reel</p></article>
    <button aria-label="Next" id="reel-next">next</button>
  </div>`;

function page(pathname) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Instagram (fixture ${pathname})</title>
    <style>
      :root { color-scheme: dark; }
      body { margin: 0; background: #0f0f12; color: #f0f0f4; font: 15px/1.4 -apple-system, sans-serif; padding-bottom: 80px; }
      .hdr { font-size: 18px; padding: 16px; margin: 0; }
      .search { margin: 0 16px 12px; width: calc(100% - 32px); padding: 10px; border-radius: 10px; border: 0; background: #1c1c22; color: #ddd; }
      .threads { list-style: none; margin: 0; padding: 0 8px; }
      .threads a { display: flex; gap: 10px; align-items: center; padding: 12px; color: inherit; text-decoration: none; }
      .avatar { width: 44px; height: 44px; border-radius: 50%; background: #2a2a33; }
      .threads em { display: block; font-style: normal; color: #9a9aa6; font-size: 13px; }
      nav[role="navigation"] { position: fixed; bottom: 0; left: 0; right: 0; height: 56px; display: flex; justify-content: space-around; align-items: center; background: #111114; border-top: 1px solid #22222a; }
      nav a { color: #cfcfd8; text-decoration: none; font-size: 12px; padding: 8px 12px; }
      #usebanner { display: flex; justify-content: space-between; align-items: center; background: #1d1d24; margin: 12px; padding: 12px; border-radius: 12px; }
      #reel-view { display: flex; flex-direction: column; height: 70vh; overflow-y: scroll; scroll-snap-type: y mandatory; }
      #reel-view article { flex: 0 0 70vh; scroll-snap-align: start; background: #191922; margin: 4px; display: flex; flex-direction: column; justify-content: flex-end; padding: 16px; border-radius: 12px; }
      #reel-view video { width: 100%; height: 200px; background: #000; border-radius: 8px; }
      #controls { margin: 16px; display: flex; flex-wrap: wrap; gap: 8px; }
      #controls button { background: #26262f; color: #e8e8ee; border: 1px solid #34343f; border-radius: 999px; padding: 8px 14px; font-size: 13px; }
      .fixture-note { margin: 16px; color: #7d7d8a; font-size: 12px; }
    </style>
    <script>
      window.__onlyInboxOptions = { host: 'extension', showNav: true, settings: { debug: true } };
    </script>
    <script>
      // A miniature SPA router, installed BEFORE the core so that the core wraps
      // this one: allowed navigations re-render, blocked ones never get here.
      window.__fixtureViews = {
        inbox: ${JSON.stringify(INBOX_VIEW)},
        reel: ${JSON.stringify(REEL_VIEW)}
      };
      window.__fixtureRender = function () {
        var app = document.getElementById('app');
        if (!app) return;
        var isReel = location.pathname.indexOf('/reel') === 0;
        app.innerHTML = isReel ? window.__fixtureViews.reel : window.__fixtureViews.inbox;
        document.body.setAttribute('data-view', isReel ? 'reel' : 'inbox');
      };
      // Installed BEFORE the core loads, so the core wraps this: an allowed
      // navigation re-renders, a blocked one never reaches the render.
      (function () {
        var push = history.pushState.bind(history);
        var replace = history.replaceState.bind(history);
        history.pushState = function (state, title, url) { push(state, title, url); window.__fixtureRender(); };
        history.replaceState = function (state, title, url) { replace(state, title, url); window.__fixtureRender(); };
        window.addEventListener('popstate', function () { window.__fixtureRender(); });
      })();
    </script>
    <script src="/inpage.js"></script>
  </head>
  <body data-path="${pathname}">
    <div id="app"></div>
    <script>window.__fixtureRender();</script>
    <div id="usebanner"><span>Use the app</span><button aria-label="Close">×</button></div>
    <nav role="navigation">
      <a href="/" id="nav-home">Home</a>
      <a href="/explore/" id="nav-explore">Search</a>
      <a href="/reels/" id="nav-reels">Reels</a>
      <a href="/direct/inbox/" id="nav-dms">Messages</a>
    </nav>
    <div id="controls">
      <button id="open-reel">SPA: open reel from DM</button>
      <button id="next-reel">SPA: next reel</button>
      <button id="go-explore">SPA: explore</button>
      <button id="go-thread">SPA: thread</button>
    </div>
    <p class="fixture-note">Local fixture, not Instagram. Used to verify the built in-page script.</p>
    <script>
      document.getElementById('open-reel').addEventListener('click', () => history.pushState({}, '', '/reel/Cabc/'));
      document.getElementById('next-reel').addEventListener('click', () => history.pushState({}, '', '/reel/Cdef/'));
      document.getElementById('go-explore').addEventListener('click', () => history.pushState({}, '', '/explore/'));
      document.getElementById('go-thread').addEventListener('click', () => history.pushState({}, '', '/direct/t/42/'));
    </script>
  </body>
</html>`;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${PORT}`);
  const pathname = url.pathname;

  if (pathname === '/inpage.js') {
    try {
      const body = await readFile(path.join(coreRoot, 'dist/inpage.js'));
      res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' });
      res.end(body);
    } catch {
      res.writeHead(500, { 'content-type': 'text/plain' });
      res.end('build the core first: pnpm --filter @only-inbox/core build');
    }
    return;
  }

  if (pathname === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
  res.end(page(pathname));
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`fixture on http://127.0.0.1:${PORT}/  (paths: /, /direct/inbox/, /reel/Cabc/, /explore/)`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}
