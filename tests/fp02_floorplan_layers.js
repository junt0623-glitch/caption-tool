// tests/fp02_floorplan_layers.js
// 図面アプリのレイヤー・在庫・リスト連携テスト:
// 在庫パレット(種類ごと1つ+残数)、取り出しで残数減/削除で復元、
// 作品リスト(CSV)読み込みと番号連携、作品画像の一括読み込み(圧縮)、
// 縮尺%によるケース・展示台のサイズ変更、展示室図面、レイヤー表示切替。
const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium, mkRunner } = require('./helpers');

const FP_URL = 'file://' + path.join(__dirname, '..', 'floorplan', 'index.html');
const FIXTURE_PNG = path.join(__dirname, 'fixture.png');
const PRESET_CHROMIUM = '/opt/pw-browsers/chromium';
const launchOpts = fs.existsSync(PRESET_CHROMIUM) ? { executablePath: PRESET_CHROMIUM } : {};

async function run() {
  const t = mkRunner('fp02 図面アプリ レイヤー・在庫');
  const browser = await chromium.launch(launchOpts);
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console error: ' + m.text()); });
  await page.goto(FP_URL);
  await page.waitForTimeout(300);

  const svgBox = await page.locator('svg#plan').boundingBox();
  const cx = svgBox.x + svgBox.width / 2, cy = svgBox.y + svgBox.height / 2;

  // --- 在庫パレット: 種類ごと1つだけ+残数表示 ---
  t.eq(await page.locator('g[data-stock]').count(), 14, '在庫パレットは種類ごと1つ(ケース9+展示台5=14)');
  const caseXs = await page.$$eval('g[data-stock^="c_"]', gs =>
    gs.map(g => +g.getAttribute('transform').match(/translate\(([-\d.]+)/)[1]));
  t.ok(caseXs.length === 9 && caseXs.every(x => x === caseXs[0] && x < 0),
    'ケース9種は印刷範囲の左外に縦一列');
  const pedXs = await page.$$eval('g[data-stock^="p_"]', gs =>
    gs.map(g => +g.getAttribute('transform').match(/translate\(([-\d.]+)/)[1]));
  t.ok(pedXs.length === 5 && pedXs.every(x => x === pedXs[0] && x > 42000),
    '展示台5種は印刷範囲の右外に縦一列');
  const remainOf = key => page.$eval(`g[data-stock="${key}"] text:nth-of-type(2)`, e => e.textContent);
  t.eq(await remainOf('c_alpha'), '残 2', 'αの残数は2');
  t.eq(await remainOf('p_120'), '残 30', '展示台1.2×0.9の残数は30');

  // --- 取り出すと残数が減り、削除で在庫に戻る ---
  const alphaBox = await page.locator('g[data-stock="c_alpha"] rect').boundingBox();
  await page.mouse.move(alphaBox.x + alphaBox.width / 2, alphaBox.y + alphaBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(cx, cy, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(100);
  t.eq(await page.locator('g.obj').count(), 1, 'パレットからドラッグでケースを1台取り出せる');
  t.eq(await remainOf('c_alpha'), '残 1', '取り出すと残数が1減る');
  await page.keyboard.press('Delete');
  await page.waitForTimeout(100);
  t.eq(await remainOf('c_alpha'), '残 2', '配置したケースを削除すると残数が戻る');

  // --- 縮尺%: ケース・展示台の表示サイズが変わる ---
  const alphaW = () => page.$eval('g[data-stock="c_alpha"] rect', r => +r.getAttribute('width'));
  t.eq(await alphaW(), 2400, '縮尺100%でα幅2400mm');
  await page.fill('#scalePct', '50');
  await page.dispatchEvent('#scalePct', 'change');
  await page.waitForTimeout(100);
  t.eq(await alphaW(), 1200, '縮尺50%でα幅1200mm(半分)');
  await page.fill('#scalePct', '100');
  await page.dispatchEvent('#scalePct', 'change');
  await page.waitForTimeout(100);

  // --- 作品リスト(CSV)の読み込み ---
  const csvPath = path.join(os.tmpdir(), 'fp02_worklist.csv');
  fs.writeFileSync(csvPath, '番号,作品名,作家名\n10001,春の海,山田太郎\n10002,秋の山,佐藤花子\n');
  await page.setInputFiles('#wlInput', csvPath);
  await page.waitForTimeout(200);
  t.eq(await page.locator('#workList li[data-no]').count(), 2, 'CSVを読み込むと作品リストに2件表示される');
  t.eq(await page.$eval('#workList li[data-no="10001"] .t', e => e.textContent), '春の海', '作品名が表示される');
  t.ok((await page.$eval('#workList li[data-no="10001"] .s', e => e.textContent)).includes('未配置'),
    '読み込み直後は未配置');

  // --- 作品配置: リストの番号が自動で付き、図面上は番号のみ表示 ---
  await page.click('.tool[data-tool="work"]');
  await page.mouse.click(cx - 100, cy - 100);
  await page.waitForTimeout(100);
  t.eq(await page.$eval('g.obj .badge text', e => e.textContent), '10001',
    '配置した作品にリストの番号10001が付く');
  t.eq(await page.$$eval('g.obj text', ts => ts.map(x => x.textContent)), ['10001'],
    '図面上は番号のみ表示(作品名は出ない)');
  t.ok((await page.$eval('#workList li[data-no="10001"] .s', e => e.textContent)).includes('配置済'),
    'リスト側が配置済になる');

  // --- 作品画像の一括読み込み(ファイル名の番号と対応) ---
  const imgPath = path.join(os.tmpdir(), '10001.png');
  fs.copyFileSync(FIXTURE_PNG, imgPath);
  await page.setInputFiles('#imgsInput', imgPath);
  await page.waitForTimeout(400);
  t.eq(await page.locator('g.obj image').count(), 1, '番号10001の作品に画像が表示される');
  t.ok(await page.$eval('g.obj image', i => i.getAttribute('href').startsWith('data:image/jpeg')),
    '画像はJPEGに圧縮して保持される');
  t.eq(await page.locator('#workList .thumb').count(), 1, 'リストにもサムネイルが出る');

  // --- 展示室図面(最背面)とレイヤー切替 ---
  await page.keyboard.press('Escape'); // 選択解除して図面パネルを表示
  await page.waitForTimeout(100);
  t.eq(await page.$$eval('#roomSel option', os2 => os2.map(o => o.textContent.trim())),
    ['(なし)', '展示室1-A（旧第1）', '展示室1-A（旧第2）', '展示室1-B', '展示室2-B'],
    '展示室図面はデフォルト4面+なしから選べる');
  await page.selectOption('#roomSel', 'r1a1');
  await page.waitForTimeout(100);
  await page.setInputFiles('#roomFile', FIXTURE_PNG);
  await page.waitForTimeout(200);
  t.eq(await page.locator('svg#plan > image').count(), 1, '図面画像が最背面に描画される');
  t.ok(await page.$eval('svg#plan', s => {
    const img = s.querySelector(':scope > image');
    const obj = s.querySelector('g.obj');
    return img && obj && (img.compareDocumentPosition(obj) & Node.DOCUMENT_POSITION_FOLLOWING);
  }), '図面画像はオブジェクトより背面(先に描画)');
  await page.uncheck('#layerBar input[data-layer="room"]');
  await page.waitForTimeout(100);
  t.eq(await page.locator('svg#plan > image').count(), 0, '図面レイヤーを隠すと画像が消える');
  await page.check('#layerBar input[data-layer="room"]');
  await page.uncheck('#layerBar input[data-layer="furniture"]');
  await page.waitForTimeout(100);
  t.eq(await page.locator('g[data-stock]').count(), 0, 'ケース・展示台レイヤーを隠すと在庫パレットも消える');
  await page.check('#layerBar input[data-layer="furniture"]');

  // --- テキストは最前面 ---
  await page.click('.tool[data-tool="text"]');
  await page.mouse.click(cx + 60, cy + 60);
  await page.waitForTimeout(100);
  const lastObjText = await page.$$eval('g.obj', gs => {
    const tx = gs[gs.length - 1].querySelector('text');
    return tx ? tx.textContent : '';
  });
  t.eq(lastObjText, 'テキスト', 'テキストが最前面(最後)に描画される');

  t.noErrors(errors);
  await context.close();
  await browser.close();
  fs.unlinkSync(csvPath); fs.unlinkSync(imgPath);
  return t.finish();
}

module.exports = { run };
if (require.main === module) run();
