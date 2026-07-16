// bt29【新機能】台帳の並び替え（▲▼）で番号が行の位置に合わせて自動で振り直される
const { openApp, mkRunner, chromium } = require('./helpers');

async function run() {
  const t = mkRunner('bt29 並び替え時の自動番号振り直し');
  const browser = await chromium.launch({});
  try {
    const { page, errors } = await openApp(browser);

    // 見本データ：works[0]=庄野(1-01), works[1]=神奈川沖浪裏(1-02)
    const init = await page.evaluate(() => proj().works.map(w => ({ no: w.no, title: w.title.slice(0, 4) })));
    t.eq(init.map(w => w.no), ['1-01', '1-02'], '初期状態の番号は 1-01, 1-02');

    // 1行目を下へ移動 → 作品は入れ替わるが、番号は行の位置に残る
    await page.click('button[data-move="1"][data-i="0"]');
    await page.waitForTimeout(200);
    const after = await page.evaluate(() => proj().works.map(w => ({ no: w.no, title: w.title })));
    t.eq(after.map(w => w.no), ['1-01', '1-02'], '並び替え後も番号の並びは 1-01, 1-02 のまま（自動振り直し）');
    const titlesSwapped = await page.evaluate(() => proj().works[0].title.includes('神奈川沖浪裏'));
    t.eq(titlesSwapped, true, '作品自体は入れ替わっている（2番目だった作品が先頭に）');

    // 画面表示も一致する（番号列が上から 1-01, 1-02）
    const shown = await page.evaluate(() => [...document.querySelectorAll('#worksListArea tr.work-row td:nth-child(2)')].map(td => td.textContent));
    t.eq(shown, ['1-01', '1-02'], '一覧の番号列も並び替え後に 1-01, 1-02 の順で表示される');

    // 上へ戻すと元どおり
    await page.click('button[data-move="-1"][data-i="1"]');
    await page.waitForTimeout(200);
    const back = await page.evaluate(() => proj().works.map(w => ({ no: w.no, first: w.title.includes('庄野') })));
    t.eq(back[0].no === '1-01' && back[0].first, true, '上へ戻すと作品・番号とも元の状態に戻る');

    // 番号が空の作品との入れ替え：空も「位置の番号」として入れ替わる
    await page.evaluate(() => { proj().works[1].no = ''; save(); renderList(); });
    await page.waitForTimeout(300);
    await page.click('button[data-move="1"][data-i="0"]');
    await page.waitForTimeout(200);
    const mixed = await page.evaluate(() => proj().works.map(w => w.no));
    t.eq(mixed, ['1-01', ''], '空番号も位置に据え置かれる（先頭行は1-01のまま・空番号は2行目に残る）');

    // Undoで並び替え前に戻る
    await page.evaluate(() => doUndo());
    await page.waitForTimeout(200);
    const undone = await page.evaluate(() => proj().works.map(w => w.no));
    t.eq(undone, ['1-01', ''], 'Ctrl+Z（Undo）で並び替え・番号とも巻き戻せる');

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
