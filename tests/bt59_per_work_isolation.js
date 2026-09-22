// bt59【総点検】作品ごとの編集が、マスターにも他の作品にも干渉しないこと
//   配置・寸法・書体/行間・ルビの体裁・表示項目・背景/画像・文章・ルビ・文字単位の書式まで、
//   個別編集でできる操作をひととおり行い、
//   「編集した作品以外は1文字も変わっていない」ことをまとめて確かめる。
const { openApp, mkRunner, chromium } = require('./helpers');

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAAAgCAYAAACinX6EAAAAKklEQVR42u3OMQEAAAgDoC251a3gLzhQwOlWAAAAAAAAAAAAAAAAAADwYQF0AAABmb6NTQAAAABJRU5ErkJggg==';

/* 「編集した作品以外」の状態をまるごと文字列にする。
   一時的な編集フラグ（_ovEditing 等）は見た目に関わらないので外す。 */
const SNAPSHOT = `(exceptIndex)=>{
  const p=proj();
  const clean=(w)=>{const c=JSON.parse(JSON.stringify(w));delete c._ovEditing;delete c._styleOvEditing;return c;};
  return JSON.parse(JSON.stringify({
    style:p.style, size:p.size, descSize:p.descSize,
    others:p.works.map((w,i)=>i===exceptIndex?null:clean(w))
  }));
}`;

/* 2つの写しを見比べて、違っている場所を「どこが・何から何へ」の形で並べる */
function diffPaths(a, b, path = '', out = []) {
  if (a === b) return out;
  const prim = (v) => v === null || typeof v !== 'object';
  if (prim(a) || prim(b)) {
    if (JSON.stringify(a) !== JSON.stringify(b))
      out.push(`${path}: ${JSON.stringify(a)} → ${JSON.stringify(b)}`);
    return out;
  }
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  keys.forEach(k => diffPaths(a[k], b[k], path ? `${path}.${k}` : k, out));
  return out;
}

async function run() {
  const t = mkRunner('bt59 作品ごとの編集がマスターと他作品に干渉しないこと');
  const browser = await chromium.launch();
  try {
    const { page, errors } = await openApp(browser, { waitTab: 'daicho' });
    page.on('dialog', d => d.accept());

    await page.evaluate((img) => {
      const p = proj();
      p.works = [];
      for (let i = 1; i <= 4; i++) {
        const w = newWork();
        w.no = String(i);
        w.title = '鷹匠図屏風'; w.yomigana = 'たかじょうずびょうぶ';
        w.origin = '狩野派'; w.period = '桃山時代'; w.collection = '当館蔵';
        w.catchcopy = '鷹を見よ';
        w.description = '桃山期の金地屏風。鷹匠の姿を大画面に配する。'.repeat(6);
        w.image = img;
        p.works.push(w);
      }
      p.style.show.desc = true; p.style.show.catch = true;
      save(); renderAll();
    }, PNG);
    await page.waitForTimeout(400);
    await page.click('nav.tabs button[data-tab="layout"]');
    await page.waitForTimeout(300);

    const snapshot = (except) => page.evaluate(`(${SNAPSHOT})(${except})`);

    /* No.3（index 2）だけを個別編集する。上書きは配置・画像の両方をON */
    await page.evaluate(() => {
      switchEditScope('one');
      previewIndex = 2; userZoom = 1;
      applyEditScope();
      const a = document.getElementById('ovToggle');
      a.checked = true; a.dispatchEvent(new Event('change', { bubbles: true }));
      const b = document.getElementById('imgOvToggle');
      b.checked = true; b.dispatchEvent(new Event('change', { bubbles: true }));
      refreshLayoutControls(); renderEditor();
    });
    await page.waitForTimeout(500);

    const baseline = await snapshot(2);

    /* ===== 個別編集でできる操作をひととおり行う ===== */
    const setRange = (id, v) => page.evaluate(([i, val]) => {
      const el = document.getElementById(i); el.value = String(val);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, [id, v]);
    const setSel = (id, v) => page.evaluate(([i, val]) => {
      const el = document.getElementById(i); el.value = val;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, [id, v]);
    const setChk = (id, v) => page.evaluate(([i, val]) => {
      const el = document.getElementById(i); el.checked = val;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, [id, v]);

    // 1) 項目の移動・整列・小パネルでの書式
    await page.evaluate(() => {
      sel.clear(); sel.add('title'); sel.add('origin');
      renderEditor(); showPanel();
    });
    await page.waitForTimeout(300);
    await setRange('ipSize', 22);
    await setRange('ipLh', 1.9);
    await setRange('ipSx', 88);
    await setRange('ipSy', 112);
    await setRange('ipLs', 0.08);
    await setSel('ipAlign', 'center');
    await setRange('ipW', 95);
    await page.waitForTimeout(250);
    await page.evaluate(() => {
      const L = curLayout(); L.title.x = 13; L.title.y = 21; L.origin.x = 41; save(); renderEditor();
    });
    await page.waitForTimeout(250);
    await page.evaluate(() => document.querySelector('#alignBar [data-align="left"]').click());
    await page.waitForTimeout(250);

    // 2) 札の寸法
    await setRange('sizeW', 118);
    await setRange('sizeH', 92);
    await page.waitForTimeout(250);

    // 3) 書体・行間・《》・縦中横
    await setRange('stLh', 2.1);
    await setSel('fontKind', 'gothic');
    await setChk('stBracket', true);
    await page.waitForTimeout(250);

    // 4) ルビの体裁
    await setRange('rubyOffset', 4);
    await setRange('rubyLs', 0.12);
    await setSel('rubyAlign', 'center');
    await setSel('rubyFit', 'fit');
    await page.evaluate(() => {
      const el = document.getElementById('rubySizePt'); el.value = '7';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForTimeout(250);

    // 5) 表示する項目
    await setChk('shPeriod', false);
    await setChk('shColl', false);
    await page.waitForTimeout(250);

    // 6) 背景・色・画像
    await page.evaluate(() => {
      const it = document.querySelector('#bgPicker .bg-item[data-bg="washi"]')
        || document.querySelectorAll('#bgPicker .bg-item')[2];
      if (it) it.click();
    });
    await setRange('bgOpacity', 70);
    await setRange('bgScale', 140);
    await page.evaluate(() => {
      const r = document.querySelector('input[name=imgFit][value="custom"]');
      r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await setRange('imgScale', 130);
    await setRange('imgOffX', 6);
    await setRange('imgOpacity', 80);
    await setChk('textScrim', true);
    await page.waitForTimeout(300);

    // 7) 文章のその場編集（キャプション面）
    const capText = await page.evaluate(async () => {
      startInlineEdit('title');
      await new Promise(r => setTimeout(r, 200));
      const el = document.querySelector('#editHolder [data-item="title"]');
      const r2 = document.createRange(); r2.selectNodeContents(el); r2.collapse(false);
      const s = getSelection(); s.removeAllRanges(); s.addRange(r2);
      document.execCommand('insertText', false, '（右隻）');
      await new Promise(r => setTimeout(r, 200));
      finishInlineEdit();
      await new Promise(r => setTimeout(r, 400));
      return proj().works[2].title;
    });
    t.eq(capText, '鷹匠図屏風（右隻）', 'その作品の文章を編集できる');

    // 8) ルビと文字単位の書式
    await page.evaluate(async () => {
      const w = proj().works[2];
      w.ruby = w.ruby || {};
      w.ruby.title = [{ start: 0, end: 1, text: 'たか' }, { start: 1, end: 2, text: 'じょう' }];
      w.charFmt = w.charFmt || {};
      w.charFmt.origin = [{ start: 0, end: 2, ls: 0.2, size: 14 }];
      save(); renderEditor();
      await new Promise(r => setTimeout(r, 200));
    });

    // 9) 追加画像
    await page.evaluate((img) => {
      const w = proj().works[2];
      w.images = [{ id: 'x1', url: img, x: 8, y: 60, w: 36, opacity: 0.9 }];
      save(); renderEditor();
    }, PNG);
    await page.waitForTimeout(300);

    // 10) 解説面：自動調整のかかる文章をその場編集する（今回直したところ）
    await page.click('.mode-sw button[data-mode="desc"]');   // 実際のボタンで面を切り替える
    await page.waitForTimeout(500);
    await page.evaluate(async () => {
      startInlineEdit('description');
      await new Promise(r => setTimeout(r, 250));
      const el = document.querySelector('#editHolder [data-item="description"]');
      const r2 = document.createRange(); r2.selectNodeContents(el); r2.collapse(false);
      const s = getSelection(); s.removeAllRanges(); s.addRange(r2);
      document.execCommand('insertText', false, '本図は右隻にあたる。');
      await new Promise(r => setTimeout(r, 300));
      finishInlineEdit();
      await new Promise(r => setTimeout(r, 500));
    });
    await setRange('sizeW', 124);   // 解説面の寸法も個別に
    await page.waitForTimeout(300);
    await page.click('.mode-sw button[data-mode="cap"]');
    await page.waitForTimeout(400);

    /* ===== ここまでの操作で、他の作品とマスターが変わっていないこと ===== */
    const afterAll = await snapshot(2);
    const leaks = diffPaths(baseline, afterAll);
    t.eq(leaks, [],
      '個別編集の操作をひととおり行っても、マスターと他の3作品は1つも変わらない');

    // 変更がその作品には確かに入っていること（操作が空振りでないことの確認）
    const mine = await page.evaluate(() => {
      const w = proj().works[2];
      return {
        layout: !!(w.layoutOverride && w.layoutOverride.cap && w.layoutOverride.cap.title),
        titleX: w.layoutOverride.cap.title.x,
        size: w.sizeOverride && w.sizeOverride.cap,
        descSize: w.sizeOverride && w.sizeOverride.desc,
        text: w.textOverride && { lh: w.textOverride.lh, font: w.textOverride.font, rubyFit: w.textOverride.rubyFit },
        show: w.textOverride && w.textOverride.show,
        style: w.styleOverride && { bgOpacity: w.styleOverride.bgOpacity, imgScale: w.styleOverride.imgScale },
        ruby: !!(w.ruby && w.ruby.title), charFmt: !!(w.charFmt && w.charFmt.origin),
        images: w.images.length
      };
    });
    t.eq(mine.layout, true, 'その作品には独自配置が入っている');
    t.eq(mine.size, { w: 118, h: 92 }, 'その作品だけキャプション面の寸法が変わる');
    t.eq(mine.descSize, { w: 124, h: 100 }, 'その作品だけ解説面の寸法が変わる');
    t.eq(mine.text.lh, 2.1, 'その作品だけ行間が変わる');
    t.eq(mine.text.font, 'gothic', 'その作品だけ書体が変わる');
    t.eq(mine.text.rubyFit, 'fit', 'その作品だけルビの掛け方が変わる');
    t.eq(mine.show, { period: false, collection: false }, 'その作品だけ表示項目が変わる');
    t.eq(mine.style.imgScale, 130, 'その作品だけ画像の設定が変わる');
    t.eq([mine.ruby, mine.charFmt, mine.images], [true, true, 1], 'ルビ・文字単位の書式・追加画像も入っている');

    /* ===== 作品を切り替えても、前の作品の編集が漏れない ===== */
    const switched = await page.evaluate(async () => {
      previewIndex = 0; clearImgSel(); sel.clear();
      applyEditScope(); refreshLayoutControls(); renderEditor();
      await new Promise(r => setTimeout(r, 400));
      const w0 = proj().works[0];
      return {
        ov: !!(w0.layoutOverride || w0.sizeOverride || w0.textOverride || w0.styleOverride),
        toggle: document.getElementById('ovToggle').checked,
        lhShown: document.getElementById('stLh').value,
        sizeShown: document.getElementById('sizeW').value,
        drawnLh: document.querySelector('#editHolder [data-item="title"]').style.lineHeight
      };
    });
    t.eq(switched.ov, false, '別の作品に切り替えても、その作品には何も付いていない');
    t.eq(switched.toggle, false, '上書きのチェックも切り替わる');
    t.eq(switched.lhShown, '1.45', '行間の欄にはマスターの値が戻る');
    t.eq(switched.sizeShown, '140', '寸法の欄にもマスターの値が戻る');
    t.eq(switched.drawnLh, '1.45', '描画もマスターの行間で行われる');

    /* ===== マスター編集は従来どおり全作品に効き、独自の作品は引きずられない ===== */
    const beforeMaster = await page.evaluate(() => JSON.stringify(proj().works[2].textOverride));
    await page.evaluate(() => { switchEditScope('master'); refreshLayoutControls(); renderEditor(); });
    await page.waitForTimeout(400);
    await setRange('stLh', 1.7);
    await setRange('sizeW', 152);
    await setChk('shCatch', false);
    await page.waitForTimeout(400);

    const masterEffect = await page.evaluate(() => {
      const p = proj();
      return {
        masterLh: p.style.lh, masterSize: p.size.w, masterCatch: p.style.show.catch,
        ownText: JSON.stringify(p.works[2].textOverride),
        ownSize: p.works[2].sizeOverride.cap,
        // 上書きの無い作品は実効値としてマスターに従う
        plainLh: effectiveStyle(p.works[0], p.style).lh,
        plainSize: effectiveSize(p.works[0], p, 'cap').w,
        // 上書きのある作品は自分の値を保つ
        ovLh: effectiveStyle(p.works[2], p.style).lh,
        ovSize: effectiveSize(p.works[2], p, 'cap').w,
        // 触れていない項目はマスターの変更に追随する
        ovCatch: effectiveStyle(p.works[2], p.style).show.catch
      };
    });
    t.eq(masterEffect.masterLh, 1.7, 'マスター編集では従来どおりマスターの行間が変わる');
    t.eq(masterEffect.masterSize, 152, 'マスターの寸法も変えられる');
    t.eq(masterEffect.plainLh, 1.7, '上書きの無い作品はマスターの行間に従う');
    t.eq(masterEffect.plainSize, 152, '上書きの無い作品はマスターの寸法に従う');
    t.eq(masterEffect.ovLh, 2.1, '独自の行間を持つ作品はマスターの変更に引きずられない');
    t.eq(masterEffect.ovSize, 118, '独自の寸法を持つ作品も引きずられない');
    t.eq(masterEffect.ownText, beforeMaster, 'マスターを編集しても、その作品の上書きの中身は変わらない');
    t.eq(masterEffect.ovCatch, false, '触れていない項目は、あとからのマスターの変更に追随する');

    /* ===== 個別編集で上書きOFFのときは、体裁に触れない ===== */
    const locked = await page.evaluate(async () => {
      switchEditScope('one'); previewIndex = 0; applyEditScope(); renderEditor();
      await new Promise(r => setTimeout(r, 400));
      return {
        one: document.getElementById('tab-layout').classList.contains('one-mode'),
        lh: getComputedStyle(document.getElementById('stLh')).pointerEvents,
        size: getComputedStyle(document.getElementById('sizeW')).pointerEvents,
        panel: getComputedStyle(document.querySelector('#itemPanel .prow')).pointerEvents,
        align: getComputedStyle(document.getElementById('alignBar')).pointerEvents
      };
    });
    t.eq(locked.one, true, '上書きOFFの個別編集では体裁ロックがかかる');
    t.eq([locked.lh, locked.size, locked.panel, locked.align], ['none', 'none', 'none', 'none'],
      '行間・寸法・小パネル・整列バーのいずれも触れない（マスターを書き換えないため）');

    /* ===== 保存して読み直しても、同じ分かれ方のまま =====
       読み込み時には既定値の補完（w.ruby={} など）が入るので、
       いちど読み直して整えた状態どうしを見比べ、そこから先は動かないことを見る */
    await page.evaluate(() => flushSave());
    await page.reload();
    await page.waitForTimeout(900);
    const beforeReload = await snapshot(-1);
    await page.evaluate(() => flushSave());
    await page.reload();
    await page.waitForTimeout(900);
    t.eq(diffPaths(beforeReload, await snapshot(-1)), [],
      '読み直しても、マスターと各作品の分かれ方がそのまま残る');

    // 作品ごとの上書きが、読み直しても中身ごと残っている
    const kept = await page.evaluate(() => {
      const w = proj().works[2];
      return { size: w.sizeOverride, lh: w.textOverride.lh, font: w.textOverride.font,
               show: w.textOverride.show, bg: w.styleOverride.bg,
               scrim: w.styleOverride.textScrim, masterScrim: proj().style.textScrim,
               layoutX: w.layoutOverride.cap.title.x };
    });
    t.eq(kept.size, { cap: { w: 118, h: 92 }, desc: { w: 124, h: 100 } }, '独自の寸法が残る');
    t.eq([kept.lh, kept.font], [2.1, 'gothic'], '独自の行間・書体が残る');
    t.eq(kept.show, { period: false, collection: false }, '独自の表示項目が残る');
    t.eq(kept.layoutX, 13, '独自の配置が残る');
    t.eq([kept.scrim, kept.masterScrim], [true, false],
      '「文字の下に白い敷き」もその作品だけに入り、マスターは元のまま');

    /* ===== 「マスターに戻す」でその作品だけ解除される ===== */
    await page.click('nav.tabs button[data-tab="layout"]');
    await page.waitForTimeout(300);
    const beforeReset = await snapshot(2);
    const reset = await page.evaluate(async () => {
      switchEditScope('one'); previewIndex = 2; applyEditScope();
      await new Promise(r => setTimeout(r, 300));
      document.getElementById('ovReset').click();
      await new Promise(r => setTimeout(r, 150));
      document.getElementById('confirmOk').click();
      await new Promise(r => setTimeout(r, 400));
      const w = proj().works[2];
      return { layout: !!w.layoutOverride, size: !!w.sizeOverride, text: !!w.textOverride,
               style: !!w.styleOverride, title: w.title };
    });
    t.eq([reset.layout, reset.size, reset.text], [false, false, false],
      '「マスターに戻す」で配置・寸法・書体まわりの上書きが解除される');
    t.eq(reset.style, true, '画像・背景の上書きは別枠なので残る（専用の解除ボタンで外す）');
    t.eq(reset.title, '鷹匠図屏風（右隻）', '文章そのものは作品の中身なので消えない');
    t.eq(diffPaths(beforeReset, await snapshot(2)), [], '解除してもマスターと他の作品は変わらない');

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
