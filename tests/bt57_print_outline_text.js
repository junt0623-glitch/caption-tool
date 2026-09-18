// bt57【新機能】印刷時にテキストを画像に変換して出す（アウトライン化の代わり）
//   出力先にその書体が入っていなくても字形が変わらないようにする。
//   焼き付けるのは文字だけで、背景デザインと写真は元のまま残す。
//   何より、焼き付けた文字が元の文字と同じ位置に出ることを確かめる。
const { openApp, mkRunner, chromium } = require('./helpers');

const WIDE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAAAgCAYAAACinX6EAAAAKklEQVR42u3OMQEAAAgDoC251a3gLzhQwOlWAAAAAAAAAAAAAAAAAADwYQF0AAABmb6NTQAAAABJRU5ErkJggg==';

async function run() {
  const t = mkRunner('bt57 印刷時のテキストの画像化');
  const browser = await chromium.launch();
  try {
    const { page, errors } = await openApp(browser, { waitTab: 'daicho' });
    page.on('dialog', d => d.accept());

    await page.evaluate((img) => {
      const p = proj();
      p.works = [];
      for (let i = 1; i <= 2; i++) {
        const w = newWork();
        w.no = String(i);
        w.title = '鷹匠図屏風'; w.origin = '狩野派'; w.period = '桃山時代'; w.collection = '当館蔵';
        w.description = '桃山期の金地屏風。鷹匠の姿を大画面に配する。'.repeat(3);
        w.image = img;
        w.images = [{ id: 'a' + i, url: img, x: 10, y: 62, w: 40, opacity: 1 }];
        w.ruby = { title: [{ start: 0, end: 1, text: 'たか' }, { start: 1, end: 2, text: 'じょう' },
                           { start: 2, end: 3, text: 'ず' }, { start: 3, end: 5, text: 'びょうぶ' }] };
        p.works.push(w);
      }
      p.style.rubyFit = 'fit';
      p.style.bg = 'nokigawara';        // SVGマスクを使う背景でも壊れないこと
      p.style.show.desc = true;
      save(); renderAll();
    }, WIDE);
    await page.waitForTimeout(400);

    await page.click('nav.tabs button[data-tab="print"]');
    await page.waitForTimeout(800);
    // 印刷ダイアログは開かせず、呼ばれたことだけ数える
    await page.evaluate(() => { window.__printed = 0; window.print = () => { window.__printed++; }; });

    const setOutline = (on, dpi) => page.evaluate(([o, d]) => {
      const cb = document.getElementById('prOutline');
      cb.checked = o; cb.dispatchEvent(new Event('change', { bubbles: true }));
      if (d) { const s = document.getElementById('prOutlineDpi'); s.value = String(d); s.dispatchEvent(new Event('change', { bubbles: true })); }
    }, [on, dpi]);

    /* ===== 1. 既定はOFF。UIの出方 ===== */
    const initial = await page.evaluate(() => ({
      exists: !!document.getElementById('prOutline'),
      checked: document.getElementById('prOutline').checked,
      dpiRow: getComputedStyle(document.getElementById('outlineDpiRow')).display,
      opt: proj().printOpt.outline
    }));
    t.eq(initial.exists, true, '印刷タブに「テキストを画像に変換して印刷」の選択がある');
    t.eq(initial.checked, false, '既定はOFF（これまでどおり文字のまま印刷する）');
    t.eq(initial.dpiRow, 'none', 'OFFのあいだは解像度の欄を出さない');
    t.ok(!initial.opt, '設定にも残らない');

    await setOutline(true);
    await page.waitForTimeout(200);
    const on = await page.evaluate(() => ({
      dpiRow: getComputedStyle(document.getElementById('outlineDpiRow')).display,
      dpi: document.getElementById('prOutlineDpi').value,
      opt: proj().printOpt.outline,
      choices: [...document.querySelectorAll('#prOutlineDpi option')].map(o => o.value)
    }));
    t.ok(on.dpiRow !== 'none', 'ONにすると解像度を選べる');
    t.eq(on.dpi, '600', '解像度の既定は600dpi');
    t.eq(on.choices, ['300', '600', '1200'], '解像度は300/600/1200dpiから選べる');
    t.eq(on.opt, true, '選択が設定に保存される');

    /* ===== 2. OFFのときは、これまでどおり文字のまま印刷する ===== */
    await setOutline(false);
    await page.waitForTimeout(150);
    await page.evaluate(() => doPrint());
    await page.waitForTimeout(300);
    const plain = await page.evaluate(() => {
      const card = document.querySelector('#print-root .cap-card');
      return { items: card.querySelectorAll('.cap-item').length,
               layers: document.querySelectorAll('#print-root .cap-textlayer').length };
    });
    t.ok(plain.items > 0, `OFFでは文字が文字のまま出る（${plain.items}項目）`);
    t.eq(plain.layers, 0, 'OFFでは画像化しない');

    await page.evaluate(() => { document.getElementById('print-root').innerHTML = ''; });

    /* ===== 3. ONにすると、文字だけが画像に置き換わる ===== */
    await setOutline(true, 600);
    await page.waitForTimeout(150);
    const ret = await page.evaluate(() => doPrint());
    await page.waitForTimeout(600);
    t.eq(ret, true, '画像化しても印刷は最後まで進む');
    t.eq(await page.evaluate(() => window.__printed), 2, '印刷ダイアログが開かれる（OFFのときと合わせて2回）');

    const baked = await page.evaluate(() => {
      const card = document.querySelector('#print-root .cap-card');
      const l = card.querySelector('.cap-textlayer');
      return {
        items: card.querySelectorAll('.cap-item').length,
        layers: document.querySelectorAll('#print-root .cap-textlayer').length,
        cards: document.querySelectorAll('#print-root .cap-card').length,
        layerW: l.style.width, layerH: l.style.height,
        cardW: card.style.width, cardH: card.style.height,
        px: [l.naturalWidth, l.naturalHeight],
        keepsBg: card.className.includes('bg-nokigawara'),
        keepsImg: !!card.querySelector('.cap-img'),
        keepsImg2: card.querySelectorAll('.cap-img2').length,
        isPng: l.src.startsWith('data:image/png'),
        pos: [getComputedStyle(l).left, getComputedStyle(l).top, getComputedStyle(l).position]
      };
    });
    t.eq(baked.items, 0, 'ONでは文字項目そのものは残らない（＝書体に依存しない）');
    t.eq(baked.layers, 2, '作品の枚数ぶん、文字の画像ができる');
    t.eq(baked.cards, 2, 'カードの枚数は変わらない');
    t.eq(baked.isPng, true, '文字の画像はPNG（背景が透ける）');
    t.eq([baked.layerW, baked.layerH], [baked.cardW, baked.cardH], '文字の画像はカードと同じ寸法に置く');
    t.eq(baked.pos, ['0px', '0px', 'absolute'], 'カードの左上にぴったり重ねる');
    // 140×100mm を 600dpi で焼くと 3307×2362 画素
    t.eq(baked.px, [Math.round(140 / 25.4 * 600), Math.round(100 / 25.4 * 600)],
      `600dpiの画素数で焼かれている（${baked.px.join('×')}）`);
    t.eq(baked.keepsBg, true, '背景デザインはそのまま（画像化しない）');
    t.eq(baked.keepsImg, true, '作品の写真もそのまま');
    t.eq(baked.keepsImg2, 1, '追加画像もそのまま');
    await page.evaluate(() => { document.getElementById('print-root').innerHTML = ''; });

    /* ===== 4. 焼き付けた文字が、元の文字とまったく同じ位置に出ている =====
       文字だけが写るよう、背景と写真を外した状態で
       「文字のまま」と「画像化したもの」をそれぞれ実際に描かせ、
       出来上がった絵を突き合わせる。 */
    await page.evaluate(() => {
      const p = proj();
      p.style.bg = 'white';
      p.printOpt.border = false; p.printOpt.tight = false; p.printOpt.marks = false;
      p.works.forEach(w => { w.image = ''; w.images = []; w.descImages = []; });
      save();
    });

    const shoot = async (outline) => {
      await setOutline(outline, 600);
      await page.waitForTimeout(150);
      await page.evaluate(() => { document.getElementById('print-root').innerHTML = ''; });
      await page.evaluate(() => doPrint());
      await page.waitForTimeout(600);
      await page.evaluate(() => {
        const root = document.getElementById('print-root');
        root.style.cssText = 'display:block;position:absolute;left:0;top:0;z-index:99999;background:#fff';
      });
      await page.waitForTimeout(250);
      const el = await page.$('#print-root .cap-card');
      const buf = await el.screenshot();
      await page.evaluate(() => { document.getElementById('print-root').style.cssText = ''; });
      return buf.toString('base64');
    };

    const shotPlain = await shoot(false);
    const shotBaked = await shoot(true);

    /* 2枚の絵を読み込み、墨のある帯（＝行）の位置を突き合わせる。
       墨の「濃さ」は、高解像度で焼いた絵を画面用に縮めるぶん少しだけ変わるが、
       位置が合っていれば帯の範囲は1画素も動かない。 */
    const cmp = await page.evaluate(async ([a, b]) => {
      const load = (b64) => new Promise((res, rej) => {
        const i = new Image(); i.onload = () => res(i); i.onerror = rej;
        i.src = 'data:image/png;base64,' + b64;
      });
      const gray = (img) => {
        const cv = document.createElement('canvas');
        cv.width = img.naturalWidth; cv.height = img.naturalHeight;
        const c = cv.getContext('2d');
        c.fillStyle = '#fff'; c.fillRect(0, 0, cv.width, cv.height);
        c.drawImage(img, 0, 0);
        const d = c.getImageData(0, 0, cv.width, cv.height).data;
        const g = new Float64Array(cv.width * cv.height);
        for (let i = 0; i < g.length; i++) g[i] = 255 - (d[i * 4] * .299 + d[i * 4 + 1] * .587 + d[i * 4 + 2] * .114);
        return { g, w: cv.width, h: cv.height };
      };
      /* 墨のある行の区間（＝文字の1行ずつ）を切り出し、その行の中での
         左端・右端も測る。行ごとに上下左右の4辺が分かる */
      const lines = (G) => {
        const rowSum = [];
        for (let y = 0; y < G.h; y++) {
          let s = 0;
          for (let x = 0; x < G.w; x++) s += G.g[y * G.w + x];
          rowSum.push(s);
        }
        const out = []; let cur = null;
        rowSum.forEach((s, y) => {
          if (s > 200) { if (!cur) cur = { top: y, bottom: y }; cur.bottom = y; }
          else if (cur) { out.push(cur); cur = null; }
        });
        if (cur) out.push(cur);
        out.forEach(L => {
          let lo = G.w, hi = -1, ink = 0;
          for (let y = L.top; y <= L.bottom; y++) for (let x = 0; x < G.w; x++) {
            const v = G.g[y * G.w + x];
            if (v > 24) { ink += v; if (x < lo) lo = x; if (x > hi) hi = x; }
          }
          L.left = lo; L.right = hi; L.ink = Math.round(ink);
        });
        return out;
      };
      const A = gray(await load(a)), B = gray(await load(b));
      const total = (G) => G.g.reduce((x, y) => x + y, 0);
      return { w: A.w, h: A.h, linesA: lines(A), linesB: lines(B), inkA: total(A), inkB: total(B) };
    }, [shotPlain, shotBaked]);

    const mmPerPx = 140 / cmp.w;
    t.ok(cmp.linesA.length >= 5, `比べられるだけの文字の行がある（${cmp.linesA.length}行）`);
    t.eq(cmp.linesB.length, cmp.linesA.length, '文字の行数が画像化しても変わらない');

    let maxShift = 0, worst = '';
    cmp.linesA.forEach((L, i) => {
      const M = cmp.linesB[i]; if (!M) return;
      [['上', 'top'], ['下', 'bottom'], ['左', 'left'], ['右', 'right']].forEach(([nm, k]) => {
        const d = Math.abs(L[k] - M[k]);
        if (d > maxShift) { maxShift = d; worst = `${i + 1}行目の${nm}端`; }
      });
    });
    t.ok(maxShift <= 1,
      `どの行も、上下左右とも1画素（${mmPerPx.toFixed(3)}mm）を超えてずれない（最大 ${maxShift}画素＝${(maxShift * mmPerPx).toFixed(3)}mm${worst ? '：' + worst : ''}）`);

    // 墨の量は、高解像度の絵を画面用に縮めるぶんだけわずかに変わる（位置とは別の話）
    const inkRatio = cmp.inkB / cmp.inkA;
    t.ok(inkRatio > 0.9 && inkRatio < 1.1,
      `文字の濃さも見た目どおり（画像化すると ${(inkRatio * 100).toFixed(1)}%）`);

    await page.evaluate(() => {
      const p = proj();
      p.style.bg = 'nokigawara'; save();
      document.getElementById('print-root').innerHTML = '';
    });

    /* ===== 5. 解像度の選択が効く ===== */
    for (const dpi of [300, 1200]) {
      await setOutline(true, dpi);
      await page.waitForTimeout(150);
      await page.evaluate(() => doPrint());
      await page.waitForTimeout(700);
      const px = await page.evaluate(() => {
        const l = document.querySelector('#print-root .cap-textlayer');
        return [l.naturalWidth, l.naturalHeight];
      });
      t.eq(px, [Math.round(140 / 25.4 * dpi), Math.round(100 / 25.4 * dpi)],
        `${dpi}dpiを選ぶとその画素数で焼かれる（${px.join('×')}）`);
      await page.evaluate(() => { document.getElementById('print-root').innerHTML = ''; });
    }

    /* ===== 6. 縦書き・解説面でも成り立つ ===== */
    await page.click('nav.tabs button[data-tab="layout"]');
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      const cb = document.getElementById('stVertical');
      cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.waitForTimeout(400);
    await page.click('nav.tabs button[data-tab="print"]');
    await page.waitForTimeout(500);
    await setOutline(true, 600);
    await page.waitForTimeout(150);
    for (const face of ['cap', 'desc']) {
      await page.evaluate((f) => { proj().printOpt.face = f; save(); }, face);
      await page.evaluate(() => doPrint());
      await page.waitForTimeout(600);
      const v = await page.evaluate(() => {
        const card = document.querySelector('#print-root .cap-card');
        const l = card.querySelector('.cap-textlayer');
        const cv = document.createElement('canvas');
        cv.width = l.naturalWidth; cv.height = l.naturalHeight;
        cv.getContext('2d').drawImage(l, 0, 0);
        const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
        let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 24) n++;
        return { items: card.querySelectorAll('.cap-item').length, ink: n };
      });
      t.eq(v.items, 0, `縦書きの${face === 'desc' ? '解説面' : 'キャプション面'}でも文字が画像に置き換わる`);
      t.ok(v.ink > 1000, `縦書きの${face === 'desc' ? '解説面' : 'キャプション面'}でも文字が焼き付く（${v.ink}画素）`);
      await page.evaluate(() => { document.getElementById('print-root').innerHTML = ''; });
    }
    await page.click('nav.tabs button[data-tab="layout"]');
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      const cb = document.getElementById('stVertical');
      cb.checked = false; cb.dispatchEvent(new Event('change', { bubbles: true }));
      proj().printOpt.face = 'cap'; save();
    });
    await page.waitForTimeout(300);

    /* ===== 7. オンラインフォントを使っているときは、代替書体になる旨を知らせる ===== */
    await page.click('nav.tabs button[data-tab="print"]');
    await page.waitForTimeout(400);
    const warnOff = await page.evaluate(() => getComputedStyle(document.getElementById('outlineGfWarn')).display);
    t.eq(warnOff, 'none', '端末の書体だけなら注意書きは出さない');
    const warnOn = await page.evaluate(() => {
      const key = Object.keys(FONTS).find(k => FONTS[k].gf);
      proj().style.font = key; save(); refreshPrintControls();
      return { key, display: getComputedStyle(document.getElementById('outlineGfWarn')).display,
               text: document.getElementById('outlineGfWarn').textContent };
    });
    t.ok(warnOn.display !== 'none', `オンラインフォント使用時は注意書きを出す（${warnOn.key}）`);
    t.ok(warnOn.text.includes('代替書体'), '画像化すると代替書体の字形になると説明する');
    await page.evaluate(() => { proj().style.font = 'mincho'; save(); refreshPrintControls(); });

    /* ===== 8. 設定が保存され、読み直しても残る ===== */
    await setOutline(true, 1200);
    await page.waitForTimeout(200);
    await page.evaluate(() => flushSave());
    await page.reload();
    await page.waitForTimeout(900);
    await page.click('nav.tabs button[data-tab="print"]');
    await page.waitForTimeout(500);
    const kept = await page.evaluate(() => ({
      checked: document.getElementById('prOutline').checked,
      dpi: document.getElementById('prOutlineDpi').value,
      opt: proj().printOpt.outline, optDpi: proj().printOpt.outlineDpi
    }));
    t.eq([kept.checked, kept.dpi], [true, '1200'], '再読込しても選択と解像度が残る');
    t.eq([kept.opt, kept.optDpi], [true, 1200], '設定として保存されている');

    // おかしな解像度が入っていても既定に丸める
    const clamped = await page.evaluate(() => {
      proj().printOpt.outlineDpi = 99999; save(); refreshPrintControls();
      return { v: proj().printOpt.outlineDpi, ui: document.getElementById('prOutlineDpi').value };
    });
    t.eq([clamped.v, clamped.ui], [600, '600'], '想定外の解像度は600dpiに丸める');

    /* ===== 9. 印刷プレビューでも、画像化した状態で確かめられる ===== */
    await page.evaluate(() => { proj().printOpt.face = 'cap'; save(); refreshPrintControls(); renderSheets(); });
    await page.waitForTimeout(600);

    const prev = () => page.evaluate(() => ({
      cards: document.querySelectorAll('#sheetScroll .cap-card').length,
      items: document.querySelectorAll('#sheetScroll .cap-item').length,
      layers: document.querySelectorAll('#sheetScroll .cap-textlayer').length,
      note: document.getElementById('outlineBakeNote').textContent
    }));
    /* 変換が終わるまで待つ（枚数ぶん焼けたら完了） */
    const waitBake = async (n) => {
      for (let i = 0; i < 60; i++) {
        const s = await prev();
        if (s.layers >= n && s.items === 0) return s;
        await page.waitForTimeout(200);
      }
      return prev();
    };

    await setOutline(false);
    await page.waitForTimeout(500);
    const pOff = await prev();
    t.ok(pOff.items > 0, `OFFのプレビューは文字のまま（${pOff.items}項目）`);
    t.eq(pOff.layers, 0, 'OFFのプレビューには画像化した文字が無い');
    t.eq(pOff.note, '', 'OFFのときは案内も出さない');

    await setOutline(true, 600);
    const pOn = await waitBake(pOff.cards);
    t.eq(pOn.items, 0, 'ONにするとプレビューの文字も画像に置き換わる');
    t.eq(pOn.layers, pOff.cards, `プレビューでも枚数ぶん画像化される（${pOn.layers}枚）`);
    t.ok(pOn.note.includes('600dpi'), `どの解像度で見ているかを示す（${pOn.note}）`);
    t.ok(pOn.note.includes('印刷でもこのとおり'), '印刷と同じものだと案内する');

    // プレビューの画像も、選んだ解像度どおりに焼かれている
    const prevPx = await page.evaluate(() => {
      const l = document.querySelector('#sheetScroll .cap-textlayer');
      const card = l.closest('.cap-card');
      return { px: [l.naturalWidth, l.naturalHeight], w: card.style.width,
               layerW: l.style.width, layerH: l.style.height, cardH: card.style.height };
    });
    t.eq(prevPx.px, [Math.round(parseFloat(prevPx.w) / 25.4 * 600), Math.round(parseFloat(prevPx.cardH) / 25.4 * 600)],
      `プレビューの画像も600dpiで焼かれている（${prevPx.px.join('×')}）`);
    t.eq([prevPx.layerW, prevPx.layerH], [prevPx.w, prevPx.cardH], 'プレビューでもカードと同じ寸法に置く');

    // 解像度を変えるとプレビューも焼き直す
    await setOutline(true, 300);
    await waitBake(pOff.cards);
    const px300 = await page.evaluate(() => {
      const l = document.querySelector('#sheetScroll .cap-textlayer');
      return { px: [l.naturalWidth, l.naturalHeight], note: document.getElementById('outlineBakeNote').textContent };
    });
    t.eq(px300.px, [Math.round(parseFloat(prevPx.w) / 25.4 * 300), Math.round(parseFloat(prevPx.cardH) / 25.4 * 300)],
      `解像度を変えるとプレビューも焼き直す（${px300.px.join('×')}）`);
    t.ok(px300.note.includes('300dpi'), '案内の解像度も変わる');

    // 拡大縮小しても画像化した状態のまま（焼き直しは控えを使うので待たされない）
    const zoomed = await page.evaluate(async () => {
      sheetZoom = 0.8; renderSheets();
      await new Promise(r => setTimeout(r, 400));
      return { items: document.querySelectorAll('#sheetScroll .cap-item').length,
               layers: document.querySelectorAll('#sheetScroll .cap-textlayer').length };
    });
    t.eq(zoomed.items, 0, 'プレビューを拡大縮小しても文字のままには戻らない');
    t.eq(zoomed.layers, pOff.cards, '拡大縮小後も画像化した文字がそろっている');

    // 変換の途中で切り替えても、中途半端な状態で止まらない
    await page.evaluate(() => {
      const s = document.getElementById('prOutlineDpi');
      s.value = '1200'; s.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.waitForTimeout(150);
    await setOutline(false);
    await page.waitForTimeout(1500);
    const aborted = await prev();
    t.eq(aborted.layers, 0, '変換の途中でOFFにしたら、画像化を打ち切って文字に戻す');
    t.ok(aborted.items > 0, '文字が全部そろった状態に戻る');
    t.eq(aborted.note, '', '途中経過の案内も消える');

    // プレビューで画像化したあとに印刷しても、同じものが出る
    await setOutline(true, 600);
    await waitBake(pOff.cards);
    await page.evaluate(() => { window.__printed = 0; window.print = () => { window.__printed++; }; });
    const printedAfterPreview = await page.evaluate(async () => {
      const prevSrc = document.querySelector('#sheetScroll .cap-textlayer').src;
      await doPrint();
      const l = document.querySelector('#print-root .cap-textlayer');
      return { same: !!l && l.src === prevSrc,
               items: document.querySelectorAll('#print-root .cap-item').length,
               printed: window.__printed };
    });
    t.eq(printedAfterPreview.printed, 1, 'プレビューのあとでも印刷できる');
    t.eq(printedAfterPreview.items, 0, '印刷でも文字は画像になっている');
    t.eq(printedAfterPreview.same, true, 'プレビューで見た画像がそのまま印刷に使われる');
    await page.evaluate(() => { document.getElementById('print-root').innerHTML = ''; });

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
