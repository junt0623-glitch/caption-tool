// tests/helpers.js
// 展覧会キャプション工房 - テスト共通ヘルパー
// 各 btNN_*.js は Playwright を直接使い、この中の mkRunner() でアサーションと集計を行う。
const { chromium } = require('playwright');
const path = require('path');

const APP_URL = 'file://' + path.join(__dirname, '..', 'index.html');

/** 新しいブラウザコンテキスト（＝まっさらな localStorage）でページを開く */
async function openApp(browser, { waitTab = null } = {}) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console error: ' + m.text()); });
  // ダイアログ(alert/confirm/prompt)は各テストで page.once('dialog', ...) 等を使って個別に処理する。
  // （openApp では自動応答しない：複数ハンドラの二重accept衝突を避けるため）
  await page.goto(APP_URL);
  await page.waitForTimeout(300);
  if (waitTab) {
    await page.click(`nav.tabs button[data-tab="${waitTab}"]`);
    await page.waitForTimeout(200);
  }
  return { context, page, errors };
}

/** 1テストファイル分の合否を集計するランナーを作る */
function mkRunner(title) {
  let pass = 0, fail = 0;
  const failMessages = [];
  return {
    title,
    ok(cond, msg) {
      if (cond) { pass++; }
      else { fail++; failMessages.push(msg); console.log('  ✗ FAIL: ' + msg); }
    },
    eq(actual, expected, msg) {
      const cond = JSON.stringify(actual) === JSON.stringify(expected);
      if (cond) { pass++; }
      else { fail++; const m = `${msg}（期待: ${JSON.stringify(expected)} / 実際: ${JSON.stringify(actual)}）`; failMessages.push(m); console.log('  ✗ FAIL: ' + m); }
    },
    noErrors(errors, msg = 'コンソール/ページエラーが無いこと') {
      this.eq(errors, [], msg + (errors.length ? '：' + errors.join(' | ') : ''));
    },
    finish() {
      const label = `[${title}] ${pass} passed, ${fail} failed`;
      console.log(label);
      return { title, pass, fail, failMessages };
    }
  };
}

/** 内容を問わずダイアログ(confirm/alert)を自動でOKにする（prompt にテキストを渡したい場合は使わないこと） */
function autoAccept(page) {
  page.on('dialog', d => d.accept());
}

module.exports = { APP_URL, openApp, mkRunner, chromium, autoAccept };
