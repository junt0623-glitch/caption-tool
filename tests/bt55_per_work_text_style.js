// bt55【不具合修正】「この作品だけ」で行間を変えると他の作品（マスター）にも及んでしまう
//   行間・書体・ルビの体裁・表示項目は展覧会にひとつしか持てない作りだったため、
//   「この作品だけ配置を上書きする」にチェックを入れても全作品に反映されていた。
const { openApp, mkRunner, chromium } = require('./helpers');

async function run() {
  const t = mkRunner('bt55 作品ごとの行間・書体・ルビの体裁');
  const browser = await chromium.launch();
  try {
    const { page, errors } = await openApp(browser, { waitTab: 'daicho' });

    // 番号付きの作品を4件用意する
    await page.evaluate(() => {
      const p = proj();
      p.works = [];
      ['1', '2', '3', '4'].forEach(n => {
        const w = newWork();
        w.no = n; w.title = '作品' + n; w.origin = '産地' + n;
        w.period = '江戸時代'; w.catch = 'ふたつの川の交わるところ';
        p.works.push(w);
      });
      p.style.lh = 1.45;
      save(); renderAll();
    });
    await page.click('nav.tabs button[data-tab="layout"]');
    await page.waitForTimeout(400);

    /* この作品だけの上書きをONにして No.2 を選ぶ */
    const enterOne = (idx) => page.evaluate((i) => {
      switchEditScope('one');
      previewIndex = i;
      proj().works[i]._ovEditing = true;
      applyEditScope(); refreshLayoutControls(); renderEditor();
    }, idx);

    const setRange = (id, v) => page.evaluate(([i, val]) => {
      const el = document.getElementById(i);
      el.value = String(val);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }, [id, v]);

    /* ===== 1. 行間：その作品だけに効き、マスターと他作品に及ばない ===== */
    await enterOne(1);
    await page.waitForTimeout(300);
    await setRange('stLh', 2.0);
    await page.waitForTimeout(300);

    const lh = await page.evaluate(() => {
      const p = proj();
      const drawn = () => {
        const el = document.querySelector('#editHolder [data-item="title"]');
        return el ? el.style.lineHeight : '';
      };
      return {
        thisWork: p.works[1].textOverride && p.works[1].textOverride.lh,
        master: p.style.lh,
        otherWork: !!p.works[0].textOverride,
        drawn: drawn(),
        note: document.getElementById('textScopeNote').textContent
      };
    });
    t.eq(lh.thisWork, 2, 'その作品にだけ行間が記録される');
    t.eq(lh.master, 1.45, '展覧会共通の行間は変わらない（これまでは変わってしまっていた）');
    t.eq(lh.otherWork, false, '他の作品には何も付かない');
    t.eq(lh.drawn, '2', '編集プレビューもその作品の行間で描かれる');
    t.ok(lh.note.includes('この作品だけ'), `「この作品だけ」のときは行間欄がその旨を示す（${lh.note}）`);

    // 他の作品に切り替えると、マスターの行間のまま描かれる
    await enterOne(0);
    await page.waitForTimeout(400);
    const other = await page.evaluate(() => ({
      drawn: document.querySelector('#editHolder [data-item="title"]').style.lineHeight,
      slider: document.getElementById('stLh').value
    }));
    t.eq(other.drawn, '1.45', '他の作品はマスターの行間のまま描かれる');
    t.eq(other.slider, '1.45', '行間の欄にもマスターの値が出る');

    /* ===== 2. マスター編集では従来どおり全作品に効く ===== */
    const masterEdit = await page.evaluate(() => {
      switchEditScope('master'); refreshLayoutControls();
      const note = document.getElementById('textScopeNote').textContent;
      const el = document.getElementById('stLh');
      el.value = '1.8'; el.dispatchEvent(new Event('input', { bubbles: true }));
      return { note, master: proj().style.lh, overridden: proj().works[1].textOverride.lh };
    });
    t.ok(masterEdit.note.includes('すべての作品'), 'マスター編集では全作品に及ぶ旨を示す');
    t.eq(masterEdit.master, 1.8, 'マスターの行間は従来どおり変えられる');
    t.eq(masterEdit.overridden, 2, '独自の行間を持つ作品はマスターの変更に引きずられない');

    /* ===== 3. 書体・ルビの体裁・表示項目も同じ扱い ===== */
    await enterOne(1);
    await page.waitForTimeout(300);
    const others = await page.evaluate(() => {
      const setSel = (id, v) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('change', { bubbles: true })); };
      const setChk = (id, v) => { const e = document.getElementById(id); e.checked = v; e.dispatchEvent(new Event('change', { bubbles: true })); };
      setSel('fontKind', 'gothic');
      setSel('rubyAlign', 'center');
      setChk('shPeriod', false);
      const p = proj(), ov = p.works[1].textOverride;
      return {
        font: ov.font, rubyAlign: ov.rubyAlign, show: JSON.stringify(ov.show),
        masterFont: p.style.font, masterAlign: p.style.rubyAlign, masterShow: p.style.show.period,
        otherWork: !!p.works[0].textOverride
      };
    });
    t.eq(others.font, 'gothic', '書体もその作品だけに記録される');
    t.eq(others.rubyAlign, 'center', 'ルビの割付もその作品だけ');
    t.eq(others.show, '{"period":false}', '表示項目は触れた項目だけが差分になる');
    t.ok(others.masterFont !== 'gothic', `マスターの書体は変わらない（${others.masterFont}）`);
    t.eq(others.masterAlign, 'space-around', 'マスターのルビの割付も変わらない');
    t.eq(others.masterShow, true, 'マスターの表示項目も変わらない');
    t.eq(others.otherWork, false, '他の作品には何も付かない');

    // 触れていない項目はマスターの変更にそのまま追随する（差分方式）
    const follow = await page.evaluate(() => {
      proj().style.rubyLs = 0.2; save(); renderEditor();
      const card = document.querySelector('#editHolder .cap-card');
      return card.style.getPropertyValue('--ruby-ls');
    });
    t.eq(follow, '0.2em', '触れていないルビの文字間は、あとからのマスターの変更に追随する');

    /* ===== 4. 展覧会にひとつだけの設定は、作品ごとの編集中は閉じる ===== */
    const locked = await page.evaluate(() => ({
      pad: getComputedStyle(document.getElementById('stPad').closest('.ctl')).pointerEvents,
      vertical: getComputedStyle(document.getElementById('stVertical').closest('label')).pointerEvents,
      copyStyle: getComputedStyle(document.getElementById('btnCopyStyle')).pointerEvents,
      hint: getComputedStyle(document.querySelector('.master-only-hint')).display,
      lhOpen: getComputedStyle(document.getElementById('stLh')).pointerEvents
    }));
    t.eq(locked.pad, 'none', '初期配置の余白は作品ごとに持てないので触れない');
    t.eq(locked.vertical, 'none', '縦書きの切り替えも触れない');
    t.eq(locked.copyStyle, 'none', '体裁の複製も触れない');
    t.eq(locked.hint, 'block', '触れない理由の案内が出る');
    t.eq(locked.lhOpen, 'auto', '行間は作品ごとに持てるので触れる');

    const unlockedOnMaster = await page.evaluate(() => {
      switchEditScope('master'); refreshLayoutControls();
      return {
        pad: getComputedStyle(document.getElementById('stPad').closest('.ctl')).pointerEvents,
        copyStyle: getComputedStyle(document.getElementById('btnCopyStyle')).pointerEvents,
        hint: getComputedStyle(document.querySelector('.master-only-hint')).display
      };
    });
    t.eq(unlockedOnMaster.pad, 'auto', 'マスター編集では余白を触れる');
    t.eq(unlockedOnMaster.copyStyle, 'auto', 'マスター編集では体裁の複製も触れる');
    t.eq(unlockedOnMaster.hint, 'none', 'マスター編集では案内を出さない');

    /* ===== 5. 印刷でも作品ごとの行間・表示項目で出る ===== */
    await page.click('nav.tabs button[data-tab="print"]');
    await page.waitForTimeout(800);
    const printed = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('#sheetScroll .cap-card')];
      return cards.map(c => {
        const ti = c.querySelector('[data-item="title"]');
        return {
          title: ti ? ti.textContent : '',
          lh: ti ? ti.style.lineHeight : '',
          hasPeriod: !!c.querySelector('[data-item="period"]')
        };
      });
    });
    const w2 = printed.find(x => x.title.includes('作品2'));
    const w1 = printed.find(x => x.title.includes('作品1'));
    t.eq(w2.lh, '2', '印刷でもその作品だけ独自の行間で出る');
    t.eq(w1.lh, '1.8', '他の作品はマスターの行間で出る');
    t.eq(w2.hasPeriod, false, '非表示にした項目はその作品だけ消える');
    t.eq(w1.hasPeriod, true, '他の作品の「時代」は出たまま');

    /* ===== 6. 「マスターに戻す」で解除できる・保存して残る ===== */
    await page.click('nav.tabs button[data-tab="layout"]');
    await page.waitForTimeout(400);
    await page.evaluate(() => { switchEditScope('one'); previewIndex = 1; applyEditScope(); save(); });
    await page.reload();
    await page.waitForTimeout(800);
    const persisted = await page.evaluate(() => {
      const ov = proj().works[1].textOverride;
      return { lh: ov && ov.lh, font: ov && ov.font };
    });
    t.eq(persisted.lh, 2, '作品ごとの行間が保存され、再読込後も残る');
    t.eq(persisted.font, 'gothic', '作品ごとの書体も残る');

    await page.click('nav.tabs button[data-tab="layout"]');
    await page.waitForTimeout(400);
    const cleared = await page.evaluate(async () => {
      switchEditScope('one'); previewIndex = 1; applyEditScope();
      const btn = document.getElementById('ovReset');
      const shown = btn.style.display !== 'none';
      const status = document.getElementById('ovStatus').textContent;
      btn.click();
      await new Promise(r => setTimeout(r, 120));
      document.getElementById('confirmOk').click();
      await new Promise(r => setTimeout(r, 250));
      return { shown, status, has: !!proj().works[1].textOverride,
               drawn: document.querySelector('#editHolder [data-item="title"]').style.lineHeight };
    });
    t.eq(cleared.shown, true, '独自の書体・行間があると「マスターに戻す」が出る');
    t.ok(cleared.status.includes('書体'), `独自の書体・行間であることを知らせる（${cleared.status}）`);
    t.eq(cleared.has, false, '「マスターに戻す」で独自の書体・行間も解除される');
    t.eq(cleared.drawn, '1.8', '解除するとマスターの行間で描かれる');

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
