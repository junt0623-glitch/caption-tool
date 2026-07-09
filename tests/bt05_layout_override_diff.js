// bt05: 作品ごとの配置上書き（差分方式）
// 前回チャットで発見・修正した「触った項目だけが独自化され、未変更項目はマスターに追従する」仕様の回帰テスト
const { openApp, mkRunner, chromium } = require('./helpers');

async function run() {
  const t = mkRunner('bt05 配置上書き（差分方式）');
  const browser = await chromium.launch();
  try {
    const { page, errors } = await openApp(browser, { waitTab: 'layout' });

    // 作品が最低2件あることを確認（無ければ複製して増やす）
    await page.evaluate(() => {
      const p = proj();
      while (p.works.length < 2) {
        const w = JSON.parse(JSON.stringify(p.works[0]));
        w.title = w.title + '_copy';
        p.works.push(w);
      }
    });

    // 個別編集モード・作品1（index 0）で上書きON
    await page.click('#emodeOne');
    await page.waitForTimeout(200);
    await page.evaluate(() => { previewIndex = 0; applyEditScope(); renderEditor(); });
    await page.click('#ovToggle');
    await page.waitForTimeout(200);

    // titleだけをドラッグで動かす（マスターの値から意図的にズラす）
    const box = await page.locator('#editHolder [data-item="title"]').boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 15, box.y + box.height / 2 + 8, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(200);

    const ov = await page.evaluate(() => proj().works[0].layoutOverride && proj().works[0].layoutOverride.cap);
    t.ok(ov && Object.keys(ov).length === 1 && ('title' in ov), '触れたtitleだけが上書き層に実体化される（他項目は空のまま）');

    // マスターへ戻り、origin（別項目）の位置を変更する
    await page.click('#emodeMaster');
    await page.waitForTimeout(200);
    const originBefore = await page.evaluate(() => proj().style.layout.origin.y);
    await page.evaluate(() => { proj().style.layout.origin.y = (proj().style.layout.origin.y || 0) + 30; save(); renderEditor(); });
    await page.waitForTimeout(200);

    // 作品1（上書きあり）に戻って確認：originはマスターの新しい値に追従、titleは上書きされた値のまま保持
    await page.click('#emodeOne');
    await page.waitForTimeout(200);
    await page.evaluate(() => { previewIndex = 0; applyEditScope(); renderEditor(); });
    await page.waitForTimeout(200);

    const w0EffOrigin = await page.evaluate(() => effectiveLayout(proj().works[0], proj().style, 'cap').origin.y);
    const masterOrigin = await page.evaluate(() => proj().style.layout.origin.y);
    t.eq(w0EffOrigin, masterOrigin, '上書きしていないorigin項目はマスターの変更に追従する');

    const w0TitleX = await page.evaluate(() => proj().works[0].layoutOverride.cap.title.x);
    const masterTitleX = await page.evaluate(() => proj().style.layout.title.x);
    t.ok(w0TitleX !== masterTitleX, '上書きしたtitle項目はマスターの値から独立して保持される');

    // 作品2（上書きなし）はマスターの変更にそのまま追従
    await page.evaluate(() => { previewIndex = 1; applyEditScope(); renderEditor(); });
    await page.waitForTimeout(200);
    const w1EffOrigin = await page.evaluate(() => effectiveLayout(proj().works[1], proj().style, 'cap').origin.y);
    t.eq(w1EffOrigin, masterOrigin, '上書きしていない作品2はマスターの配置にそのまま追従する');

    // ◆マークがプルダウンに付く
    const optText = await page.evaluate(() => document.querySelectorAll('#previewWorkSelect option')[0].textContent);
    t.ok(optText.includes('◆'), '上書きのある作品の選択肢に◆マークが付く');

    // 上書き解除
    await page.evaluate(() => { previewIndex = 0; applyEditScope(); renderEditor(); });
    await page.waitForTimeout(100);
    const resetVisible = await page.locator('#ovReset').isVisible();
    t.ok(resetVisible, '上書きのある作品では解除ボタンが表示される');
    await page.click('#ovReset');
    await page.waitForTimeout(200);
    const confirmVisible = await page.locator('#confirmDialog').isVisible().catch(() => false);
    if (confirmVisible) { await page.click('#confirmOk'); await page.waitForTimeout(200); }
    const hasOvAfterReset = await page.evaluate(() => hasOverride(proj().works[0], 'cap'));
    t.eq(hasOvAfterReset, false, '解除後は上書きデータが削除される');

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
