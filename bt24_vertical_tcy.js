// bt24【新機能・第4段階】縦書きモード：縦中横（数字の自動結合＋英字混在部分の手動指定）
const { openApp, mkRunner, chromium } = require('./helpers');

// DOM構造が複数ノード（テキストノード＋span.tcyなど）に分かれていても、絶対文字位置からRangeを組み立てる
async function installRangeHelpers(page) {
  await page.evaluate(() => {
    window.rangeFromOffsets = function (el, start, end) {
      const range = document.createRange();
      let pos = 0, startSet = false, endSet = false;
      (function walk(node) {
        if (endSet) return;
        if (node.nodeType === Node.TEXT_NODE) {
          const len = node.textContent.length;
          if (!startSet && pos + len >= start) { range.setStart(node, start - pos); startSet = true; }
          if (!endSet && pos + len >= end) { range.setEnd(node, end - pos); endSet = true; return; }
          pos += len;
        } else if (node.nodeName === 'BR') {
          pos += 1;
        } else {
          for (const c of node.childNodes) { walk(c); if (endSet) return; }
        }
      })(el);
      return range;
    };
    window.selectOffsets = function (el, start, end) {
      const range = window.rangeFromOffsets(el, start, end);
      const sel = getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    };
  });
}

async function run() {
  const t = mkRunner('bt24 縦書きモード（第4段階：縦中横）');
  const browser = await chromium.launch();
  try {
    const { page, errors } = await openApp(browser, { waitTab: 'layout' });
    await installRangeHelpers(page);

    const rowHiddenBefore = await page.evaluate(() => getComputedStyle(document.getElementById('stTcyDigitsRow')).display === 'none');
    t.eq(rowHiddenBefore, true, '縦書きOFFの間は数字自動縦中横のチェックボックスが非表示');

    await page.click('#stVertical');
    await page.waitForTimeout(200);
    const rowInfo = await page.evaluate(() => ({
      visible: getComputedStyle(document.getElementById('stTcyDigitsRow')).display !== 'none',
      checked: document.getElementById('stTcyDigits').checked,
      styleValue: proj().style.tcyDigits,
    }));
    t.eq(rowInfo.visible, true, '縦書きONで数字自動縦中横のチェックボックスが表示される');
    t.eq(rowInfo.checked, true, '数字自動縦中横は既定でON');
    t.eq(rowInfo.styleValue, true, 'style.tcyDigitsの既定値はtrue');

    // チェックボックスのUI動作そのものはマスターモード内で確認する（この設定パネルは体裁全体が個別編集モードでロックされる仕様のため）
    await page.click('#stTcyDigits');
    await page.waitForTimeout(150);
    const uiToggleOff = await page.evaluate(() => proj().style.tcyDigits);
    t.eq(uiToggleOff, false, 'チェックボックスをクリックするとstyle.tcyDigitsがfalseになる');
    await page.click('#stTcyDigits');
    await page.waitForTimeout(150);
    const uiToggleOn = await page.evaluate(() => proj().style.tcyDigits);
    t.eq(uiToggleOn, true, '再度クリックするとstyle.tcyDigitsがtrueに戻る');

    await page.evaluate(() => {
      const p = proj();
      p.works.push({ title: '寛永18年ABC作12345番', origin: '', period: '', collection: '' });
      save();
    });
    await page.click('#emodeOne');
    await page.waitForTimeout(150);
    await page.evaluate(() => { previewIndex = proj().works.length - 1; applyEditScope(); refreshLayoutControls(); renderEditor(); });
    await page.waitForTimeout(200);

    const autoDigits = await page.evaluate(() => {
      const el = document.querySelector('#editHolder [data-item="title"]');
      return [...el.querySelectorAll('.tcy')].map(s => s.textContent);
    });
    t.ok(autoDigits.includes('18'), '2桁の数字「18」が自動でspan.tcyとして結合される（実際: ' + JSON.stringify(autoDigits) + '）');
    t.ok(!autoDigits.includes('12345'), '5桁の数字「12345」は自動結合の対象外（4桁を超えるため）');

    const tcySpanStyle = await page.evaluate(() => {
      const el = document.querySelector('#editHolder [data-item="title"]');
      const span = [...el.querySelectorAll('.tcy')].find(s => s.textContent === '18');
      return span ? getComputedStyle(span).textCombineUpright : null;
    });
    t.eq(tcySpanStyle, 'all', '自動結合されたspan.tcyにtext-combine-upright:allが適用される');

    // 個別編集モードでは体裁パネル（チェックボックスUI）自体がロックされるため、ここではstyle値を直接変更して
    // 「OFF時に自動結合が解除される」ことをレンダリング結果で確認する（クリックではなく状態変更で検証）
    await page.evaluate(() => { proj().style.tcyDigits = false; save(); renderEditor(); });
    await page.waitForTimeout(200);
    const afterDigitsOff = await page.evaluate(() => {
      const el = document.querySelector('#editHolder [data-item="title"]');
      return [...el.querySelectorAll('.tcy')].map(s => s.textContent);
    });
    t.ok(!afterDigitsOff.includes('18'), '数字自動縦中横をOFFにすると「18」の自動結合が解除される');

    await page.evaluate(() => { proj().style.tcyDigits = true; save(); renderEditor(); });
    await page.waitForTimeout(200);

    await page.evaluate(() => startInlineEdit('title'));
    await page.waitForTimeout(150);
    await page.evaluate(() => selectOffsets(document.querySelector('#editHolder [data-item="title"]'), 5, 8));
    await page.waitForTimeout(150);
    const popoverState = await page.evaluate(() => ({
      tcyRowVisible: getComputedStyle(document.getElementById('csTcyRow')).display !== 'none',
      btnLabel: document.getElementById('csTcyToggle').textContent,
      selStart: charSel ? charSel.start : null,
      selEnd: charSel ? charSel.end : null,
      selectedText: getSelection().toString(),
    }));
    t.eq(popoverState.tcyRowVisible, true, '縦書き和文項目の選択時、縦中横トグルが表示される');
    t.eq(popoverState.selectedText, 'ABC', '選択したテキストが「ABC」になっている（前提確認）');
    t.eq(popoverState.btnLabel, '縦中横にする', '未設定の選択範囲ではボタンが「縦中横にする」表示');
    t.eq(popoverState.selStart, 5, '選択開始位置が正しく取得される');
    t.eq(popoverState.selEnd, 8, '選択終了位置が正しく取得される');

    await page.click('#csTcyToggle');
    await page.waitForTimeout(200);
    const afterApply = await page.evaluate(() => {
      const w = proj().works[previewIndex];
      const el = document.querySelector('#editHolder [data-item="title"]');
      const span = [...el.querySelectorAll('.tcy')].find(s => s.textContent === 'ABC');
      return { savedRange: w.tcy && w.tcy.title, found: !!span, combine: span ? getComputedStyle(span).textCombineUpright : null };
    });
    t.eq(afterApply.savedRange, [{ start: 5, end: 8 }], 'work.tcy.title に選択範囲(5-8)が保存される');
    t.eq(afterApply.found, true, '再描画後、ABC部分がspan.tcyとして描画される');
    t.eq(afterApply.combine, 'all', 'span.tcyにtext-combine-upright:allが適用される');

    await page.evaluate(() => startInlineEdit('title'));
    await page.waitForTimeout(150);
    await page.evaluate(() => selectOffsets(document.querySelector('#editHolder [data-item="title"]'), 5, 8));
    await page.waitForTimeout(150);
    const state2 = await page.evaluate(() => ({
      btnLabel: document.getElementById('csTcyToggle').textContent,
      selectedText: getSelection().toString(),
    }));
    t.eq(state2.selectedText, 'ABC', '編集モード再突入後も同じ範囲(5-8)がABCとして選択できる');
    t.eq(state2.btnLabel, '縦中横を解除', '既に縦中横が設定された範囲を再選択すると「縦中横を解除」表示になる');

    await page.click('#csTcyToggle');
    await page.waitForTimeout(200);
    const afterRemove = await page.evaluate(() => {
      const w = proj().works[previewIndex];
      const el = document.querySelector('#editHolder [data-item="title"]');
      return { savedRange: (w.tcy && w.tcy.title) || [], found: [...el.querySelectorAll('.tcy')].some(s => s.textContent === 'ABC') };
    });
    t.eq(afterRemove.savedRange, [], 'もう一度トグルするとwork.tcy.titleから範囲が削除される');
    t.eq(afterRemove.found, false, '再描画後、ABC部分のspan.tcyが無くなる');

    await page.evaluate(() => { proj().style.show.titleEn = true; proj().works[previewIndex].titleEn = 'Test Work'; save(); renderEditor(); });
    await page.waitForTimeout(150);
    await page.evaluate(() => startInlineEdit('titleEn'));
    await page.waitForTimeout(150);
    await page.evaluate(() => selectOffsets(document.querySelector('#editHolder [data-item="titleEn"]'), 0, 4));
    await page.waitForTimeout(150);
    const enTcyHidden = await page.evaluate(() => getComputedStyle(document.getElementById('csTcyRow')).display === 'none');
    t.eq(enTcyHidden, true, '英字項目（横書き固定）では縦中横トグルが表示されない');

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
