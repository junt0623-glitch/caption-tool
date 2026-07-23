// bt36【新機能】印刷は原寸案内→プリンター詳細設定（印刷ダイアログ）へ進む。「次回から表示しない」で直接印刷。
const path = require('path');
const { openApp, mkRunner, chromium } = require('./helpers');

async function run() {
  const t = mkRunner('bt36 原寸印刷ガイド');
  const browser = await chromium.launch({});
  try {
    const { page, errors } = await openApp(browser);
    // window.printは実際には呼ばず、呼ばれた回数だけ記録する（ヘッドレスでのハング回避）
    await page.evaluate(() => { window.__printCalls = 0; window.print = () => { window.__printCalls++; }; });

    await page.click('nav.tabs button[data-tab="print"]');
    await page.waitForTimeout(300);

    // ---- 印刷ボタンでまず案内ダイアログが開く（いきなり印刷しない） ----
    await page.click('#btnPrint');
    await page.waitForTimeout(200);
    const st1 = await page.evaluate(() => ({
      open: document.getElementById('printGuideDialog').open,
      prints: window.__printCalls
    }));
    t.eq(st1.open, true, '印刷ボタンでまず原寸印刷の案内ダイアログが開く');
    t.eq(st1.prints, 0, '案内の段階ではまだ印刷（ダイアログ）は呼ばれない');

    // ---- 「プリンターの詳細設定へ」で印刷ダイアログ（window.print）へ進む ----
    await page.click('#printGuideGo');
    await page.waitForTimeout(200);
    const st2 = await page.evaluate(() => ({
      open: document.getElementById('printGuideDialog').open,
      prints: window.__printCalls,
      page: document.getElementById('dynPageSize').textContent
    }));
    t.eq(st2.open, false, '案内ダイアログが閉じる');
    t.eq(st2.prints, 1, '印刷ダイアログ（プリンター詳細設定への入口）へ進む');
    t.ok(/@page\{size:210mm 297mm;margin:0\}/.test(st2.page), '原寸で出力するため用紙寸法(A4)がmm単位で@pageに設定される');

    // ---- キャンセルでは印刷しない ----
    await page.click('#btnPrint');
    await page.waitForTimeout(150);
    await page.click('#printGuideDialog button[data-close="printGuideDialog"]');
    await page.waitForTimeout(150);
    const st3 = await page.evaluate(() => window.__printCalls);
    t.eq(st3, 1, 'キャンセルすると印刷は呼ばれない（回数は変わらない）');

    // ---- 「次回から表示しない」で以後は直接印刷ダイアログへ ----
    await page.click('#btnPrint');
    await page.waitForTimeout(150);
    await page.check('#printGuideHide');
    await page.click('#printGuideGo');
    await page.waitForTimeout(200);
    const persisted = await page.evaluate(() => ({
      calls: window.__printCalls,
      flag: JSON.parse(localStorage.getItem('caption-koubou-v1')).printGuideHide
    }));
    t.eq(persisted.calls, 2, '「次回から表示しない」でもその回はきちんと印刷へ進む');
    t.eq(persisted.flag, true, '「次回から表示しない」設定がlocalStorageに保存される');

    // 次回はダイアログを出さず直接印刷
    await page.click('#btnPrint');
    await page.waitForTimeout(200);
    const st4 = await page.evaluate(() => ({
      open: document.getElementById('printGuideDialog').open,
      calls: window.__printCalls
    }));
    t.eq(st4.open, false, '2回目以降は案内ダイアログを出さない');
    t.eq(st4.calls, 3, '案内を飛ばして直接プリンター詳細設定（印刷ダイアログ）へ進む');

    t.noErrors(errors);
    const r = t.finish();
    await browser.close();
    return r;
  } catch (e) {
    console.log('  ✗ EXCEPTION: ' + e.message);
    await browser.close();
    t.ok(false, '例外: ' + e.message);
    return t.finish();
  }
}
module.exports = { run };
if (require.main === module) { run().then(r => process.exit(r.fail ? 1 : 0)); }
