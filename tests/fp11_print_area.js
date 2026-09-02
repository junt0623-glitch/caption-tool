// tests/fp11_print_area.js
// 回帰テスト: 印刷しても印刷範囲の外のもの(在庫パレット・範囲外に置いたケース等)が
// 用紙に出ず、印刷範囲が用紙いっぱいに印刷されること。
//
// 背景: 印刷時のviewBoxは applyView() が画面の縦横比に合わせて左右(上下)に広げるため、
// 印刷範囲の外に並べてある在庫パレットまで用紙に写り込んでいた。
// また用紙サイズを指定していなかったため、印刷範囲が紙いっぱいにならなかった。
const fs = require('fs');
const path = require('path');
const { chromium, mkRunner } = require('./helpers');

const FP_URL = 'file://' + path.join(__dirname, '..', 'floorplan', 'index.html');
const PRESET_CHROMIUM = '/opt/pw-browsers/chromium';
const launchOpts = fs.existsSync(PRESET_CHROMIUM) ? { executablePath: PRESET_CHROMIUM } : {};

// window.print() はテストでは開けないので、印刷直前の状態を捕まえるために差し替え、
// その中でviewBoxと差し込まれた@pageの指定を記録する。
async function capturePrintState(page) {
  return page.evaluate(() => {
    const svg = document.getElementById('plan');
    let snap = null;
    const orig = window.print;
    window.print = () => {
      snap = {
        viewBox: svg.getAttribute('viewBox'),
        page: document.getElementById('pageStyle').textContent,
      };
    };
    document.getElementById('printBtn').click();
    window.print = orig;
    return snap;
  });
}

async function run() {
  const t = mkRunner('fp11 印刷は印刷範囲だけを用紙いっぱいに出す');
  const browser = await chromium.launch(launchOpts);
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console error: ' + m.text()); });
  await page.goto(FP_URL);
  await page.waitForTimeout(300);

  const sheet = await page.$eval('svg#plan .sheet-root > rect', r =>
    [+r.getAttribute('width'), +r.getAttribute('height')]);

  // --- A3横のとき ---
  let snap = await capturePrintState(page);
  t.eq(snap.viewBox, `0 0 ${sheet[0]} ${sheet[1]}`,
    '印刷時のviewBoxは印刷範囲そのもの(画面の縦横比に合わせて広げない)');
  t.ok(snap.page.includes('A3') && snap.page.includes('landscape'),
    'A3横の図面ではA3横の用紙が指定される');
  t.ok(/margin\s*:\s*0/.test(snap.page), '余白0で紙いっぱいに印刷される');

  // 印刷後は元の表示範囲(在庫パレットが見える広い範囲)に戻る
  const after = await page.$eval('svg#plan', s => s.getAttribute('viewBox').split(' ').map(Number));
  t.ok(after[0] < 0, '印刷後は編集用の表示範囲に戻る(印刷範囲の左外まで見えている)');

  // --- A3縦に切り替えたとき ---
  await page.selectOption('#sheetSel', '90');
  await page.waitForTimeout(200);
  const sheetP = await page.$eval('svg#plan .sheet-root > rect', r =>
    [+r.getAttribute('width'), +r.getAttribute('height')]);
  t.ok(sheetP[1] > sheetP[0], '90°回転で印刷範囲が縦長になる(前提確認)');
  snap = await capturePrintState(page);
  t.eq(snap.viewBox, `0 0 ${sheetP[0]} ${sheetP[1]}`, '縦のときもviewBoxは印刷範囲そのもの');
  t.ok(snap.page.includes('portrait'), 'A3縦の図面ではA3縦の用紙が指定される');
  await page.selectOption('#sheetSel', '0');
  await page.waitForTimeout(200);

  // --- 印刷メディアでは印刷範囲の外が隠れる/切り落とされること ---
  const styleOf = (sel, prop) => page.$eval(sel, (e, p) => getComputedStyle(e)[p], prop);
  t.eq(await styleOf('g[data-stock]', 'display'), 'inline',
    '画面表示では在庫パレットが見えている(前提確認)');

  await page.emulateMedia({ media: 'print' });
  t.eq(await styleOf('g[data-stock]', 'display'), 'none',
    '印刷では在庫パレットが用紙に出ない');
  t.ok((await styleOf('#plan .sheet-root', 'clipPath')).includes('sheetClip'),
    '印刷では描画物が印刷範囲でクリップされる');
  t.eq(await styleOf('header', 'display'), 'none', 'ヘッダー等のUIも用紙に出ない');
  await page.emulateMedia({ media: 'screen' });
  t.ok((await styleOf('#plan .sheet-root', 'clipPath')) === 'none',
    '画面編集中はクリップされない(印刷範囲の外にも自由に置ける)');

  // クリップの矩形は印刷範囲と同じ大きさで、描画物はすべてその中にある
  const clip = await page.$eval('#sheetClip rect', r =>
    [+r.getAttribute('width'), +r.getAttribute('height')]);
  t.eq(clip, sheet, 'クリップ範囲は印刷範囲(A3)と同じ大きさ');
  t.eq(await page.locator('svg#plan > g.sheet-root').count(), 1,
    '描画物はすべてクリップ対象のグループにまとまっている');

  // 在庫パレットは印刷範囲の外(左と右)に置かれたままであること = クリップが必要な状況
  const outside = await page.$$eval('g[data-stock]', (gs, w) => gs.filter(g => {
    const x = +/translate\(([-\d.]+)/.exec(g.getAttribute('transform'))[1];
    return x < 0 || x > w;
  }).length, sheet[0]);
  t.eq(outside, await page.locator('g[data-stock]').count(),
    '在庫パレットは全種類が印刷範囲の外に置かれている');

  // --- 用紙はA3の実寸で出る(プリンター側がA4のままでもA4に縮まない) ---
  // 描画領域を「紙いっぱい(inset:0)」にすると、用紙がA4なら図面もA4の大きさで
  // 出てしまう。mm実寸で指定しているので、印刷メディアでの大きさは常にA3になる。
  const MM = 96 / 25.4; // 1mmあたりのCSSピクセル
  const near = (a, b) => Math.abs(a - b) < 1;
  const wrapSize = () => page.$eval('#canvasWrap', e => {
    const r = e.getBoundingClientRect();
    return [r.width, r.height];
  });

  await capturePrintState(page); // 直前の向きの指定が残っているので押し直す
  await page.emulateMedia({ media: 'print' });
  let [ww, wh] = await wrapSize();
  t.ok(near(ww, 420 * MM) && near(wh, 297 * MM),
    `A3横のとき印刷される領域はA3実寸(420×297mm)になる(実際: ${Math.round(ww / MM)}×${Math.round(wh / MM)}mm)`);

  await page.emulateMedia({ media: 'screen' });
  await page.selectOption('#sheetSel', '90');
  await page.waitForTimeout(200);
  await capturePrintState(page);
  await page.emulateMedia({ media: 'print' });
  [ww, wh] = await wrapSize();
  t.ok(near(ww, 297 * MM) && near(wh, 420 * MM),
    `A3縦のとき印刷される領域はA3縦の実寸(297×420mm)になる(実際: ${Math.round(ww / MM)}×${Math.round(wh / MM)}mm)`);
  await page.emulateMedia({ media: 'screen' });
  await page.selectOption('#sheetSel', '0');
  await page.waitForTimeout(200);

  // 実際にPDFに出して用紙サイズがA3(420×297mm)になっていることを確かめる
  const mediaBox = async () => {
    await capturePrintState(page);
    const pdf = await page.pdf({ preferCSSPageSize: true });
    const m = /MediaBox\s*\[([^\]]+)\]/.exec(pdf.toString('latin1'));
    return m[1].trim().split(/\s+/).map(Number).slice(2).map(pt => pt / 72 * 25.4);
  };
  let [mw, mh] = await mediaBox();
  t.ok(Math.abs(mw - 420) < 1 && Math.abs(mh - 297) < 1,
    `印刷結果の用紙はA3横(実際: ${Math.round(mw)}×${Math.round(mh)}mm)`);
  await page.selectOption('#sheetSel', '90');
  await page.waitForTimeout(200);
  [mw, mh] = await mediaBox();
  t.ok(Math.abs(mw - 297) < 1 && Math.abs(mh - 420) < 1,
    `A3縦の図面では用紙もA3縦(実際: ${Math.round(mw)}×${Math.round(mh)}mm)`);

  t.noErrors(errors);
  await context.close();
  await browser.close();
  return t.finish();
}

module.exports = { run };
if (require.main === module) run();
