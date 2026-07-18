// tests/fp02_floorplan_layers.js
// 図面アプリのレイヤー機能テスト:
// デフォルト在庫(ケース33+展示台69)、展示室図面の選択と画像読み込み、
// 作品への画像設定、レイヤー表示切替、描画順(テキスト最前面)を確認する。
const fs = require('fs');
const path = require('path');
const { chromium, mkRunner } = require('./helpers');

const FP_URL = 'file://' + path.join(__dirname, '..', 'floorplan', 'index.html');
const FIXTURE_PNG = path.join(__dirname, 'fixture.png');
const PRESET_CHROMIUM = '/opt/pw-browsers/chromium';
const launchOpts = fs.existsSync(PRESET_CHROMIUM) ? { executablePath: PRESET_CHROMIUM } : {};

async function run() {
  const t = mkRunner('fp02 図面アプリ レイヤー');
  const browser = await chromium.launch(launchOpts);
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console error: ' + m.text()); });
  await page.goto(FP_URL);
  await page.waitForTimeout(300);

  // --- デフォルト在庫 ---
  t.eq(await page.locator('g.obj').count(), 102, 'デフォルトでケース33+展示台69=102オブジェクトが配置されている');
  const caseCount = await page.$$eval('g.obj', gs =>
    gs.filter(g => { const r = g.querySelector('rect.body'); return r && r.getAttribute('stroke') === 'var(--case)'; }).length);
  t.eq(caseCount, 33, '可動ケースは33台');
  const caseXs = await page.$$eval('g.obj', gs => gs
    .filter(g => { const r = g.querySelector('rect.body'); return r && r.getAttribute('stroke') === 'var(--case)'; })
    .map(g => +g.getAttribute('transform').match(/translate\(([-\d.]+)/)[1]));
  t.ok(caseXs.every(x => x === caseXs[0] && x < 0), 'ケースは印刷範囲の左外(x<0)に縦一列(同一x)');
  const pedXs = await page.$$eval('g.obj', gs => gs
    .filter(g => { const r = g.querySelector('rect.body'); return r && r.getAttribute('stroke') === 'var(--fixture)'; })
    .map(g => +g.getAttribute('transform').match(/translate\(([-\d.]+)/)[1]));
  t.eq(pedXs.length, 69, '展示台は69台');
  t.ok(pedXs.every(x => x === pedXs[0] && x > 42000), '展示台は印刷範囲の右外(x>シート幅42000mm)に縦一列(同一x)');

  // --- レイヤー表示切替 ---
  await page.uncheck('#layerBar input[data-layer="furniture"]');
  await page.waitForTimeout(100);
  t.eq(await page.locator('g.obj').count(), 0, 'ケース・展示台レイヤーを隠すと在庫が消える');
  await page.check('#layerBar input[data-layer="furniture"]');
  await page.waitForTimeout(100);
  t.eq(await page.locator('g.obj').count(), 102, '再表示で在庫が戻る');

  // --- 展示室図面レイヤー ---
  t.eq(await page.$$eval('#roomSel option', os => os.map(o => o.textContent.trim())),
    ['(なし)', '展示室1-A（旧第1）', '展示室1-A（旧第2）', '展示室1-B', '展示室2-B'],
    '展示室図面はデフォルト4面+なしから選べる');
  await page.selectOption('#roomSel', 'r1a1');
  await page.waitForTimeout(100);
  await page.setInputFiles('#roomFile', FIXTURE_PNG);
  await page.waitForTimeout(200);
  t.eq(await page.locator('svg#plan > image').count(), 1, '図面画像が最背面に描画される');
  t.ok(await page.$eval('svg#plan', s => {
    const img = s.querySelector(':scope > image');
    const wall = s.querySelector('.wall-line') || s.querySelector('g.obj');
    return img && wall && (img.compareDocumentPosition(wall) & Node.DOCUMENT_POSITION_FOLLOWING);
  }), '図面画像はオブジェクトより背面(先に描画)');
  await page.uncheck('#layerBar input[data-layer="room"]');
  await page.waitForTimeout(100);
  t.eq(await page.locator('svg#plan > image').count(), 0, '図面レイヤーを隠すと画像が消える');
  await page.check('#layerBar input[data-layer="room"]');

  // --- 作品への画像設定 ---
  const svgBox = await page.locator('svg#plan').boundingBox();
  const cx = svgBox.x + svgBox.width / 2, cy = svgBox.y + svgBox.height / 2;
  await page.click('.tool[data-tool="work"]');
  await page.mouse.click(cx, cy);
  await page.waitForTimeout(100);
  await page.setInputFiles('#pImgFile', FIXTURE_PNG);
  await page.waitForTimeout(200);
  t.eq(await page.locator('g.obj image').count(), 1, '作品に画像を貼れる');

  // --- テキストは最前面 ---
  await page.click('.tool[data-tool="text"]');
  await page.mouse.click(cx + 60, cy + 60);
  await page.waitForTimeout(100);
  const lastObjText = await page.$$eval('g.obj', gs => {
    const last = gs[gs.length - 1];
    const tx = last.querySelector('text');
    return tx ? tx.textContent : '';
  });
  t.eq(lastObjText, 'テキスト', 'テキストが最前面(最後)に描画される');

  t.noErrors(errors);
  await context.close();
  await browser.close();
  return t.finish();
}

module.exports = { run };
if (require.main === module) run();
