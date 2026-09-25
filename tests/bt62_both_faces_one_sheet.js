// bt62【新機能】1作品のキャプションと解説を、用紙1枚にまとめて印刷する
//   縦並び・横並びのうち大きく置けるほうを選び、用紙に収まらないときだけ
//   両方を同じ比率で縮める（原寸より大きくはしない）。
const { openApp, mkRunner, chromium } = require('./helpers');

async function run() {
  const t = mkRunner('bt62 キャプション＋解説を1枚に');
  const browser = await chromium.launch();
  try {
    const { page, errors } = await openApp(browser, { waitTab: 'daicho' });
    page.on('dialog', d => d.accept());

    const setup = (cw, ch, dw, dh, face) => page.evaluate(([a, b, c, d, f]) => {
      const p = proj();
      p.works = [];
      for (let i = 1; i <= 3; i++) {
        const w = newWork();
        w.no = String(i); w.title = '鷹匠図屏風' + i; w.origin = '狩野派';
        w.period = '桃山時代'; w.collection = '当館蔵';
        w.description = '桃山期の金地屏風。鷹匠の姿を大画面に配する。'.repeat(3);
        p.works.push(w);
      }
      p.size = { preset: 'custom', w: a, h: b };
      p.descSize = { w: c, h: d };
      p.style.show.desc = true;
      p.printOpt = Object.assign({ mode: 'impose', border: true, section: '', tight: false },
        p.printOpt, { face: f, outline: false, sheetKind: 'a4' });   // 用紙は毎回A4に戻す
      save(); renderAll();
    }, [cw, ch, dw, dh, face]);

    /* 用紙の中での位置と大きさを mm で測る */
    const info = () => page.evaluate(() => {
      const sheets = [...document.querySelectorAll('#sheetScroll .sheet')];
      const s0 = sheets[0];
      if (!s0) return { sheets: 0 };
      const sr = s0.getBoundingClientRect();
      const S = sr.width / parseFloat(s0.style.width);
      const mm = r => ({ x: +((r.left - sr.left) / S).toFixed(1), y: +((r.top - sr.top) / S).toFixed(1),
                         w: +(r.width / S).toFixed(1), h: +(r.height / S).toFixed(1) });
      const cards = [...s0.querySelectorAll('.cap-card')];
      return {
        sheets: sheets.length,
        sheetW: parseFloat(s0.style.width), sheetH: parseFloat(s0.style.height),
        wraps: s0.querySelectorAll('.pair-wrap').length,
        scale: lastBothScale,
        cards: cards.map(c => mm(c.getBoundingClientRect())),
        inside: cards.every(c => {
          const r = c.getBoundingClientRect();
          return r.left >= sr.left - 1 && r.top >= sr.top - 1 &&
                 r.right <= sr.right + 1 && r.bottom <= sr.bottom + 1;
        }),
        note: document.getElementById('bothFitNote').textContent
      };
    });

    /* ===== 1. 印刷タブで選べる ===== */
    await setup(140, 100, 140, 100, 'cap');
    await page.click('nav.tabs button[data-tab="print"]');
    await page.waitForTimeout(800);
    const ui = await page.evaluate(() => ({
      opts: [...document.querySelectorAll('input[name=printFace]')].map(r => r.value),
      noteHidden: getComputedStyle(document.getElementById('bothFaceNote')).display === 'none',
      modeOn: getComputedStyle(document.getElementById('printModeRow')).pointerEvents
    }));
    t.eq(ui.opts, ['cap', 'desc', 'both'], '「印刷する面」に3つめの選択肢がある');
    t.eq(ui.noteHidden, true, '選んでいないうちは説明を出さない');
    t.eq(ui.modeOn, 'auto', 'ふつうの面では「配置」を選べる');

    await page.evaluate(() => {
      const r = document.querySelector('input[name=printFace][value="both"]');
      r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.waitForTimeout(800);
    const uiBoth = await page.evaluate(() => ({
      note: document.getElementById('bothFaceNote').textContent,
      noteShown: getComputedStyle(document.getElementById('bothFaceNote')).display !== 'none',
      mode: getComputedStyle(document.getElementById('printModeRow')).pointerEvents,
      tight: getComputedStyle(document.getElementById('tightRow')).pointerEvents,
      saved: proj().printOpt.face
    }));
    t.eq(uiBoth.noteShown, true, '選ぶと説明が出る');
    t.ok(uiBoth.note.includes('自動的に縮め'), '収まらないときだけ縮めると説明する');
    t.eq(uiBoth.saved, 'both', '選択が設定に保存される');
    t.eq([uiBoth.mode, uiBoth.tight], ['none', 'none'],
      'この面では使わない「配置」「詰め方」は触れないようにする');

    /* ===== 2. 1作品につき1枚、キャプションと解説が並ぶ ===== */
    const a = await info();
    t.eq(a.sheets, 3, '3作品なら用紙3枚（1作品につき1枚）');
    t.eq(a.wraps, 1, '1枚に1組だけ置く');
    t.eq(a.cards.length, 2, '1枚にキャプションと解説の2枚が入る');
    t.eq(a.scale, 1, '余裕があるときは縮めない（原寸のまま）');
    t.eq([a.cards[0].w, a.cards[0].h], [140, 100], 'キャプションは原寸のまま');
    t.eq([a.cards[1].w, a.cards[1].h], [140, 100], '解説も原寸のまま');
    t.eq(a.cards[0].x, a.cards[1].x, '縦並びのときは左右がそろう');
    t.ok(a.cards[1].y > a.cards[0].y, 'キャプションが上、解説が下');
    t.eq(+(a.cards[1].y - (a.cards[0].y + a.cards[0].h)).toFixed(1), 6, '2枚のあいだに6mmの間隔をとる');
    t.ok(Math.abs((a.sheetW - a.cards[0].w) / 2 - a.cards[0].x) < 0.6,
      `用紙の左右中央に置かれる（左${a.cards[0].x}mm）`);
    t.eq(a.inside, true, '用紙からはみ出さない');
    t.ok(a.note.includes('原寸のまま'), `原寸で収まったことを知らせる（${a.note}）`);

    /* ===== 3. 大きすぎるときは同じ比率で縮めて収める ===== */
    await setup(200, 160, 200, 180, 'both');
    await page.evaluate(() => renderSheets());
    await page.waitForTimeout(800);
    const b = await info();
    t.ok(b.scale < 1, `収まらないときは縮める（倍率 ${b.scale.toFixed(3)}）`);
    t.eq(b.inside, true, '縮めたうえで用紙に収まる');
    t.eq(b.cards.length, 2, '縮めても2枚とも残る');
    // 2枚が同じ比率で縮んでいる（元の比のまま）
    const rw = b.cards[0].w / b.cards[1].w, rh = b.cards[0].h / b.cards[1].h;
    t.ok(Math.abs(rw - 200 / 200) < 0.02 && Math.abs(rh - 160 / 180) < 0.02,
      'キャプションと解説が同じ比率で縮む（片方だけ歪まない）');
    t.ok(Math.abs(b.cards[0].w - 200 * b.scale) < 0.6,
      `縮めた実寸が倍率どおり（${b.cards[0].w}mm ≒ 200×${b.scale.toFixed(3)}）`);
    t.ok(b.note.includes('%'), `縮めた倍率を知らせる（${b.note}）`);
    t.ok(!b.note.includes('原寸のまま'), '原寸ではないことがわかる文言にする');

    /* ===== 4. 縦長の札なら、横並びを自動で選ぶ ===== */
    await setup(90, 180, 90, 180, 'both');
    await page.evaluate(() => renderSheets());
    await page.waitForTimeout(800);
    const c = await info();
    t.eq(c.scale, 1, '横並びにすれば原寸で収まる（縦並びだと縮む寸法）');
    t.eq(c.cards[0].y, c.cards[1].y, '横並びのときは上下がそろう');
    t.ok(c.cards[1].x > c.cards[0].x, 'キャプションが左、解説が右');
    t.eq(+(c.cards[1].x - (c.cards[0].x + c.cards[0].w)).toFixed(1), 6, '横並びでも6mmの間隔');
    t.eq(c.inside, true, '横並びでも用紙に収まる');

    /* ===== 5. 用紙を変えると、それに合わせて収め直す ===== */
    await setup(140, 100, 140, 100, 'both');
    await page.evaluate(() => {
      proj().printOpt.sheetKind = 'custom';
      proj().printOpt.sheetCustomW = 150; proj().printOpt.sheetCustomH = 150;
      save(); renderSheets();
    });
    await page.waitForTimeout(800);
    const d = await info();
    t.ok(d.scale < 1, `小さい用紙に変えると縮めて収める（倍率 ${d.scale.toFixed(3)}）`);
    t.eq(d.inside, true, '小さい用紙でもはみ出さない');

    /* ===== 6. 実際の印刷でも同じものが出る ===== */
    await setup(140, 100, 140, 100, 'both');
    await page.evaluate(() => { renderSheets(); window.__printed = 0; window.print = () => { window.__printed++; }; });
    await page.waitForTimeout(700);
    const printed = await page.evaluate(async () => {
      const ok = await doPrint();
      return {
        ok, printed: window.__printed,
        sheets: document.querySelectorAll('#print-root .sheet').length,
        wraps: document.querySelectorAll('#print-root .pair-wrap').length,
        cards: document.querySelectorAll('#print-root .cap-card').length
      };
    });
    t.eq(printed.ok, true, '印刷まで進む');
    t.eq(printed.printed, 1, '印刷ダイアログが開く');
    t.eq([printed.sheets, printed.wraps, printed.cards], [3, 3, 6],
      '印刷でも3作品→3枚・6カードになる');
    await page.evaluate(() => { document.getElementById('print-root').innerHTML = ''; });

    /* ===== 7. 文字の画像化と組み合わせても成り立つ ===== */
    await page.evaluate(() => {
      const cb = document.getElementById('prOutline');
      cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true }));
    });
    for (let i = 0; i < 40; i++) {
      const done = await page.evaluate(() =>
        document.querySelectorAll('#sheetScroll .cap-textlayer').length >= 6 &&
        document.querySelectorAll('#sheetScroll .cap-item').length === 0);
      if (done) break;
      await page.waitForTimeout(250);
    }
    const baked = await page.evaluate(() => {
      const s0 = document.querySelector('#sheetScroll .sheet');
      const sr = s0.getBoundingClientRect();
      const S = sr.width / parseFloat(s0.style.width);
      const cards = [...s0.querySelectorAll('.cap-card')];
      return {
        layers: document.querySelectorAll('#sheetScroll .cap-textlayer').length,
        items: document.querySelectorAll('#sheetScroll .cap-item').length,
        // 焼いた画像がカードと同じ大きさ・同じ位置に重なっているか
        aligned: cards.every(c => {
          const l = c.querySelector('.cap-textlayer'); if (!l) return false;
          const cr = c.getBoundingClientRect(), lr = l.getBoundingClientRect();
          return Math.abs(cr.left - lr.left) / S < 0.05 && Math.abs(cr.top - lr.top) / S < 0.05 &&
                 Math.abs(cr.width - lr.width) / S < 0.05 && Math.abs(cr.height - lr.height) / S < 0.05;
        })
      };
    });
    t.eq(baked.layers, 6, '1枚に2つずつ、計6つの文字画像が焼かれる');
    t.eq(baked.items, 0, '文字そのものは残らない');
    t.eq(baked.aligned, true, '縮めた組でも、焼いた文字がカードとぴったり重なる');
    await page.evaluate(() => {
      const cb = document.getElementById('prOutline');
      cb.checked = false; cb.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.waitForTimeout(500);

    /* ===== 8. ほかの面に戻せば、これまでどおり ===== */
    await page.evaluate(() => {
      const r = document.querySelector('input[name=printFace][value="cap"]');
      r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.waitForTimeout(800);
    const back = await page.evaluate(() => ({
      wraps: document.querySelectorAll('#sheetScroll .pair-wrap').length,
      cards: document.querySelectorAll('#sheetScroll .cap-card').length,
      sheets: document.querySelectorAll('#sheetScroll .sheet').length,
      note: document.getElementById('bothFitNote').textContent,
      noteHidden: getComputedStyle(document.getElementById('bothFaceNote')).display === 'none',
      mode: getComputedStyle(document.getElementById('printModeRow')).pointerEvents
    }));
    t.eq(back.wraps, 0, 'キャプション面に戻すと組はできない');
    t.eq(back.cards, 3, 'キャプション面では作品の枚数ぶんのカードになる');
    t.ok(back.sheets < 3, `従来どおり用紙に面付けされる（3作品が${back.sheets}枚に収まる）`);
    t.eq(back.note, '', '倍率の案内も消える');
    t.eq(back.noteHidden, true, '説明も引っ込む');
    t.eq(back.mode, 'auto', '「配置」がまた選べる');

    /* ===== 9. 設定が保存され、読み直しても残る ===== */
    await page.evaluate(() => {
      const r = document.querySelector('input[name=printFace][value="both"]');
      r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true }));
      flushSave();
    });
    await page.waitForTimeout(500);
    await page.reload();
    await page.waitForTimeout(900);
    await page.click('nav.tabs button[data-tab="print"]');
    await page.waitForTimeout(800);
    const kept = await page.evaluate(() => ({
      face: proj().printOpt.face,
      checked: document.querySelector('input[name=printFace][value="both"]').checked,
      noteShown: getComputedStyle(document.getElementById('bothFaceNote')).display !== 'none',
      wraps: document.querySelectorAll('#sheetScroll .pair-wrap').length
    }));
    t.eq([kept.face, kept.checked], ['both', true], '読み直しても選択が残る');
    t.eq(kept.noteShown, true, '読み直しても説明が出ている');
    t.eq(kept.wraps, 3, '読み直しても1作品1枚で組まれる');

    /* ===== 10. 長い解説文が下で切れない（用紙に余白があるのに切るのはおかしい） =====
       札が足りなければ札を、文章の枠が足りなければ枠を、それぞれ下へ伸ばして全文を出す。 */
    const LONG = '盤の中央に描かれた、真っ二つに分断された三層の楼閣。山に向かって伸びる白い光の道と、'
      + '水上に浮かぶ三つの楼閣門、傍らには橋を渡る人物と船を漕ぐ人物。'
      + '欧米で「スプリッド・パゴダ」と呼ばれるこの奇抜な意匠は、染付と五彩のいずれにも見られ、'
      + '明代末期の漳州窯を代表する図様として知られる。分断された楼閣が何を意味するのかは'
      + '諸説あるが、いまだ定説をみない。同様の図様は伊万里焼にも写され、十九世紀の丸山窯の'
      + '作例が知られる。本作は産業技術総合研究所中部センターの旧蔵品で、当館が管理している。';
    await page.evaluate((long) => {
      const p = proj();
      p.works = [p.works[0]];
      p.works[0].description = long;
      p.size = { preset: 'custom', w: 140, h: 100 };
      p.descSize = { w: 140, h: 70 };          // わざと足りない高さにしておく
      p.printOpt = Object.assign({}, p.printOpt, { face: 'both', sheetKind: 'a4' });
      save(); renderSheets();
    }, LONG);
    await page.waitForTimeout(900);

    const grown = await page.evaluate((long) => {
      const s0 = document.querySelector('#sheetScroll .sheet');
      const sr = s0.getBoundingClientRect();
      const S = sr.width / parseFloat(s0.style.width);
      const mm = v => +(v / S).toFixed(1);
      const cards = [...s0.querySelectorAll('.cap-card')];
      const desc = cards[1], item = desc.querySelector('[data-item="description"]');
      const dr = desc.getBoundingClientRect(), ir = item.getBoundingClientRect();
      return {
        descCardH: mm(dr.height),
        itemOverflow: item.scrollHeight - item.clientHeight,
        itemInsideCard: ir.bottom <= dr.bottom + 1,
        lastBottomMM: mm(cards[cards.length - 1].getBoundingClientRect().bottom - sr.top),
        sheetH: parseFloat(s0.style.height),
        // 文章が最後まで出ているか
        endsWith: item.textContent.trim().endsWith(long.slice(-12)),
        scale: lastBothScale
      };
    }, LONG);
    t.ok(grown.descCardH > 70, `解説の札が足りなければ下へ伸ばす（70mm → ${grown.descCardH}mm）`);
    t.eq(grown.itemOverflow, 0, '解説文が枠からあふれない（切り取られない）');
    t.eq(grown.itemInsideCard, true, '文章の枠が札からはみ出さない（札に切り取られない）');
    t.eq(grown.endsWith, true, '解説文が最後の一文まで出ている');
    t.ok(grown.lastBottomMM <= grown.sheetH,
      `伸ばしても用紙に収まる（下端${grown.lastBottomMM}mm ≦ 用紙${grown.sheetH}mm）`);

    // 実際の印刷でも同じ
    await page.evaluate(() => { window.print = () => {}; });
    const printedLong = await page.evaluate(async (long) => {
      await doPrint();
      const root = document.getElementById('print-root');
      root.style.cssText = 'display:block;position:absolute;left:-4000px;top:0';
      const s0 = root.querySelector('.sheet');
      const cards = [...s0.querySelectorAll('.cap-card')];
      const desc = cards[1], item = desc.querySelector('[data-item="description"]');
      const out = {
        overflow: item.scrollHeight - item.clientHeight,
        inside: item.getBoundingClientRect().bottom <= desc.getBoundingClientRect().bottom + 1,
        endsWith: item.textContent.trim().endsWith(long.slice(-12)),
        bottomOK: desc.getBoundingClientRect().bottom <= s0.getBoundingClientRect().bottom + 1
      };
      root.style.cssText = ''; root.innerHTML = '';
      return out;
    }, LONG);
    t.eq(printedLong.overflow, 0, '印刷でも解説文が枠からあふれない');
    t.eq(printedLong.inside, true, '印刷でも札に切り取られない');
    t.eq(printedLong.endsWith, true, '印刷でも最後の一文まで出る');
    t.eq(printedLong.bottomOK, true, '印刷でも用紙の中に収まる');

    // 収まる長さのときは、札の寸法を勝手に変えない
    await page.evaluate(() => {
      const p = proj();
      p.works[0].description = '短い解説。';
      p.descSize = { w: 140, h: 100 };
      save(); renderSheets();
    });
    await page.waitForTimeout(800);
    const notGrown = await page.evaluate(() => {
      const s0 = document.querySelector('#sheetScroll .sheet');
      const S = s0.getBoundingClientRect().width / parseFloat(s0.style.width);
      const cards = [...s0.querySelectorAll('.cap-card')];
      return cards.map(c => +(c.getBoundingClientRect().height / S).toFixed(1));
    });
    t.eq(notGrown, [100, 100], '収まっているときは札の寸法をそのまま使う（勝手に伸ばさない）');

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
