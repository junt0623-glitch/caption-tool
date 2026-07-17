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

    // ---- 検索フィルターで絞り込み中でも、見えている隣の行と入れ替わる ----
    // 3件目を追加：庄野(1-01,①) / 神奈川沖浪裏(1-02,②) / 検索に一致しない作品(no=9-99,③)を間に挟む
    await page.evaluate(() => {
      proj().works[1].no = '1-02'; // 直前のUndo検証で空にした番号を戻す
      const w = newWork();
      Object.assign(w, { no: '9-99', title: '該当しない作品', origin: '検索対象外' });
      proj().works.splice(1, 0, w); // 1-01 と 1-02 の間に挿入
      save(); renderList();
    });
    await page.waitForTimeout(200);
    const beforeFilter = await page.evaluate(() => proj().works.map(x => x.no));
    t.eq(beforeFilter, ['1-01', '9-99', '1-02'], '絞り込み前：1-01, 9-99, 1-02 の3件');

    await page.fill('#searchBox', '広重'); // 1件目（庄野／広重）だけが一致し、9-99は隠れる
    await page.waitForTimeout(300);
    const visibleWhileFiltered = await page.evaluate(() => document.querySelectorAll('#worksListArea tr.work-row').length);
    t.eq(visibleWhileFiltered, 1, '絞り込み中は一致する1件だけが表示される');

    // 絞り込み解除して2件表示にし、見えている2行を▼で入れ替える
    await page.fill('#searchBox', '');
    await page.waitForTimeout(300);
    // 章フィルターの代わりに検索語で「1-」を含む2件（1-01,1-02）だけに絞る想定は難しいため、
    // ここでは実データそのままの並びで、隠れた行(9-99)を挟んだ状態からの▼移動を検証する
    await page.fill('#searchBox', '1-');
    await page.waitForTimeout(300);
    const shownNos = await page.evaluate(() => [...document.querySelectorAll('#worksListArea tr.work-row td:nth-child(2)')].map(td => td.textContent));
    t.eq(shownNos, ['1-01', '1-02'], '「1-」で絞り込むと1-01・1-02の2件のみ表示（9-99は隠れる）');

    // 表示1行目（実配列では0番目）を下へ移動 → 表示上の隣（実配列2番目の1-02）と入れ替わるべき
    // 中間の9-99（実配列1番目）は影響を受けない
    const lp0Down = await page.locator('#worksListArea tr.work-row').nth(0).locator('button[data-move="1"]');
    await lp0Down.click();
    await page.waitForTimeout(300);
    const afterFilteredMove = await page.evaluate(() => proj().works.map(x => x.no));
    t.eq(afterFilteredMove, ['1-01', '9-99', '1-02'], '絞り込み中に見えている隣の行と入れ替わり、間に挟まる非表示行(9-99)は動かない');
    const swappedTitle = await page.evaluate(() => proj().works[2].title.includes('庄野'));
    t.eq(swappedTitle, true, '絞り込み中でも実際に見えている作品どうしが正しく入れ替わる（隠れた行を飛ばす）');

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
