// bt51【新機能】編集中の文字サイズ（pt）調整。項目全体と、選んだ文字だけの2通り
const { openApp, mkRunner, chromium } = require('./helpers');

async function run() {
  const t = mkRunner('bt51 編集中の文字サイズ（項目全体／選択文字）');
  const browser = await chromium.launch();
  try {
    const { page, errors } = await openApp(browser, { waitTab: 'layout' });
    await page.evaluate(() => {
      switchEditScope('one');
      const w = proj().works[previewIndex];
      w.title = '灰陶緑斑双耳壺';
      w.charFmt = {}; save(); renderEditor();
    });
    await page.waitForTimeout(300);

    /* 文字を選んで書式パネルを出す小道具 */
    const selectChars = (from, to) => page.evaluate(([a, b]) => {
      startInlineEdit('title');
      const el = document.querySelector('#editHolder [data-item="title"]');
      const tn = document.createTreeWalker(el, NodeFilter.SHOW_TEXT).nextNode();
      const range = document.createRange(); range.setStart(tn, a); range.setEnd(tn, b);
      const s = getSelection(); s.removeAllRanges(); s.addRange(range);
      document.dispatchEvent(new Event('selectionchange'));
    }, [from, to]);

    // ---- パネルに2つのpt欄が出て、現在値が入る ----
    await selectChars(0, 2);
    await page.waitForTimeout(200);
    const ui = await page.evaluate(() => {
      const it = document.getElementById('csItemPt'), se = document.getElementById('csSelPt');
      return it && se ? {
        shown: document.getElementById('charSpacingPopover').classList.contains('show'),
        item: it.value, sel: se.value, ph: se.placeholder,
        itemRange: it.min + '-' + it.max, step: it.step,
        spins: [it, se].every(e => !!e.parentElement.querySelector('.spin')),
        masterSize: curLayoutRead().title.size
      } : null;
    });
    t.ok(ui && ui.shown, '文字を選ぶと書式パネルが出る');
    t.eq(ui && ui.item, String(ui && ui.masterSize), '「この項目全体の大きさ」に現在のptが入る');
    t.eq(ui && ui.sel, '', '選択範囲に指定が無ければ「選んだ文字だけ」は空欄');
    t.eq(ui && ui.ph, '全体', '空欄のときは項目全体に従うと示される');
    t.eq(ui && ui.itemRange, '4-60', 'ptの指定範囲は4〜60');
    t.eq(ui && ui.step, '0.5', '0.5pt刻み');
    t.eq(ui && ui.spins, true, 'どちらのpt欄にも上下ボタンが付く');

    // ---- 項目全体のptを変えると、編集を続けたまま見た目と配置データに入る ----
    const whole = await page.evaluate(() => {
      const el = document.getElementById('csItemPt');
      el.value = '24'; el.dispatchEvent(new Event('input', { bubbles: true }));
      const item = document.querySelector('#editHolder [data-item="title"]');
      return {
        saved: curLayoutRead().title.size,
        css: item.style.fontSize,
        stillEditing: item.classList.contains('editing-text'),
        popoverOpen: document.getElementById('charSpacingPopover').classList.contains('show')
      };
    });
    t.eq(whole.saved, 24, '項目全体のptが配置データに保存される');
    t.eq(whole.css, '24pt', '編集中の見た目にもすぐ反映される');
    t.eq(whole.stillEditing, true, '文字の編集は続いたまま（再描画で中断しない）');
    t.eq(whole.popoverOpen, true, '書式パネルも開いたまま');

    // 確定後の描画にも残る
    await page.evaluate(() => finishInlineEdit());
    await page.waitForTimeout(300);
    const afterFinish = await page.evaluate(() => ({
      saved: curLayoutRead().title.size,
      css: getComputedStyle(document.querySelector('#editHolder [data-item="title"]')).fontSize
    }));
    t.eq(afterFinish.saved, 24, '編集を終えても項目全体のptが残る');
    t.ok(Math.abs(parseFloat(afterFinish.css) - 32) < 1, `描画にも反映される（24pt≒32px／実際 ${afterFinish.css}）`);

    // ---- 選んだ文字だけのptを変えると、その範囲だけ変わる ----
    await selectChars(0, 2);
    await page.waitForTimeout(200);
    const partial = await page.evaluate(() => {
      const el = document.getElementById('csSelPt');
      el.value = '36'; el.dispatchEvent(new Event('input', { bubbles: true }));
      const w = proj().works[previewIndex];
      return { fmt: (w.charFmt.title || []).map(r => ({ start: r.start, end: r.end, size: r.size, ls: r.ls })),
               itemSize: curLayoutRead().title.size };
    });
    t.eq(partial.fmt, [{ start: 0, end: 2, size: 36, ls: 0 }], '選んだ文字だけに大きさが記録される');
    t.eq(partial.itemSize, 24, '項目全体のptは変わらない');

    await page.evaluate(() => finishInlineEdit());
    await page.waitForTimeout(300);
    const drawn = await page.evaluate(() => {
      const el = document.querySelector('#editHolder [data-item="title"]');
      const spans = [...el.querySelectorAll('span.cf')];
      return { text: spans.map(s => s.textContent).join(''),
               sizes: spans.map(s => s.style.fontSize),
               base: getComputedStyle(el).fontSize };
    });
    // 分かち書きの都合で1文字ずつのspanに分かれることがあるので、合わせて確かめる
    t.eq(drawn.text, '灰陶', '個別の書式が付くのは選んだ2文字だけ');
    t.eq(drawn.sizes, ['36pt', '36pt'], 'その2文字が36ptで描かれる');
    t.ok(Math.abs(parseFloat(drawn.base) - 32) < 1, '残りの文字は項目全体のpt（24pt）のまま');

    // ---- 字間と大きさを両方指定しても、片方が消えない ----
    await selectChars(0, 2);
    await page.waitForTimeout(200);
    const both = await page.evaluate(() => {
      const ls = document.getElementById('csNum');
      ls.value = '0.20'; ls.dispatchEvent(new Event('input', { bubbles: true }));
      const w = proj().works[previewIndex];
      return (w.charFmt.title || [])[0];
    });
    t.ok(both && Math.abs(both.ls - 0.2) < 0.001, `あとから字間を変えても指定できる（ls=${both && both.ls}）`);
    t.eq(both && both.size, 36, '先に指定した大きさが字間の変更で消えない');

    const reverse = await page.evaluate(() => {
      const pt = document.getElementById('csSelPt');
      pt.value = '12'; pt.dispatchEvent(new Event('input', { bubbles: true }));
      return (proj().works[previewIndex].charFmt.title || [])[0];
    });
    t.eq(reverse.size, 12, '大きさを変え直せる');
    t.ok(Math.abs(reverse.ls - 0.2) < 0.001, '大きさを変えても字間が消えない');

    // ---- 空欄にすると「全体に従う」に戻る ----
    const back = await page.evaluate(() => {
      const pt = document.getElementById('csSelPt');
      pt.value = ''; pt.dispatchEvent(new Event('input', { bubbles: true }));
      const r = (proj().works[previewIndex].charFmt.title || [])[0];
      return { hasSize: r && 'size' in r, ls: r && r.ls };
    });
    t.eq(back.hasSize, false, '空欄にすると文字だけの大きさ指定が外れる');
    t.ok(Math.abs(back.ls - 0.2) < 0.001, '外しても字間の指定は残る');

    // ---- 範囲外の入力は4〜60ptに収まる ----
    const clamped = await page.evaluate(() => {
      const it = document.getElementById('csItemPt');
      it.value = '999'; it.dispatchEvent(new Event('change', { bubbles: true }));
      const hi = curLayoutRead().title.size;
      it.value = '1'; it.dispatchEvent(new Event('change', { bubbles: true }));
      return { hi, lo: curLayoutRead().title.size };
    });
    t.eq(clamped.hi, 60, '大きすぎる指定は60ptで止まる');
    t.eq(clamped.lo, 4, '小さすぎる指定は4ptで止まる');

    // ---- 「選択範囲を既定に戻す」で文字だけの指定が消える ----
    await page.evaluate(() => { curLayout().title.size = 15; save(); renderEditor(); });
    await page.waitForTimeout(200);
    await selectChars(0, 2);
    await page.waitForTimeout(200);
    const reset = await page.evaluate(() => {
      const pt = document.getElementById('csSelPt');
      pt.value = '30'; pt.dispatchEvent(new Event('input', { bubbles: true }));
      const beforeN = (proj().works[previewIndex].charFmt.title || []).length;
      document.getElementById('csReset').click();
      return { beforeN, afterN: (proj().works[previewIndex].charFmt.title || []).length };
    });
    t.eq(reset.beforeN, 1, '文字だけの指定が入っている（前提確認）');
    t.eq(reset.afterN, 0, '「選択範囲を既定に戻す」で消える');

    // ---- 印刷にも反映される ----
    await page.evaluate(() => {
      const w = proj().works[previewIndex];
      w.charFmt = { title: [{ start: 0, end: 2, ls: 0, size: 30 }] };
      curLayout().title.size = 18; save(); renderEditor();
    });
    await page.waitForTimeout(300);
    await page.click('nav.tabs button[data-tab="print"]');
    await page.waitForTimeout(700);
    const printed = await page.evaluate(() => {
      const el = document.querySelector('#sheetScroll .cap-card [data-item="title"]');
      if (!el) return null;
      const sp = el.querySelector('span.cf');
      return { item: getComputedStyle(el).fontSize, span: sp && sp.style.fontSize };
    });
    t.ok(printed && Math.abs(parseFloat(printed.item) - 24) < 1, `印刷にも項目全体のpt（18pt≒24px）が出る（${printed && printed.item}）`);
    t.eq(printed && printed.span, '30pt', '印刷にも選んだ文字だけのptが出る');

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
