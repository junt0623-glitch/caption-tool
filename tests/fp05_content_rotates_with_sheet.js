// tests/fp05_content_rotates_with_sheet.js
// 印刷範囲(A3)の回転時、壁・作品・ケース・展示台などの配置済みの全てが
// まとめて回転に対応する(位置がずれず、向きも一緒に回る)ことを確認する。
//
// 0°→90°回転(A3横→A3縦、42000×29700 → 29700×42000)での座標変換は、
// remapPointForRotation()の数式を手計算すると (x,y) → (29700-y, x) に一致する
// (0°でのフレーム座標=物理座標なので導出が単純になるケース)。
// ドラッグ配置の実座標はマウス操作の丸め等で数十mm程度ずれうるため、
// 「配置後に実際に読み取った座標」を基準にこの式で期待値を計算して検証する。
const fs = require('fs');
const path = require('path');
const { chromium, mkRunner } = require('./helpers');

const FP_URL = 'file://' + path.join(__dirname, '..', 'floorplan', 'index.html');
const PRESET_CHROMIUM = '/opt/pw-browsers/chromium';
const launchOpts = fs.existsSync(PRESET_CHROMIUM) ? { executablePath: PRESET_CHROMIUM } : {};

async function planToClient(page, px, py) {
  return await page.evaluate(([x, y]) => {
    const svg = document.getElementById('plan');
    const pt = svg.createSVGPoint(); pt.x = x; pt.y = y;
    const s = pt.matrixTransform(svg.getScreenCTM());
    return { x: s.x, y: s.y };
  }, [px, py]);
}

function expectAfter90(x, y) { return [29700 - y, x]; } // 0°→90°の期待値(本文コメント参照)

async function readObjs(page) {
  return await page.evaluate(() => [...document.querySelectorAll('g.obj')].map(g => {
    const t = g.getAttribute('transform');
    const m = t.match(/translate\(([-\d.]+),([-\d.]+)\)/);
    const r = t.match(/rotate\(([-\d.]+)\)/);
    return { id: +g.dataset.id, x: +m[1], y: +m[2], rot: r ? +r[1] : 0 };
  }));
}

async function run() {
  const t = mkRunner('fp05 印刷範囲の回転で配置物もまとめて回転');
  const browser = await chromium.launch(launchOpts);
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console error: ' + m.text()); });
  await page.goto(FP_URL);
  await page.waitForTimeout(300);

  // --- 壁を既知の座標に描く(ドラッグ描画は始点・終点をそのままsnapするので正確) ---
  const wStart = await planToClient(page, 8000, 4000);
  const wEnd = await planToClient(page, 20000, 4000);
  await page.click('.tool[data-tool="wall"]');
  await page.mouse.move(wStart.x, wStart.y);
  await page.mouse.down();
  await page.mouse.move(wEnd.x, wEnd.y, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(80);
  const wallBefore = await page.$eval('line.wall-line', l =>
    ({ x1: +l.getAttribute('x1'), y1: +l.getAttribute('y1'), x2: +l.getAttribute('x2'), y2: +l.getAttribute('y2') }));
  t.eq([wallBefore.x1, wallBefore.y1, wallBefore.x2, wallBefore.y2], [8000, 4000, 20000, 4000],
    '壁を(8000,4000)-(20000,4000)に描けた');

  // --- ケースを在庫からドラッグ配置(ドラッグ量には多少の丸めが入るので実座標を後で読み取る) ---
  const caseBox = await page.locator('g[data-stock="c_alpha"] rect').boundingBox();
  const caseDest = await planToClient(page, 10000, 20000);
  await page.mouse.move(caseBox.x + caseBox.width / 2, caseBox.y + caseBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(caseDest.x, caseDest.y, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(80);

  // --- 作品を既知の座標に配置し、向きを30度にしておく ---
  const workDest = await planToClient(page, 15000, 10000);
  await page.click('.tool[data-tool="work"]');
  await page.mouse.click(workDest.x, workDest.y);
  await page.waitForTimeout(80);
  await page.fill('#pRot', '30');
  await page.dispatchEvent('#pRot', 'input');
  await page.waitForTimeout(80);

  const objBefore = await readObjs(page);
  t.eq(objBefore.length, 2, 'ケースと作品の2つが配置されている');
  const caseB = objBefore.find(o => o.rot === 0);
  const workB = objBefore.find(o => o.rot === 30);
  t.ok(caseB && workB, 'ケース(向き0度)と作品(向き30度)を判別できる');

  // --- 印刷範囲を0°→90°に回転する ---
  await page.selectOption('#sheetSel', '90');
  await page.waitForTimeout(100);

  const wallAfter = await page.$eval('line.wall-line', l =>
    ({ x1: +l.getAttribute('x1'), y1: +l.getAttribute('y1'), x2: +l.getAttribute('x2'), y2: +l.getAttribute('y2') }));
  const [ex1, ey1] = expectAfter90(8000, 4000), [ex2, ey2] = expectAfter90(20000, 4000);
  t.eq([wallAfter.x1, wallAfter.y1, wallAfter.x2, wallAfter.y2], [ex1, ey1, ex2, ey2],
    '印刷範囲を90°回転すると壁の両端も期待どおりの位置に回転する');

  const objAfter = await readObjs(page);
  const caseA = objAfter.find(o => o.id === caseB.id);
  const workA = objAfter.find(o => o.id === workB.id);
  const [cex, cey] = expectAfter90(caseB.x, caseB.y);
  t.eq([caseA.x, caseA.y], [cex, cey], 'ケースの位置も回転前の実座標から計算した期待どおりの座標になる');
  t.eq(caseA.rot, 90, 'ケース自体の向きも回転量(90度)ぶん一緒に回る(0→90)');
  const [wex, wey] = expectAfter90(workB.x, workB.y);
  t.eq([workA.x, workA.y], [wex, wey], '作品の位置も回転前の実座標から計算した期待どおりの座標になる');
  t.eq(workA.rot, 120, '作品の向きは元の30度に回転量90度が加算されて120度になる');

  // --- Undoで元(0°・元の位置)に戻る ---
  await page.click('#undoBtn');
  await page.waitForTimeout(100);
  const wallUndone = await page.$eval('line.wall-line', l =>
    ({ x1: +l.getAttribute('x1'), y1: +l.getAttribute('y1'), x2: +l.getAttribute('x2'), y2: +l.getAttribute('y2') }));
  t.eq([wallUndone.x1, wallUndone.y1, wallUndone.x2, wallUndone.y2], [8000, 4000, 20000, 4000],
    'Undoで壁の位置が回転前に戻る');
  const objUndone = await readObjs(page);
  t.eq(objUndone.find(o => o.id === caseB.id), caseB, 'Undoでケースの位置・向きも回転前に戻る');
  t.eq(objUndone.find(o => o.id === workB.id), workB, 'Undoで作品の位置・向きも回転前に戻る');
  t.eq(await page.$eval('#sheetSel', s => s.value), '0', 'Undoで印刷範囲の回転も0°に戻る');

  // --- 90°刻みで4回まとめて回して1周させ、誤差なくちょうど元の位置・向きに戻ることを確認 ---
  // (直前のUndoで確実に0°・元の座標へ戻した状態から改めて1周させる)
  for (const r of ['90', '180', '270', '0']){ await page.selectOption('#sheetSel', r); await page.waitForTimeout(80); }
  const objFullCircle = await readObjs(page);
  t.eq(objFullCircle.find(o => o.id === caseB.id), caseB,
    '90°×4回転(1周)してもケースの位置・向きに誤差が出ずちょうど元に戻る');
  t.eq(objFullCircle.find(o => o.id === workB.id), workB,
    '90°×4回転(1周)しても作品の位置・向きに誤差が出ずちょうど元に戻る');
  const wallFullCircle = await page.$eval('line.wall-line', l =>
    ({ x1: +l.getAttribute('x1'), y1: +l.getAttribute('y1'), x2: +l.getAttribute('x2'), y2: +l.getAttribute('y2') }));
  t.eq([wallFullCircle.x1, wallFullCircle.y1, wallFullCircle.x2, wallFullCircle.y2], [8000, 4000, 20000, 4000],
    '90°×4回転(1周)しても壁の位置に誤差が出ずちょうど元に戻る');

  t.noErrors(errors);
  await context.close();
  await browser.close();
  return t.finish();
}

module.exports = { run };
if (require.main === module) run();
