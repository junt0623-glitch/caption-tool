// bt28【新機能】オンラインフォント拡充＋即時反映／追加画像の複数貼り付け・同位置一括コピー
const path = require('path');
const fs = require('fs');
const { mkRunner, chromium } = require('./helpers');
const FIXTURE = path.join(__dirname, 'fixture.png');

async function run() {
  const t = mkRunner('bt28 オンラインフォント・追加画像');
  const browser = await chromium.launch({});
  try {
    const context = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    page.on('console', m => {
      // Google Fonts への到達不可（オフライン実行）による読み込み失敗はテスト対象外として無視する
      if (m.type() === 'error' && !/fonts\.googleapis|fonts\.gstatic|net::ERR/.test(m.text())) errors.push('console error: ' + m.text());
    });
    await page.goto('file://' + path.join(__dirname, '..', 'index.html'));
    await page.waitForTimeout(300);
    await page.click('nav.tabs button[data-tab="layout"]');
    await page.waitForTimeout(200);

    // ---- オンラインフォントの拡充 ----
    const fontInfo = await page.evaluate(() => {
      const keys = Object.keys(FONTS).filter(k => FONTS[k].group === 'オンラインフォント');
      return { count: keys.length, allHaveGf: keys.every(k => !!FONTS[k].gf),
        optCount: document.querySelectorAll('#fontKind optgroup[label="オンラインフォント"] option').length };
    });
    t.ok(fontInfo.count >= 15, `オンラインフォントが15種以上ある（実際: ${fontInfo.count}）`);
    t.eq(fontInfo.allHaveGf, true, 'オンラインフォント全てにGoogle Fonts読み込み指定(gf)がある');
    t.eq(fontInfo.optCount, fontInfo.count, '書体セレクトにオンラインフォントが全て並ぶ');

    // ---- 選択と同時に読み込み＆プレビュー即時反映 ----
    await page.selectOption('#fontKind', 'zenoldmincho');
    await page.waitForTimeout(300);
    const after = await page.evaluate(() => ({
      links: [...document.querySelectorAll('link[rel=stylesheet]')].map(l => l.href).filter(h => h.includes('fonts.googleapis')),
      applied: getComputedStyle(document.querySelector('#editHolder .cap-item')).fontFamily,
      noteShown: document.getElementById('gfontNote').style.display !== 'none'
    }));
    t.ok(after.links.some(h => h.includes('Zen+Old+Mincho')), '選択した書体のGoogle Fonts <link>が自動追加される');
    t.ok(after.applied.includes('Zen Old Mincho'), 'プレビューの項目に選択書体が即時反映される');
    t.eq(after.noteShown, true, 'オンライン読み込み中の注意書きが表示される');

    // 同じ書体を選び直しても<link>は増えない
    await page.selectOption('#fontKind', 'mincho');
    await page.selectOption('#fontKind', 'zenoldmincho');
    await page.waitForTimeout(200);
    const linkCount = await page.evaluate(() => [...document.querySelectorAll('link[rel=stylesheet]')].filter(l => l.href.includes('Zen+Old+Mincho')).length);
    t.eq(linkCount, 1, '同じ書体の<link>は重複追加されない');

    // ---- 追加画像：マスターでは追加不可の案内 ----
    page.once('dialog', d => d.accept());
    await page.click('#btnImg2Add');
    await page.waitForTimeout(200);

    // ---- 追加画像：ファイルから複数追加 ----
    await page.click('#emodeOne');
    await page.waitForTimeout(200);
    await page.click('#btnImg2Add');
    await page.setInputFiles('#img2Input', [FIXTURE, FIXTURE]);
    await page.waitForTimeout(600);
    const st1 = await page.evaluate(() => ({
      n: proj().works[0].images.length,
      dom: document.querySelectorAll('#editHolder .cap-img2').length,
      sel: !!img2Sel, boxShown: document.getElementById('img2Box').style.display !== 'none'
    }));
    t.eq(st1.n, 2, '1つの作品に画像を2枚登録できる（複数可）');
    t.eq(st1.dom, 2, 'プレビューに追加画像が2枚描画される');
    t.eq(st1.sel && st1.boxShown, true, '追加した画像が選択され操作ボックスが表示される');

    // ---- 追加画像：Ctrl+V貼り付け ----
    const bytes = [...fs.readFileSync(FIXTURE)];
    await page.evaluate((arr) => {
      const dt = new DataTransfer();
      dt.items.add(new File([new Uint8Array(arr)], 'pasted.png', { type: 'image/png' }));
      document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt }));
    }, bytes);
    await page.waitForTimeout(500);
    const pasted = await page.evaluate(() => proj().works[0].images.length);
    t.eq(pasted, 3, 'Ctrl+V（pasteイベント）で画像を追加できる');

    // ---- ドラッグで移動 ----
    const before = await page.evaluate(() => { const m = curImg2(); return { x: m.x, y: m.y, w: m.w }; });
    await page.locator('#editHolder .cap-img2.sel-img2').scrollIntoViewIfNeeded();
    const box = await page.locator('#editHolder .cap-img2.sel-img2').boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2 + 25, { steps: 4 });
    await page.mouse.up();
    await page.waitForTimeout(200);
    const moved = await page.evaluate(() => { const m = curImg2(); return { x: m.x, y: m.y }; });
    t.ok(moved.x > before.x && moved.y > before.y, 'ドラッグで追加画像を移動できる');

    // ---- ホイールで拡大縮小 ----
    const box2 = await page.locator('#editHolder .cap-img2.sel-img2').boundingBox();
    await page.mouse.move(box2.x + box2.width / 2, box2.y + box2.height / 2);
    await page.mouse.wheel(0, -100);
    await page.waitForTimeout(200);
    const zoomed = await page.evaluate(() => curImg2().w);
    t.ok(zoomed > before.w, 'ホイールで追加画像を拡大できる');

    // ---- 同じ画像を同じ位置で他の作品へコピー ----
    const src = await page.evaluate(() => { const m = curImg2(); return { x: m.x, y: m.y, w: m.w, url: m.url }; });
    await page.click('#btnImg2Copy');
    await page.waitForTimeout(200);
    const listed = await page.evaluate(() => document.querySelectorAll('.img2CopyChk').length);
    t.eq(listed, 1, 'コピー先ダイアログに他の作品が並ぶ（見本2作品中、自分以外の1件）');
    await page.click('#img2CopyAll');
    page.once('dialog', d => d.accept());
    await page.click('#img2CopyOk');
    await page.waitForTimeout(300);
    const dst = await page.evaluate(() => { const m = proj().works[1].images[0]; return { x: m.x, y: m.y, w: m.w, sameUrl: m.url === proj().works[0].images.find(a => a.id === img2Sel || true).url }; });
    t.eq([dst.x, dst.y, dst.w], [src.x, src.y, src.w], '別の作品にも同じ位置・同じ大きさでコピーされる');

    // 再コピーしても重複追加せず位置合わせのみ
    await page.click('#btnImg2Copy');
    await page.waitForTimeout(200);
    await page.click('#img2CopyAll');
    page.once('dialog', d => d.accept());
    await page.click('#img2CopyOk');
    await page.waitForTimeout(300);
    const dstN = await page.evaluate(() => proj().works[1].images.length);
    t.eq(dstN, 1, '同じ画像の再コピーは重複追加にならない');

    // ---- Deleteキーで削除 ----
    const beforeDel = await page.evaluate(() => proj().works[0].images.length);
    await page.keyboard.press('Delete');
    await page.waitForTimeout(200);
    const afterDel = await page.evaluate(() => ({ n: proj().works[0].images.length, sel: img2Sel }));
    t.eq(afterDel.n, beforeDel - 1, 'Deleteキーで選択中の追加画像を削除できる');
    t.eq(afterDel.sel, null, '削除後は選択が解除される');

    // ---- 解説面にも貼れる（キャプション面とは別管理） ----
    await page.click('.mode-sw button[data-mode="desc"]');
    await page.waitForTimeout(300);
    const descBefore = await page.evaluate(() => ({ dom: document.querySelectorAll('#editHolder .cap-img2').length }));
    t.eq(descBefore.dom, 0, 'キャプション面の追加画像は解説面には表示されない');
    await page.click('#btnImg2Add');
    await page.setInputFiles('#img2Input', FIXTURE);
    await page.waitForTimeout(500);
    const desc = await page.evaluate(() => ({
      n: (proj().works[0].descImages || []).length,
      capN: proj().works[0].images.length,
      dom: document.querySelectorAll('#editHolder .cap-img2').length
    }));
    t.eq(desc.n, 1, '解説面にも追加画像を貼れる（descImagesに保存）');
    t.eq(desc.dom, 1, '解説面のプレビューに描画される');
    t.ok(desc.capN >= 1, 'キャプション面の画像はそのまま残る');

    // ---- 印刷シートにも追加画像が出る ----
    await page.click('nav.tabs button[data-tab="print"]');
    await page.waitForTimeout(500);
    const printImgs = await page.evaluate(() => document.querySelectorAll('#sheetScroll .cap-img2').length);
    t.ok(printImgs >= 1, '印刷プレビューにも追加画像が描画される');

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
