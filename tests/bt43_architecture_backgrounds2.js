// bt43【新機能】建築テーマの背景4案の追加（瓦当文・幾何の組物の上部帯／五層望楼・仏塔線描の左端縦帯）
const { openApp, mkRunner, chromium } = require('./helpers');

const NEW = ['nokigawara', 'kikatokyou', 'bourou', 'butto'];
const BAND = ['nokigawara', 'kikatokyou'];   // 枠の上部に帯状
const SIDE = ['bourou', 'butto'];          // 枠の左端に縦長

async function run() {
  const t = mkRunner('bt43 建築背景の追加（瓦当・幾何の組物・望楼・仏塔）');
  const browser = await chromium.launch();
  try {
    const { page, errors } = await openApp(browser, { waitTab: 'layout' });

    // ---- 登録：4案がすべて「建築」カテゴリに入っている ----
    const reg = await page.evaluate((ids) => ids.map(id => {
      const b = BACKGROUNDS.find(x => x.id === id);
      return { id, found: !!b, cat: b && b.cat, label: b && b.label, fill: !!PRESET_FILL[id] };
    }), NEW);
    for (const r of reg) {
      t.eq(r.found, true, `背景「${r.id}」が登録されている`);
      t.eq(r.cat, 'arch', `「${r.label || r.id}」が建築カテゴリに属する`);
      t.eq(r.fill, true, `「${r.id}」に地色プリセット（灰陶／緑釉）がある`);
    }

    // ---- 既存の背景IDと重複していない ----
    const dup = await page.evaluate(() => {
      const seen = {}, d = [];
      BACKGROUNDS.forEach(b => { if (seen[b.id]) d.push(b.id); seen[b.id] = 1; });
      return d;
    });
    t.eq(dup.join(','), '', '背景IDに重複がない（既存の瓦当円文などと衝突しない）');

    // ---- ピッカー：建築カテゴリに7種が並び、スウォッチに地色が付く ----
    const picker = await page.evaluate((ids) => {
      const items = [...document.querySelectorAll('#bgPicker .bg-item')].map(i => i.dataset.bg);
      const sw = {};
      ids.forEach(id => {
        const el = document.querySelector(`#bgPicker .bg-item[data-bg="${id}"] .swatch`);
        sw[id] = el ? getComputedStyle(el).backgroundColor : null;
      });
      return { items, sw };
    }, NEW);
    NEW.forEach(id => {
      t.ok(picker.items.includes(id), `背景ピッカーに「${id}」が表示される`);
      t.ok(picker.sw[id] && picker.sw[id] !== 'rgba(0, 0, 0, 0)', `「${id}」のスウォッチに地色が付く（${picker.sw[id]}）`);
    });

    // ---- 適用：クラスが付き、擬似要素が実際に描画される ----
    for (const id of NEW) {
      await page.evaluate((b) => { proj().style.bg = b; proj().style.bgScale = 100; save(); renderEditor(); }, id);
      await page.waitForTimeout(120);
      const r = await page.evaluate(() => {
        const c = document.querySelector('#editHolder .cap-card');
        const cs = getComputedStyle(c, '::before');
        return {
          cls: c.className,
          w: parseFloat(cs.width), h: parseFloat(cs.height),
          img: cs.backgroundImage, mask: cs.webkitMaskImage || cs.maskImage
        };
      });
      t.ok(r.cls.includes('bg-' + id), `「${id}」を選ぶとカードにbg-${id}クラスが付く`);
      const painted = (r.img && r.img !== 'none') || (r.mask && r.mask !== 'none');
      t.ok(painted, `「${id}」の::beforeが実際に描画される（背景かマスクを持つ）`);
      if (BAND.includes(id)) t.ok(r.w > r.h * 2, `「${id}」は枠の上部に横長の帯として出る（${r.w.toFixed(0)}×${r.h.toFixed(0)}px）`);
      if (SIDE.includes(id)) t.ok(r.h > r.w * 2, `「${id}」は枠の左端に縦長の帯として出る（${r.w.toFixed(0)}×${r.h.toFixed(0)}px）`);
    }

    // ---- 左端縦帯は幅16mm・左寄せ ----
    for (const id of SIDE) {
      await page.evaluate((b) => { proj().style.bg = b; proj().style.bgScale = 100; save(); renderEditor(); }, id);
      await page.waitForTimeout(120);
      const g = await page.evaluate(() => {
        const c = document.querySelector('#editHolder .cap-card');
        const cs = getComputedStyle(c, '::before');
        return { w: parseFloat(cs.width), left: cs.left, cardW: c.getBoundingClientRect().width };
      });
      // 96dpi換算で16mm ≒ 60.5px（ズーム倍率の影響を受けるため比率で見る）
      const mmPerPx = await page.evaluate(() => {
        const d = document.createElement('div');
        d.style.cssText = 'position:absolute;width:100mm'; document.body.appendChild(d);
        const w = d.getBoundingClientRect().width; d.remove(); return 100 / w;
      });
      t.ok(Math.abs(g.w * mmPerPx - 16) < 1.5, `「${id}」の帯幅が16mm（実測 ${(g.w * mmPerPx).toFixed(1)}mm）`);
      t.eq(g.left, '0px', `「${id}」の帯が枠の左端に接している`);
    }

    // ---- 柄の大きさ（--bg-scale）で縦帯の幅が伸縮する ----
    await page.evaluate(() => { proj().style.bg = 'bourou'; proj().style.bgScale = 100; save(); renderEditor(); });
    await page.waitForTimeout(120);
    const w100 = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('#editHolder .cap-card'), '::before').width));
    await page.evaluate(() => { proj().style.bgScale = 200; save(); renderEditor(); });
    await page.waitForTimeout(120);
    const w200 = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('#editHolder .cap-card'), '::before').width));
    t.ok(w200 > w100 * 1.8, `望楼の帯幅が柄の大きさに追随する（${w100.toFixed(1)}px → ${w200.toFixed(1)}px）`);

    // ---- 上部帯も柄の大きさに追随する ----
    await page.evaluate(() => { proj().style.bg = 'nokigawara'; proj().style.bgScale = 100; save(); renderEditor(); });
    await page.waitForTimeout(120);
    const h100 = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('#editHolder .cap-card'), '::before').height));
    await page.evaluate(() => { proj().style.bgScale = 200; save(); renderEditor(); });
    await page.waitForTimeout(120);
    const h200 = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('#editHolder .cap-card'), '::before').height));
    t.ok(h200 > h100 * 1.8, `瓦当文の帯高が柄の大きさに追随する（${h100.toFixed(1)}px → ${h200.toFixed(1)}px）`);

    // ---- 柄の色（--bg-accent）が縦帯にも効く（マスク方式でも配色変更できる） ----
    const tinted = await page.evaluate(() => {
      const c = document.querySelector('#editHolder .cap-card');
      proj().style.bg = 'butto'; save(); renderEditor();
      const card = document.querySelector('#editHolder .cap-card');
      const before = getComputedStyle(card, '::before').backgroundColor;
      card.style.setProperty('--bg-accent', 'rgb(12, 34, 56)');
      const after = getComputedStyle(card, '::before').backgroundColor;
      return { before, after };
    });
    t.eq(tinted.after, 'rgb(12, 34, 56)', `仏塔・線描の色が--bg-accentで変えられる（${tinted.before} → ${tinted.after}）`);

    // ---- 柄の濃さ（--bg-opacity）が効く ----
    const op = await page.evaluate(() => {
      const card = document.querySelector('#editHolder .cap-card');
      card.style.setProperty('--bg-opacity', '0.3');
      return getComputedStyle(card, '::before').opacity;
    });
    t.eq(op, '0.3', '柄の濃さ（--bg-opacity）が縦帯にも効く');

    // ---- 印刷プレビューにも反映される ----
    await page.evaluate(() => { proj().style.bg = 'kikatokyou'; proj().style.bgScale = 150; save(); renderEditor(); });
    await page.waitForTimeout(120);
    await page.click('nav.tabs button[data-tab="print"]');
    await page.waitForTimeout(500);
    const pr = await page.evaluate(() => {
      const c = document.querySelector('#sheetScroll .cap-card');
      return c ? { cls: c.classList.contains('bg-kikatokyou'), scale: c.style.getPropertyValue('--bg-scale') } : null;
    });
    t.ok(pr && pr.cls, '印刷プレビューにも幾何の組物が反映される');
    t.eq(pr && pr.scale, '1.5', '印刷プレビューにも柄の大きさが反映される');

    // ---- 廃止した「釉だまり」が残っていない ----
    const gone = await page.evaluate(() => ({
      reg: BACKGROUNDS.some(b => b.id === 'yudamari'),
      fill: !!PRESET_FILL.yudamari,
      picker: [...document.querySelectorAll('#bgPicker .bg-item')].some(i => i.dataset.bg === 'yudamari')
    }));
    t.eq(gone.reg, false, '廃止した「釉だまり」が背景一覧に残っていない');
    t.eq(gone.fill, false, '「釉だまり」の地色プリセットも削除されている');
    t.eq(gone.picker, false, '背景ピッカーにも「釉だまり」が出ない');

    // ---- 旧IDで保存された既存データは「幾何の組物」に読み替えられる ----
    const migrated = await page.evaluate(() => {
      const p = proj();
      p.style.bg = 'yudamari';
      p.works[0].styleOverride = Object.assign({}, p.works[0].styleOverride || {}, { bg: 'yudamari' });
      fixStyle(p);
      return { master: p.style.bg, ovr: p.works[0].styleOverride.bg };
    });
    t.eq(migrated.master, 'kikatokyou', '旧IDで保存されたマスターの背景が幾何の組物に読み替えられる');
    t.eq(migrated.ovr, 'kikatokyou', '作品ごとの上書きに残った旧IDも読み替えられる');

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
