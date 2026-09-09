// bt49【新機能】項目ごとの行間（キャッチコピー等）と、単漢字ルビを親文字の幅に収める掛け方
const { openApp, mkRunner, chromium } = require('./helpers');

async function run() {
  const t = mkRunner('bt49 項目ごとの行間・単漢字ルビの収め');
  const browser = await chromium.launch();
  try {
    const { page, errors } = await openApp(browser, { waitTab: 'layout' });
    await page.evaluate(() => { switchEditScope('one'); });
    await page.waitForTimeout(200);

    /* ===== 1. 項目ごとの行間 ===== */

    // ---- 既定は「全体に従う」（null）。既存データも同じ ----
    const def = await page.evaluate(() => {
      const L = proj().style.layout;
      return { catch: L.catchcopy.lh, allNull: ITEMS.every(i => L[i.key].lh === null), desc: proj().style.descLayout.description.lh };
    });
    t.eq(def.catch, null, 'キャッチコピーの行間は既定で「全体に従う」');
    t.eq(def.allNull, true, '全項目が既定で「全体に従う」');
    t.eq(def.desc, null, '解説面の解説文も「全体に従う」');

    const migrated = await page.evaluate(() => {
      const p = proj();
      delete p.style.layout.catchcopy.lh; delete p.style.descLayout.description.lh;
      ensureLayout(p);
      return [p.style.layout.catchcopy.lh, p.style.descLayout.description.lh];
    });
    t.eq(migrated, [null, null], '行間を持たない既存データは「全体に従う」で補われる');

    // ---- パネルに行間の入力欄がある ----
    await page.evaluate(() => {
      const w = proj().works[previewIndex];
      w.catchcopy = '雨の線と竹林の濃淡が\n画面に奥行きを与える。';
      proj().style.layout.catchcopy.h = null; save(); renderEditor();
      sel.clear(); sel.add('catchcopy'); showPanel();
    });
    await page.waitForTimeout(300);
    const ui = await page.evaluate(() => {
      const el = document.getElementById('ipLh');
      return el ? { min: el.min, max: el.max, step: el.step, ph: el.placeholder, val: el.value,
                    clear: !!document.getElementById('ipLhClear'),
                    spin: !!el.parentElement.querySelector('.spin') } : null;
    });
    t.ok(ui, 'キャッチコピーを選ぶとパネルに行間の入力欄が出る');
    t.eq(ui && ui.ph, '全体に従う', '未設定のときは「全体に従う」と示される');
    t.eq(ui && ui.val, '', '未設定のときは空欄');
    t.eq(ui && ui.clear, true, '「全体」に戻すボタンがある');
    t.eq(ui && ui.spin, true, '行間にも上下ボタンが付く（数値項目の共通仕様）');

    // ---- 入力すると描画と高さに反映される ----
    const before = await page.evaluate(() => heightMM('catchcopy'));
    await page.evaluate(() => {
      const el = document.getElementById('ipLh'); el.value = '2.4';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForTimeout(300);
    const wide = await page.evaluate(() => ({
      lh: proj().style.layout.catchcopy.lh,
      h: heightMM('catchcopy'),
      css: getComputedStyle(document.querySelector('#editHolder [data-item="catchcopy"]')).lineHeight,
      size: parseFloat(getComputedStyle(document.querySelector('#editHolder [data-item="catchcopy"]')).fontSize)
    }));
    t.eq(wide.lh, 2.4, 'キャッチコピーの行間に2.4を指定できる');
    t.ok(Math.abs(parseFloat(wide.css) - wide.size * 2.4) < 1, `描画の行間が2.4倍になる（${wide.css} / 文字サイズ ${wide.size}px）`);
    t.ok(wide.h > before * 1.4, `行間を広げると項目の高さが増える（${before.toFixed(1)}mm → ${wide.h.toFixed(1)}mm）`);

    // ---- 他の項目は全体の行間のまま ----
    const others = await page.evaluate(() => {
      const st = proj().style;
      const el = document.querySelector('#editHolder [data-item="origin"]');
      const cs = getComputedStyle(el);
      return { lh: proj().style.layout.origin.lh, ratio: parseFloat(cs.lineHeight) / parseFloat(cs.fontSize), master: st.lh };
    });
    t.eq(others.lh, null, '他の項目の行間は「全体に従う」のまま');
    t.ok(Math.abs(others.ratio - others.master) < 0.05, `他の項目は全体の行間（${others.master}）で描かれる`);

    // ---- 「全体」ボタンで戻せる ----
    await page.evaluate(() => document.getElementById('ipLhClear').click());
    await page.waitForTimeout(300);
    const cleared = await page.evaluate(() => ({
      lh: proj().style.layout.catchcopy.lh, val: document.getElementById('ipLh').value,
      ratio: (() => { const cs = getComputedStyle(document.querySelector('#editHolder [data-item="catchcopy"]'));
        return parseFloat(cs.lineHeight) / parseFloat(cs.fontSize); })()
    }));
    t.eq(cleared.lh, null, '「全体」ボタンで全体の行間に戻る');
    t.eq(cleared.val, '', '入力欄も空欄に戻る');
    t.ok(Math.abs(cleared.ratio - others.master) < 0.05, '描画も全体の行間に戻る');

    // ---- 作品ごとの上書き・保存・印刷 ----
    const ovr = await page.evaluate(() => {
      const w = proj().works[previewIndex];
      w._ovEditing = true;
      curLayout().catchcopy.lh = 1.9; save();
      return { inOverride: w.layoutOverride.cap.catchcopy.lh, master: proj().style.layout.catchcopy.lh };
    });
    t.eq(ovr.inOverride, 1.9, '作品ごとの上書きに行間が入る');
    t.eq(ovr.master, null, 'マスターの行間は変わらない');

    await page.evaluate(() => { proj().style.layout.title.lh = 1.15; save(); });
    await page.click('nav.tabs button[data-tab="print"]');
    await page.waitForTimeout(600);
    const printed = await page.evaluate(() => {
      const el = document.querySelector('#sheetScroll .cap-card [data-item="title"]');
      const cs = getComputedStyle(el);
      return parseFloat(cs.lineHeight) / parseFloat(cs.fontSize);
    });
    t.ok(Math.abs(printed - 1.15) < 0.05, `印刷プレビューにも項目ごとの行間が反映される（${printed.toFixed(2)}）`);
    await page.click('nav.tabs button[data-tab="layout"]');
    await page.waitForTimeout(400);

    /* ===== 2. 単漢字ルビを親文字の幅に収める ===== */

    // ---- 設定が選べる。既定は従来どおり ----
    const rubyUi = await page.evaluate(() => {
      const s = document.getElementById('rubyFit');
      return s ? { value: s.value, opts: [...s.options].map(o => o.value), style: proj().style.rubyFit } : null;
    });
    t.ok(rubyUi, 'ルビの掛け方を選ぶ設定がある');
    t.eq(rubyUi && rubyUi.opts, ['normal', 'fit'], '「通常」と「親文字の幅に収める」から選べる');
    t.eq(rubyUi && rubyUi.style, 'normal', '既定は従来どおりの掛け方');

    const setup = async (fit) => {
      await page.evaluate((mode) => {
        const p = proj(); p.style.rubyFit = mode;
        p.style.layout.title.h = null; p.style.layout.title.lh = null;
        const w = p.works[previewIndex];
        w.title = '鑑真和上像';
        w.ruby = { title: [{ start: 0, end: 5, text: 'がん じん わ じょう ぞう' }] };
        delete w.layoutOverride; delete w._ovEditing;
        save(); renderEditor();
      }, fit);
      await page.waitForTimeout(400);
    };

    await setup('normal');
    const normal = await page.evaluate(() => {
      const el = document.querySelector('#editHolder [data-item="title"]');
      const rubies = [...el.querySelectorAll('ruby')];
      return {
        count: rubies.length,
        fitClass: rubies.filter(r => r.classList.contains('fit')).length,
        widths: rubies.map(r => +r.getBoundingClientRect().width.toFixed(1)),
        em: parseFloat(getComputedStyle(el).fontSize)
      };
    });
    t.eq(normal.count, 5, '1文字ずつのルビが5つ作られる（前提確認）');
    t.eq(normal.fitClass, 0, '通常の掛け方では収めモードにならない');
    t.ok(normal.widths.some(w => w > normal.em + 1),
      `通常の掛け方では、読みが長い文字の送りが広がる（幅 ${normal.widths.join(' / ')} ／ 1em=${normal.em}）`);

    await setup('fit');
    const fit = await page.evaluate(() => {
      const el = document.querySelector('#editHolder [data-item="title"]');
      const rubies = [...el.querySelectorAll('ruby')];
      return {
        fitClass: rubies.filter(r => r.classList.contains('fit')).length,
        widths: rubies.map(r => +r.getBoundingClientRect().width.toFixed(1)),
        em: parseFloat(getComputedStyle(el).fontSize),
        rks: rubies.map(r => r.querySelector('rt').style.getPropertyValue('--rk')),
        rtWidths: rubies.map(r => +r.querySelector('rt').getBoundingClientRect().width.toFixed(1)),
        rtPos: getComputedStyle(rubies[0].querySelector('rt')).position
      };
    });
    t.eq(fit.fitClass, 5, '収めモードでは各ルビに収めの指定が付く');
    t.eq(fit.rtPos, 'absolute', 'ルビを流れから外して送り幅を持たせない');
    t.ok(fit.widths.every(w => w <= fit.em + 1),
      `収めモードでは全ての親文字の送りが1文字ぶんに収まる（幅 ${fit.widths.join(' / ')} ／ 1em=${fit.em}）`);
    t.ok(fit.rtWidths.every((w, i) => w <= fit.widths[i] + 1),
      `読みも親文字の幅に収まる（読みの幅 ${fit.rtWidths.join(' / ')}）`);
    t.ok(fit.rks.some(k => parseFloat(k) < 1), `読みが長い文字は長体になる（倍率 ${fit.rks.join(' / ')}）`);
    t.ok(fit.rks.some(k => parseFloat(k) === 1), '読みが親文字に収まる文字は等倍のまま');
    t.ok(fit.rks.every(k => parseFloat(k) >= 0.5), '下限（50%）より詰めない');

    // ---- 縦書きの和文項目は従来どおりの掛け方にする ----
    await page.evaluate(() => {
      const c = document.getElementById('stVertical');
      c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.waitForTimeout(700);
    const vert = await page.evaluate(() => {
      const el = document.querySelector('#editHolder [data-item="title"]');
      const rubies = [...el.querySelectorAll('ruby')];
      return { fitClass: rubies.filter(r => r.classList.contains('fit')).length, count: rubies.length,
               setting: proj().style.rubyFit };
    });
    t.eq(vert.setting, 'fit', '設定は「収める」のまま（前提確認）');
    t.eq(vert.fitClass, 0, '縦書きの和文項目では収めモードを使わない（親文字が重ならないようにするため）');
    t.ok(vert.count >= 5, '縦書きでもルビ自体は従来どおり付く');
    await page.evaluate(() => {
      const c = document.getElementById('stVertical');
      c.checked = false; c.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.waitForTimeout(600);

    // ---- 印刷プレビューでも収まる ----
    await page.click('nav.tabs button[data-tab="print"]');
    await page.waitForTimeout(700);
    const printedRuby = await page.evaluate(() => {
      const el = document.querySelector('#sheetScroll .cap-card [data-item="title"]');
      if (!el) return null;
      const rubies = [...el.querySelectorAll('ruby.fit')];
      return { n: rubies.length, rks: rubies.map(r => r.querySelector('rt').style.getPropertyValue('--rk')) };
    });
    t.ok(printedRuby && printedRuby.n === 5, '印刷プレビューでも収めモードで組まれる');
    t.ok(printedRuby && printedRuby.rks.some(k => parseFloat(k) < 1), `印刷プレビューでも長体の倍率が入る（${printedRuby && printedRuby.rks.join(' / ')}）`);

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
