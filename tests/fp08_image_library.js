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
  // 作品ツールは配置後もそのまま(次の番号を続けて置けるように)なので、
  // 図面上の作品を触る前に選択ツールへ戻す
  await page.click('.tool[data-tool="select"]');
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

  t.noErrors(errors);
  await context.close();
  await browser.close();
  fs.unlinkSync(plainPath); fs.unlinkSync(numberedPath); fs.unlinkSync(savePath);
  return t.finish();
}

module.exports = { run };
if (require.main === module) run();
