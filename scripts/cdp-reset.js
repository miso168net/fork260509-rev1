#!/usr/bin/env node
/**
 * scripts/cdp-reset.js — CDP debug session reset utility
 *
 * 用途：把 Edge :9229 debug session 帶回乾淨狀態。已知 base-web `setupRouter` boot
 * 階段對 stale `SOY_refreshToken` / `SOY_token` localStorage entry 處理不穩
 * （refresh promise 卡住、`app.mount('#app')` 永不執行、splash mask 永久顯示）；
 * 清 localStorage + sessionStorage + cookies + cache 即可恢復。
 *
 * 範例：
 *   # 純 reset：清 storage + cookies + cache + reload 當前 tab
 *   node scripts/cdp-reset.js
 *
 *   # reset + 跑 Soybean login flow（驗 base-web reachable + login OK）
 *   node scripts/cdp-reset.js --login
 *
 *   # reset + 指定 url + 不 reload（手動 navigate 後再清）
 *   node scripts/cdp-reset.js --target http://127.0.0.1:11080/login --no-reload
 *
 *   # 指定別的 debug port
 *   node scripts/cdp-reset.js --port 9230
 *
 * Flags：
 *   --port <n>           Edge debug port (default 9229)
 *   --target <url>       navigate 到指定 url 後再清 (default：跳過 navigate、用當前 tab)
 *   --no-reload          不 reload (default 清完 reload)
 *   --login [u:p]        清 + reload 後嘗試 login (default `Soybean:123456`)
 *   --front <url>        base-web front URL (default http://127.0.0.1:11080、影響 login 觸發 navigate)
 *   --timeout <ms>       單個 CDP method timeout (default 10000)
 *   --quiet              只輸出最終結果 + exit code
 *   -h / --help          show usage
 *
 * Exit code:
 *   0 success
 *   1 generic failure (CDP connect / clear / reload)
 *   2 login failed (--login mode only)
 *
 * 對齊 052 C-V6-N1 follow-up；scaffold pattern 對齊 specs/048-base-typings-sync/contracts/cdp-smoke.js。
 */

const args = parseArgs(process.argv.slice(2));
if (args.help) { printHelp(); process.exit(0); }

const PORT = args.port || 9229;
const TARGET = args.target || null;
const RELOAD = !args.noReload;
const LOGIN = args.login;
const FRONT = args.front || 'http://127.0.0.1:11080';
const TIMEOUT = Number(args.timeout || 10000);
const QUIET = !!args.quiet;
const CDP_HTTP = `http://127.0.0.1:${PORT}`;

function log(...a) { if (!QUIET) console.log(...a); }

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') out.help = true;
    else if (a === '--no-reload') out.noReload = true;
    else if (a === '--quiet') out.quiet = true;
    else if (a === '--login') {
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) { out.login = next; i++; }
      else { out.login = 'Soybean:123456'; }
    }
    else if (a.startsWith('--')) {
      const key = a.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      out[key] = argv[i + 1];
      i++;
    }
  }
  return out;
}

function printHelp() {
  const help = `
scripts/cdp-reset.js — CDP debug session reset utility

Usage:
  node scripts/cdp-reset.js [--port 9229] [--target <url>] [--no-reload]
                            [--login [user:pass]] [--front <url>]
                            [--timeout <ms>] [--quiet]

Flags:
  --port <n>           Edge debug port (default 9229)
  --target <url>       navigate to url before clearing (default: skip navigate)
  --no-reload          do not reload after clearing (default: reload)
  --login [u:p]        after reset+reload, run Soybean login flow
                       (default credentials Soybean:123456)
  --front <url>        base-web front URL when login navigation needed
                       (default http://127.0.0.1:11080)
  --timeout <ms>       per-CDP-method timeout in ms (default 10000)
  --quiet              minimal stdout; rely on exit code

Examples:
  # clear stale storage + cookies + reload current tab
  node scripts/cdp-reset.js

  # one-shot login probe (reset + reload + login Soybean/123456)
  node scripts/cdp-reset.js --login

  # navigate to /login, then clear and reload
  node scripts/cdp-reset.js --target http://127.0.0.1:11080/login

  # custom credentials
  node scripts/cdp-reset.js --login Administrator:123456
`.trim();
  console.log(help);
}

async function main() {
  // 1. find a 11080 page tab (or any page tab as fallback)
  let tabs;
  try {
    tabs = await (await fetch(`${CDP_HTTP}/json`)).json();
  } catch (e) {
    console.error(`CDP not reachable at ${CDP_HTTP}/json: ${e.message}`);
    process.exit(1);
  }
  const pageTabs = tabs.filter(t => t.type === 'page' && !t.url.startsWith('devtools://'));
  if (pageTabs.length === 0) {
    console.error(`No page-type tab available on ${CDP_HTTP}. Open a tab first or start Edge.`);
    process.exit(1);
  }
  // prefer 11080 tab; fallback to first page tab
  const target = pageTabs.find(t => t.url.includes('11080')) || pageTabs[0];
  log(`[CDP] connecting to tab: ${target.url || '(blank)'}`);

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = () => reject(new Error('WebSocket open failed'));
  });

  let msgId = 0;
  const pending = new Map();
  ws.onmessage = (ev) => {
    const data = typeof ev.data === 'string' ? ev.data : Buffer.from(ev.data).toString();
    const msg = JSON.parse(data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg);
    }
  };
  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++msgId;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (pending.has(id)) { pending.delete(id); reject(new Error(`CDP ${method} timeout (${TIMEOUT}ms)`)); }
      }, TIMEOUT);
    });
  }
  async function evaluate(expr) {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
    if (r.result && r.result.exceptionDetails) {
      throw new Error(`JS exception: ${r.result.exceptionDetails.text}`);
    }
    return r.result?.result?.value;
  }
  async function waitSelector(selector, timeout = 8000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const ok = await evaluate(`!!document.querySelector(${JSON.stringify(selector)})`);
      if (ok) return true;
      await new Promise(r => setTimeout(r, 200));
    }
    return false;
  }

  try {
    await send('Runtime.enable');
    await send('Page.enable');
    await send('Network.enable');

    // 2. navigate first if --target given
    if (TARGET) {
      log(`[CDP] navigate → ${TARGET}`);
      await send('Page.navigate', { url: TARGET });
      await new Promise(r => setTimeout(r, 1500));
    }

    // 3. probe pre-reset state
    const before = await evaluate(`JSON.stringify({
      url: location.href,
      lsKeys: Object.keys(localStorage),
      ssKeys: Object.keys(sessionStorage),
      cookieLen: document.cookie.length
    })`);
    log(`[CDP] BEFORE: ${before}`);

    // 4. clear localStorage + sessionStorage
    await evaluate(`localStorage.clear(); sessionStorage.clear();`);
    log('[CDP] cleared localStorage + sessionStorage');

    // 5. clear cookies + cache (browser-level)
    await send('Network.clearBrowserCookies');
    await send('Network.clearBrowserCache');
    log('[CDP] cleared cookies + cache');

    // 6. reload (unless --no-reload)
    if (RELOAD) {
      log('[CDP] reload (ignoreCache)');
      await send('Page.reload', { ignoreCache: true });
      // wait for app hydration: input appears or 12s
      const t0 = Date.now();
      let ready = false;
      while (Date.now() - t0 < 12000) {
        const probe = await evaluate(`JSON.stringify({
          inputs: document.querySelectorAll('input').length,
          hasVueApp: !!document.getElementById('app')?.__vue_app__,
          nprogress: document.documentElement.classList.contains('nprogress-busy')
        })`);
        const p = JSON.parse(probe);
        if (p.hasVueApp && !p.nprogress) { ready = true; break; }
        await new Promise(r => setTimeout(r, 300));
      }
      if (ready) {
        log(`[CDP] ✓ hydration complete (${Date.now() - t0}ms)`);
      } else {
        log(`[CDP] ⚠ hydration not confirmed within 12s (Vue maybe not yet mounted)`);
      }
    }

    // 7. optional login flow
    if (LOGIN) {
      const [user, pass = '123456'] = LOGIN.split(':');
      log(`[CDP] login flow: ${user}/${pass.replace(/./g, '*')}`);
      // ensure on /login route
      const curPath = await evaluate('location.pathname');
      if (!curPath.includes('login')) {
        await send('Page.navigate', { url: `${FRONT}/login` });
        await new Promise(r => setTimeout(r, 2000));
      }
      const hasForm = await waitSelector('input', 8000);
      if (!hasForm) {
        console.error('[CDP] ✗ login form not visible — abort');
        ws.close();
        process.exit(2);
      }
      // fill
      await evaluate(`
        (() => {
          const inputs = document.querySelectorAll('input');
          const u = inputs[0];
          const p = Array.from(inputs).find(i => i.type === 'password');
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          setter.call(u, ${JSON.stringify(user)});
          u.dispatchEvent(new Event('input', { bubbles: true }));
          setter.call(p, ${JSON.stringify(pass)});
          p.dispatchEvent(new Event('input', { bubbles: true }));
        })()
      `);
      await new Promise(r => setTimeout(r, 400));
      // click 确认
      const clicked = await evaluate(`
        (() => {
          const btns = Array.from(document.querySelectorAll('button'));
          const ok = btns.find(b => /^(确 认|确认|Confirm|Login)$/.test((b.textContent||'').trim()));
          if (ok) { ok.click(); return true; }
          return false;
        })()
      `);
      if (!clicked) {
        console.error('[CDP] ✗ login button 确认 not found');
        ws.close();
        process.exit(2);
      }
      // wait navigation
      const t0 = Date.now();
      let landed = '/login';
      while (Date.now() - t0 < 12000) {
        landed = await evaluate('location.pathname');
        if (landed && !landed.includes('login')) break;
        await new Promise(r => setTimeout(r, 300));
      }
      if (landed && !landed.includes('login')) {
        log(`[CDP] ✓ login PASS — landed on ${landed} (${Date.now() - t0}ms)`);
        // probe token
        const after = await evaluate(`JSON.stringify({
          tokenPrefix: (localStorage.getItem('SOY_token') || '').slice(0, 40),
          title: document.title
        })`);
        log(`[CDP] post-login: ${after}`);
      } else {
        console.error(`[CDP] ✗ login FAIL — still on ${landed} after 12s`);
        ws.close();
        process.exit(2);
      }
    }

    if (QUIET) console.log('OK');
    ws.close();
    process.exit(0);
  } catch (e) {
    console.error(`[CDP] error: ${e.message}`);
    try { ws.close(); } catch {}
    process.exit(1);
  }
}

main().catch(e => {
  console.error('crashed:', e);
  process.exit(1);
});
