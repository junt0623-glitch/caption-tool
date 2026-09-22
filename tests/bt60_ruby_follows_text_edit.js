// bt60【不具合修正】ルビを振ったあと本文を編集すると、ルビが別の文字にずれる
//   ルビは「何文字目から何文字目まで」で覚えているので、前のほうに文字を足したり
//   消したりすると、そのぶん後ろのルビがずれていた。
//   編集の前後を見比べて、ルビが付いていた文字を追いかけて付け直す。
//   文字ごとの書式（字間・大きさ）と縦中横も同じ扱いにする。
const { openApp, mkRunner, chromium } = require('./helpers');

const BASE = '桃山期の金地屏風。鷹匠の姿を大画面に配する。';
// 桃山(0-2) 金地(4-6) 鷹匠(9-11)
const RUBY = [
  { start: 0, end: 2, text: 'ももやま' },
  { start: 4, end: 6, text: 'きんじ' },
  { start: 9, end: 11, text: 'たかじょう' }
];

async function run() {
  const t = mkRunner('bt60 本文を編集してもルビが同じ文字に付いたまま');
  const browser = await chromium.launch();
  try {
    const { page, errors } = await openApp(browser, { waitTab: 'daicho' });
    page.on('dialog', d => d.accept());

    const setup = () => page.evaluate(([base, ruby]) => {
      const p = proj(); p.works = [];
      const w = newWork();
      w.no = '1'; w.title = '鷹匠図屏風'; w.description = base;
      w.ruby = { description: JSON.parse(JSON.stringify(ruby)) };
      p.works.push(w);
      p.style.show.desc = true;
      save(); renderAll();
    }, [BASE, RUBY]);

    const toDesc = () => page.evaluate(() => {
      editMode = 'desc';
      document.querySelectorAll('.mode-sw button').forEach(b => b.classList.toggle('on', b.dataset.mode === 'desc'));
      switchEditScope('one'); previewIndex = 0; userZoom = 1;
      applyEditScope(); refreshLayoutControls(); renderEditor();
    });

    /* 記録のうえで「どの文字にどのルビが付いているか」 */
    const pairs = () => page.evaluate(() => {
      const w = proj().works[0], txt = w.description;
      return ((w.ruby && w.ruby.description) || []).map(r => `${txt.slice(r.start, r.end)}→${r.text}`);
    });
    /* 実際に画面に描かれている親文字とルビ */
    const drawn = () => page.evaluate(() => {
      const el = document.querySelector('#editHolder [data-item="description"]');
      if (!el) return null;
      return [...el.querySelectorAll('ruby')].map(r => {
        const rt = r.querySelector('rt');
        const base = [...r.childNodes].filter(n => n.nodeName !== 'RT').map(n => n.textContent).join('');
        return `${base}→${rt ? rt.textContent : ''}`;
      });
    });
    const ALL = ['桃山→ももやま', '金地→きんじ', '鷹匠→たかじょう'];

    await setup();
    await page.click('nav.tabs button[data-tab="layout"]');
    await page.waitForTimeout(250);
    await toDesc();
    await page.waitForTimeout(500);
    t.eq(await drawn(), ALL, '最初は狙った文字にルビが付いている');

    /* ===== 1. キャンバスで打ち込んでも、ルビが同じ文字に付いたまま ===== */
    await page.evaluate(async () => {
      startInlineEdit('description');
      await new Promise(r => setTimeout(r, 250));
      setCaretOffset(document.querySelector('#editHolder [data-item="description"]'), 0);
    });
    await page.keyboard.type('本作は', { delay: 60 });
    await page.waitForTimeout(300);
    await page.evaluate(() => finishInlineEdit());
    await page.waitForTimeout(600);
    t.eq(await page.evaluate(() => proj().works[0].description), '本作は' + BASE,
      '先頭に打ち込んだ文字が入る');
    t.eq(await pairs(), ALL, '先頭に打ち込んでもルビは同じ文字に付いたまま（これまではずれていた）');
    t.eq(await drawn(), ALL, '画面の表示も同じ文字に付いている');

    /* ===== 2. 消しても追いかける ===== */
    await page.evaluate(async () => {
      startInlineEdit('description');
      await new Promise(r => setTimeout(r, 250));
      setCaretOffset(document.querySelector('#editHolder [data-item="description"]'), 3);
    });
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(300);
    await page.evaluate(() => finishInlineEdit());
    await page.waitForTimeout(600);
    t.eq(await page.evaluate(() => proj().works[0].description), BASE, '打ち込んだ文字を消せる');
    t.eq(await pairs(), ALL, '消してもルビは同じ文字に付いたまま');

    /* ===== 3. 「作品の編集」ダイアログからの書き換えでも追いかける ===== */
    await setup();
    await page.click('nav.tabs button[data-tab="daicho"]');
    await page.waitForTimeout(400);
    const dlg = await page.evaluate(async (base) => {
      openWorkDialog(0);
      await new Promise(r => setTimeout(r, 300));
      document.getElementById('f_description').value = '本作は' + base;
      document.getElementById('btnSaveWork').click();
      await new Promise(r => setTimeout(r, 400));
      const w = proj().works[0], txt = w.description;
      return (w.ruby.description || []).map(r => `${txt.slice(r.start, r.end)}→${r.text}`);
    }, BASE);
    t.eq(dlg, ALL, '作品の編集ダイアログから書き換えてもルビは同じ文字に付いたまま');

    /* ===== 4. いろいろな編集のしかたを総当たりで ===== */
    const tryEdit = (newText) => page.evaluate(([base, ruby, nt]) => {
      const w = proj().works[0];
      w.description = base;
      w.ruby = { description: JSON.parse(JSON.stringify(ruby)) };
      setWorkText(w, 'description', nt);
      const txt = w.description;
      return ((w.ruby && w.ruby.description) || []).map(r => `${txt.slice(r.start, r.end)}→${r.text}`);
    }, [BASE, RUBY, newText]);

    t.eq(await tryEdit('桃山期のとても' + BASE.slice(4)), ALL, '中ほどに足しても付いたまま');
    t.eq(await tryEdit(BASE + '重要文化財。'), ALL, '末尾に足しても付いたまま');
    t.eq(await tryEdit(BASE.slice(0, 4) + '※' + BASE.slice(4)), ALL,
      'ルビのすぐ前に足しても、ルビが余計に伸びない');
    t.eq(await tryEdit(BASE.slice(0, 6) + '※' + BASE.slice(6)), ALL,
      'ルビのすぐ後ろに足しても、ルビが余計に伸びない');
    t.eq(await tryEdit(BASE.slice(0, 2) + BASE.slice(4)), ALL, '中ほどを消しても付いたまま');
    t.eq(await tryEdit(BASE.replace('屏風', '屏障')), ALL, '近くの語を言い換えても付いたまま');
    t.eq(await tryEdit(BASE), ALL, '編集しなければそのまま');
    t.eq(await tryEdit(BASE.slice(3)),
      ['金地→きんじ', '鷹匠→たかじょう'], '消した文字に付いていたルビだけが外れる');
    t.eq(await tryEdit(BASE.slice(0, 4) + BASE.slice(6)),
      ['桃山→ももやま', '鷹匠→たかじょう'], 'ルビの付いた語を丸ごと消すと、そのルビだけ外れる');
    t.eq(await tryEdit('まったく別の文章に差し替えた。'), [],
      '本文をそっくり差し替えたら、行き場の無いルビは残さない');

    /* ===== 5. 文字ごとの書式・縦中横も同じように追いかける ===== */
    const other = await page.evaluate(([base]) => {
      const w = proj().works[0];
      w.description = base;
      w.ruby = { description: [] };
      w.charFmt = { description: [{ start: 4, end: 6, ls: 0.2, size: 14 }] };
      w.tcy = { description: [{ start: 9, end: 11 }] };
      setWorkText(w, 'description', '本作は' + base);
      const txt = w.description;
      return {
        charFmt: (w.charFmt.description || []).map(r => txt.slice(r.start, r.end)),
        tcy: (w.tcy.description || []).map(r => txt.slice(r.start, r.end))
      };
    }, [BASE]);
    t.eq(other.charFmt, ['金地'], '文字ごとの書式（字間・大きさ）も同じ文字に付いたまま');
    t.eq(other.tcy, ['鷹匠'], '縦中横も同じ文字に付いたまま');

    /* ===== 6. 他の項目（作品名など）でも同じ ===== */
    const title = await page.evaluate(() => {
      const w = proj().works[0];
      w.title = '鷹匠図屏風';
      w.ruby = { title: [{ start: 0, end: 2, text: 'たかじょう' }] };
      setWorkText(w, 'title', '伝 鷹匠図屏風');
      return (w.ruby.title || []).map(r => `${w.title.slice(r.start, r.end)}→${r.text}`);
    });
    t.eq(title, ['鷹匠→たかじょう'], '作品名など他の項目でもルビが追いかける');

    /* ===== 7. 保存して読み直しても、そのまま ===== */
    await setup();
    await page.click('nav.tabs button[data-tab="layout"]');
    await page.waitForTimeout(250);
    await toDesc();
    await page.waitForTimeout(400);
    await page.evaluate(async () => {
      startInlineEdit('description');
      await new Promise(r => setTimeout(r, 250));
      setCaretOffset(document.querySelector('#editHolder [data-item="description"]'), 0);
    });
    await page.keyboard.type('本作は', { delay: 60 });
    await page.waitForTimeout(300);
    await page.evaluate(() => { finishInlineEdit(); flushSave(); });
    await page.waitForTimeout(500);
    await page.reload();
    await page.waitForTimeout(900);
    await page.click('nav.tabs button[data-tab="layout"]');
    await page.waitForTimeout(250);
    await toDesc();
    await page.waitForTimeout(600);
    t.eq(await pairs(), ALL, '読み直してもルビは同じ文字に付いたまま');
    t.eq(await drawn(), ALL, '読み直した画面の表示も同じ');

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
