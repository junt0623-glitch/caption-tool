// bt46【新機能】文字の縦横幅調整（長体・平体、1〜200%）
const { openApp, mkRunner, chromium } = require('./helpers');

async function run() {
  const t = mkRunner('bt46 文字の縦横幅（長体・平体）');
  const browser = await chromium.launch();
  try {
    const { page, errors } = await openApp(browser, { waitTab: 'layout' });

    // ---- 既定値は100%（既存データも100%で埋まる）----
    const def = await page.evaluate(() => {
      const L = proj().style.layout, D = proj().style.descLayout;
      return {
        title: [L.title.sx, L.title.sy],
        desc: [D.description.sx, D.description.sy],
        allJp: ITEMS.every(i => L[i.key].sx === 100 && L[i.key].sy === 100)
      };
    });
    t.eq(def.title, [100, 100], '作品名の文字の縦横幅は既定で100%');
    t.eq(def.desc, [100, 100], '解説面の解説文も既定で100%');
    t.eq(def.allJp, true, '全項目が100%で初期化される');

    const migrated = await page.evaluate(() => {
      const p = proj();
      delete p.style.layout.title.sx; delete p.style.layout.title.sy;
      delete p.style.descLayout.description.sx;
      ensureLayout(p);
      return [p.style.layout.title.sx, p.style.layout.title.sy, p.style.descLayout.description.sx];
    });
    t.eq(migrated, [100, 100, 100], '縦横幅を持たない既存データは100%（等倍）で補われる');

    // ---- 小パネルに入力欄が出る ----
    const ui = await page.evaluate(() => {
      const sx = document.getElementById('ipSx'), sy = document.getElementById('ipSy');
      return sx && sy ? { min: sx.min, max: sx.max, ymin: sy.min, ymax: sy.max, reset: !!document.getElementById('ipScaleReset') } : null;
    });
    t.ok(ui, '小パネルに文字の横幅・縦幅の入力欄がある');
    t.eq(ui && ui.min + '-' + ui.max, '1-200', '横幅の指定範囲は1〜200%');
    t.eq(ui && ui.ymin + '-' + ui.ymax, '1-200', '縦幅の指定範囲は1〜200%');
    t.eq(ui && ui.reset, true, '100%に戻すボタンがある');

    // ---- 字形だけが伸縮し、枠の実寸（L.w）は変わらない ----
    const boxW = await page.evaluate(() => proj().style.layout.title.w);
    async function measure(sx, sy) {
      await page.evaluate(([x, y]) => {
        const L = proj().style.layout.title; L.sx = x; L.sy = y; save(); renderEditor();
      }, [sx, sy]);
      await page.waitForTimeout(150);
      return page.evaluate(() => {
        const el = document.querySelector('#editHolder [data-item="title"]');
        const cs = getComputedStyle(el);
        return {
          cssW: parseFloat(cs.width) / MM2PX,          // 倍率で割ったあとのCSS上の幅
          visW: el.offsetWidth * (proj().style.layout.title.sx / 100) / MM2PX, // 見た目の実寸
          transform: cs.transform,
          measuredW: widthMM('title'), measuredH: heightMM('title')
        };
      });
    }
    const at100 = await measure(100, 100);
    const at50 = await measure(50, 100);
    const at200 = await measure(200, 100);
    t.ok(Math.abs(at100.visW - boxW) < 0.5, `100%では枠の実寸が指定どおり（${at100.visW.toFixed(1)}mm / 指定 ${boxW}mm）`);
    t.ok(Math.abs(at50.visW - boxW) < 0.5, `50%に縮めても枠の実寸は変わらない（${at50.visW.toFixed(1)}mm）`);
    t.ok(Math.abs(at200.visW - boxW) < 0.5, `200%に広げても枠の実寸は変わらない（${at200.visW.toFixed(1)}mm）`);
    t.ok(at50.cssW > at100.cssW * 1.8, `横幅50%では組む幅が倍に広がる＝1行に入る字数が増える（${at100.cssW.toFixed(1)}mm → ${at50.cssW.toFixed(1)}mm）`);
    t.ok(at200.cssW < at100.cssW * 0.6, `横幅200%では組む幅が半分になる（${at100.cssW.toFixed(1)}mm → ${at200.cssW.toFixed(1)}mm）`);
    t.ok(/matrix\(0\.5,/.test(at50.transform), `横幅50%が実際の描画（transform）に反映される（${at50.transform}）`);
    t.ok(/matrix\(2,/.test(at200.transform), `横幅200%が実際の描画に反映される（${at200.transform}）`);
    t.eq(at100.transform, 'none', '100%のときは余計なtransformを付けない');

    // ---- はみ出し判定・選択枠が見た目の実寸で測られる ----
    t.ok(Math.abs(at100.measuredW - at50.measuredW) < 0.5,
      `横幅を変えても項目の測定幅（はみ出し判定・選択枠）は変わらない（${at100.measuredW.toFixed(1)}mm / ${at50.measuredW.toFixed(1)}mm）`);
    const hh = await page.evaluate(async () => {
      const L = proj().style.layout.title;
      L.sx = 100; L.sy = 100; save(); renderEditor();
      const h100 = heightMM('title');
      L.sy = 50; save(); renderEditor();
      return { h100, h50: heightMM('title') };
    });
    t.ok(hh.h50 < hh.h100 * 0.7, `縦幅50%では項目の測定高さも縮む（${hh.h100.toFixed(1)}mm → ${hh.h50.toFixed(1)}mm）`);

    // ---- 1〜200%の範囲に丸められる ----
    const clamped = await page.evaluate(() => [clampScale(0), clampScale(-30), clampScale(500), clampScale(37.4), clampScale('x')]);
    t.eq(clamped, [1, 1, 200, 37, 100], '範囲外・非数値の指定は1〜200%に丸められる');

    // ---- 小パネルの入力で反映され、100%に戻せる ----
    await page.evaluate(() => {
      proj().style.layout.title.sx = 100; proj().style.layout.title.sy = 100; save();
      sel.clear(); sel.add('title'); renderEditor(); showPanel();
    });
    await page.waitForTimeout(150);
    const shown = await page.evaluate(() => [document.getElementById('ipSx').value, document.getElementById('ipSy').value]);
    t.eq(shown, ['100', '100'], '項目を選ぶと現在の縦横幅がパネルに出る');
    await page.evaluate(() => {
      const sx = document.getElementById('ipSx'); sx.value = '80'; sx.dispatchEvent(new Event('input', { bubbles: true }));
      const sy = document.getElementById('ipSy'); sy.value = '120'; sy.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForTimeout(200);
    const typed = await page.evaluate(() => [proj().style.layout.title.sx, proj().style.layout.title.sy]);
    t.eq(typed, [80, 120], 'パネルへの入力が配置データに反映される');
    await page.evaluate(() => document.getElementById('ipScaleReset').click());
    await page.waitForTimeout(200);
    const reset = await page.evaluate(() => [proj().style.layout.title.sx, proj().style.layout.title.sy]);
    t.eq(reset, [100, 100], '「縦横幅を100%に戻す」で等倍に戻る');

    // ---- 解説文の自動縮小と併用しても、指定した縦横幅が土台として残る ----
    await page.click('[data-mode="desc"]');
    await page.waitForTimeout(300);
    const withFit = await page.evaluate(() => {
      const w = proj().works[previewIndex];
      w.description = 'あ'.repeat(600);   // 枠に収まらない量を入れて自動縮小を働かせる
      proj().style.descLayout.description.sx = 50;
      save(); renderEditor(); fitDescIn(document.querySelector('#editHolder .cap-card'));
      const el = document.querySelector('#editHolder [data-item="description"]');
      const m = getComputedStyle(el).transform.match(/matrix\(([-\d.]+)/);
      return { scaleX: m ? parseFloat(m[1]) : null, hasFit: el.classList.contains('fit-desc') };
    });
    t.eq(withFit.hasFit, true, '解説文は自動縮小の対象になっている（前提確認）');
    t.ok(withFit.scaleX !== null && withFit.scaleX <= 0.5 && withFit.scaleX > 0.45,
      `自動縮小がかかっても指定した横幅50%が土台として残る（実際の倍率 ${withFit.scaleX}）`);
    await page.click('[data-mode="cap"]');
    await page.waitForTimeout(300);

    // ---- 作品ごとの上書きに含まれる ----
    const ovr = await page.evaluate(() => {
      switchEditScope('one');
      const w = proj().works[previewIndex];
      w._ovEditing = true;
      curLayout().title.sx = 60;
      save();
      return {
        inOverride: w.layoutOverride.cap.title.sx,
        masterUntouched: proj().style.layout.title.sx,
        effective: effectiveLayout(w, proj().style, 'cap').title.sx
      };
    });
    t.eq(ovr.inOverride, 60, '作品ごとの上書きに文字の縦横幅が入る');
    t.eq(ovr.masterUntouched, 100, 'マスターの値は変わらない');
    t.eq(ovr.effective, 60, '実効配置では作品ごとの値が使われる');

    // ---- 保存・再読込で残る ----
    await page.evaluate(() => { proj().style.layout.origin.sx = 70; proj().style.layout.origin.sy = 130; save(); });
    await page.reload();
    await page.waitForTimeout(700);
    await page.click('nav.tabs button[data-tab="layout"]');
    await page.waitForTimeout(300);
    const persisted = await page.evaluate(() => [proj().style.layout.origin.sx, proj().style.layout.origin.sy]);
    t.eq(persisted, [70, 130], '文字の縦横幅が保存され、再読込後も残る');

    // ---- 印刷プレビューにも反映される ----
    await page.click('nav.tabs button[data-tab="print"]');
    await page.waitForTimeout(600);
    const printed = await page.evaluate(() => {
      const el = document.querySelector('#sheetScroll .cap-card [data-item="origin"]');
      return el ? getComputedStyle(el).transform : null;
    });
    t.ok(printed && /matrix\(0\.7,/.test(printed), `印刷プレビューにも文字の縦横幅が反映される（${printed}）`);

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
