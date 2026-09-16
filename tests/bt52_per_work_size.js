// bt52【不具合修正＋新機能】札の寸法を作品ごとに持てるようにする
//   「この作品だけに反映」にチェックを入れても、寸法だけは展覧会共通のため全作品に及んでいた。
const { openApp, mkRunner, chromium } = require('./helpers');

async function run() {
  const t = mkRunner('bt52 作品ごとの札の寸法');
  const browser = await chromium.launch();
  try {
    const { page, errors } = await openApp(browser, { waitTab: 'daicho' });

    // 番号付きの作品を10件用意する（28〜38を含む）
    await page.evaluate(() => {
      const p = proj();
      p.works = [];
      [26, 27, 28, 29, 30, 31, 32, 35, 37, 38].forEach(n => {
        const w = newWork(); w.no = String(n); w.title = '作品' + n; p.works.push(w);
      });
      p.size = { preset: '140x100', w: 140, h: 100 };
      save(); renderAll();
    });
    await page.waitForTimeout(300);

    /* ===== 1. 個別編集で寸法を変えても、他の作品に及ばない ===== */
    await page.click('nav.tabs button[data-tab="layout"]');
    await page.waitForTimeout(300);
    const scoped = await page.evaluate(() => {
      switchEditScope('one');
      previewIndex = 2;                      // No.28
      const w = proj().works[2];
      w._ovEditing = true;                   // 「この作品だけに反映」ON
      applyEditScope(); refreshLayoutControls(); renderEditor();
      const note = document.getElementById('sizeScopeNote').textContent;
      const el = document.getElementById('sizeW');
      el.value = '90'; el.dispatchEvent(new Event('input', { bubbles: true }));
      const h = document.getElementById('sizeH');
      h.value = '60'; h.dispatchEvent(new Event('input', { bubbles: true }));
      return {
        note,
        thisWork: JSON.stringify(w.sizeOverride && w.sizeOverride.cap),
        master: JSON.stringify({ w: proj().size.w, h: proj().size.h }),
        otherWork: !!proj().works[3].sizeOverride,
        drawn: (() => { const c = document.querySelector('#editHolder .cap-card');
          return { w: +(c.getBoundingClientRect().width / MM2PX / (userZoom || 1)).toFixed(0) }; })()
      };
    });
    t.ok(scoped.note.includes('この作品だけ'), `「この作品だけ」のときは寸法欄がその旨を示す（${scoped.note}）`);
    t.eq(scoped.thisWork, '{"w":90,"h":60}', 'その作品にだけ寸法が記録される');
    t.eq(scoped.master, '{"w":140,"h":100}', '展覧会共通の寸法は変わらない（これまでは変わってしまっていた）');
    t.eq(scoped.otherWork, false, '他の作品には何も付かない');
    t.eq(scoped.drawn.w, 90, '編集プレビューもその作品の寸法で描かれる');

    // ---- マスター編集に戻せば、従来どおり全体の寸法を変えられる ----
    const masterEdit = await page.evaluate(() => {
      switchEditScope('master');
      refreshLayoutControls();
      const note = document.getElementById('sizeScopeNote').textContent;
      const el = document.getElementById('sizeW');
      el.value = '150'; el.dispatchEvent(new Event('input', { bubbles: true }));
      return { note, master: proj().size.w, overridden: proj().works[2].sizeOverride.cap.w };
    });
    t.ok(masterEdit.note.includes('すべての作品'), 'マスター編集では全作品に及ぶ旨を示す');
    t.eq(masterEdit.master, 150, 'マスターの寸法は従来どおり変えられる');
    t.eq(masterEdit.overridden, 90, '独自寸法を持つ作品はマスターの変更に引きずられない');

    // ---- 「マスターに戻す」で独自寸法も消える ----
    const reset = await page.evaluate(async () => {
      switchEditScope('one'); previewIndex = 2; applyEditScope();
      const p = document.getElementById('ovReset');
      const shown = p.style.display !== 'none';
      p.click();
      await new Promise(r => setTimeout(r, 100));
      document.getElementById('confirmOk').click();
      await new Promise(r => setTimeout(r, 200));
      return { shown, hasSize: !!proj().works[2].sizeOverride };
    });
    t.eq(reset.shown, true, '独自寸法があると「マスターに戻す」が出る');
    t.eq(reset.hasSize, false, '「マスターに戻す」で独自寸法も解除される');

    /* ===== 2. リストでチェックした作品だけに寸法を付ける ===== */
    await page.click('nav.tabs button[data-tab="daicho"]');
    await page.waitForTimeout(300);
    const TARGET = ['28', '29', '30', '32', '35', '37', '38'];
    const bulk = await page.evaluate((nos) => {
      bulkSel.clear();
      proj().works.forEach((w, i) => { if (nos.includes(w.no)) bulkSel.add(i); });
      renderList(); updateBulkBar();
      return { n: bulkSel.size, barShown: document.getElementById('bulkBar').style.display !== 'none',
               btn: !!document.getElementById('bulkSetSize') };
    }, TARGET);
    t.eq(bulk.n, 7, '7件をチェックした（28・29・30・32・35・37・38）');
    t.eq(bulk.barShown, true, '一括操作のバーが出る');
    t.eq(bulk.btn, true, '「選択した作品の札の寸法を変更」ボタンがある');

    await page.click('#bulkSetSize');
    await page.waitForTimeout(300);
    const dlg = await page.evaluate(() => ({
      open: document.getElementById('bulkSizeDialog').open,
      who: document.getElementById('bulkSizeWho').textContent,
      w: document.getElementById('bulkSizeW').value,
      h: document.getElementById('bulkSizeH').value
    }));
    t.eq(dlg.open, true, 'ボタンで寸法のダイアログが開く');
    t.ok(dlg.who.includes('7件'), `対象の件数が出る（${dlg.who}）`);
    t.ok(dlg.who.includes('28') && dlg.who.includes('38'), '対象の番号が並ぶ');
    t.eq(dlg.w + 'x' + dlg.h, '150x100', '現在の寸法が初期値に入る');

    const applied = await page.evaluate(() => {
      document.getElementById('bulkSizeW').value = '80';
      document.getElementById('bulkSizeH').value = '55';
      document.getElementById('bulkSizeApply').click();
      return null;
    });
    page.once('dialog', d => d.accept());
    await page.waitForTimeout(400);
    const result = await page.evaluate((nos) => {
      const out = {};
      proj().works.forEach(w => {
        const ov = w.sizeOverride && w.sizeOverride.cap;
        out[w.no] = ov ? `${ov.w}x${ov.h}` : 'マスター';
      });
      return { out, master: `${proj().size.w}x${proj().size.h}` };
    }, TARGET);
    TARGET.forEach(n => t.eq(result.out[n], '80x55', `No.${n} だけが80×55mmになる`));
    ['26', '27', '31'].forEach(n => t.eq(result.out[n], 'マスター', `No.${n} はマスターの寸法のまま`));
    t.eq(result.master, '150x100', '展覧会共通の寸法は変わらない');

    // ---- 「マスターの寸法に戻す」で選んだぶんだけ解除できる ----
    await page.evaluate(() => {
      bulkSel.clear();
      proj().works.forEach((w, i) => { if (w.no === '32') bulkSel.add(i); });
      renderList(); updateBulkBar();
    });
    await page.click('#bulkSetSize');
    await page.waitForTimeout(300);
    await page.evaluate(() => document.getElementById('bulkSizeClear').click());
    page.once('dialog', d => d.accept());
    await page.waitForTimeout(400);
    const afterClear = await page.evaluate(() => {
      const find = n => proj().works.find(w => w.no === n);
      return { n32: !!(find('32').sizeOverride), n35: find('35').sizeOverride.cap.w };
    });
    t.eq(afterClear.n32, false, '選んだNo.32だけマスターの寸法に戻る');
    t.eq(afterClear.n35, 80, '選んでいないNo.35はそのまま');

    /* ===== 3. 印刷でも作品ごとの寸法で並ぶ ===== */
    await page.click('nav.tabs button[data-tab="print"]');
    await page.waitForTimeout(800);
    const printed = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('#sheetScroll .cap-card')];
      const sizes = cards.map(c => `${Math.round(parseFloat(c.style.width))}x${Math.round(parseFloat(c.style.height))}`);
      // 重なっていないか（同じ用紙の中で矩形が交差しないか）
      const bySheet = new Map();
      cards.forEach(c => {
        const s = c.closest('.sheet'); if (!bySheet.has(s)) bySheet.set(s, []);
        const r = c.getBoundingClientRect(); bySheet.get(s).push(r);
      });
      let overlap = false;
      bySheet.forEach(list => {
        for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
          const a = list[i], b = list[j];
          if (a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5) overlap = true;
        }
      });
      return { sizes, overlap, count: cards.length };
    });
    t.eq(printed.count, 10, '10件すべてが印刷プレビューに出る');
    t.ok(printed.sizes.filter(s => s === '80x55').length === 6, `独自寸法の6件が80×55mmで出る（${printed.sizes.join(' / ')}）`);
    t.ok(printed.sizes.filter(s => s === '150x100').length === 4, 'それ以外の4件はマスターの150×100mmで出る');
    t.eq(printed.overlap, false, '寸法が混ざっても札どうしが重ならない');

    // ---- 寸法が全部同じなら、従来どおりの等間隔の格子のまま ----
    await page.evaluate(() => {
      proj().works.forEach(w => delete w.sizeOverride);
      save(); renderSheets();
    });
    await page.waitForTimeout(600);
    const uniform = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('#sheetScroll .cap-card')];
      const xs = [...new Set(cards.map(c => Math.round(parseFloat(c.style.left))))];
      const sizes = [...new Set(cards.map(c => c.style.width))];
      return { xs: xs.length, sizes };
    });
    t.eq(uniform.sizes.length, 1, '独自寸法を外すと全部同じ寸法に戻る');
    t.ok(uniform.xs <= 2, `等間隔の格子に並ぶ（左端の種類 ${uniform.xs}）`);

    // ---- 保存・再読込で残る ----
    await page.evaluate(() => {
      const w = proj().works.find(x => x.no === '29');
      setWorkSize(w, 'cap', { w: 70, h: 45 }); save();
    });
    await page.reload();
    await page.waitForTimeout(800);
    const persisted = await page.evaluate(() => {
      const w = proj().works.find(x => x.no === '29');
      return w.sizeOverride && w.sizeOverride.cap;
    });
    t.eq(persisted, { w: 70, h: 45 }, '作品ごとの寸法が保存され、再読込後も残る');

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
