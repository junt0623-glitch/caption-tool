// tests/fp03_multiselect_align.js
// 複数選択・整列ツール・細かい移動のテスト。
const fs = require('fs');
const path = require('path');
const { chromium, mkRunner } = require('./helpers');

const FP_URL = 'file://' + path.join(__dirname, '..', 'floorplan', 'index.html');
const PRESET_CHROMIUM = '/opt/pw-browsers/chromium';
const launchOpts = fs.existsSync(PRESET_CHROMIUM) ? { executablePath: PRESET_CHROMIUM } : {};

// 図面座標→クライアント座標(左上=(0,0)基準の変換をブラウザ側で解決)
async function planToClient(page, px, py) {
  return await page.evaluate(([x, y]) => {
    const svg = document.getElementById('plan');
    const pt = svg.createSVGPoint(); pt.x = x; pt.y = y;
    const s = pt.matrixTransform(svg.getScreenCTM());
    return { x: s.x, y: s.y };
  }, [px, py]);
}

// 指定の図面座標にケース/展示台/作品を配置して、そのオブジェクトのstate上のx,y,idを返す
async function placeWork(page, px, py) {
  const c = await planToClient(page, px, py);
  await page.click('.tool[data-tool="work"]');
  await page.mouse.click(c.x, c.y);
  await page.waitForTimeout(60);
}

async function objs(page) {
  return await page.evaluate(() => window.__state ? null : (() => {
    // stateは直接触れないのでDOMから復元
    return [...document.querySelectorAll('g.obj')].map(g => {
      const m = g.getAttribute('transform').match(/translate\(([-\d.]+),([-\d.]+)\)/);
      return { id: +g.dataset.id, x: +m[1], y: +m[2], sel: g.classList.contains('selected') };
    });
  })());
}

async function run() {
  const t = mkRunner('fp03 複数選択・整列');
  const browser = await chromium.launch(launchOpts);
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console error: ' + m.text()); });
  await page.goto(FP_URL);
  await page.waitForTimeout(300);

  // 3つの作品をバラバラの位置に配置(グリッド250mmに乗る座標)
  await placeWork(page, 10000, 6000);
  await placeWork(page, 14000, 9000);
  await placeWork(page, 18000, 4000);
  let list = await objs(page);
  t.eq(list.length, 3, '作品3つを配置');

  // --- 複数選択: Shift+クリックで3つ選択 ---
  for (let i = 0; i < 3; i++) {
    const c = await planToClient(page, list[i].x, list[i].y);
    if (i > 0) await page.keyboard.down('Shift');
    await page.mouse.click(c.x, c.y);
    if (i > 0) await page.keyboard.up('Shift');
    await page.waitForTimeout(50);
  }
  list = await objs(page);
  t.eq(list.filter(o => o.sel).length, 3, 'Shift+クリックで3つとも選択状態になる');
  t.ok(await page.locator('#props [data-align]').count() > 0, '複数選択時に整列ツールが表示される');

  // --- 左揃え: 全員のxが最小xにそろう ---
  const minX = Math.min(...list.map(o => o.x));
  await page.click('#props [data-align="left"]');
  await page.waitForTimeout(80);
  list = await objs(page);
  t.ok(list.every(o => o.x === minX), `左揃えで全オブジェクトのxが${minX}にそろう`);

  // --- 上下中央揃え: 全員のyが中央値にそろう ---
  await page.click('#props [data-align="vcenter"]');
  await page.waitForTimeout(80);
  list = await objs(page);
  const ys = list.map(o => o.y);
  t.ok(ys.every(y => y === ys[0]), '上下中央揃えで全オブジェクトのyが一致する');

  // --- 横方向の等間隔配置 ---
  // まず横バラバラに戻す
  await page.keyboard.press('Escape');
  await placeWork(page, 12000, 12000); // 4つ目
  // 全選択(Ctrl+A)
  await page.keyboard.press('Control+a');
  await page.waitForTimeout(60);
  list = await objs(page);
  t.eq(list.filter(o => o.sel).length, 4, 'Ctrl+Aで全オブジェクト選択');
  await page.click('#props [data-align="disth"]');
  await page.waitForTimeout(80);
  list = (await objs(page)).sort((a, b) => a.x - b.x);
  const gaps = [];
  for (let i = 1; i < list.length; i++) gaps.push(Math.round(list[i].x - list[i - 1].x));
  t.ok(gaps.every(g => Math.abs(g - gaps[0]) <= 1), '横等間隔配置で隣接間隔が等しくなる');

  // --- 細かい移動: 主選択をドラッグ、Altで50mm未満の移動ができる ---
  await page.keyboard.press('Escape');
  await placeWork(page, 10000, 10000);
  list = await objs(page);
  const target = list[list.length - 1];
  const from = await planToClient(page, target.x, target.y);
  // 単独選択してAltドラッグ(画面上で数px=数十mm)。Alt無しは50mm刻み
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.keyboard.down('Alt');
  await page.mouse.move(from.x + 4, from.y, { steps: 3 });
  await page.mouse.up();
  await page.keyboard.up('Alt');
  await page.waitForTimeout(80);
  const moved = (await objs(page)).find(o => o.id === target.id);
  const dx = Math.abs(moved.x - target.x);
  t.ok(dx > 0 && dx % 50 !== 0, `Altドラッグで50mm刻みでない微移動ができる(移動量${dx}mm)`);

  t.noErrors(errors);
  await context.close();
  await browser.close();
  return t.finish();
}

module.exports = { run };
if (require.main === module) run();
