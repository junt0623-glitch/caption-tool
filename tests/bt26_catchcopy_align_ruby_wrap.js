// bt26【不具合修正】キャッチコピー（キーワード）の既定中央揃え／解説文にルビがあっても折り返し調整が効く
const { openApp, mkRunner, chromium } = require('./helpers');

async function run() {
  const t = mkRunner('bt26 キャッチコピー中央揃え・解説文ルビの折り返し');
  const browser = await chromium.launch();
  try {
    const { page, errors } = await openApp(browser, { waitTab: 'layout' });

    // ---- キャッチコピーの既定文字揃え ----
    const alignInfo = await page.evaluate(() => {
      const L = proj().style.layout;
      return { catchcopy: L.catchcopy.align, title: L.title.align, origin: L.origin.align };
    });
    t.eq(alignInfo.catchcopy, 'center', 'キャッチコピーの既定の文字揃えはcenter');
    t.eq(alignInfo.title, 'inherit', '作品名は従来通りinherit（全体の設定に従う）のまま');
    t.eq(alignInfo.origin, 'inherit', '産地も従来通りinherit（全体の設定に従う）のまま');

    const catchTextAlign = await page.evaluate(() => {
      const el = document.querySelector('#editHolder [data-item="catchcopy"]');
      return el ? getComputedStyle(el).textAlign : null;
    });
    t.eq(catchTextAlign, 'center', 'プレビュー上でもキャッチコピーが中央揃えで描画される');

    // 縦書きモードでも既定センター揃え
    await page.click('#stVertical');
    await page.waitForTimeout(300);
    const catchAlignVertical = await page.evaluate(() => proj().style.layout.catchcopy.align);
    t.eq(catchAlignVertical, 'center', '縦書きモードの初期配置でもキャッチコピーはcenter');
    await page.click('#stVertical');
    await page.waitForTimeout(200);

    // 「初期状態に戻す」を押しても中央揃えが維持されるか（defaultAlignForが正しく使われているか）
    await page.evaluate(() => { sel.clear(); sel.add('catchcopy'); updateSelUI(); showPanel(); });
    await page.waitForTimeout(100);
    await page.evaluate(() => { curLayout().catchcopy.align = 'left'; save(); renderEditor(); });
    await page.waitForTimeout(100);
    const okBtn = page.locator('#confirmOk');
    await page.click('#btnResetLayout');
    await page.waitForTimeout(150);
    if (await okBtn.isVisible().catch(() => false)) { await okBtn.click(); }
    await page.waitForTimeout(200);
    const alignAfterReset = await page.evaluate(() => proj().style.layout.catchcopy.align);
    t.eq(alignAfterReset, 'center', '「初期状態に戻す」でキャッチコピーの中央揃えが正しく復元される');

    // ---- 解説文にルビを入れても折り返し調整（分かち書きspan.w）が効く ----
    await page.evaluate(() => {
      const p = proj();
      p.works.push({ title: 'テスト作品', description: '桃山時代を代表する名品であり、力強い造形と\n温かみのある釉薬の表情が見どころである。' });
      save();
    });
    await page.click('#emodeOne');
    await page.waitForTimeout(150);
    await page.evaluate(() => { previewIndex = proj().works.length - 1; applyEditScope(); refreshLayoutControls(); renderEditor(); });
    await page.waitForTimeout(200);
    await page.click('[data-mode="desc"]');
    await page.waitForTimeout(300);

    const before = await page.evaluate(() => {
      const el = document.querySelector('#editHolder [data-item="description"]');
      return { spanCount: el ? el.querySelectorAll('.w').length : 0, brCount: el ? el.querySelectorAll('br').length : 0 };
    });
    t.ok(before.spanCount > 0, 'ルビ無しの解説文では分かち書きspan（折り返し調整用）が使われている（前提確認）');
    t.eq(before.brCount, 1, 'ルビ無しの解説文で手動改行（\\n）が<br>として反映される（前提確認）');

    await page.evaluate(() => {
      const w = proj().works[previewIndex];
      w.ruby = w.ruby || {};
      w.ruby.description = [{ start: 0, end: 4, text: 'ももやま' }];
      save(); renderEditor();
    });
    await page.waitForTimeout(200);
    const after = await page.evaluate(() => {
      const el = document.querySelector('#editHolder [data-item="description"]');
      return {
        hasRuby: !!el.querySelector('ruby'),
        spanCount: el.querySelectorAll('.w').length,
        brCount: el.querySelectorAll('br').length,
        hasFitDesc: el.classList.contains('fit-desc'),
      };
    });
    t.eq(after.hasRuby, true, '解説文にルビが適用されている（前提確認）');
    t.ok(after.spanCount > 0, 'ルビを入れても解説文の分かち書きspan（折り返し調整）が引き続き使われる');
    t.eq(after.brCount, 1, 'ルビを入れても手動改行（\\n）が<br>として正しく維持される');
    t.eq(after.hasFitDesc, true, 'ルビを入れても解説文の自動縮小調整（fit-desc）が引き続き有効');

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
