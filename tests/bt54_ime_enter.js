// bt54【不具合修正】ひらがなの変換確定のEnterで、ルビ入力が終了してしまう
//   変換中（下線が出ている状態）のEnterは「変換の確定」であって「入力の終了」ではない。
const { openApp, mkRunner, chromium } = require('./helpers');

async function run() {
  const t = mkRunner('bt54 変換確定のEnterでルビが終了しない');
  const browser = await chromium.launch();
  try {
    const { page, errors } = await openApp(browser, { waitTab: 'layout' });

    await page.evaluate(() => {
      switchEditScope('one');
      const w = proj().works[previewIndex];
      w.title = '東海道五十三次'; w.ruby = {}; save(); renderEditor();
    });
    await page.waitForTimeout(300);

    /* 文字を選んでルビ欄を出す */
    const openRuby = (from, to) => page.evaluate(([a, b]) => {
      startInlineEdit('title');
      const el = document.querySelector('#editHolder [data-item="title"]');
      const tn = document.createTreeWalker(el, NodeFilter.SHOW_TEXT).nextNode();
      const r = document.createRange(); r.setStart(tn, a); r.setEnd(tn, b);
      const s = getSelection(); s.removeAllRanges(); s.addRange(r);
      document.dispatchEvent(new Event('selectionchange'));
    }, [from, to]);

    /* 日本語入力の一連のイベントを再現する。
       ブラウザによって compositionend と keydown の前後が入れ替わるので両方を試す */
    const typeAndConvert = (text, order) => page.evaluate(([txt, ord]) => {
      const box = document.getElementById('rubyText');
      box.focus();
      box.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
      box.value = txt;
      box.dispatchEvent(new CompositionEvent('compositionupdate', { bubbles: true, data: txt }));
      const enter = (composing) => {
        const ev = new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true, cancelable: true });
        Object.defineProperty(ev, 'isComposing', { get: () => composing });
        box.dispatchEvent(ev);
      };
      const end = () => box.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: txt }));
      // A: 確定のkeydownに isComposing が立つ（Windows/Chrome など）
      // B: compositionend が先に来て keydown では落ちている（一部のIME）
      if (ord === 'A') { enter(true); end(); } else { end(); enter(false); }
      box.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }));
      return {
        popoverOpen: document.getElementById('charSpacingPopover').classList.contains('show'),
        stillEditing: !!inlineEditKey,
        boxValue: box.value,
        focused: document.activeElement === box,
        saved: JSON.stringify((proj().works[previewIndex].ruby || {}).title || [])
      };
    }, [text, order]);

    for (const ord of ['A', 'B']) {
      await openRuby(0, 3);
      await page.waitForTimeout(200);
      const r = await typeAndConvert('とうかいどう', ord);
      const label = ord === 'A' ? '確定のkeydownに変換中の印が付く場合' : 'compositionendが先に来る場合';
      t.eq(r.popoverOpen, true, `${label}：変換確定のEnterでルビ欄が閉じない`);
      t.eq(r.stillEditing, true, `${label}：文字の編集も続いたまま`);
      t.eq(r.focused, true, `${label}：入力欄からフォーカスが外れない`);
      t.eq(r.boxValue, 'とうかいどう', `${label}：打ち込んだ読みが残る`);
      t.eq(r.saved, '[]', `${label}：この時点ではまだルビを確定しない`);
      await page.evaluate(() => { finishInlineEdit(); });
      await page.waitForTimeout(150);
    }

    /* 変換を終えたあとのEnterで、はじめてルビが確定して終了する */
    await openRuby(0, 3);
    await page.waitForTimeout(200);
    await typeAndConvert('とうかいどう', 'A');
    const applied = await page.evaluate(() => {
      const box = document.getElementById('rubyText');
      // 変換は終わっている。あらためてEnterを押す
      box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true, cancelable: true }));
      const w = proj().works[previewIndex];
      return {
        saved: (w.ruby.title || []).map(r => `${r.start}-${r.end}:${r.text}`),
        popoverOpen: document.getElementById('charSpacingPopover').classList.contains('show')
      };
    });
    t.eq(applied.saved, ['0-3:とうかいどう'], '変換確定のあとのEnterでルビが振られる');
    t.eq(applied.popoverOpen, false, 'そのEnterでルビ欄が閉じる');

    /* 変換を挟まずに直接Enterを押したときも従来どおり効く（英数字の読みなど） */
    await page.evaluate(() => { const w = proj().works[previewIndex]; w.ruby = {}; save(); renderEditor(); });
    await page.waitForTimeout(200);
    await openRuby(3, 5);
    await page.waitForTimeout(200);
    const plain = await page.evaluate(() => {
      const box = document.getElementById('rubyText');
      box.focus(); box.value = 'ごじゅう';
      box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true, cancelable: true }));
      return (proj().works[previewIndex].ruby.title || []).map(r => r.text);
    });
    t.eq(plain, ['ごじゅう'], '変換を挟まないEnterは従来どおりルビを確定する');

    /* 変換中のEscapeは「変換の取り消し」。文字の編集や選択まで終わらせない */
    await page.evaluate(() => { const w = proj().works[previewIndex]; w.ruby = {}; save(); renderEditor(); });
    await page.waitForTimeout(200);
    const esc = await page.evaluate(() => {
      startInlineEdit('title');
      const el = document.querySelector('#editHolder [data-item="title"]');
      el.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
      const ev = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
      Object.defineProperty(ev, 'isComposing', { get: () => true });
      el.dispatchEvent(ev);
      const during = !!inlineEditKey;
      el.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
      el.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', bubbles: true }));
      return { during };
    });
    t.eq(esc.during, true, '変換中のEscapeで文字の編集が終わらない');

    const escAfter = await page.evaluate(async () => {
      const el = document.querySelector('#editHolder [data-item="title"]');
      await new Promise(r => setTimeout(r, 600));   // 変換終了からの猶予を過ぎさせる
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      await new Promise(r => setTimeout(r, 200));
      return !!inlineEditKey;
    });
    t.eq(escAfter, false, '変換中でないEscapeは従来どおり編集を終える');

    /* 選択解除のEscapeも、変換中は効かない */
    const selEsc = await page.evaluate(() => {
      finishInlineEdit();
      sel.clear(); sel.add('title'); sel.add('origin'); updateSelUI();
      const el = document.getElementById('f_title') || document.body;
      el.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
      const ev = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
      Object.defineProperty(ev, 'isComposing', { get: () => true });
      window.dispatchEvent(ev);
      const during = sel.size;
      document.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
      window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', bubbles: true }));
      return during;
    });
    t.eq(selEsc, 2, '変換中のEscapeで項目の選択まで解除しない');

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
