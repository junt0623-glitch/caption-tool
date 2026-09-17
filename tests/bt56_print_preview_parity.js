// bt56【不具合修正】作ったものと、書き出して読み直したもの、そして印刷とで、
//   画像・テキスト・ルビの位置がずれないこと。
//   編集プレビューと印刷は同じ組版関数で組まれるはずなので、
//   すべての要素の位置と大きさを mm に直して突き合わせ、差が出ないことを保証する。
const { openApp, mkRunner, chromium } = require('./helpers');

// 縦横比 2:1 の横長PNG（64×32）
const WIDE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAAAgCAYAAACinX6EAAAAKklEQVR42u3OMQEAAAgDoC251a3gLzhQwOlWAAAAAAAAAAAAAAAAAADwYQF0AAABmb6NTQAAAABJRU5ErkJggg==';

/* カードの中の全要素を「カード左上からの mm」で測る。
   編集プレビューも印刷プレビューも倍率が掛かっているので、
   カードの実測幅と指定mm幅の比で割り戻せば、どちらも同じ土俵で比べられる。 */
const MEASURE = `(card)=>{
  const cr=card.getBoundingClientRect();
  const S=cr.width/parseFloat(card.style.width);
  const n=(r)=>[+((r.left-cr.left)/S).toFixed(3),+((r.top-cr.top)/S).toFixed(3),
                +(r.width/S).toFixed(3),+(r.height/S).toFixed(3)];
  const out={items:{},ruby:[],rk:[],img:null,img2:[],text:{}};
  card.querySelectorAll('.cap-item').forEach(el=>{
    out.items[el.dataset.item]=n(el.getBoundingClientRect());
    out.text[el.dataset.item]=el.textContent;
  });
  card.querySelectorAll('rt').forEach(rt=>{
    out.ruby.push(n(rt.getBoundingClientRect()));
    out.rk.push(rt.style.getPropertyValue('--rk'));
  });
  const im=card.querySelector('.cap-img'); if(im)out.img=n(im.getBoundingClientRect());
  card.querySelectorAll('.cap-img2').forEach(i2=>out.img2.push(n(i2.getBoundingClientRect())));
  return out;
}`;

/* 2つの測定結果を突き合わせ、ずれている箇所を並べて返す。
   印刷では空欄の項目を出さないので、両方にある項目だけを比べる（編集の空欄案内は対象外）。 */
function mismatches(a, b, tol = 0.02) {
  const rows = [];
  Object.keys(a.items).forEach(k => {
    if (!b.items[k]) return;
    const d = a.items[k].map((v, i) => +(v - b.items[k][i]).toFixed(3));
    if (d.some(x => Math.abs(x) > tol)) rows.push(`${k} Δmm${JSON.stringify(d)}`);
    if (a.text[k] !== b.text[k]) rows.push(`${k} 文字が違う「${a.text[k]}」/「${b.text[k]}」`);
  });
  if (a.ruby.length !== b.ruby.length) rows.push(`ルビの数 ${a.ruby.length}/${b.ruby.length}`);
  else a.ruby.forEach((r, i) => {
    const d = r.map((v, j) => +(v - b.ruby[i][j]).toFixed(3));
    if (d.some(x => Math.abs(x) > tol)) rows.push(`ルビ[${i}] Δmm${JSON.stringify(d)} 倍率${a.rk[i]}/${b.rk[i]}`);
  });
  if (a.img && b.img) {
    const d = a.img.map((v, i) => +(v - b.img[i]).toFixed(3));
    if (d.some(x => Math.abs(x) > tol)) rows.push(`画像 Δmm${JSON.stringify(d)}`);
  }
  if (a.img2.length !== b.img2.length) rows.push(`追加画像の数 ${a.img2.length}/${b.img2.length}`);
  else a.img2.forEach((r, i) => {
    const d = r.map((v, j) => +(v - b.img2[i][j]).toFixed(3));
    if (d.some(x => Math.abs(x) > tol)) rows.push(`追加画像[${i}] Δmm${JSON.stringify(d)}`);
  });
  return rows;
}

async function run() {
  const t = mkRunner('bt56 作成・書き出し・印刷での位置ずれ');
  const browser = await chromium.launch();
  try {
    const { page, errors } = await openApp(browser, { waitTab: 'daicho' });

    // 画像・ルビ・解説文・追加画像を一通り持つ作品を用意する
    await page.evaluate((img) => {
      const p = proj();
      p.works = [];
      for (let i = 1; i <= 2; i++) {
        const w = newWork();
        w.no = String(i);
        w.title = '鷹匠図屏風'; w.yomigana = 'たかじょうずびょうぶ';
        w.origin = '狩野派'; w.period = '桃山時代'; w.collection = '当館蔵';
        w.catchcopy = '鷹を見よ';
        w.description = '桃山期の金地屏風。鷹匠の姿を大画面に配する。'.repeat(4);
        w.image = img;
        w.images = [{ id: 'a' + i, url: img, x: 10, y: 62, w: 40, opacity: 1 }];
        w.descImages = [{ id: 'b' + i, url: img, x: 6, y: 70, w: 30, opacity: 1 }];
        w.ruby = { title: [{ start: 0, end: 1, text: 'たか' }, { start: 1, end: 2, text: 'じょう' },
                           { start: 2, end: 3, text: 'ず' }, { start: 3, end: 5, text: 'びょうぶ' }],
                   origin: [{ start: 0, end: 2, text: 'かのう' }],
                   description: [{ start: 0, end: 2, text: 'ももやま' }, { start: 4, end: 5, text: 'きん' },
                                 { start: 5, end: 6, text: 'じ' }] };
        p.works.push(w);
      }
      p.style.rubyFit = 'fit';
      p.style.show.desc = true; p.style.show.catch = true; p.style.show.yomigana = true;
      save(); renderAll();
    }, WIDE);
    await page.waitForTimeout(400);

    const measureEditor = () => page.evaluate(`(${MEASURE})(document.querySelector('#editHolder .cap-card'))`);
    const measurePreview = () => page.evaluate(`(${MEASURE})(document.querySelector('#sheetScroll .cap-card'))`);

    /* doPrint と同じ手順で印刷用DOMを組み立てて残す */
    const buildPrintDom = (face) => page.evaluate((f) => {
      const p = proj();
      p.printOpt = Object.assign({ sheetKind: 'a4' }, p.printOpt, { face: f });
      const root = document.getElementById('print-root');
      root.innerHTML = '';
      const dims = sheetDims(p.printOpt);
      document.getElementById('dynPageSize').textContent = pageSizeRule(dims);
      buildSheets().forEach(s => { s.style.transform = ''; root.appendChild(s); });
      root.style.cssText = `display:block;position:absolute;left:-${Math.round(dims.w * 3 + 2000)}px;top:0;width:${dims.w}mm`;
      fitDescIn(root); fitRubyIn(root);
      root.style.cssText = '';
    }, face);
    const measurePrint = () => page.evaluate(`(${MEASURE})(document.querySelector('#print-root .cap-card'))`);
    const clearPrintDom = () => page.evaluate(() => { document.getElementById('print-root').innerHTML = ''; });

    const setFace = (mode, vertical) => page.evaluate(([m, v]) => {
      const st = proj().style;
      if (!!st.vertical !== v) {
        const cb = document.getElementById('stVertical');
        cb.checked = v; cb.dispatchEvent(new Event('change', { bubbles: true }));
      }
      editMode = m;
      document.querySelectorAll('.mode-sw button').forEach(b => b.classList.toggle('on', b.dataset.mode === m));
      switchEditScope('one'); previewIndex = 0; userZoom = 1;
      applyEditScope(); refreshLayoutControls(); renderEditor();
    }, [mode, vertical]);

    /* ===== 1. 編集プレビューと印刷とで、画像・テキスト・ルビが1つもずれない ===== */
    for (const [mode, label] of [['cap', 'キャプション面'], ['desc', '解説面']]) {
      for (const vert of [false, true]) {
        const vlabel = vert ? '縦書き' : '横書き';
        await page.click('nav.tabs button[data-tab="layout"]');
        await page.waitForTimeout(250);
        await setFace(mode, vert);
        await page.waitForTimeout(450);
        const ed = await measureEditor();
        await buildPrintDom(mode);
        await page.waitForTimeout(150);
        const pr = await measurePrint();
        const bad = mismatches(ed, pr);
        t.eq(bad, [], `${label}・${vlabel}：編集プレビューと印刷で位置がずれない`);
        t.ok(ed.ruby.length > 0, `${label}・${vlabel}：比較対象のルビがある（${ed.ruby.length}箇所）`);
        t.ok(ed.img2.length > 0, `${label}・${vlabel}：比較対象の追加画像がある`);

        // 印刷メディアを適用しても動かない（印刷用CSSで組版が変わらないこと）
        await page.emulateMedia({ media: 'print' });
        await page.waitForTimeout(200);
        const pm = await measurePrint();
        t.eq(mismatches(pr, pm), [], `${label}・${vlabel}：印刷用CSSを当てても組版が動かない`);
        await page.emulateMedia({ media: null });
        await clearPrintDom();
      }
    }

    /* ===== 2. 画面の表示倍率を変えても、組版そのものは変わらない ===== */
    await page.click('nav.tabs button[data-tab="layout"]');
    await page.waitForTimeout(250);
    await setFace('cap', false);
    await page.waitForTimeout(400);
    const at100 = await measureEditor();
    for (const z of [0.5, 0.75, 1.45, 2.2]) {
      await page.evaluate((zz) => { userZoom = zz; renderEditor(); }, z);
      await page.waitForTimeout(350);
      t.eq(mismatches(at100, await measureEditor()), [],
        `表示倍率${Math.round(z * 100)}%でも組版は同じ（ルビの縮め方も倍率に引きずられない）`);
    }
    await page.evaluate(() => { userZoom = 1; renderEditor(); });
    await page.waitForTimeout(300);

    /* ===== 3. 印刷プレビュー（縮小表示）と実際の印刷が一致する ===== */
    await page.evaluate(() => { proj().printOpt = Object.assign({ sheetKind: 'a4' }, proj().printOpt, { face: 'cap' }); save(); });
    await page.click('nav.tabs button[data-tab="print"]');
    await page.waitForTimeout(300);
    await page.evaluate(() => { refreshPrintControls(); renderSheets(); });
    await page.waitForTimeout(700);
    const prev = await measurePreview();
    await buildPrintDom('cap');
    await page.waitForTimeout(150);
    t.eq(mismatches(prev, await measurePrint()), [], '印刷プレビューの縮小表示と、実際の印刷の組版が一致する');
    await clearPrintDom();

    /* ===== 4. ルビが親文字からはみ出さない（「収める」を選んだとき） ===== */
    const over = await page.evaluate(() => {
      const card = document.querySelector('#sheetScroll .cap-card');
      const S = card.getBoundingClientRect().width / parseFloat(card.style.width);
      return [...card.querySelectorAll('ruby.fit')].map(ruby => {
        const rt = ruby.querySelector('rt');
        return +(((rt.getBoundingClientRect().width - ruby.getBoundingClientRect().width) / S)).toFixed(3);
      });
    });
    t.ok(over.length > 0, `「収める」ルビが印刷に出ている（${over.length}箇所）`);
    t.ok(over.every(v => v <= 0.02), `どのルビも親文字の幅からはみ出さない（最大 ${Math.max(...over)}mm）`);

    /* ===== 5. 書き出して読み直しても、組版が1つも変わらない ===== */
    await page.click('nav.tabs button[data-tab="layout"]');
    await page.waitForTimeout(300);
    await setFace('cap', false);
    await page.waitForTimeout(450);
    const before = await measureEditor();
    const beforeData = await page.evaluate(() => JSON.stringify({
      style: proj().style, size: proj().size, descSize: proj().descSize,
      works: proj().works.map(w => ({ ruby: w.ruby, charFmt: w.charFmt, images: w.images, descImages: w.descImages,
        layoutOverride: w.layoutOverride, sizeOverride: w.sizeOverride, textOverride: w.textOverride }))
    }));

    const roundTripped = await page.evaluate(() => {
      // 「書き出し」と同じ中身を作り、まっさらにしてから「読み込み」と同じ手順で戻す
      const json = JSON.stringify({ app: 'caption-koubou', version: 1, projects: store.projects });
      store.projects = []; store.currentId = null;
      applyProjectsJson(json);
      return proj().works.length;
    });
    t.eq(roundTripped, 2, '書き出したJSONを読み込み直せる');

    await page.click('nav.tabs button[data-tab="layout"]');
    await page.waitForTimeout(300);
    await setFace('cap', false);
    await page.waitForTimeout(450);
    t.eq(mismatches(before, await measureEditor()), [], '書き出して読み直しても編集プレビューの組版が変わらない');
    const afterData = await page.evaluate(() => JSON.stringify({
      style: proj().style, size: proj().size, descSize: proj().descSize,
      works: proj().works.map(w => ({ ruby: w.ruby, charFmt: w.charFmt, images: w.images, descImages: w.descImages,
        layoutOverride: w.layoutOverride, sizeOverride: w.sizeOverride, textOverride: w.textOverride }))
    }));
    t.eq(afterData, beforeData, '書き出して読み直しても体裁のデータが1文字も変わらない');

    await buildPrintDom('cap');
    await page.waitForTimeout(150);
    const printedAfter = await measurePrint();
    await clearPrintDom();
    t.eq(mismatches(before, printedAfter), [], '読み直したデータの印刷も、作ったときと同じ位置に出る');

    /* ===== 6. 作品ごとの上書きを持つデータでも、往復でずれない ===== */
    await page.evaluate(() => {
      const w = proj().works[0];
      w._ovEditing = true;
      w.textOverride = { lh: 1.9, rubyAlign: 'center' };
      setWorkSize(w, 'cap', { w: 120, h: 90 });
      const L = (w.layoutOverride = { cap: { title: { x: 12.5, y: 20.5, w: 90, h: null, font: 'inherit', size: 17.5, ls: 0.03, align: 'left', color: null, sx: 90, sy: 105, lh: null } } });
      save(); applyEditScope(); renderEditor();
    });
    await page.waitForTimeout(450);
    const ovBefore = await measureEditor();
    await page.evaluate(() => {
      const json = JSON.stringify({ app: 'caption-koubou', version: 1, projects: store.projects });
      store.projects = []; store.currentId = null;
      applyProjectsJson(json);
    });
    await page.click('nav.tabs button[data-tab="layout"]');
    await page.waitForTimeout(300);
    await page.evaluate(() => { switchEditScope('one'); previewIndex = 0; userZoom = 1; applyEditScope(); renderEditor(); });
    await page.waitForTimeout(450);
    const ovAfter = await measureEditor();
    t.eq(mismatches(ovBefore, ovAfter), [], '作品ごとの上書き（寸法・行間・配置）を持つデータも往復でずれない');
    const kept = await page.evaluate(() => {
      const w = proj().works[0];
      return { size: w.sizeOverride && w.sizeOverride.cap, lh: w.textOverride && w.textOverride.lh,
               x: w.layoutOverride.cap.title.x, sx: w.layoutOverride.cap.title.sx };
    });
    t.eq(kept, { size: { w: 120, h: 90 }, lh: 1.9, x: 12.5, sx: 90 }, '上書きの数値が丸められずそのまま残る');

    /* ===== 7. 読み込み時に、上書き層も書き込み時と同じ形にそろえる ===== */
    const normalized = await page.evaluate(() => {
      const p = proj();
      p.works[1].sizeOverride = { cap: { w: 9999, h: -5 }, desc: null };
      p.works[1].textOverride = { lh: 1.6, bracket: true, なにか: 1 };
      const json = JSON.stringify({ app: 'caption-koubou', version: 1, projects: [p] });
      store.projects = []; store.currentId = null;
      applyProjectsJson(json);
      const w = proj().works[1];
      return { size: w.sizeOverride.cap, text: w.textOverride, desc: w.sizeOverride.desc };
    });
    t.eq(normalized.size, { w: 300, h: 20 }, '範囲外の寸法は読み込み時に丸められる（画面と印刷で食い違わない）');
    t.eq(normalized.desc, undefined, '中身の無い面の寸法は落とす');
    t.eq(normalized.text, { lh: 1.6 }, '《》は全体と同じく毎回OFF・知らない項目は捨てる');

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
