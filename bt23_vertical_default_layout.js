// bt23【新機能・第3段階】縦書きモード：初期配置ロジック（右側＝和文縦列／左側＝英字帯）とバックアップ復元
const { openApp, mkRunner, chromium } = require('./helpers');

async function run() {
  const t = mkRunner('bt23 縦書きモード（第3段階：初期配置・バックアップ復元）');
  const browser = await chromium.launch();
  try {
    const { page, errors } = await openApp(browser, { waitTab: 'layout' });

    // ---- 縦書きONで生成される初期配置（案A：右＝和文縦列／左＝英字帯）----
    const beforeSnapshot = await page.evaluate(() => JSON.stringify(proj().style.layout));
    await page.click('#stVertical');
    await page.waitForTimeout(300);

    const onInfo2 = await page.evaluate((before) => {
      const L = proj().style.layout;
      return {
        hasLayoutH: !!proj().style.layoutH,
        layoutHMatchesBefore: JSON.stringify(proj().style.layoutH) === before,
        en: ['titleEn', 'originEn', 'periodEn', 'collectionEn'].map(k => ({ key: k, x: L[k].x, y: L[k].y })),
        jp: ['no', 'yomigana', 'title', 'origin', 'period', 'collection', 'catchcopy', 'description'].map(k => ({ key: k, x: L[k].x, y: L[k].y, w: L[k].w })),
      };
    }, beforeSnapshot);

    t.eq(onInfo2.hasLayoutH, true, '縦書きONで切替前の横書き配置がlayoutHにバックアップされる');
    t.eq(onInfo2.layoutHMatchesBefore, true, 'バックアップされたlayoutHが切替前の配置と一致する');

    // 英字4項目は左側に同じx（帯）で上から下へ積み上がる
    const enXs = onInfo2.en.map(i => i.x);
    t.ok(enXs.every(x => x === enXs[0]), '英字4項目は同じx位置（左側の帯）に揃う');
    t.ok(onInfo2.en.every((cur, i) => i === 0 || cur.y > onInfo2.en[i - 1].y), '英字4項目は上から下へyが増える順に積み上がる');

    // 和文項目（description含む）は右→左へxが減る順に列が並ぶ（ITEMS順）
    const jpXs = onInfo2.jp.map(i => i.x);
    t.ok(jpXs.every((x, i) => i === 0 || x < jpXs[i - 1]), '和文項目は右→左へxが減る順に縦列が並ぶ');

    // 和文項目の「行の長さ」(w)はカード使用可能高さ(H=size.h-pad*2)で統一される
    const hInfo = await page.evaluate(() => {
      const p = proj();
      return { H: p.size.h - (p.style.pad || 8) * 2, w0: p.style.layout.title.w };
    });
    t.eq(hInfo.w0, hInfo.H, '和文縦列の「行の長さ」(w)がカード使用可能高さと一致する');

    // 和文縦列は英字帯の右側にあり、重ならない（最も左の和文項目xが英字帯の右端より右）
    const noOverlap = await page.evaluate(() => {
      const L = proj().style.layout;
      const enRight = L.titleEn.x + L.titleEn.w;
      const jpLeftMost = Math.min(...['no', 'yomigana', 'title', 'origin', 'period', 'collection', 'catchcopy', 'description'].map(k => L[k].x));
      return jpLeftMost >= enRight;
    });
    t.ok(noOverlap, '和文縦列（最も左の列）が英字帯の右端より左にはみ出さない');

    // ---- 縦書き中に手動調整 → OFFで横書きへ復元、layoutVにバックアップ ----
    const verticalTouched = await page.evaluate(() => {
      curLayout().title.x = 55.5;
      save();
      return JSON.stringify(proj().style.layout);
    });
    await page.click('#stVertical');
    await page.waitForTimeout(300);
    const offInfo = await page.evaluate((before) => ({
      vertical: !!proj().style.vertical,
      hasLayoutV: !!proj().style.layoutV,
      restoredMatchesOriginalHorizontal: JSON.stringify(proj().style.layout) === before,
    }), beforeSnapshot);
    t.eq(offInfo.vertical, false, 'OFFにすると横書きモードに戻る');
    t.eq(offInfo.hasLayoutV, true, 'OFFにする際、縦書き配置（手動調整含む）がlayoutVにバックアップされる');
    t.eq(offInfo.restoredMatchesOriginalHorizontal, true, '横書きへ戻すと元の横書き配置がそのまま復元される（縦書き用の初期配置で上書きされない）');

    // ---- 再度ONにすると、新規生成ではなくlayoutVバックアップ（手動調整済み）が復元される ----
    await page.click('#stVertical');
    await page.waitForTimeout(300);
    const reOnInfo = await page.evaluate((touched) => JSON.stringify(proj().style.layout) === touched, verticalTouched);
    t.eq(reOnInfo, true, '縦書きに戻すと直前の縦書き配置（手動調整済み）がlayoutVから復元され、初期配置で上書きされない');

    // ---- 「初期状態に戻す」ボタン：縦書き中は縦書き版の初期配置に戻る ----
    const okBtn = page.locator('#confirmOk');
    await page.click('#btnResetLayout');
    await page.waitForTimeout(150);
    if (await okBtn.isVisible().catch(() => false)) {
      await okBtn.click();
    }
    await page.waitForTimeout(200);
    const afterReset = await page.evaluate(() => ({
      vertical: !!proj().style.vertical,
      titleX: proj().style.layout.title.x,
      noX: proj().style.layout.no.x,
    }));
    t.eq(afterReset.vertical, true, 'リセット後も縦書きモードのままである');
    t.eq(afterReset.titleX, 114.1, 'リセットすると縦書き版の初期配置（作品名のx）に戻る');
    t.eq(afterReset.noX, 126.3, 'リセットすると縦書き版の初期配置（番号のx）に戻る');

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
