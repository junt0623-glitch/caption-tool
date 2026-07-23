// bt37【新機能】フォント診断：選択中の書体の実フォントが端末に入っているか判定・警告・診断表示
// UDデジタル教科書体等はWindows搭載フォントで、macOS等・このテスト環境（Linux）には入っていない。
// 実フォントが無いと近い代替書体で表示されるため、その事実を可視化する。
const { openApp, mkRunner, chromium } = require('./helpers');

async function run() {
  const t = mkRunner('bt37 フォント診断');
  const browser = await chromium.launch({});
  try {
    const { page, errors } = await openApp(browser, { waitTab: 'layout' });

    // ---- isFontAvailable の基本動作 ----
    const basic = await page.evaluate(() => ({
      real: isFontAvailable('DejaVu Sans'),        // ヘッドレスChromiumに存在
      bogus: isFontAvailable('ZZ No Such Font 98765'),
      generic: isFontAvailable('serif'),           // 総称は実フォント扱いしない
      empty: isFontAvailable('')
    }));
    t.eq(basic.real, true, '端末に存在する実フォントは「利用可」と判定される');
    t.eq(basic.bogus, false, '存在しないフォントは「なし」と判定される');
    t.eq(basic.generic, false, '総称フォント（serif等）は実フォント扱いしない');
    t.eq(basic.empty, false, '空文字は利用不可');

    // ---- UDデジタル教科書体（未インストール環境）を選ぶと警告が出る ----
    await page.selectOption('#fontKind', 'udkyokashob');
    await page.waitForTimeout(200);
    const warn = await page.evaluate(() => ({
      shown: getComputedStyle(document.getElementById('fontMissingWarn')).display !== 'none',
      unavail: selectedFontUnavailable('udkyokashob'),
      txt: document.getElementById('fontMissingWarn').textContent
    }));
    t.eq(warn.shown, true, '実フォントが無い書体を選ぶと警告が表示される');
    t.eq(warn.unavail, true, 'selectedFontUnavailableがtrueを返す（実フォント未検出）');
    t.ok(warn.txt.includes('見つかりません') && warn.txt.includes('オンラインフォント'), '警告に代替表示中である旨とオンライン書体の案内が含まれる');

    // ---- 診断ボタンで候補フォントの利用可否一覧が出る ----
    await page.click('#btnFontCheck');
    await page.waitForTimeout(150);
    const diag = await page.evaluate(() => ({
      shown: getComputedStyle(document.getElementById('fontCheckResult')).display !== 'none',
      txt: document.getElementById('fontCheckResult').textContent
    }));
    t.eq(diag.shown, true, '診断結果が表示される');
    t.ok(diag.txt.includes('UD デジタル 教科書体 NP'), '診断に24H2統合名など候補フォント名が列挙される');
    t.ok(diag.txt.includes('なし'), 'この環境では実フォントが「なし」と示される');
    t.ok(diag.txt.includes('代替表示') || diag.txt.includes('総称'), '結論として代替表示中である旨が示される');

    // ---- オンライン書体（gf付き）は警告対象外（ダウンロードされ確実に表示できるため） ----
    await page.selectOption('#fontKind', 'notosans');
    await page.waitForTimeout(200);
    const online = await page.evaluate(() => ({
      shown: getComputedStyle(document.getElementById('fontMissingWarn')).display !== 'none',
      unavail: selectedFontUnavailable('notosans'),
      diagHidden: getComputedStyle(document.getElementById('fontCheckResult')).display === 'none'
    }));
    t.eq(online.unavail, false, 'オンライン書体は未インストール警告の対象外');
    t.eq(online.shown, false, 'オンライン書体選択時は警告を出さない');
    t.eq(online.diagHidden, true, '書体を切り替えると前回の診断結果は消える');

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
