// tests/fp17_wall_style.js
// 壁の太さと色を変えられることのテスト。
//
// 仕様:
//  ・壁ツールの右パネルで太さ(mm)と色(6色)を選ぶと、これから描く壁に適用される。
//  ・壁を選ぶと、その壁の太さと色をあとから変えられる。
//  ・壁を複数選ぶと、選んだ壁すべてにまとめて適用される。
//  ・太さ・色は壁ごとに図面データへ保存され、読み込みで戻る。
//  ・太さ・色を持たない古い保存ファイルは、これまでどおりの太さ(150mm)と黒で描く。
const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium, mkRunner } = require('./helpers');

const FP_URL = 'file://' + path.join(__dirname, '..', 'floorplan', 'index.html');
const PRESET_CHROMIUM = '/opt/pw-browsers/chromium';
const launchOpts = fs.existsSync(PRESET_CHROMIUM) ? { executablePath: PRESET_CHROMIUM } : {};

// 図面上に描かれている壁の線の見た目(太さ・色)を読む
const drawnWalls = page => page.$$eval('line.wall-line', ls => ls.map(l => ({
  w: +l.getAttribute('stroke-width'),
  stroke: l.style.stroke,
})));
const wallData = page => page.evaluate(() => state.walls.map(w => ({ t: w.t, c: w.c })));

async function run() {
  const t = mkRunner('fp17 壁の太さと色');
  const browser = await chromium.launch(launchOpts);
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console error: ' + m.text()); });
  await page.goto(FP_URL);
  await page.waitForTimeout(300);

  const box = await page.locator('svg#plan').boundingBox();
  const drawWall = async (i) => {
    const y = box.y + box.height * 0.3 + i * 60;
    await page.mouse.move(box.x + box.width * 0.35, y);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.35 + 240, y, { steps: 4 });
    await page.mouse.up();
    await page.waitForTimeout(150);
  };

  // --- 操作部は壁ツールのときに出る ---
  await page.click('.tool[data-tool="wall"]');
  await page.waitForTimeout(150);
  t.eq(await page.locator('#wallThick').count(), 1, '壁ツールに太さの欄が出る');
  t.eq(await page.locator('[data-wcolor]').count(), 6, '色は6色から選べる');
  t.eq(await page.$eval('#wallThick', e => e.value), '150', '太さの既定は150mm(これまでどおり)');
  t.eq(await page.$eval('[data-wcolor].on', e => e.dataset.wcolor), 'ink', '色の既定は黒');

  // --- 既定を変えると、これから描く壁に効く ---
  await page.fill('#wallThick', '400');
  await page.dispatchEvent('#wallThick', 'change');
  await page.click('[data-wcolor="red"]');
  await page.waitForTimeout(150);
  await drawWall(0);
  let drawn = await drawnWalls(page);
  t.eq(drawn.length, 1, '壁が1本描けた(前提確認)');
  t.eq(drawn[0].w, 400, '設定した太さ400mmで描かれる');
  t.eq(drawn[0].stroke, 'rgb(192, 57, 43)', '設定した色(赤)で描かれる');
  t.eq(await wallData(page), [{ t: 400, c: 'red' }], '太さと色が壁のデータに入る');

  // --- 描いたあとから、選んだ壁の太さ・色を変えられる ---
  await page.click('.tool[data-tool="select"]');
  await page.waitForTimeout(100);
  await page.evaluate(() => { selectOnly(state.walls[0].id); render(); renderSide(); });
  await page.waitForTimeout(150);
  t.eq(await page.locator('#wallThick').count(), 1, '壁を選ぶと太さの欄が出る');
  t.eq(await page.$eval('#wallThick', e => e.value), '400', 'その壁の今の太さが出る');
  t.eq(await page.$eval('[data-wcolor].on', e => e.dataset.wcolor), 'red', 'その壁の今の色に印がつく');

  await page.fill('#wallThick', '80');
  await page.dispatchEvent('#wallThick', 'change');
  await page.waitForTimeout(150);
  await page.click('[data-wcolor="blue"]');
  await page.waitForTimeout(150);
  drawn = await drawnWalls(page);
  t.eq(drawn[0].w, 80, 'あとから太さを変えられる');
  t.eq(await wallData(page), [{ t: 80, c: 'blue' }], 'あとから色も変えられる');

  // 変更はUndoで戻せる
  await page.click('#undoBtn');
  await page.waitForTimeout(150);
  t.eq((await wallData(page))[0].c, 'red', '色の変更はUndoで戻せる');
  await page.click('#redoBtn');
  await page.waitForTimeout(150);
  t.eq((await wallData(page))[0].c, 'blue', 'Redoでやり直せる');

  // --- 複数の壁にまとめて適用できる ---
  await page.click('.tool[data-tool="wall"]');
  await page.waitForTimeout(100);
  await drawWall(1);
  await drawWall(2);
  await page.click('.tool[data-tool="select"]');
  await page.waitForTimeout(100);
  await page.evaluate(() => {
    selectedIds = new Set(state.walls.map(w => w.id));
    selectedId = state.walls[0].id;
    render(); renderSide();
  });
  await page.waitForTimeout(150);
  t.eq(await page.locator('#wallThick').count(), 1, '複数選択でも太さの欄が出る');
  await page.fill('#wallThick', '250');
  await page.dispatchEvent('#wallThick', 'change');
  await page.waitForTimeout(150);
  await page.click('[data-wcolor="green"]');
  await page.waitForTimeout(150);
  t.eq(await wallData(page), [
    { t: 250, c: 'green' }, { t: 250, c: 'green' }, { t: 250, c: 'green' },
  ], '選んだ壁すべてに太さと色が適用される');
  t.ok((await drawnWalls(page)).every(w => w.w === 250), '図面上の見た目にも反映される');

  // --- コピー&ペーストでも太さ・色が引き継がれる ---
  await page.evaluate(() => { selectOnly(state.walls[0].id); render(); renderSide(); });
  await page.waitForTimeout(100);
  await page.keyboard.press('Control+c');
  await page.keyboard.press('Control+v');
  await page.waitForTimeout(200);
  const pasted = (await wallData(page)).slice(-1)[0];
  t.eq(pasted, { t: 250, c: 'green' }, '貼り付けた壁も同じ太さ・色になる');

  // --- 太さ・色は保存され、読み込みで戻る ---
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#saveBtn'),
  ]);
  const savePath = path.join(os.tmpdir(), 'fp17_saved.json');
  await download.saveAs(savePath);
  const saved = JSON.parse(fs.readFileSync(savePath, 'utf8'));
  t.ok(saved.walls.every(w => w.t === 250 && w.c === 'green'),
    '壁ごとの太さ・色が図面データに保存される');

  await page.reload();
  await page.waitForTimeout(300);
  await page.setInputFiles('#fileInput', savePath);
  await page.waitForTimeout(400);
  drawn = await drawnWalls(page);
  t.ok(drawn.length > 0 && drawn.every(w => w.w === 250 && w.stroke === 'rgb(47, 133, 90)'),
    '読み込むと太さも色もそのまま復元される');

  // --- 太さ・色を持たない古い保存ファイルは、これまでどおり150mmの黒で描く ---
  const old = JSON.parse(fs.readFileSync(savePath, 'utf8'));
  old.walls = old.walls.map(({ id, x1, y1, x2, y2 }) => ({ id, x1, y1, x2, y2 }));
  delete old.wallThick; delete old.wallColor;
  const oldPath = path.join(os.tmpdir(), 'fp17_old.json');
  fs.writeFileSync(oldPath, JSON.stringify(old));
  await page.setInputFiles('#fileInput', oldPath);
  await page.waitForTimeout(400);
  drawn = await drawnWalls(page);
  t.ok(drawn.length > 0 && drawn.every(w => w.w === 150),
    '太さを持たない古い壁はこれまでどおり150mmで描く');
  t.ok(drawn.every(w => w.stroke === 'rgb(43, 43, 46)'),
    '色を持たない古い壁はこれまでどおり黒で描く');
  await page.click('.tool[data-tool="wall"]');
  await page.waitForTimeout(150);
  t.eq(await page.$eval('#wallThick', e => e.value), '150',
    '既定を持たない古いファイルでは太さの既定も150mmに戻る');

  t.noErrors(errors);
  await context.close();
  await browser.close();
  fs.unlinkSync(savePath); fs.unlinkSync(oldPath);
  return t.finish();
}

module.exports = { run };
if (require.main === module) run();
