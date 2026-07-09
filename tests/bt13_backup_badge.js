// bt13【新機能】配置上書きを多用している場合のJSONバックアップ推奨バッジ
const { openApp, mkRunner, chromium } = require('./helpers');

async function run() {
  const t = mkRunner('bt13 バックアップ推奨バッジ');
  const browser = await chromium.launch();
  try {
    const { page, errors } = await openApp(browser);

    t.eq(await page.evaluate(() => document.getElementById('backupBadge').style.display), 'none', '初期状態ではバッジは非表示');

    // 上書き作品3件未満・編集回数が少ない場合は非表示のまま
    await page.evaluate(() => {
      const p = proj();
      while (p.works.length < 1) p.works.push(newWork());
      p.works[0].layoutOverride = { cap: { title: { x: 10 } } };
      for (let i = 0; i < 20; i++) { save(); flushSave(); }
    });
    await page.waitForTimeout(200);
    t.eq(await page.evaluate(() => document.getElementById('backupBadge').style.display), 'none', '上書き作品が3件未満なら編集回数が多くてもバッジは出ない');

    // 3件以上の上書き＋十分な編集回数でバッジが出る
    await page.evaluate(() => {
      const p = proj();
      while (p.works.length < 3) {
        const w = JSON.parse(JSON.stringify(p.works[0]));
        w.title = w.title + '_x';
        p.works.push(w);
      }
      p.works[1].layoutOverride = { cap: { title: { x: 11 } } };
      p.works[2].layoutOverride = { cap: { title: { x: 12 } } };
      updateBackupBadge();
    });
    await page.waitForTimeout(200);
    t.eq(await page.evaluate(() => document.getElementById('backupBadge').style.display), '', '上書き3件以上＋編集回数十分でバッジが表示される');

    const badgeText = await page.textContent('#backupBadge');
    t.ok(badgeText.includes('3'), 'バッジに上書き件数（3件）が表示される');

    // 書き出しでリセットされる（download() はブラウザのダウンロード動作なのでイベントだけ拾う）
    const downloadPromise = page.waitForEvent('download').catch(() => null);
    await page.click('#btnExport');
    await downloadPromise;
    await page.waitForTimeout(200);
    t.eq(await page.evaluate(() => document.getElementById('backupBadge').style.display), 'none', '書き出し後はバッジが消える');
    t.eq(await page.evaluate(() => store.backupMeta.editsSinceExport), 0, '書き出し後は編集カウントがリセットされる');

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
