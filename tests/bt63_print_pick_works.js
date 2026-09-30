// bt63【新機能】印刷の「対象」で、任意の作品だけを選んで刷れる
//   章（節）を付けていない展覧会だと「対象」に選択肢が出ず、全点まとめて刷るしかなかった。
//   番号と作品名の一覧から1点ずつ選べるようにし、番号の範囲指定でもまとめて選べるようにする。
const { openApp, mkRunner, chromium } = require('./helpers');

async function run() {
  const t = mkRunner('bt63 印刷する作品を選ぶ');
  const browser = await chromium.launch();
  try {
    const { page, errors } = await openApp(browser, { waitTab: 'daicho' });

    // 章を一切付けない6点（利用者の展覧会と同じ状況）
    await page.evaluate(() => {
      const p = proj();
      p.works = [];
      ['74', '75', '76', '80', '85', 'A-1'].forEach(no => {
        const w = newWork();
        w.no = no; w.title = '作品' + no; w.origin = '産地';
        w.period = '江戸時代'; w.description = '解説' + no;
        p.works.push(w);
      });
      p.printOpt = Object.assign({ mode: 'impose', marks: false, border: true, section: '',
        face: 'cap', sheetKind: 'a4', tight: false }, p.printOpt, { section: '', face: 'cap' });
      save(); renderAll();
    });
    await page.click('nav.tabs button[data-tab="print"]');
    await page.waitForTimeout(600);

    const opts = () => page.evaluate(() =>
      [...document.querySelectorAll('#printSection option')].map(o => o.value));
    const state = () => page.evaluate(() => ({
      shown: getComputedStyle(document.getElementById('printPick')).display !== 'none',
      rows: [...document.querySelectorAll('.pickChk')].length,
      checked: [...document.querySelectorAll('.pickChk')].filter(c => c.checked).length,
      count: document.getElementById('pickCount').textContent,
      sheetNote: document.getElementById('sheetCount').textContent,
      printed: [...document.querySelectorAll('#sheetScroll .cap-card [data-item="no"]')]
        .map(e => e.textContent.trim())
    }));

    /* ===== 1. 章が無くても「選んだ作品だけ」を選べる ===== */
    t.eq((await opts()).includes('__pick'), true,
      '章を付けていなくても「選んだ作品だけ」が選べる');
    t.eq(await page.evaluate(() =>
      getComputedStyle(document.getElementById('printPick')).display), 'none',
      '「すべての作品」のあいだは作品の一覧を出さない');

    await page.selectOption('#printSection', '__pick');
    await page.waitForTimeout(600);
    let s = await state();
    t.eq(s.shown, true, '「選んだ作品だけ」にすると作品の一覧が出る');
    t.eq(s.rows, 6, '台帳の全作品がならぶ');
    t.eq(s.checked, 0, 'はじめは何も選ばれていない');
    t.ok(/1件も選ばれていません/.test(s.count), '選ばれていないことを知らせる');
    t.ok(/選ばれていません/.test(s.sheetNote), 'プレビューにも理由を出す（台帳が空だと誤解させない）');

    /* ===== 2. チェックした作品だけが刷られる ===== */
    const check = (no, on = true) => page.evaluate(({ no, on }) => {
      const w = proj().works.find(w => w.no === no);
      const c = document.querySelector(`.pickChk[data-id="${w.id}"]`);
      if (c.checked !== on) c.click();
    }, { no, on });
    await check('75'); await page.waitForTimeout(400);
    await check('85'); await page.waitForTimeout(500);
    s = await state();
    t.eq(s.printed, ['75', '85'], 'チェックした作品だけが刷られる');
    t.ok(/2件/.test(s.count), '選んだ件数を知らせる');
    t.ok(/2件/.test(s.sheetNote), 'プレビューにも件数を出す');

    await check('75', false); await page.waitForTimeout(500);
    t.eq((await state()).printed, ['85'], 'チェックを外すとその作品は刷られない');

    /* ===== 3. すべて選ぶ／すべて外す ===== */
    await page.click('#pickAll'); await page.waitForTimeout(600);
    s = await state();
    t.eq(s.checked, 6, '「すべて選ぶ」で全作品にチェックが付く');
    t.eq(s.printed, ['74', '75', '76', '80', '85', 'A-1'], '全作品が台帳の順に刷られる');

    await page.click('#pickNone'); await page.waitForTimeout(600);
    s = await state();
    t.eq(s.checked, 0, '「すべて外す」で全部外れる');
    t.eq(s.printed, [], '刷られる作品が無くなる');

    /* ===== 4. 番号の範囲で選び直す ===== */
    await page.fill('#pickRange', '74-76, 85');
    await page.click('#pickApplyRange');
    await page.waitForTimeout(600);
    s = await state();
    t.eq(s.printed, ['74', '75', '76', '85'], '「74-76, 85」で範囲と単独をまとめて選べる');
    t.eq(s.checked, 4, '一覧のチェックも選び直した内容に揃う');

    // 全角の読点・波ダッシュでも同じ
    await page.fill('#pickRange', '74〜75、A-1');
    await page.click('#pickApplyRange');
    await page.waitForTimeout(600);
    t.eq((await state()).printed, ['74', '75', 'A-1'],
      '全角の読点・波ダッシュ、数字でない番号も受け取る');

    // あてはまらないときは知らせて、選択はそのまま
    page.once('dialog', d => d.accept());
    await page.fill('#pickRange', '900-999');
    await page.click('#pickApplyRange');
    await page.waitForTimeout(500);
    t.eq((await state()).printed, ['74', '75', 'A-1'],
      'あてはまる番号が無いときは前の選択を壊さない');

    /* ===== 5. 並べ替えても選び直さなくてよい（idで覚える） ===== */
    await page.evaluate(() => {
      const p = proj();
      p.works.reverse();
      save(); renderAll(); refreshPrintControls(); renderSheets();
    });
    await page.waitForTimeout(700);
    t.eq((await state()).printed, ['A-1', '75', '74'],
      '台帳を並べ替えても、選んだ作品はそのまま（順だけ入れ替わる）');

    /* ===== 6. 保存され、読み直しても残る ===== */
    const saved = await page.evaluate(() => ({
      section: proj().printOpt.section, n: (proj().printOpt.pick || []).length
    }));
    t.eq(saved.section, '__pick', '「対象」の選択が保存される');
    t.eq(saved.n, 3, '選んだ作品が保存される');

    await page.reload();
    await page.waitForTimeout(600);
    await page.click('nav.tabs button[data-tab="print"]');
    await page.waitForTimeout(700);
    s = await state();
    t.eq(s.shown, true, '読み直しても「選んだ作品だけ」のまま');
    t.eq(s.printed, ['A-1', '75', '74'], '読み直しても同じ作品が刷られる');

    /* ===== 7. 実際の印刷でも同じ ===== */
    await page.evaluate(() => { window.print = () => {}; });
    const printed = await page.evaluate(async () => {
      await doPrint();
      const root = document.getElementById('print-root');
      root.style.cssText = 'display:block;position:absolute;left:-4000px;top:0';
      const out = [...root.querySelectorAll('.cap-card [data-item="no"]')].map(e => e.textContent.trim());
      root.style.cssText = ''; root.innerHTML = '';
      return out;
    });
    t.eq(printed, ['A-1', '75', '74'], '実際の印刷でも選んだ作品だけが出る');

    /* 1件も選んでいないときは、理由の分かる案内を出して印刷しない */
    await page.click('#pickNone'); await page.waitForTimeout(500);
    const msg = await page.evaluate(async () => {
      let said = null;
      const keep = window.alert; window.alert = m => { said = m; };
      const ok = await doPrint();
      window.alert = keep;
      return { said, ok };
    });
    t.eq(msg.ok, false, '1件も選んでいなければ印刷しない');
    t.ok(/選ばれていません/.test(msg.said || ''),
      '台帳が空のときとは違う案内を出す（' + msg.said + '）');

    /* ===== 8. 「すべての作品」に戻せば全点刷れる ===== */
    await page.fill('#pickRange', '74, 75, A-1');
    await page.click('#pickApplyRange');
    await page.waitForTimeout(600);
    await page.selectOption('#printSection', '');
    await page.waitForTimeout(700);
    s = await state();
    t.eq(s.shown, false, '「すべての作品」に戻すと一覧を隠す');
    t.eq(s.printed.length, 6, '全作品が刷られる');
    t.eq(await page.evaluate(() => (proj().printOpt.pick || []).length), 3,
      '選んだ内容は捨てずに覚えておく（また選び直さなくてよい）');

    /* ===== 9. 章での絞り込みは今までどおり ===== */
    await page.evaluate(() => {
      const p = proj();
      p.works.forEach(w => { if (w.no === '74' || w.no === '75') w.section = '第一章'; });
      save(); renderAll(); refreshPrintControls(); renderSheets();
    });
    await page.waitForTimeout(600);
    t.eq((await opts()), ['', '第一章', '__pick'], '章があれば章も選べる');
    await page.selectOption('#printSection', '第一章');
    await page.waitForTimeout(700);
    t.eq((await state()).printed, ['75', '74'], '章で絞ると、その章の作品だけが刷られる');

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
