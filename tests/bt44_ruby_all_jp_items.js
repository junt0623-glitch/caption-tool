// bt44【新機能】日本語の項目すべてにルビを振れるようにする（従来は作品名・キャッチコピー・解説文のみ）
const { openApp, mkRunner, chromium } = require('./helpers');

// 従来から対応していた項目と、今回追加になった項目
const OLD = ['title', 'catchcopy', 'description'];
const ADDED = ['no', 'yomigana', 'origin', 'period', 'collection'];
const EN = ['titleEn', 'originEn', 'periodEn', 'collectionEn'];

async function run() {
  const t = mkRunner('bt44 日本語の項目すべてにルビ');
  const browser = await chromium.launch();
  try {
    const { page, errors } = await openApp(browser, { waitTab: 'layout' });

    // ---- 対象キーの定義 ----
    const keys = await page.evaluate(() => ({
      ruby: RUBY_KEYS.slice(),
      jp: ITEMS.filter(i => i.group !== 'en').map(i => i.key),
      en: ITEMS.filter(i => i.group === 'en').map(i => i.key)
    }));
    keys.jp.forEach(k => t.ok(keys.ruby.includes(k), `日本語の項目「${k}」がルビの対象になっている`));
    keys.en.forEach(k => t.ok(!keys.ruby.includes(k), `英訳の項目「${k}」はルビの対象外のまま`));
    OLD.forEach(k => t.ok(keys.ruby.includes(k), `従来からの対象「${k}」が引き続きルビを振れる`));
    ADDED.forEach(k => t.ok(keys.ruby.includes(k), `新たに「${k}」にもルビを振れる`));

    // ---- 個別編集モードへ。全項目を表示し、値を入れておく ----
    await page.evaluate(() => {
      switchEditScope('one');
      const p = proj();
      Object.keys(p.style.show).forEach(k => p.style.show[k] = true);
      const w = p.works[previewIndex];
      w.no = '壱'; w.yomigana = 'かいとう'; w.title = '灰陶緑斑双耳壺';
      w.origin = '越前'; w.period = '漢代'; w.collection = '穴吹允氏寄贈';
      w.catchcopy = '緑の釉'; w.description = '灰陶に緑釉を掛けた壺である。';
      w.titleEn = 'Jar'; w.originEn = 'Echizen'; w.periodEn = 'Han'; w.collectionEn = 'Gift';
      save(); renderEditor();
    });
    await page.waitForTimeout(250);

    // ---- 各日本語項目にルビを入れると <ruby><rt> が描画される ----
    for (const key of keys.jp) {
      const r = await page.evaluate((k) => {
        const p = proj(), w = p.works[previewIndex];
        const mode = (k === 'description') ? 'desc' : 'cap';
        if (typeof setMode === 'function') { /* モード切替はUI経由で行う */ }
        w.ruby = w.ruby || {};
        w.ruby[k] = [{ start: 0, end: 1, text: 'よ' }];
        save(); renderEditor();
        const el = document.querySelector(`#editHolder [data-item="${k}"]`);
        const rt = el && el.querySelector('rt');
        return { present: !!el, rt: rt ? rt.textContent : null, mode };
      }, key);
      if (key === 'description') continue; // 解説面は下で別に確認する
      t.eq(r.present, true, `キャプション面に「${key}」が描画されている（前提確認）`);
      t.eq(r.rt, 'よ', `「${key}」にルビが表示される`);
    }

    // ---- 解説面の解説文でも従来どおり動く ----
    await page.click('[data-mode="desc"]');
    await page.waitForTimeout(300);
    const desc = await page.evaluate(() => {
      const el = document.querySelector('#editHolder [data-item="description"]');
      const rt = el && el.querySelector('rt');
      return rt ? rt.textContent : null;
    });
    t.eq(desc, 'よ', '解説文のルビは従来どおり表示される');
    await page.click('[data-mode="cap"]');
    await page.waitForTimeout(300);

    // ---- ルビ入力欄が、日本語の項目では出て英訳の項目では出ない ----
    async function openRubyRow(key) {
      return page.evaluate((k) => {
        startInlineEdit(k);
        const el = document.querySelector(`#editHolder [data-item="${k}"]`);
        if (!el) return { ok: false };
        const range = document.createRange();
        const tn = document.createTreeWalker(el, NodeFilter.SHOW_TEXT).nextNode();
        if (!tn || !tn.textContent.length) return { ok: false };
        range.setStart(tn, 0); range.setEnd(tn, 1);
        const s = getSelection(); s.removeAllRanges(); s.addRange(range);
        document.dispatchEvent(new Event('selectionchange'));
        const row = document.getElementById('csRubyRow');
        const btns = document.getElementById('csRubyBtns');
        return { ok: true, row: row.style.display, btns: btns.style.display };
      }, key);
    }
    for (const key of ['title', 'origin', 'period', 'collection']) {
      const r = await openRubyRow(key);
      await page.evaluate(() => finishInlineEdit());
      await page.waitForTimeout(120);
      t.eq(r.ok && r.row !== 'none', true, `「${key}」を編集して文字を選ぶとルビ入力欄が出る`);
      t.eq(r.ok && r.btns !== 'none', true, `「${key}」でルビの適用・解除ボタンが出る`);
    }
    for (const key of EN) {
      const r = await openRubyRow(key);
      await page.evaluate(() => finishInlineEdit());
      await page.waitForTimeout(120);
      t.eq(r.ok && r.row, 'none', `英訳の「${key}」ではルビ入力欄が出ない`);
    }

    // ---- ルビ入力欄から実際に適用・解除できる ----
    await page.evaluate(() => {
      const w = proj().works[previewIndex];
      w.ruby = {}; save(); renderEditor();
    });
    await page.waitForTimeout(200);
    const applied = await page.evaluate(() => {
      startInlineEdit('origin');
      const el = document.querySelector('#editHolder [data-item="origin"]');
      const tn = document.createTreeWalker(el, NodeFilter.SHOW_TEXT).nextNode();
      const range = document.createRange();
      range.setStart(tn, 0); range.setEnd(tn, 2);
      const s = getSelection(); s.removeAllRanges(); s.addRange(range);
      document.dispatchEvent(new Event('selectionchange'));
      document.getElementById('rubyText').value = 'えち ぜん';
      document.getElementById('rubyApply').click();
      const w = proj().works[previewIndex];
      const el2 = document.querySelector('#editHolder [data-item="origin"]');
      return {
        saved: JSON.stringify(w.ruby.origin || []),
        rts: [...el2.querySelectorAll('rt')].map(r => r.textContent)
      };
    });
    await page.waitForTimeout(200);
    t.ok(applied.saved.includes('えち ぜん'), `「産地（作者）」のルビが作品データに保存される（${applied.saved}）`);
    t.eq(applied.rts.join('|'), 'えち|ぜん', 'スペース区切りで1文字ずつのモノルビになる');

    const removed = await page.evaluate(() => {
      startInlineEdit('origin');
      const el = document.querySelector('#editHolder [data-item="origin"]');
      const tn = document.createTreeWalker(el, NodeFilter.SHOW_TEXT).nextNode();
      const range = document.createRange();
      range.setStart(tn, 0); range.setEnd(tn, 2);
      const s = getSelection(); s.removeAllRanges(); s.addRange(range);
      document.dispatchEvent(new Event('selectionchange'));
      document.getElementById('rubyRemove').click();
      const el2 = document.querySelector('#editHolder [data-item="origin"]');
      return { count: (proj().works[previewIndex].ruby.origin || []).length, rts: el2.querySelectorAll('rt').length };
    });
    await page.waitForTimeout(200);
    t.eq(removed.count, 0, '「ルビ解除」で産地のルビが消える');
    t.eq(removed.rts, 0, 'ルビ解除後は<rt>が描画されない');

    // ---- 保存され、再読込しても残る ----
    await page.evaluate(() => {
      const w = proj().works[previewIndex];
      w.ruby = { period: [{ start: 0, end: 2, text: 'かんだい' }] };
      save(); renderEditor();
    });
    await page.waitForTimeout(200);
    await page.reload();
    await page.waitForTimeout(700);
    await page.click('nav.tabs button[data-tab="layout"]');   // 再読込直後は既定のタブに戻るため
    await page.waitForTimeout(300);
    await page.evaluate(() => { switchEditScope('one'); });   // 編集範囲もマスターに戻る
    await page.waitForTimeout(300);
    const persisted = await page.evaluate(() => {
      const el = document.querySelector('#editHolder [data-item="period"]');
      const rt = el && el.querySelector('rt');
      return { rt: rt ? rt.textContent : null, saved: (proj().works[previewIndex].ruby.period || []).length };
    });
    t.eq(persisted.saved, 1, '時代のルビが保存され、再読込後も残っている');
    t.eq(persisted.rt, 'かんだい', '再読込後も時代のルビが描画される');

    // ---- 印刷プレビューにも出る ----
    await page.click('nav.tabs button[data-tab="print"]');
    await page.waitForTimeout(600);
    const printed = await page.evaluate(() => {
      const el = document.querySelector('#sheetScroll .cap-card [data-item="period"]');
      const rt = el && el.querySelector('rt');
      return rt ? rt.textContent : null;
    });
    t.eq(printed, 'かんだい', '印刷プレビューでも時代のルビが出る');

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
