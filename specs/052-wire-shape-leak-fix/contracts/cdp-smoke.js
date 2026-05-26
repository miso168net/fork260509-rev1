#!/usr/bin/env node
/**
 * 052 wire-shape-leak-fix C-V6 CDP smoke — base-web role-list 新增 + 編輯 modal regression
 *
 * per spec.md FR-008 + contracts C-V6 (reassurance: wire shape 改變後 base-web 0 改動仍 OK、防 040 critical bug 重演)
 *
 * 驅動 Edge :9229 debug port (per memory: reference_cdp_smoke_technique)、
 * 純 node global WebSocket (node v22+)、無 playwright/puppeteer dep。
 *
 * 14 步流程：
 *   1. Login (Soybean/123456) → 「确认」
 *   2. Wait dashboard nav
 *   3. Navigate /manage/role
 *   4. Wait list table loaded
 *   5. Click 「新增」 button
 *   6. Wait modal opened
 *   7. Fill modal: roleName=CV6_R1 / roleCode=R_CV6_R1
 *   8. Click 「确认」
 *   9. Wait 1s + assert list includes CV6_R1
 *  10. Click CV6_R1 row 「编辑」 button
 *  11. Wait modal opened
 *  12. Change roleName to CV6_R1_EDITED
 *  13. Click 「确认」
 *  14. Wait toast 「修改成功」 + assert list reflects new name
 *
 * cleanup: psql DELETE WHERE code='R_CV6_R1' (run outside this script)
 *
 * Exit code: 0 if all PASS、1 if any FAIL.
 */

const FRONT = 'http://127.0.0.1:11080';
const USER = 'Soybean';
const PASS = '123456';
const CDP_HTTP = 'http://127.0.0.1:9229';
const TIMEOUT_NAV = 15000;
const TIMEOUT_SELECTOR = 8000;
const TEST_ROLE_NAME = 'CV6_R1';
const TEST_ROLE_CODE = 'R_CV6_R1';
const TEST_ROLE_EDITED = 'CV6_R1_EDITED';

let msgId = 0;
const pending = new Map();
const consoleErrors = [];

function send(ws, method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++msgId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error(`CDP ${method} timeout`));
      }
    }, TIMEOUT_NAV);
  });
}

async function waitSelector(ws, selector, timeout = TIMEOUT_SELECTOR) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const r = await send(ws, 'Runtime.evaluate', {
      expression: `(() => { const el = document.querySelector(${JSON.stringify(selector)}); return el ? { ok: true, text: (el.textContent || '').trim().slice(0, 200) } : { ok: false }; })()`,
      returnByValue: true
    });
    if (r.result && r.result.result && r.result.result.value && r.result.result.value.ok) {
      return r.result.result.value;
    }
    await new Promise(r => setTimeout(r, 200));
  }
  throw new Error(`waitSelector timeout: ${selector}`);
}

async function evaluate(ws, expr) {
  const r = await send(ws, 'Runtime.evaluate', { expression: expr, returnByValue: true });
  if (r.result && r.result.exceptionDetails) {
    throw new Error(`JS exception: ${r.result.exceptionDetails.text}`);
  }
  return r.result?.result?.value;
}

async function navigate(ws, url) {
  await send(ws, 'Page.navigate', { url });
  await new Promise(r => setTimeout(r, 1500));
}

async function setInputValue(ws, selector, value) {
  return evaluate(ws, `
    (() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return { ok: false, reason: 'no element' };
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      nativeSetter.call(el, ${JSON.stringify(value)});
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return { ok: true };
    })()
  `);
}

async function main() {
  // 1. Pick or create a tab
  const tabs = await (await fetch(`${CDP_HTTP}/json`)).json();
  let target = tabs.find(t => t.type === 'page' && !t.url.startsWith('devtools://'));
  if (!target) {
    target = await (await fetch(`${CDP_HTTP}/json/new?${encodeURIComponent('about:blank')}`, { method: 'PUT' })).json();
  }
  const wsUrl = target.webSocketDebuggerUrl;
  console.log(`[CDP] connecting to ${wsUrl.slice(0, 80)}...`);

  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });

  ws.onmessage = (ev) => {
    const data = typeof ev.data === 'string' ? ev.data : Buffer.from(ev.data).toString();
    const msg = JSON.parse(data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg);
    }
    if (msg.method === 'Runtime.consoleAPICalled' && (msg.params.type === 'error' || msg.params.type === 'warning')) {
      const txt = (msg.params.args || []).map(a => a.value || a.description || '').join(' ');
      consoleErrors.push(`[${msg.params.type}] ${txt.slice(0, 200)}`);
    }
  };

  await send(ws, 'Page.enable');
  await send(ws, 'Runtime.enable');
  await send(ws, 'Network.enable');

  // ─── PROLOGUE: stale-token clear ───
  // 已知 base-web stale-token hang bug：debug session 若留有過期 SOY_refreshToken /
  // SOY_token、setupRouter 嘗試 refresh 會卡 promise、splash mask 永不消失。
  // 對齊 scripts/cdp-reset.js 邏輯、smoke 開頭一定清。詳見 CLAUDE.md §8.4。
  try {
    const r = await send(ws, 'Runtime.evaluate', {
      expression: 'try { localStorage.clear(); sessionStorage.clear(); JSON.stringify(Object.keys(localStorage)) } catch (e) { e.message }',
      returnByValue: true
    });
    await send(ws, 'Network.clearBrowserCookies');
    await send(ws, 'Network.clearBrowserCache');
    console.log('[CDP smoke 052 C-V6] stale-token prologue: cleared localStorage + sessionStorage + cookies + cache');
  } catch (e) {
    console.log(`[CDP smoke 052 C-V6] stale-token prologue skipped: ${e.message}`);
  }

  const results = [];
  function record(name, status, detail = '') {
    const sym = status === 'PASS' ? '✓' : '✗';
    console.log(`  ${sym} ${name}: ${status}${detail ? ' — ' + detail : ''}`);
    results.push({ name, status, detail });
  }

  console.log('\n[CDP smoke 052 C-V6] base-web role-list 新增 + 編輯 modal regression');
  console.log('==========================================================');

  // ─── 1+2. Login + dashboard ───
  try {
    await navigate(ws, `${FRONT}/login`);
    await waitSelector(ws, 'input[placeholder*="账号"], input[placeholder*="userName"], input[type="text"]');
    await evaluate(ws, `
      (() => {
        const inputs = document.querySelectorAll('input');
        const usernameInput = inputs[0];
        const passwordInput = Array.from(inputs).find(i => i.type === 'password');
        if (usernameInput) {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          setter.call(usernameInput, ${JSON.stringify(USER)});
          usernameInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
        if (passwordInput) {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          setter.call(passwordInput, ${JSON.stringify(PASS)});
          passwordInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
      })()
    `);
    await new Promise(r => setTimeout(r, 500));
    await evaluate(ws, `
      (() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const submit = btns.find(b => /(确认|登录|确认登录|登 录|Confirm|Login)/.test(b.textContent || ''));
        if (submit) submit.click();
      })()
    `);
    const t0 = Date.now();
    while (Date.now() - t0 < TIMEOUT_NAV) {
      const url = await evaluate(ws, 'location.pathname');
      if (url && !url.includes('login')) break;
      await new Promise(r => setTimeout(r, 300));
    }
    const url = await evaluate(ws, 'location.pathname');
    if (url && !url.includes('login')) {
      record('1+2. Login + dashboard', 'PASS', `at ${url}`);
    } else {
      record('1+2. Login + dashboard', 'FAIL', 'still on login');
      throw new Error('login failed');
    }
  } catch (e) {
    record('1+2. Login + dashboard', 'FAIL', e.message);
    ws.close();
    return process.exit(1);
  }

  // ─── 3+4. Navigate to /manage/role, wait list table ───
  let initialRowCount = 0;
  try {
    await navigate(ws, `${FRONT}/manage/role`);
    await waitSelector(ws, '.n-data-table-tr, .n-data-table__pagination, .n-data-table');
    initialRowCount = await evaluate(ws, `document.querySelectorAll('.n-data-table-tr').length`);
    if (initialRowCount >= 1) {
      record('3+4. /manage/role list', 'PASS', `${initialRowCount} rows initially`);
    } else {
      record('3+4. /manage/role list', 'FAIL', `rows=${initialRowCount}`);
    }
  } catch (e) {
    record('3+4. /manage/role list', 'FAIL', e.message);
  }

  // ─── 5+6. Click 新增 button + wait modal ───
  try {
    await evaluate(ws, `
      (() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const addBtn = btns.find(b => /新增|添加/.test(b.textContent || '') && !/角色|菜单/.test(b.textContent || ''));
        // try fallback: any 新增 button
        const fallback = btns.find(b => /新增/.test(b.textContent || ''));
        const target = addBtn || fallback;
        if (target) target.click();
        return target ? target.textContent.trim() : null;
      })()
    `);
    await new Promise(r => setTimeout(r, 1000));
    await waitSelector(ws, '.n-modal, .n-drawer', 6000);
    record('5+6. Click 新增 + modal open', 'PASS', 'modal opened');
  } catch (e) {
    record('5+6. Click 新增 + modal open', 'FAIL', e.message);
  }

  // ─── 7+8. Fill roleName / roleCode and click 确认 ───
  let addPassed = false;
  try {
    await evaluate(ws, `
      (() => {
        const modal = document.querySelector('.n-modal-container .n-modal, .n-drawer');
        if (!modal) return { ok: false, reason: 'no modal' };
        const inputs = Array.from(modal.querySelectorAll('input.n-input__input-el, input'));
        // Heuristic: first input = roleName, second input = roleCode
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        if (inputs[0]) {
          setter.call(inputs[0], ${JSON.stringify(TEST_ROLE_NAME)});
          inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
        }
        if (inputs[1]) {
          setter.call(inputs[1], ${JSON.stringify(TEST_ROLE_CODE)});
          inputs[1].dispatchEvent(new Event('input', { bubbles: true }));
        }
        return { ok: true, filled: inputs.length };
      })()
    `);
    await new Promise(r => setTimeout(r, 500));
    // Click 确认 inside modal
    await evaluate(ws, `
      (() => {
        const modal = document.querySelector('.n-modal-container .n-modal, .n-drawer');
        if (!modal) return null;
        const btns = Array.from(modal.querySelectorAll('button'));
        const ok = btns.find(b => /(确 认|确认|Confirm|OK)/.test(b.textContent || ''));
        if (ok) ok.click();
        return ok ? ok.textContent.trim() : null;
      })()
    `);
    await new Promise(r => setTimeout(r, 2000));
    // Verify role appears in list
    const found = await evaluate(ws, `
      (() => {
        const rows = Array.from(document.querySelectorAll('.n-data-table-tr'));
        return rows.some(r => /CV6_R1(?!_EDITED)|R_CV6_R1/.test(r.textContent || ''));
      })()
    `);
    if (found) {
      record('7+8+9. Fill + 确认 + list contains CV6_R1', 'PASS', 'new role visible in list');
      addPassed = true;
    } else {
      // Try fallback: refresh page and check again
      await navigate(ws, `${FRONT}/manage/role`);
      await waitSelector(ws, '.n-data-table-tr, .n-data-table');
      const found2 = await evaluate(ws, `
        (() => {
          const rows = Array.from(document.querySelectorAll('.n-data-table-tr'));
          return rows.some(r => /CV6_R1|R_CV6_R1/.test(r.textContent || ''));
        })()
      `);
      if (found2) {
        record('7+8+9. Fill + 确认 + list contains CV6_R1', 'PASS', 'visible after page refresh');
        addPassed = true;
      } else {
        record('7+8+9. Fill + 确认 + list contains CV6_R1', 'FAIL', 'CV6_R1 not in list after submit');
      }
    }
  } catch (e) {
    record('7+8+9. Fill + 确认 + list contains CV6_R1', 'FAIL', e.message);
  }

  // ─── 10+11. Click 编辑 for CV6_R1 + wait modal ───
  if (addPassed) {
    try {
      await evaluate(ws, `
        (() => {
          const rows = Array.from(document.querySelectorAll('.n-data-table-tr'));
          const target = rows.find(r => /CV6_R1(?!_EDITED)|R_CV6_R1/.test(r.textContent || ''));
          if (!target) return { ok: false, reason: 'no CV6_R1 row' };
          const btns = Array.from(target.querySelectorAll('button'));
          const editBtn = btns.find(b => /编辑|編輯|Edit/.test(b.textContent || ''));
          if (editBtn) editBtn.click();
          return { ok: !!editBtn, clicked: editBtn?.textContent?.trim() };
        })()
      `);
      await new Promise(r => setTimeout(r, 1000));
      await waitSelector(ws, '.n-modal, .n-drawer', 6000);
      record('10+11. Click 编辑 + modal open', 'PASS', 'edit modal opened');
    } catch (e) {
      record('10+11. Click 编辑 + modal open', 'FAIL', e.message);
    }
  } else {
    record('10+11. Click 编辑 + modal open', 'FAIL', 'skipped (add failed)');
  }

  // ─── 12+13. Change roleName, click 确认, wait toast 修改成功 ───
  if (addPassed) {
    try {
      // Replace first input value (roleName) with CV6_R1_EDITED
      await evaluate(ws, `
        (() => {
          const modal = document.querySelector('.n-modal-container .n-modal, .n-drawer');
          if (!modal) return null;
          const inputs = Array.from(modal.querySelectorAll('input.n-input__input-el, input'));
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          if (inputs[0]) {
            setter.call(inputs[0], ${JSON.stringify(TEST_ROLE_EDITED)});
            inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
            inputs[0].dispatchEvent(new Event('change', { bubbles: true }));
          }
          return inputs[0]?.value;
        })()
      `);
      await new Promise(r => setTimeout(r, 500));
      // Click 确认 in modal
      await evaluate(ws, `
        (() => {
          const modal = document.querySelector('.n-modal-container .n-modal, .n-drawer');
          if (!modal) return null;
          const btns = Array.from(modal.querySelectorAll('button'));
          const ok = btns.find(b => /(确 认|确认|Confirm|OK)/.test(b.textContent || ''));
          if (ok) ok.click();
        })()
      `);
      await new Promise(r => setTimeout(r, 2000));
      // Wait for toast 修改成功
      const toastSeen = await evaluate(ws, `
        (() => {
          const allText = document.body.innerText || '';
          return /修改成功|更新成功|成功/.test(allText);
        })()
      `);
      // Verify edited name in list (refresh if needed)
      await navigate(ws, `${FRONT}/manage/role`);
      await waitSelector(ws, '.n-data-table-tr, .n-data-table');
      const editedFound = await evaluate(ws, `
        (() => {
          const rows = Array.from(document.querySelectorAll('.n-data-table-tr'));
          return rows.some(r => /CV6_R1_EDITED/.test(r.textContent || ''));
        })()
      `);
      if (editedFound) {
        record('12+13+14. Edit + 确认 + list shows CV6_R1_EDITED', 'PASS', toastSeen ? 'toast seen' : 'edit confirmed via list (toast missed)');
      } else {
        record('12+13+14. Edit + 确认 + list shows CV6_R1_EDITED', 'FAIL', 'edited name not in list');
      }
    } catch (e) {
      record('12+13+14. Edit + 确认 + list shows CV6_R1_EDITED', 'FAIL', e.message);
    }
  } else {
    record('12+13+14. Edit + 确认 + list shows CV6_R1_EDITED', 'FAIL', 'skipped (add failed)');
  }

  ws.close();

  // Summary
  const pass = results.filter(r => r.status === 'PASS').length;
  const fail = results.filter(r => r.status === 'FAIL').length;
  console.log('==========================================================');
  console.log(`Total: ${pass}/${results.length} PASS、${fail} FAIL`);
  if (consoleErrors.length > 0) {
    console.log(`Console errors observed: ${consoleErrors.length}`);
    consoleErrors.slice(0, 5).forEach(e => console.log(`  ${e}`));
  } else {
    console.log('No console errors observed');
  }
  console.log('\nReminder: cleanup test role via psql:');
  console.log(`  docker compose exec -T postgres psql -U soybean -d soybean_admin_rust -c "DELETE FROM sys_role WHERE code='${TEST_ROLE_CODE}';"`);

  process.exit(fail > 0 ? 1 : 0);
}

main().catch(e => {
  console.error('Smoke runner crashed:', e);
  process.exit(2);
});
