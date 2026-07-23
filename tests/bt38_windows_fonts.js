// bt38【新機能】Windows標準搭載フォントの網羅追加（欧文グループ＋日本語UI/等幅の追加）
const { openApp, mkRunner, chromium } = require('./helpers');

async function run() {
  const t = mkRunner('bt38 Windows標準フォント');
  const browser = await chromium.launch({});
  try {
    const { page, errors } = await openApp(browser, { waitTab: 'layout' });

    // ---- 「欧文（Windows標準）」グループが存在し、代表的なWindows書体が並ぶ ----
    const info = await page.evaluate(() => {
      const groups = [...document.querySelectorAll('#fontKind optgroup')].map(g => g.label);
      const win = [...document.querySelectorAll('#fontKind optgroup[label="欧文（Windows標準）"] option')].map(o => o.value);
      return { groups, win, total: document.querySelectorAll('#fontKind option').length };
    });
    t.ok(info.groups.includes('欧文（Windows標準）'), '「欧文（Windows標準）」グループが書体セレクトに追加される');
    t.ok(info.win.length >= 25, `Windows標準欧文が多数（25以上）並ぶ（実際: ${info.win.length}）`);
    ['winArial', 'winCalibri', 'winConsolas', 'winTrebuchet', 'winVerdana', 'winComic'].forEach(k => {
      t.ok(info.win.includes(k), `Windows書体 ${k} が選択肢にある`);
    });

    // ---- 各Windows書体の登録内容（正確なファミリ名・非オンライン） ----
    const reg = await page.evaluate(() => {
      const pick = k => ({ stack: FONTS[k].stack, gf: !!FONTS[k].gf, group: FONTS[k].group });
      return {
        arial: pick('winArial'), calibri: pick('winCalibri'), consolas: pick('winConsolas'),
        segoeScript: pick('winSegoeScript'),
        yugothicui: pick('yugothicui'), meiryoui: pick('meiryoui'),
        bizminchom: pick('bizminchom'), bizgothicm: pick('bizgothicm')
      };
    });
    t.ok(reg.arial.stack.includes('"Arial"') && !reg.arial.gf, 'Arialは正確なファミリ名参照でオンラインではない');
    t.ok(reg.calibri.stack.includes('"Calibri"'), 'Calibriのスタックに"Calibri"が含まれる');
    t.ok(reg.consolas.stack.includes('"Consolas"') && reg.consolas.stack.includes('monospace'), 'Consolasは等幅フォールバック');
    t.ok(reg.segoeScript.stack.includes('"Segoe Script"'), 'Segoe Scriptのスタックに"Segoe Script"が含まれる');
    // 追加した日本語UI/等幅
    t.ok(reg.yugothicui.stack.includes('"Yu Gothic UI"') && reg.yugothicui.group === 'ゴシック体', '游ゴシック UIがゴシック体に追加される');
    t.ok(reg.meiryoui.stack.includes('"Meiryo UI"'), 'メイリオ UIが追加される');
    t.ok(reg.bizminchom.stack.includes('"BIZ UDMincho"'), 'BIZ UD明朝（等幅）が追加される');
    t.ok(reg.bizgothicm.stack.includes('"BIZ UDGothic"'), 'BIZ UDゴシック（等幅）が追加される');

    // ---- 選択してプレビューに適用できる（クラッシュしない） ----
    await page.selectOption('#fontKind', 'winTrebuchet');
    await page.waitForTimeout(150);
    const applied = await page.evaluate(() => {
      const el = document.querySelector('#editHolder .cap-item');
      return { family: el ? el.style.fontFamily : '' };
    });
    t.ok(applied.family.includes('Trebuchet MS'), 'Windows書体を選ぶとプレビューに適用される');

    // ---- 診断機能がWindows書体の候補名を列挙できる ----
    await page.click('#btnFontCheck');
    await page.waitForTimeout(150);
    const diag = await page.evaluate(() => document.getElementById('fontCheckResult').textContent);
    t.ok(diag.includes('Trebuchet MS'), '診断にWindows書体の候補名が列挙される');

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
