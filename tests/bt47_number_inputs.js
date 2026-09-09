// bt47【新機能】数値の調整を全項目で「直接入力＋上下ボタン」にそろえる
const { openApp, mkRunner, chromium } = require('./helpers');

async function run() {
  const t = mkRunner('bt47 数値の直接入力と上下ボタン');
  const browser = await chromium.launch();
  try {
    const { page, errors } = await openApp(browser, { waitTab: 'layout' });

    // ---- 網羅性：スライダーには数値欄が付き、数値欄には▲▼が1組ずつ付く ----
    const cover = await page.evaluate(() => {
      const ranges = [...document.querySelectorAll('input[type=range]')];
      const nums = [...document.querySelectorAll('input[type=number]')];
      return {
        rangeCount: ranges.length,
        rangesWithoutBox: ranges.filter(r => !document.getElementById(r.id + 'Num')).map(r => r.id),
        numCount: nums.length,
        numsWithoutSpin: nums.filter(n => !n.dataset.spun).map(n => n.id || n.className),
        spinCount: document.querySelectorAll('.spin').length,
        buttonsPerSpin: [...document.querySelectorAll('.spin')].every(s => s.querySelectorAll('button').length === 2)
      };
    });
    t.ok(cover.rangeCount >= 16, `スライダーが${cover.rangeCount}個ある（前提確認）`);
    t.eq(cover.rangesWithoutBox, [], 'すべてのスライダーに数値の直接入力欄が付く');
    t.eq(cover.numsWithoutSpin, [], 'すべての数値欄に上下ボタンが付く');
    t.eq(cover.spinCount, cover.numCount, `上下ボタンは数値欄と同数（重複して付かない／${cover.spinCount}組）`);
    t.eq(cover.buttonsPerSpin, true, '上下ボタンは▲▼の2つ1組');

    // ---- スライダーの数値欄：直接入力が描画と保存に反映される ----
    await page.evaluate(() => { proj().style.bg = 'raimon'; save(); renderEditor(); refreshLayoutControls(); });
    await page.waitForTimeout(200);
    const typed = await page.evaluate(() => {
      const box = document.getElementById('bgScaleNum');
      box.value = '137'; box.dispatchEvent(new Event('input', { bubbles: true }));
      return {
        saved: proj().style.bgScale,
        slider: document.getElementById('bgScale').value,
        label: document.getElementById('oBgScale').textContent
      };
    });
    t.eq(typed.saved, 137, '柄の大きさに137%と直接入力すると、その値が保存される');
    t.eq(typed.slider, '137', '入力した値がスライダー側にも反映される');
    t.eq(typed.label, '137%', '既存の表示（内部の値ラベル）も追随する');

    // ---- 上下ボタン：1目盛りずつ増減する ----
    const stepped = await page.evaluate(() => {
      const box = document.getElementById('bgScaleNum');
      const spin = box.parentElement.querySelector('.spin');
      const [up, down] = spin.querySelectorAll('button');
      up.click(); const afterUp = proj().style.bgScale;
      down.click(); down.click(); const afterDown = proj().style.bgScale;
      return { afterUp, afterDown, upMark: up.textContent, downMark: down.textContent };
    });
    t.eq(stepped.upMark + stepped.downMark, '▲▼', '上が▲、下が▼');
    t.eq(stepped.afterUp, 138, '▲で1目盛り（1%）増える');
    t.eq(stepped.afterDown, 136, '▼で1目盛りずつ減る');

    // ---- 刻みが小数の項目でも、桁が壊れずに増減する ----
    const decimal = await page.evaluate(() => {
      const box = document.getElementById('stLhNum');       // 行間 step=0.05
      box.value = '1.45'; box.dispatchEvent(new Event('input', { bubbles: true }));
      const spin = box.parentElement.querySelector('.spin');
      const [up] = spin.querySelectorAll('button');
      up.click();
      return { v: proj().style.lh, box: box.value };
    });
    t.eq(decimal.v, 1.5, '行間（0.05刻み）の▲で1.45→1.5になる（小数の誤差が出ない）');
    t.eq(decimal.box, '1.5', '数値欄の表示も1.5になる');

    // ---- 範囲外は上限・下限で止まる ----
    const clamped = await page.evaluate(() => {
      const box = document.getElementById('bgScaleNum');
      box.value = '9999'; box.dispatchEvent(new Event('change', { bubbles: true }));
      const hi = proj().style.bgScale;
      box.value = '-50'; box.dispatchEvent(new Event('change', { bubbles: true }));
      return { hi, lo: proj().style.bgScale };
    });
    t.eq(clamped.hi, 300, '上限（300%）を超える入力は上限で止まる');
    t.eq(clamped.lo, 30, '下限（30%）を下回る入力は下限で止まる');

    // ---- スライダーを動かすと数値欄が追随する ----
    const followed = await page.evaluate(() => {
      const r = document.getElementById('bgScale');
      r.value = '175'; r.dispatchEvent(new Event('input', { bubbles: true }));
      return document.getElementById('bgScaleNum').value;
    });
    t.eq(followed, '175', 'スライダーを動かすと数値欄がその値に追随する');

    // ---- 別の作品・別の設定を開き直したときも数値欄が最新値になる ----
    const refreshed = await page.evaluate(() => {
      proj().style.bgScale = 88; save(); refreshLayoutControls();
      return document.getElementById('bgScaleNum').value;
    });
    t.eq(refreshed, '88', '設定を開き直すと数値欄に現在値が入る');

    // ---- もとからある数値欄（サイズ等）の上下ボタン ----
    await page.evaluate(() => { sel.clear(); sel.add('title'); renderEditor(); showPanel(); });
    await page.waitForTimeout(200);
    const ipSize = await page.evaluate(() => {
      const box = document.getElementById('ipSize');
      const before = proj().style.layout.title.size;
      const [up, down] = box.parentElement.querySelectorAll('.spin button');
      up.click();  const afterUp = proj().style.layout.title.size;
      down.click(); const afterDown = proj().style.layout.title.size;
      return { before, afterUp, afterDown };
    });
    t.eq(ipSize.afterUp, ipSize.before + 0.5, '文字サイズの▲で0.5pt刻みに増える');
    t.eq(ipSize.afterDown, ipSize.before, '▼で元に戻る');

    // ---- 文字の縦横幅（%）でも同じ操作ができる ----
    const scaleBtn = await page.evaluate(() => {
      const box = document.getElementById('ipSx');
      box.value = '73'; box.dispatchEvent(new Event('input', { bubbles: true }));
      const typed = proj().style.layout.title.sx;
      const [up] = box.parentElement.querySelectorAll('.spin button');
      up.click();
      return { typed, stepped: proj().style.layout.title.sx };
    });
    t.eq(scaleBtn.typed, 73, '文字の横幅に73%と直接入力できる');
    t.eq(scaleBtn.stepped, 74, '文字の横幅の▲で1%増える');

    // ---- 表示倍率（ズーム）も直接入力できる ----
    const zoom = await page.evaluate(() => {
      const box = document.getElementById('zoomInput');
      box.value = '80'; box.dispatchEvent(new Event('input', { bubbles: true }));
      const card = document.querySelector('#editHolder .cap-card');
      return { label: document.getElementById('zoomLabel').textContent, transform: card.style.transform };
    });
    t.eq(zoom.label, '80%', '表示倍率に80と入力すると倍率が80%になる');
    t.ok(/scale\(0\.8\)/.test(zoom.transform), `キャンバスの拡大率にも反映される（${zoom.transform}）`);

    // ---- 選択文字の字間も直接入力できる ----
    await page.evaluate(() => { switchEditScope('one'); });
    await page.waitForTimeout(200);
    const cs = await page.evaluate(() => {
      startInlineEdit('title');
      const el = document.querySelector('#editHolder [data-item="title"]');
      const tn = document.createTreeWalker(el, NodeFilter.SHOW_TEXT).nextNode();
      const range = document.createRange(); range.setStart(tn, 0); range.setEnd(tn, 2);
      const s = getSelection(); s.removeAllRanges(); s.addRange(range);
      document.dispatchEvent(new Event('selectionchange'));
      const box = document.getElementById('csNum');
      const visible = !!box;
      box.value = '0.20'; box.dispatchEvent(new Event('input', { bubbles: true }));
      const w = proj().works[previewIndex];
      const r = (w.charFmt && w.charFmt.title || [])[0];
      const hasSpin = !!box.parentElement.querySelector('.spin');
      return { visible, hasSpin, ls: r ? r.ls : null, label: document.getElementById('csVal').textContent };
    });
    t.eq(cs.visible, true, '字間の小パネルに数値欄がある');
    t.eq(cs.hasSpin, true, '字間の数値欄にも上下ボタンが付く');
    t.ok(cs.ls !== null && Math.abs(cs.ls - 0.2) < 0.001, `字間に0.20と直接入力できる（保存値 ${cs.ls}）`);
    t.eq(cs.label, '+0.20em', '字間の表示も追随する');
    await page.evaluate(() => { finishInlineEdit(); });

    // ---- 入力中は勝手に値を書き換えない（打ちかけを潰さない）----
    const midTyping = await page.evaluate(() => {
      const box = document.getElementById('bgScaleNum');
      box.focus(); box.value = '12';           // 「120」と打っている途中の状態
      const r = document.getElementById('bgScale');
      r.value = '200'; r.dispatchEvent(new Event('input', { bubbles: true }));
      return box.value;
    });
    t.eq(midTyping, '12', '数値欄に入力中は、他からの更新で打ちかけの値を消さない');

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
