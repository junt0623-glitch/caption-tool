// tests/fp08_image_library.js
// 画像フォルダ(ライブラリ)のテスト:
// あらかじめ画像を入れておける / 図面上の作品をダブルクリックして選べる /
// 選んだ画像を含めてJSON保存でき、読み込むと復元される。
const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium, mkRunner } = require('./helpers');

const FP_URL = 'file://' + path.join(__dirname, '..', 'floorplan', 'index.html');
const PRESET_CHROMIUM = '/opt/pw-browsers/chromium';
const launchOpts = fs.existsSync(PRESET_CHROMIUM) ? { executablePath: PRESET_CHROMIUM } : {};

// 単色のPNGをブラウザ側で作ってファイルに書き出す(画像ごとの区別をつけるため色を変える)
async function makeColorPng(page, outPath, color) {
  const dataUrl = await page.evaluate((c) => {
    const cv = document.createElement('canvas');
    cv.width = 80; cv.height = 60;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = c; ctx.fillRect(0, 0, cv.width, cv.height);
    return cv.toDataURL('image/png');
  }, color);
  fs.writeFileSync(outPath, Buffer.from(dataUrl.split(',')[1], 'base64'));
}

// 縦横比を指定してPNGを作る(一覧の見え方の検証で、縦長・横長を混ぜるために使う)
async function makeSizedPng(page, outPath, w, h, color) {
  const dataUrl = await page.evaluate(([w, h, c]) => {
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = c; ctx.fillRect(0, 0, w, h);
    return cv.toDataURL('image/png');
  }, [w, h, color]);
  fs.writeFileSync(outPath, Buffer.from(dataUrl.split(',')[1], 'base64'));
}

async function run() {
  const t = mkRunner('fp08 画像フォルダ');
  const browser = await chromium.launch(launchOpts);
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console error: ' + m.text()); });
  await page.goto(FP_URL);
  await page.waitForTimeout(300);

  // 番号なし・番号ありの2枚を用意する
  const plainPath = path.join(os.tmpdir(), 'fp08_plain.png');   // 番号を含まないファイル名
  const numberedPath = path.join(os.tmpdir(), '20002.png');     // 作品番号20002に自動対応
  await makeColorPng(page, plainPath, '#3366cc');
  await makeColorPng(page, numberedPath, '#cc3366');

  // --- 図面に作品を1つも置かないまま、あらかじめ画像フォルダに入れられる ---
  await page.click('#imgsBtn');
  await page.waitForTimeout(100);
  t.ok(!(await page.locator('#libModal').isHidden()), 'ヘッダーのボタンで画像フォルダが開く');
  t.eq(await page.locator('#libGrid .empty').count(), 1, '最初の画像フォルダは空');
  await page.setInputFiles('#imgsInput', [plainPath, numberedPath]);
  await page.waitForTimeout(500);
  t.eq(await page.locator('.libcard').count(), 2, '作品を配置していなくても画像を2枚アップロードできる');
  t.eq(await page.locator('#libGrid .empty').count(), 0, 'アップロード後は空表示が消える');
  await page.click('#libClose');
  await page.waitForTimeout(100);
  t.ok(await page.locator('#libModal').isHidden(), '閉じるボタンで画像フォルダが閉じる');

  // --- 作品を配置。番号を20002にすると、番号一致でフォルダの画像が自動で出る ---
  const svgBox = await page.locator('svg#plan').boundingBox();
  const cx = svgBox.x + svgBox.width / 2, cy = svgBox.y + svgBox.height / 2;
  await page.click('.tool[data-tool="work"]');
  await page.mouse.click(cx, cy);
  await page.waitForTimeout(100);
  await page.fill('#pNo', '20002');
  await page.dispatchEvent('#pNo', 'input');
  await page.waitForTimeout(150);
  t.eq(await page.locator('g.obj image').count(), 1, 'ファイル名の番号と作品番号が一致すると画像が自動で表示される');
  const autoHref = await page.$eval('g.obj image', i => i.getAttribute('href'));

  // --- ダブルクリックで画像フォルダを開き、別の画像(番号なしの方)を選べる ---
  await page.mouse.dblclick(cx, cy);
  await page.waitForTimeout(200);
  t.ok(!(await page.locator('#libModal').isHidden()), '作品をダブルクリックすると画像フォルダが開く');
  t.ok((await page.locator('#libTitle').textContent()).includes('20002'),
    '選択モードの見出しに対象の作品番号が出る');
  // 1枚目(番号なしの画像)を選ぶ
  await page.locator('.libcard').first().click();
  await page.waitForTimeout(200);
  t.ok(await page.locator('#libModal').isHidden(), '画像を選ぶと画像フォルダが閉じる');
  const pickedHref = await page.$eval('g.obj image', i => i.getAttribute('href'));
  t.ok(pickedHref !== autoHref, 'ダブルクリックで選んだ画像が、番号一致の画像より優先して表示される');

  // --- 選んだ画像はUndoで戻せる ---
  await page.click('#undoBtn');
  await page.waitForTimeout(150);
  t.eq(await page.$eval('g.obj image', i => i.getAttribute('href')), autoHref,
    'Undoで画像の割り当てが元(番号一致の画像)に戻る');
  await page.click('#redoBtn');
  await page.waitForTimeout(150);
  t.eq(await page.$eval('g.obj image', i => i.getAttribute('href')), pickedHref,
    'Redoで選び直した画像に戻る');

  // --- 保存したJSONに画像フォルダの中身が含まれる ---
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#saveBtn'),
  ]);
  const savePath = path.join(os.tmpdir(), 'fp08_saved.json');
  await download.saveAs(savePath);
  const saved = JSON.parse(fs.readFileSync(savePath, 'utf8'));
  t.eq(saved.library.length, 2, '保存したJSONに画像フォルダの2枚が含まれる');
  t.ok(saved.library.every(it => typeof it.img === 'string' && it.img.startsWith('data:image/')),
    '画像フォルダの各画像が実データ(dataURL)として保存されている');
  t.ok(saved.objects.some(o => o.imgId), 'どの画像を選んだか(imgId)も保存されている');

  // --- 読み込むと画像フォルダも選択状態も復元される ---
  await page.reload();
  await page.waitForTimeout(300);
  t.eq(await page.locator('g.obj image').count(), 0, '再読み込み直後は何も配置されていない');
  await page.setInputFiles('#fileInput', savePath);
  await page.waitForTimeout(400);
  t.eq(await page.$eval('g.obj image', i => i.getAttribute('href')), pickedHref,
    '保存ファイルを読み込むと、選んだ画像がそのまま復元される');
  await page.click('#imgsBtn');
  await page.waitForTimeout(150);
  t.eq(await page.locator('.libcard').count(), 2, '画像フォルダの中身も復元される');

  // --- 一覧の見え方: 横5列 / 正方形 / 切り取らない / 縦は等間隔 ---
  // 縦長・横長が混ざっていても、どれも同じ大きさの正方形の枠に収まって見えること
  const shapes = [];
  for (const [name, w, h] of [['30001.png', 100, 400], ['30002.png', 400, 100], ['30003.png', 200, 200]]) {
    const fp = path.join(os.tmpdir(), name);
    await makeSizedPng(page, fp, w, h, '#3366cc');
    shapes.push(fp);
  }
  // 3行になるよう、合計12枚まで増やす
  const filler = [];
  for (let i = 4; i <= 12; i++) {
    const fp = path.join(os.tmpdir(), `3000${i}.png`.replace('3000', '300'));
    await makeSizedPng(page, fp, 120, 120, '#66aa66');
    filler.push(fp);
  }
  await page.setInputFiles('#imgsInput', [...shapes, ...filler]);
  await page.waitForTimeout(1200);

  const grid = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('.libcard')];
    const rects = cards.map(c => c.getBoundingClientRect());
    const tops = [...new Set(rects.map(r => Math.round(r.top)))].sort((a, b) => a - b);
    const inFirstRow = rects.filter(r => Math.round(r.top) === tops[0]).length;
    const imgs = cards.map(c => {
      const r = c.querySelector('.thumb').getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height) };
    });
    return {
      rows: tops.length, inFirstRow, imgs,
      thumbs: cards.filter(c => c.querySelector('.thumb img')).length,
      gaps: tops.slice(1).map((v, i) => v - tops[i]),
      fit: getComputedStyle(cards[0].querySelector('.thumb img')).objectFit,
      imgAspect: getComputedStyle(cards[0].querySelector('.thumb img')).aspectRatio,
      padTop: getComputedStyle(cards[0].querySelector('.thumb')).paddingTop,
    };
  });
  t.eq(grid.inFirstRow, 5, 'サムネイルは横5列に並ぶ');
  t.ok(grid.rows >= 3, '12枚入れると3行以上になる(前提確認)');
  t.eq(grid.fit, 'contain', '画像は切り取らず全体を表示する(object-fit: contain)');
  t.ok(grid.imgs.every(i => Math.abs(i.w - i.h) <= 1),
    `サムネイルの枠は正方形(実際: ${grid.imgs[0].w}×${grid.imgs[0].h})`);
  t.ok(new Set(grid.imgs.map(i => i.w)).size === 1,
    '縦長・横長が混ざっていても、すべて同じ大きさの枠に収まる');
  t.eq(grid.thumbs, grid.imgs.length, '画像は正方形の枠(.thumb)の中に入っている');
  // iOS Safariでは img に aspect-ratio を直接指定すると高さが潰れて細長い帯になる。
  // 正方形は枠側の padding-top:100% で作ること(この2つが崩れると同じ不具合が再発する)
  t.eq(grid.imgAspect, 'auto', 'imgにaspect-ratioは指定しない(iOS Safariで潰れるため)');
  t.ok(Math.abs(parseFloat(grid.padTop) - grid.imgs[0].w) <= 1,
    `正方形は枠のpadding-top:100%(幅と同じ高さ)で作っている(実際: ${grid.padTop})`);
  t.ok(Math.max(...grid.gaps) - Math.min(...grid.gaps) <= 2,
    `行の間隔が均等(実際: ${grid.gaps.join(', ')}px)`);

  // 画面を広げても5列のまま(自動で列数が増える指定だと、ここで6列以上になる)
  await page.setViewportSize({ width: 1700, height: 900 });
  await page.waitForTimeout(200);
  const wideCols = await page.evaluate(() => {
    const rects = [...document.querySelectorAll('.libcard')].map(c => c.getBoundingClientRect());
    const top = Math.min(...rects.map(r => Math.round(r.top)));
    return rects.filter(r => Math.round(r.top) === top).length;
  });
  t.eq(wideCols, 5, '画面を広げても横5列のまま');
  t.eq((await page.$eval('#libGrid', e => getComputedStyle(e).gridTemplateColumns)).split(' ').length, 5,
    '列数は5で固定されている(画面幅で増減しない)');
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.waitForTimeout(200);

  for (const f of [...shapes, ...filler]) fs.unlinkSync(f);

  t.noErrors(errors);
  await context.close();
  await browser.close();
  fs.unlinkSync(plainPath); fs.unlinkSync(numberedPath); fs.unlinkSync(savePath);
  return t.finish();
}

module.exports = { run };
if (require.main === module) run();
