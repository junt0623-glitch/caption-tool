// tests/fp01_floorplan_smoke.js
// 展覧会図面作成アプリ(floorplan/index.html)のスモークテスト
// 配置・壁描画・連結・Undo/Redo・並べ替え・用紙プリセットをDOM経由で確認する。
const fs = require('fs');
const path = require('path');
const { chromium, mkRunner } = require('./helpers');

// CIは `npx playwright install` 済み。ローカル(リモート実行環境)では
// 事前インストール済みChromiumを executablePath で使う。
const PRESET_CHROMIUM = '/opt/pw-browsers/chromium';
const launchOpts = fs.existsSync(PRESET_CHROMIUM) ? { executablePath: PRESET_CHROMIUM } : {};

const FP_URL = 'file://' + path.join(__dirname, '..', 'floorplan', 'index.html');

async function openFloorplan(browser) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console error: ' + m.text()); });
  await page.goto(FP_URL);
  await page.waitForTimeout(300);
  return { context, page, errors };
}

async function run() {
  const t = mkRunner('fp01 図面アプリ スモーク');
  const browser = await chromium.launch(launchOpts);
  const { context, page, errors } = await openFloorplan(browser);

  const svgBox = await page.locator('svg#plan').boundingBox();
  const cx = svgBox.x + svgBox.width / 2, cy = svgBox.y + svgBox.height / 2;

  // --- 作品の配置と作品リスト ---
  await page.click('.tool[data-tool="work"]');
  await page.mouse.click(cx - 120, cy - 60);
  await page.waitForTimeout(100);
  t.eq(await page.locator('#workList li[data-id]').count(), 1, '作品を1つ配置するとリストに1件表示される');

  await page.click('.tool[data-tool="work"]');
  await page.mouse.click(cx + 120, cy + 60);
  await page.waitForTimeout(100);
  t.eq(await page.locator('#workList li[data-id]').count(), 2, '作品2つ目もリストに反映される');

  // --- 作品番号の手動並べ替え ---
  const idsBefore = await page.$$eval('#workList li[data-id]', ls => ls.map(l => l.dataset.id));
  await page.click('#workList li[data-id]:first-child .mv[data-mv="1"]');
  await page.waitForTimeout(100);
  const idsAfter = await page.$$eval('#workList li[data-id]', ls => ls.map(l => l.dataset.id));
  t.eq(idsAfter, [idsBefore[1], idsBefore[0]], '▼ボタンで作品の順序(=番号)が入れ替わる');
  t.ok(await page.locator('#workList li[data-id]:first-child .mv[data-mv="-1"]').isDisabled(),
    '先頭の作品の▲ボタンは無効');

  // --- 壁の描画 ---
  await page.click('.tool[data-tool="wall"]');
  await page.mouse.move(cx - 150, cy + 150);
  await page.mouse.down();
  await page.mouse.move(cx + 150, cy + 150, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(100);
  t.eq(await page.locator('line.wall-line').count(), 1, 'ドラッグで壁が1本描ける');
  const w1 = await page.$eval('line.wall-line', l =>
    ({ x1: +l.getAttribute('x1'), y1: +l.getAttribute('y1'), x2: +l.getAttribute('x2'), y2: +l.getAttribute('y2') }));
  t.eq(w1.y1, w1.y2, '通常ドラッグでは直交スナップされ水平になる');

  // --- 壁の連結(端点吸着): 1本目の終端のすぐ近く(吸着半径400mm以内)から2本目を描く ---
  await page.click('.tool[data-tool="wall"]');
  await page.mouse.move(cx + 150 + 3, cy + 150 + 3);
  await page.mouse.down();
  await page.mouse.move(cx + 150, cy + 20, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(100);
  t.eq(await page.locator('line.wall-line').count(), 2, '2本目の壁が描ける');
  const w2 = await page.$$eval('line.wall-line', ls => ls.map(l =>
    ({ x1: +l.getAttribute('x1'), y1: +l.getAttribute('y1') }))[1]);
  t.eq([w2.x1, w2.y1], [w1.x2, w1.y2], '2本目の始点が1本目の終点に吸着(連結)される');

  // --- Undo / Redo ---
  await page.click('#undoBtn');
  await page.waitForTimeout(100);
  t.eq(await page.locator('line.wall-line').count(), 1, 'Undoで2本目の壁が消える');
  await page.click('#redoBtn');
  await page.waitForTimeout(100);
  t.eq(await page.locator('line.wall-line').count(), 2, 'Redoで2本目の壁が復活する');
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(100);
  t.eq(await page.locator('line.wall-line').count(), 1, 'Ctrl+ZでもUndoできる');
  await page.keyboard.press('Control+y');
  await page.waitForTimeout(100);
  t.eq(await page.locator('line.wall-line').count(), 2, 'Ctrl+YでもRedoできる');

  // --- 用紙プリセット: シート矩形(最初のrect)が用紙×縮尺の寸法になる ---
  const sheetW = () => page.$eval('svg#plan > rect', r => +r.getAttribute('width'));
  t.eq(await sheetW(), 42000, '既定はA3横×1:100でシート幅42000mm(=420mm×100)');
  await page.selectOption('#sheetSel', 'a4l');
  await page.waitForTimeout(100);
  t.eq(await sheetW(), 29700, 'A4横×1:100でシート幅29700mm(=297mm×100)');
  await page.selectOption('#scaleSel', '50');
  await page.waitForTimeout(100);
  t.eq(await sheetW(), 14850, '縮尺1:50に変えるとシート幅14850mm(=297mm×50)');
  await page.click('#undoBtn'); // 用紙変更のUndoでA3横に戻る(縮尺1:50のまま)
  await page.waitForTimeout(100);
  t.eq(await sheetW(), 21000, '用紙プリセット変更もUndoで戻る(A3横×1:50=21000mm)');
  t.eq(await page.$eval('#sheetSel', s => s.value), 'a3l', 'Undo後は用紙セレクトも同期される');

  t.noErrors(errors);
  await context.close();
  await browser.close();
  return t.finish();
}

module.exports = { run };
if (require.main === module) run();
