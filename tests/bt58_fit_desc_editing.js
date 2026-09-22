// bt58【不具合修正】枠に収めた解説文が、編集を始めた途端に組み直されて枠からあふれる
//   編集に入ると枠へ収めるための自動調整（字間・長体）が外れ、さらに打った文字だけ
//   分かち書きにならないため、行の折り返しが変わって別物の組みになっていた。
//   編集中も確定表示とまったく同じ組み・同じ収め方で扱う。
const { openApp, mkRunner, chromium } = require('./helpers');

async function run() {
  const t = mkRunner('bt58 枠に収めた解説文の編集');
  const browser = await chromium.launch();
  try {
    const { page, errors } = await openApp(browser, { waitTab: 'daicho' });

    const setup = (rep) => page.evaluate((n) => {
      const p = proj();
      p.works = [];
      const w = newWork();
      w.no = '1'; w.title = '鷹匠図屏風';
      w.description = '桃山期の金地屏風。鷹匠の姿を大画面に配する。'.repeat(n);
      p.works.push(w);
      p.style.show.desc = true;
      save(); renderAll();
    }, rep);

    const toDesc = () => page.evaluate(() => {
      editMode = 'desc';
      document.querySelectorAll('.mode-sw button').forEach(b => b.classList.toggle('on', b.dataset.mode === 'desc'));
      switchEditScope('one'); previewIndex = 0; userZoom = 1;
      applyEditScope(); refreshLayoutControls(); renderEditor();
    });

    /* 解説文の「組み」をひとまとめに測る。
       枠に収まっているか・どんな倍率で収めたか・何行で組まれているか */
    const shape = () => page.evaluate(() => {
      const el = document.querySelector('#editHolder [data-item="description"]');
      if (!el) return null;
      const cs = getComputedStyle(el);
      return {
        width: el.style.width, transform: el.style.transform, ls: el.style.letterSpacing,
        lineHeight: cs.lineHeight,
        over: el.scrollHeight - el.clientHeight,
        lines: Math.round(el.scrollHeight / parseFloat(cs.lineHeight)),
        warn: document.getElementById('overflowWarn').classList.contains('show')
      };
    });
    const same = (a, b) => a && b &&
      a.width === b.width && a.transform === b.transform && a.ls === b.ls &&
      a.lineHeight === b.lineHeight && a.lines === b.lines && a.over === b.over;

    /* ===== 1. 収まりきらない長さ：編集を始めても組みが変わらない ===== */
    await setup(14);
    await page.click('nav.tabs button[data-tab="layout"]');
    await page.waitForTimeout(300);
    await toDesc();
    await page.waitForTimeout(700);

    const shown = await shape();
    t.ok(shown.transform.includes('0.95') || shown.ls === '-0.05em',
      `枠に収めるための自動調整がかかっている（${shown.transform} / 字間${shown.ls}）`);
    t.eq(shown.warn, true, 'それでも収まらないときは「札からはみ出しています」と知らせる');

    await page.evaluate(() => startInlineEdit('description'));
    await page.waitForTimeout(400);
    const editing = await shape();
    t.ok(same(shown, editing),
      `編集を始めても組みが変わらない（表示 ${shown.lines}行/はみ出し${shown.over}px → 編集 ${editing.lines}行/はみ出し${editing.over}px）`);
    t.eq(editing.transform, shown.transform, '収めるための倍率が編集中も外れない');
    t.eq(editing.ls, shown.ls, '収めるための字間も編集中そのまま');
    t.eq(editing.lines, shown.lines, '行の折り返しも変わらない');

    await page.evaluate(() => finishInlineEdit());
    await page.waitForTimeout(600);
    const after = await shape();
    t.ok(same(shown, after), '編集を終えても元の組みのまま');

    /* ===== 2. 打ち込んでいる間も、確定後と同じ組みで枠に収め続ける ===== */
    await setup(8);
    await page.waitForTimeout(300);
    await toDesc();
    await page.waitForTimeout(700);
    const before = await page.evaluate(() => proj().works[0].description);
    t.eq((await shape()).over, 0, '短めの文は枠に収まっている');

    await page.evaluate(() => {
      startInlineEdit('description');
      const el = document.querySelector('#editHolder [data-item="description"]');
      const r = document.createRange(); r.selectNodeContents(el); r.collapse(false);
      const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    });
    await page.waitForTimeout(300);

    const ADD = '近世初期の障壁画を代表する優品である。';
    const steps = [];
    for (let i = 0; i < 5; i++) {
      await page.keyboard.type(ADD);
      await page.waitForTimeout(250);
      steps.push(await shape());
    }
    t.ok(steps[0].ls !== '0em' || steps[1].transform.includes('0.95'),
      `打ち足すと自動で詰めて枠に収めようとする（${steps[0].ls} → ${steps[1].transform}）`);
    t.ok(steps.every((s, i) => i === 0 || s.over >= steps[i - 1].over),
      '打ち足したぶんだけ素直に伸びる（組みが暴れない）');

    const whileTyping = steps[steps.length - 1];
    await page.evaluate(() => finishInlineEdit());
    await page.waitForTimeout(700);
    const finished = await shape();
    t.ok(same(whileTyping, finished),
      `編集を終えた瞬間に組みが変わらない（打ち込み中 ${whileTyping.lines}行/はみ出し${whileTyping.over}px → 確定後 ${finished.lines}行/はみ出し${finished.over}px）`);

    // 打った文字がそのまま入っている（組み直しで消えたり重複したりしない）
    const saved = await page.evaluate(() => proj().works[0].description);
    t.eq(saved, before + ADD.repeat(5), '打ち込んだ文字がそのまま保存される（重複も欠落もしない）');

    /* ===== 3. 読み直しても、収めた状態で再開できる ===== */
    await page.evaluate(() => flushSave());
    await page.reload();
    await page.waitForTimeout(900);
    await page.click('nav.tabs button[data-tab="layout"]');
    await page.waitForTimeout(300);
    await toDesc();
    await page.waitForTimeout(700);
    const reloaded = await shape();
    t.ok(same(finished, reloaded), '読み直しても同じ組みで再開する');

    await page.evaluate(() => startInlineEdit('description'));
    await page.waitForTimeout(400);
    t.ok(same(reloaded, await shape()), '読み直したあとに編集を始めても組みが変わらない');
    await page.evaluate(() => finishInlineEdit());
    await page.waitForTimeout(500);

    /* ===== 4. 変換中は組み直さない（入力の邪魔をしない） ===== */
    const ime = await page.evaluate(async () => {
      startInlineEdit('description');
      await new Promise(r => setTimeout(r, 200));
      const el = document.querySelector('#editHolder [data-item="description"]');
      const snap = () => el.style.transform + '|' + el.style.letterSpacing + '|' + el.innerText.length;
      const s0 = snap();
      el.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
      el.dispatchEvent(new Event('input', { bubbles: true }));   // 変換中の入力
      const during = snap();
      el.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '' }));
      await new Promise(r => setTimeout(r, 150));
      return { s0, during, still: !!inlineEditKey };
    });
    t.eq(ime.during, ime.s0, '変換中は組み直さない（変換候補の表示を邪魔しない）');
    t.eq(ime.still, true, '変換を確定しても編集は続いたまま');
    await page.evaluate(() => finishInlineEdit());
    await page.waitForTimeout(400);

    /* ===== 5. キャプション面の項目は、これまでどおりの編集のまま ===== */
    await page.evaluate(() => {
      editMode = 'cap';
      document.querySelectorAll('.mode-sw button').forEach(b => b.classList.toggle('on', b.dataset.mode === 'cap'));
      applyEditScope(); refreshLayoutControls(); renderEditor();
    });
    await page.waitForTimeout(500);
    const capEdit = await page.evaluate(async () => {
      startInlineEdit('title');
      await new Promise(r => setTimeout(r, 200));
      const el = document.querySelector('#editHolder [data-item="title"]');
      const r2 = document.createRange(); r2.selectNodeContents(el); r2.collapse(false);
      const s = getSelection(); s.removeAllRanges(); s.addRange(r2);
      document.execCommand('insertText', false, '（右隻）');
      await new Promise(r => setTimeout(r, 200));
      const text = el.innerText;
      finishInlineEdit();
      await new Promise(r => setTimeout(r, 400));
      return { text, saved: proj().works[0].title, hasFit: !!document.querySelector('#editHolder .fit-desc') };
    });
    t.eq(capEdit.saved, '鷹匠図屏風（右隻）', 'キャプション面の文字編集はこれまでどおり効く');
    t.eq(capEdit.hasFit, false, 'キャプション面には枠へ収める自動調整の対象が無い');

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
