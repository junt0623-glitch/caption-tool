// bt40【変更】印刷シート右下の見出し（展覧会名＋ページ番号）を廃止し、印刷範囲に含めない
const { openApp, mkRunner, chromium } = require('./helpers');

async function run() {
  const t = mkRunner('bt40 ページ見出しの廃止');
  const browser = await chromium.launch({});
  try {
    const { page, errors } = await openApp(browser, { waitTab: 'print' });
    await page.evaluate(() => { window.print = () => {}; });

    // ---- 印刷プレビューに見出し要素が無い ----
    const preview = await page.evaluate(() => ({
      pageno: document.querySelectorAll('#sheetScroll .pageno').length,
      sheets: document.querySelectorAll('#sheetScroll .sheet').length,
      text: [...document.querySelectorAll('#sheetScroll .sheet')].map(s => s.textContent).join(' ')
    }));
    t.ok(preview.sheets >= 1, 'プレビューにシートが描画される');
    t.eq(preview.pageno, 0, 'プレビューのシートに見出し（.pageno）が無い');
    t.eq(preview.text.includes('1/1'), false, 'ページ番号（1/1）が印刷面に出ない');
    t.eq(preview.text.includes('見本の展覧会'), false, '展覧会名が印刷面に出ない');

    // ---- 実際の印刷DOM（#print-root）にも含まれない ----
    await page.evaluate(() => doPrint());
    await page.waitForTimeout(250);
    const printed = await page.evaluate(() => {
      const root = document.getElementById('print-root');
      return {
        pageno: root.querySelectorAll('.pageno').length,
        sheets: root.querySelectorAll('.sheet').length,
        hasName: root.textContent.includes('見本の展覧会')
      };
    });
    t.ok(printed.sheets >= 1, '印刷DOMにシートが入る');
    t.eq(printed.pageno, 0, '印刷DOMに見出し（.pageno）が含まれない');
    t.eq(printed.hasName, false, '印刷物に展覧会名が出力されない');

    // ---- 複数枚でも見出しが復活しない ----
    await page.evaluate(() => {
      const p = proj();
      for (let i = 0; i < 40; i++) { const w = newWork(); Object.assign(w, { no: 'x' + i, title: '作品' + i }); p.works.push(w); }
      save(); renderSheets();
    });
    await page.waitForTimeout(500);
    const multi = await page.evaluate(() => ({
      sheets: document.querySelectorAll('#sheetScroll .sheet').length,
      pageno: document.querySelectorAll('#sheetScroll .pageno').length
    }));
    t.ok(multi.sheets > 1, '複数枚に面付けされる');
    t.eq(multi.pageno, 0, '複数枚でも見出しは一切入らない');

    // ---- 原寸確認用の目盛りは従来どおり機能する（今回の削除で壊れていない） ----
    await page.check('#prRuler');
    await page.waitForTimeout(400);
    const ruler = await page.evaluate(() => document.querySelectorAll('#sheetScroll .scale-ruler').length);
    t.ok(ruler >= 1, '原寸確認用の目盛りは引き続き印刷できる');

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
