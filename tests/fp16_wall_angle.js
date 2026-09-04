// tests/fp16_wall_angle.js
// 「壁を描く」で斜めの線も引けることのテスト。
//
// 仕様:
//  ・右パネルで線の向きを選べる。直交 / 45度きざみ(既定) / 自由角度。
//  ・既定を45度きざみにしてあるのは、何も設定しなくても斜めが引けるようにするため。
//    45度きざみでも水平・垂直はちょうど0度・90度に丸まるので、これまでの描き方は変わらない。
//  ・キーボードが無いiPadでも斜めが引けるよう、Shiftではなくボタンで切り替える。
//  ・Shiftは補助。直交のときは自由角度に、それ以外のときは直交に一時的に入れ替わる。
//  ・既存の壁の端点に近づけたときは連結が優先(向きの指定より優先)。
//  ・選んだ向きは図面データに保存され、読み込みで戻る。
const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium, mkRunner } = require('./helpers');

const FP_URL = 'file://' + path.join(__dirname, '..', 'floorplan', 'index.html');
const PRESET_CHROMIUM = '/opt/pw-browsers/chromium';
const launchOpts = fs.existsSync(PRESET_CHROMIUM) ? { executablePath: PRESET_CHROMIUM } : {};

const walls = page => page.evaluate(() => state.walls.map(w => ({ ...w })));
// 壁の角度(度)。0=水平、90=垂直、45=斜め
const angleOf = w => Math.abs(Math.atan2(w.y2 - w.y1, w.x2 - w.x1) * 180 / Math.PI);

async function run() {
  const t = mkRunner('fp16 壁を斜めに引ける');
  const browser = await chromium.launch(launchOpts);
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console error: ' + m.text()); });
  await page.goto(FP_URL);
  await page.waitForTimeout(300);

  const box = await page.locator('svg#plan').boundingBox();
  // 画面のかなり斜め(横300px・縦200px)にドラッグする。角度は約33.7度
  const from = { x: box.x + box.width * 0.35, y: box.y + box.height * 0.3 };
  const to = { x: from.x + 300, y: from.y + 200 };
  const drawWall = async (opts = {}) => {
    await page.mouse.move(from.x, from.y);
    if (opts.shift) await page.keyboard.down('Shift');
    await page.mouse.down();
    await page.mouse.move(from.x + 150, from.y + 100, { steps: 4 });
    await page.mouse.move(to.x, to.y, { steps: 4 });
    await page.mouse.up();
    if (opts.shift) await page.keyboard.up('Shift');
    await page.waitForTimeout(150);
  };
  const clearWalls = () => page.evaluate(() => { state.walls = []; clearSelect(); render(); renderSide(); });

  // --- 線の向きの切り替えは壁ツールのときだけ出る ---
  t.eq(await page.locator('[data-wangle]').count(), 0, '選択ツールのときは線の向きの欄は出ない');
  await page.click('.tool[data-tool="wall"]');
  await page.waitForTimeout(150);
  t.eq(await page.locator('[data-wangle]').count(), 3,
    '壁ツールにすると「直交 / 45度きざみ / 自由角度」の3つが出る');
  t.eq(await page.$eval('[data-wangle].on', e => e.dataset.wangle), 'd45',
    '既定は45度きざみ(何も設定しなくても斜めが引ける)');

  // --- 既定のまま斜めにドラッグすると、設定を触らなくても斜めになる ---
  await drawWall();
  let w = (await walls(page))[0];
  t.ok(w && w.x2 !== w.x1 && w.y2 !== w.y1,
    '設定を触らずにドラッグしただけで斜めの壁が引ける');
  t.ok(Math.abs(angleOf(w) - 45) < 0.01,
    `既定では斜めがちょうど45度になる(実際: ${angleOf(w).toFixed(2)}度)`);
  await clearWalls();

  // 既定のままでも、ほぼ水平に引けばちょうど水平になる(これまでの描き方は変わらない)
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 300, from.y + 20, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(150);
  w = (await walls(page))[0];
  t.ok(angleOf(w) < 0.01, '既定のままでも、ほぼ水平に引けば水平の壁になる');
  await clearWalls();

  // --- 直交: 斜めにドラッグしても水平か垂直になる ---
  await page.click('[data-wangle="ortho"]');
  await page.waitForTimeout(100);
  await drawWall();
  w = (await walls(page))[0];
  t.ok(w, '壁が1本引けた(前提確認)');
  t.ok(angleOf(w) < 0.01 || Math.abs(angleOf(w) - 90) < 0.01,
    `直交では水平か垂直になる(実際: ${angleOf(w).toFixed(1)}度)`);
  await clearWalls();

  // --- 自由角度: ドラッグしたとおりの斜めになる ---
  await page.click('[data-wangle="free"]');
  await page.waitForTimeout(100);
  t.eq(await page.$eval('[data-wangle].on', e => e.dataset.wangle), 'free', '選んだ向きに印がつく');
  await drawWall();
  w = (await walls(page))[0];
  t.ok(w.x2 !== w.x1 && w.y2 !== w.y1, '自由角度では縦にも横にも動いた斜めの線になる');
  t.ok(angleOf(w) > 5 && angleOf(w) < 85, `斜めに引ける(実際: ${angleOf(w).toFixed(1)}度)`);
  await clearWalls();

  // --- 45度きざみ: 斜めにドラッグするとちょうど45度になる ---
  await page.click('[data-wangle="d45"]');
  await page.waitForTimeout(100);
  await drawWall();
  w = (await walls(page))[0];
  t.ok(Math.abs(angleOf(w) - 45) < 0.01,
    `45度きざみではちょうど45度になる(実際: ${angleOf(w).toFixed(2)}度)`);
  // ほぼ水平に引けば0度に丸まる
  await clearWalls();
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 300, from.y + 20, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(150);
  w = (await walls(page))[0];
  t.ok(angleOf(w) < 0.01, `45度きざみでも、ほぼ水平なら水平になる(実際: ${angleOf(w).toFixed(2)}度)`);
  await clearWalls();

  // --- Shiftは直交と自由角度の一時的な入れ替え ---
  await page.click('[data-wangle="ortho"]');
  await page.waitForTimeout(100);
  await drawWall({ shift: true });
  w = (await walls(page))[0];
  t.ok(w.x2 !== w.x1 && w.y2 !== w.y1,
    '直交のときShiftを押しながらだと斜めに引ける(これまでどおり)');
  await clearWalls();

  await page.click('[data-wangle="free"]');
  await page.waitForTimeout(100);
  await drawWall({ shift: true });
  w = (await walls(page))[0];
  t.ok(angleOf(w) < 0.01 || Math.abs(angleOf(w) - 90) < 0.01,
    '自由角度のときShiftを押しながらだと直交になる');
  await clearWalls();

  // --- 既存の壁の端点に近づけたときは、向きの指定より連結が優先される ---
  await page.click('[data-wangle="ortho"]');
  await page.waitForTimeout(100);
  await page.evaluate(() => {
    // 斜めの位置に端点を持つ壁をあらかじめ1本置く
    state.walls = [{ id: idSeq++, x1: 8000, y1: 8000, x2: 9000, y2: 8000 }];
    render();
  });
  const target = await page.evaluate(() => {
    const svg = document.getElementById('plan');
    const r = svg.getBoundingClientRect();
    const vb = svg.getAttribute('viewBox').split(' ').map(Number);
    const toScr = (x, y) => ({
      x: r.left + (x - vb[0]) / vb[2] * r.width,
      y: r.top + (y - vb[1]) / vb[3] * r.height,
    });
    return { start: toScr(20000, 16000), end: toScr(9000, 8000) };
  });
  await page.mouse.move(target.start.x, target.start.y);
  await page.mouse.down();
  await page.mouse.move(target.end.x, target.end.y, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(150);
  const drawn = (await walls(page))[1];
  t.ok(drawn && Math.abs(drawn.x2 - 9000) < 1 && Math.abs(drawn.y2 - 8000) < 1,
    '直交の設定でも、既存の壁の端点にはそのまま繋がる(連結が優先)');

  // --- 選んだ向きは保存され、読み込むと戻る ---
  await page.click('[data-wangle="d45"]');
  await page.waitForTimeout(100);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#saveBtn'),
  ]);
  const savePath = path.join(os.tmpdir(), 'fp16_saved.json');
  await download.saveAs(savePath);
  t.eq(JSON.parse(fs.readFileSync(savePath, 'utf8')).wallAngle, 'd45',
    '選んだ線の向きが図面データに保存される');

  await page.reload();
  await page.waitForTimeout(300);
  await page.setInputFiles('#fileInput', savePath);
  await page.waitForTimeout(400);
  await page.click('.tool[data-tool="wall"]');
  await page.waitForTimeout(150);
  t.eq(await page.$eval('[data-wangle].on', e => e.dataset.wangle), 'd45',
    '読み込むと線の向きも戻る');

  // 古い保存ファイル(線の向きを持たない)は、いまの既定(45度きざみ)で読む
  const old = JSON.parse(fs.readFileSync(savePath, 'utf8'));
  delete old.wallAngle;
  const oldPath = path.join(os.tmpdir(), 'fp16_old.json');
  fs.writeFileSync(oldPath, JSON.stringify(old));
  await page.setInputFiles('#fileInput', oldPath);
  await page.waitForTimeout(400);
  await page.click('.tool[data-tool="wall"]');
  await page.waitForTimeout(150);
  t.eq(await page.$eval('[data-wangle].on', e => e.dataset.wangle), 'd45',
    '線の向きを持たない古い保存ファイルも、いまの既定(45度きざみ)で読む');

  t.noErrors(errors);
  await context.close();
  await browser.close();
  fs.unlinkSync(savePath); fs.unlinkSync(oldPath);
  return t.finish();
}

module.exports = { run };
if (require.main === module) run();
