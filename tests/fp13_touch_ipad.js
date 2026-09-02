// tests/fp13_touch_ipad.js
// 回帰テスト: タッチ操作(iPadのSafari等)でオブジェクトを選択・移動できること。
//
// 背景: iPadのSafariで「オブジェクトをタッチしても反応しない」不具合があった。原因は2つ。
//  1. pointerdownの先頭で svg.setPointerCapture() を呼んでいた。iOS Safariでは
//     これが例外を投げることがあり、投げると以降の処理(選択・移動・在庫からの
//     取り出し)がまるごと実行されない。
//  2. pointermove/up/cancel を svg でしか受けていなかった。指を図面の外に出したり
//     捕捉に失敗したりすると up が svg に届かず、pointers に古い指が残る。
//     残ると次のタッチが「2本目の指(ピンチ)」と誤判定され、以後どこを触っても
//     反応しなくなる。一度こうなると再読み込みするまで直らない。
//
// WebKitはこの環境で動かせないため、Chromiumのタッチ操作で
// 「指が残らないこと」「捕捉に失敗しても動くこと」を検証する。
const fs = require('fs');
const path = require('path');
const { chromium, mkRunner } = require('./helpers');

const FP_URL = 'file://' + path.join(__dirname, '..', 'floorplan', 'index.html');
const PRESET_CHROMIUM = '/opt/pw-browsers/chromium';
const launchOpts = fs.existsSync(PRESET_CHROMIUM) ? { executablePath: PRESET_CHROMIUM } : {};

// 指1本でのドラッグ。end を省くと押した場所で離す(＝タップ)
async function touchDrag(page, from, to) {
  const cdp = await page.context().newCDPSession(page);
  const at = p => [{ x: p.x, y: p.y, radiusX: 12, radiusY: 12, force: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(from) });
  if (to) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: at({ x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }) });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: at(to) });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.send('Input.detachSession').catch(() => {});
  await page.waitForTimeout(120);
}

const centerOf = async (page, sel) => {
  const b = await page.locator(sel).boundingBox();
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};

async function run() {
  const t = mkRunner('fp13 iPad(タッチ)でオブジェクトを操作できる');
  const browser = await chromium.launch(launchOpts);
  // iPad相当: タッチ有効・マウス無し
  const context = await browser.newContext({
    viewport: { width: 1180, height: 820 },
    hasTouch: true, isMobile: false, deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console error: ' + m.text()); });
  await page.goto(FP_URL);
  await page.waitForTimeout(300);

  // --- 在庫パレットからタッチで1台取り出せる ---
  const pal = await centerOf(page, 'g[data-stock="c_beta"] rect');
  const mid = await centerOf(page, 'svg#plan');
  await touchDrag(page, pal, { x: mid.x - 60, y: mid.y });
  t.eq(await page.locator('g.obj').count(), 1, 'タッチで在庫から1台取り出せる');
  t.eq(await page.$eval('g[data-stock="c_beta"] .stock-remain', e => e.textContent), '残 2 / 3',
    '取り出したぶん残数が減る');

  // 指は1本も残っていない(残ると次のタッチがピンチ扱いになる)
  const restCount = () => page.evaluate(() => window.__pointersSize());
  await page.evaluate(() => { window.__pointersSize = () => pointers.size; });
  t.eq(await restCount(), 0, '指を離したあと、押されたままの指は残らない');

  // --- 続けてタッチしても反応する(1回目で壊れない) ---
  await touchDrag(page, pal, { x: mid.x + 60, y: mid.y });
  t.eq(await page.locator('g.obj').count(), 2, '2回目のタッチも反応する');
  t.eq(await restCount(), 0, '2回目のあとも指は残らない');

  // 以降は位置を固定して確かめる(重なると別のオブジェクトを掴んでしまうため)
  const place = (i, x, y) => page.evaluate(([i, x, y]) => {
    state.objects[i].x = x; state.objects[i].y = y;
    clearSelect(); render(); renderSide();
  }, [i, x, y]);

  // --- 置いたオブジェクトをタッチで選択できる ---
  await place(0, 12000, 8000);
  await place(1, 30000, 20000);
  const objAt = i => page.evaluate(i => {
    const o = state.objects[i];
    const svg = document.getElementById('plan');
    const r = svg.getBoundingClientRect();
    const vb = svg.getAttribute('viewBox').split(' ').map(Number);
    return { x: r.left + (o.x - vb[0]) / vb[2] * r.width, y: r.top + (o.y - vb[1]) / vb[3] * r.height };
  }, i);
  await touchDrag(page, await objAt(0));
  t.eq(await page.evaluate(() => selectedIds.size), 1, 'タッチでオブジェクトを選択できる');

  // --- タッチでドラッグ移動できる ---
  const before = await page.evaluate(() => state.objects[0].x);
  const p0 = await objAt(0);
  await touchDrag(page, p0, { x: p0.x + 120, y: p0.y });
  const after = await page.evaluate(() => state.objects[0].x);
  t.ok(after > before, `タッチでドラッグ移動できる(${before} → ${after})`);
  t.eq(await restCount(), 0, '移動のあとも指は残らない');

  // --- 図面の外で指を離しても、指が残らない ---
  // (svgだけでpointerupを受けていたときに壊れていたケース)
  const cdp = await page.context().newCDPSession(page);
  await place(0, 12000, 8000);
  const p1 = await objAt(0);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart', touchPoints: [{ x: p1.x, y: p1.y, radiusX: 12, radiusY: 12, force: 1 }],
  });
  await cdp.send('Input.dispatchTouchEvent', { // ヘッダーの上まで指を動かしてから離す
    type: 'touchMove', touchPoints: [{ x: 40, y: 12, radiusX: 12, radiusY: 12, force: 1 }],
  });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(150);
  t.eq(await restCount(), 0, '図面の外で指を離しても、押されたままの指は残らない');

  // その状態でもう一度触れば、ちゃんと反応する(ここが本来の不具合)
  await place(1, 30000, 20000);
  await touchDrag(page, await objAt(1));
  t.eq(await page.evaluate(() => selectedIds.size), 1,
    '図面の外で離したあとでも、次のタッチはきちんと反応する');

  // --- ポインタ捕捉に失敗する環境(iOS Safari)でも操作できる ---
  await page.evaluate(() => {
    Element.prototype.setPointerCapture = function(){ throw new Error('NotFoundError'); };
  });
  await place(0, 12000, 8000);
  await touchDrag(page, await objAt(0));
  t.eq(await page.evaluate(() => selectedIds.size), 1,
    'setPointerCaptureが例外を投げる環境でも選択できる');
  const bx = await page.evaluate(() => state.objects[0].x);
  const p2 = await objAt(0);
  await touchDrag(page, p2, { x: p2.x + 120, y: p2.y });
  t.ok(await page.evaluate(() => state.objects[0].x) > bx,
    'setPointerCaptureが例外を投げる環境でもドラッグ移動できる');

  // 捕捉が効かない状態で図面の外に指を出して離す(iOS Safariで実際に起きていた組み合わせ)。
  // svgだけでpointerupを受けていると、ここで指が残り、以後どこを触っても反応しなくなる
  await place(0, 12000, 8000);
  const p3 = await objAt(0);
  const cdp2 = await page.context().newCDPSession(page);
  await cdp2.send('Input.dispatchTouchEvent', {
    type: 'touchStart', touchPoints: [{ x: p3.x, y: p3.y, radiusX: 12, radiusY: 12, force: 1 }] });
  await cdp2.send('Input.dispatchTouchEvent', {
    type: 'touchMove', touchPoints: [{ x: 40, y: 12, radiusX: 12, radiusY: 12, force: 1 }] });
  await cdp2.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(150);
  t.eq(await restCount(), 0,
    '捕捉が効かない環境で図面の外に指を出して離しても、指が残らない');
  await place(1, 30000, 20000);
  await touchDrag(page, await objAt(1));
  t.eq(await page.evaluate(() => selectedIds.size), 1,
    'そのあとのタッチもきちんと反応する(ここが直らないと以後ずっと無反応になる)');

  // --- ブラウザのジェスチャに邪魔されない指定になっている ---
  const css = await page.$eval('svg#plan', e => {
    const s = getComputedStyle(e);
    return { touch: s.touchAction, sel: s.webkitUserSelect || s.userSelect };
  });
  t.eq(css.touch, 'none', '図面の上ではブラウザのスクロール・拡大ジェスチャを止める');
  t.eq(css.sel, 'none', '長押しの選択メニューが出ないようにする');

  t.noErrors(errors);
  await context.close();
  await browser.close();
  return t.finish();
}

module.exports = { run };
if (require.main === module) run();
