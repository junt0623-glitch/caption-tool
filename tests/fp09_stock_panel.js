// tests/fp09_stock_panel.js
// 在庫パネルのテスト:
// この図面での使用数の表示 / 他の展示室(別の図面)での使用数の入力と残数への反映 /
// ケース台数の設定値 / 背景つきケースの太線表現。
const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium, mkRunner } = require('./helpers');

const FP_URL = 'file://' + path.join(__dirname, '..', 'floorplan', 'index.html');
const PRESET_CHROMIUM = '/opt/pw-browsers/chromium';
const launchOpts = fs.existsSync(PRESET_CHROMIUM) ? { executablePath: PRESET_CHROMIUM } : {};

// 指定した在庫キーの台を1台取り出して図面中央付近に置く
async function takeFromStock(page, key, dx = 0) {
  const box = await page.locator(`g[data-stock="${key}"] rect`).boundingBox();
  const svgBox = await page.locator('svg#plan').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(svgBox.x + svgBox.width / 2 + dx, svgBox.y + svgBox.height / 2, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(100);
}

async function run() {
  const t = mkRunner('fp09 在庫パネル(他図面ぶんの調整)');
  const browser = await chromium.launch(launchOpts);
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console error: ' + m.text()); });
  await page.goto(FP_URL);
  await page.waitForTimeout(300);

  const usedOf = key => page.$eval(`g[data-stock="${key}"] .stock-used`, e => e.textContent);
  const remainOf = key => page.$eval(`g[data-stock="${key}"] .stock-remain`, e => e.textContent);

  // --- 指定された台数になっていること ---
  const totals = await page.$$eval('g[data-stock]', gs => gs.map(g =>
    [g.dataset.stock, g.querySelector('.stock-remain').textContent.split('/')[1].trim()]));
  const totalMap = Object.fromEntries(totals);
  t.eq(totalMap['c_beta'], '3', 'βの合計は3台');
  t.eq(totalMap['c_180'], '4', '180角の合計は4台');
  t.eq(totalMap['c_ym'], '3', '横長免震の合計は3台');
  t.eq(totalMap['c_ymb'], '3', '横長免震背景の合計は3台');
  t.eq(totalMap['c_yh'], '2', '横長非免震の合計は2台');
  t.eq(totalMap['c_yhb'], '3', '横長非免震背景の合計は3台');
  t.eq(totalMap['c_andon'], '5', '行燈免震の合計は5台');
  t.eq(totalMap['c_andonh'], '1', '行燈非免震(新規)の合計は1台');
  t.eq(await page.$eval('g[data-stock="c_andonh"] rect', r =>
    [+r.getAttribute('width'), +r.getAttribute('height')]), [1000, 1000],
    '行燈非免震のサイズは行燈免震と同じ1.0×1.0m');

  // --- 背景つきケースは長辺の1本が3倍の太線で描かれる ---
  const backEdge = await page.$eval('g[data-stock="c_ymb"]', g => {
    const r = g.querySelector('rect'), l = g.querySelector('line');
    if (!l) return null;
    return {
      base: +r.getAttribute('stroke-width'), thick: +l.getAttribute('stroke-width'),
      x1: +l.getAttribute('x1'), x2: +l.getAttribute('x2'),
      y1: +l.getAttribute('y1'), y2: +l.getAttribute('y2'),
      w: +r.getAttribute('width'), h: +r.getAttribute('height'),
    };
  });
  t.ok(backEdge, '横長免震背景には太線が引かれている');
  t.eq(backEdge.thick, backEdge.base * 3, '太線の太さは通常の3倍');
  t.eq(backEdge.x2 - backEdge.x1, backEdge.w, '太線は長辺(幅の側)いっぱいに引かれている');
  t.eq(backEdge.y1, backEdge.y2, '太線は辺に沿って水平に引かれている');
  t.eq(await page.$$eval('g[data-stock="c_ym"] line', ls => ls.length), 0,
    '背景なしの横長免震には太線が付かない');

  // --- この図面での使用数が表示される ---
  t.eq(await usedOf('c_beta'), '使用 0', '初期状態はどれも使用0台');
  await takeFromStock(page, 'c_beta', -3000);
  await takeFromStock(page, 'c_beta', 3000);
  t.eq(await usedOf('c_beta'), '使用 2', 'βを2台配置すると「使用 2」と表示される');
  t.eq(await remainOf('c_beta'), '残 1 / 3', '残数は合計3から2台ぶん引かれて1になる');

  // 配置済みオブジェクトにも太線が引かれることを、背景つきケースを1台置いて確認
  await takeFromStock(page, 'c_ymb', 6000);
  t.eq(await page.$$eval('g.obj line', ls => ls.length), 1,
    '配置した背景つきケースにも太線が描かれる');

  // --- 在庫パネル: 他の図面での使用数を入れると残数に反映される ---
  await page.click('#stockBtn');
  await page.waitForTimeout(150);
  t.ok(!(await page.locator('#stockModal').isHidden()), 'ヘッダーの「📦 在庫」でパネルが開く');
  const rowOf = key => page.$eval(`#stockTable input[data-other="${key}"]`,
    inp => [...inp.closest('tr').querySelectorAll('td')].map(td => td.textContent.trim()));
  let row = await rowOf('c_beta');
  t.ok(row[1] === '3' && row[2] === '2', 'パネルに総数3・この図面2が並ぶ');
  t.eq(row[4], '1', 'パネルの残数もこの図面ぶんを引いた1');

  await page.fill('#stockTable input[data-other="c_beta"]', '1');
  await page.dispatchEvent('#stockTable input[data-other="c_beta"]', 'change');
  await page.waitForTimeout(150);
  row = await rowOf('c_beta');
  t.eq(row[4], '0', '他の図面で1台使ったと入力すると残数が0になる');
  t.eq(await remainOf('c_beta'), '残 0 / 3', '図面上のパレットの残数も0に更新される');
  t.eq(await usedOf('c_beta'), '使用 2 (他 1)', 'パレットに他図面ぶんも併記される');

  // --- 取りすぎ(マイナス)は警告表示になり、それ以上は取り出せない ---
  await page.fill('#stockTable input[data-other="c_beta"]', '3');
  await page.dispatchEvent('#stockTable input[data-other="c_beta"]', 'change');
  await page.waitForTimeout(150);
  t.eq((await rowOf('c_beta'))[4], '-2', '合計を超えると残数がマイナスで表示される');
  t.ok((await page.$eval('#stockNote', e => e.textContent)).includes('β'),
    '足りていない種類がパネル下部に警告として出る');
  await page.click('#stockClose');
  await page.waitForTimeout(100);
  const objsBefore = await page.locator('g.obj').count();
  await takeFromStock(page, 'c_beta', -6000);
  t.eq(await page.locator('g.obj').count(), objsBefore, '残数がマイナスのときは新たに取り出せない');

  // --- 他の図面ぶんの入力は保存され、読み込みで復元される ---
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#saveBtn'),
  ]);
  const savePath = path.join(os.tmpdir(), 'fp09_saved.json');
  await download.saveAs(savePath);
  const saved = JSON.parse(fs.readFileSync(savePath, 'utf8'));
  t.eq(saved.usedElsewhere.c_beta, 3, '他の図面での使用台数がJSONに保存される');

  await page.reload();
  await page.waitForTimeout(300);
  await page.setInputFiles('#fileInput', savePath);
  await page.waitForTimeout(300);
  t.eq(await remainOf('c_beta'), '残 -2 / 3', '読み込むと他の図面ぶんを含めた残数が復元される');

  t.noErrors(errors);
  await context.close();
  await browser.close();
  fs.unlinkSync(savePath);
  return t.finish();
}

module.exports = { run };
if (require.main === module) run();
