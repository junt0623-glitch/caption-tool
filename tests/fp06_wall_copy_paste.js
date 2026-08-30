// tests/fp06_wall_copy_paste.js
// 「壁を描く」で作成した壁のコピー&ペースト(Ctrl+C / Ctrl+V、および
// 右パネルのコピーボタン)を検証する。
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

async function drawWall(page, x1, y1, x2, y2) {
  const start = await planToClient(page, x1, y1);
  const end = await planToClient(page, x2, y2);
  await page.click('.tool[data-tool="wall"]');
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(80);
}

async function readWalls(page) {
  return await page.$$eval('line.wall-line', ls => ls.map(l =>
    ({ id: +l.dataset.id, x1: +l.getAttribute('x1'), y1: +l.getAttribute('y1'),
       x2: +l.getAttribute('x2'), y2: +l.getAttribute('y2') })));
}

async function run() {
  const t = mkRunner('fp06 壁のコピー&ペースト');
  const browser = await chromium.launch(launchOpts);
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console error: ' + m.text()); });
  await page.goto(FP_URL);
  await page.waitForTimeout(300);

  // --- 1本の壁を描いて選択し、パネルのコピーボタンとCtrl+Vでペースト ---
  await drawWall(page, 8000, 6000, 16000, 6000);
  let walls = await readWalls(page);
  t.eq(walls.length, 1, '壁を1本描けた');
  const original = walls[0];

  await page.click('.tool[data-tool="select"]');
  const mid = await planToClient(page, (original.x1 + original.x2) / 2, original.y1);
  await page.mouse.click(mid.x, mid.y);
  await page.waitForTimeout(80);
  t.ok(await page.locator('#copyWallBtn').count() > 0, '壁を選択すると右パネルにコピーボタンが出る');

  await page.click('#copyWallBtn');
  await page.keyboard.press('Control+v');
  await page.waitForTimeout(100);
  walls = await readWalls(page);
  t.eq(walls.length, 2, 'コピーボタン→Ctrl+Vで壁が複製される');
  const pasted1 = walls.find(w => w.id !== original.id);
  t.eq([pasted1.x1 - original.x1, pasted1.y1 - original.y1, pasted1.x2 - original.x2, pasted1.y2 - original.y2],
    [500, 500, 500, 500], '貼り付けた壁は元から(500,500)だけずれた位置に複製される');

  // --- もう一度Ctrl+Vすると、元の壁からさらに離れた位置(2倍のずれ)に複製される ---
  await page.keyboard.press('Control+v');
  await page.waitForTimeout(100);
  walls = await readWalls(page);
  t.eq(walls.length, 3, '続けてCtrl+Vすると3本目が複製される');
  const pasted2 = walls.find(w => w.id !== original.id && w.id !== pasted1.id);
  t.eq([pasted2.x1 - original.x1, pasted2.y1 - original.y1], [1000, 1000],
    '2回目の貼り付けは元から2倍(1000,1000)ずれた位置になる(重ならないよう毎回さらにずらす)');

  // --- Undoで直前の貼り付けだけが取り消される ---
  await page.click('#undoBtn');
  await page.waitForTimeout(100);
  walls = await readWalls(page);
  t.eq(walls.length, 2, 'Undoで直前に貼り付けた1本だけが消える');

  // --- Ctrl+Cで明示的にコピーしてからCtrl+V(キーボードのみの操作) ---
  await page.click('.tool[data-tool="select"]');
  await page.mouse.click(mid.x, mid.y); // 元の壁を選び直す
  await page.waitForTimeout(80);
  await page.keyboard.press('Control+c');
  await page.keyboard.press('Control+v');
  await page.waitForTimeout(100);
  walls = await readWalls(page);
  t.eq(walls.length, 3, 'Ctrl+C→Ctrl+Vのキーボード操作だけでも壁を複製できる');
  // コピーし直したので、ずれ幅は500に戻っているはず(新しいコピー基準でカウントし直す)
  const pastedKb = walls.find(w => w.id !== original.id && w.id !== pasted1.id);
  t.eq([pastedKb.x1 - original.x1, pastedKb.y1 - original.y1], [500, 500],
    'コピーし直すとずれ幅が500からカウントし直される');

  // --- 貼り付け直後は貼り付けたものが選択状態になっている ---
  t.ok(await page.$eval('svg#plan', s => {
    const lines = [...s.querySelectorAll('line.wall-line')];
    return lines.some(l => l.style.stroke); // 選択された壁はinline styleで強調色が付く
  }), '貼り付けた壁は選択状態になる(強調表示される)');

  // --- 複数の壁をまとめて選択してコピー&ペースト ---
  await drawWall(page, 8000, 12000, 8000, 18000); // 2本目の壁
  walls = await readWalls(page);
  const wA = walls.find(w => w.x1 === 8000 && w.y1 === 6000);
  const wB = walls.find(w => w.x1 === 8000 && w.y1 === 12000);
  t.ok(wA && wB, '別の位置に2本目の壁を描けた');

  await page.click('.tool[data-tool="select"]');
  const clickA = await planToClient(page, (wA.x1 + wA.x2) / 2, wA.y1);
  const clickB = await planToClient(page, wB.x1, (wB.y1 + wB.y2) / 2);
  await page.mouse.click(clickA.x, clickA.y);
  await page.keyboard.down('Shift');
  await page.mouse.click(clickB.x, clickB.y);
  await page.keyboard.up('Shift');
  await page.waitForTimeout(80);
  t.ok(await page.locator('#copyWallsBtn').count() > 0, '複数選択時、選択に壁が含まれると複数壁コピーボタンが出る');

  const beforeMulti = await readWalls(page);
  await page.click('#copyWallsBtn');
  await page.keyboard.press('Control+v');
  await page.waitForTimeout(100);
  const afterMulti = await readWalls(page);
  t.eq(afterMulti.length, beforeMulti.length + 2, '複数選択したケース2本がまとめて複製される');

  t.noErrors(errors);
  await context.close();
  await browser.close();
  return t.finish();
}

module.exports = { run };
if (require.main === module) run();
