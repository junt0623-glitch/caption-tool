// tests/fp18_display_toggles.js
// 図面上の表示設定(ケース・展示台の名前 / 作品を番号のみ / 作品番号の大きさ)のテスト。
//
// 仕様:
//  ・右パネルの「表示」で3つを切り替えられる。
//  ・「ケース・展示台の名前(寸法)」を外すと、図面上の名前の文字が消える(枠は残る)。
//  ・「作品は番号のみ」にすると作品画像も枠も出さず、番号だけを置く。
//    番号は作品の位置そのものに置く(枠が無いので、枠の上ではなく中心に出す)。
//  ・「作品番号の大きさ」は20〜1000%。文字もバッジも同じ倍率で大きくなる。
//  ・いずれもUndoで戻せ、図面データに保存され、読み込みで戻る。
//  ・表示設定を持たない古い保存ファイルは、これまでどおりの見た目で開く。
const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium, mkRunner } = require('./helpers');

const FP_URL = 'file://' + path.join(__dirname, '..', 'floorplan', 'index.html');
const PRESET_CHROMIUM = '/opt/pw-browsers/chromium';
const launchOpts = fs.existsSync(PRESET_CHROMIUM) ? { executablePath: PRESET_CHROMIUM } : {};

// 1x1の透明PNG。画像ありの作品を作るためだけに使う
const PNG1 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

// 図面上のケース・展示台に出ている名前の文字
const furnLabels = page => page.$$eval('g.obj text.lbl', ts => ts.map(t => t.textContent));
// 作品の画像・斜線・番号バッジ
const workParts = page => page.evaluate(() => {
  const gs = [...document.querySelectorAll('g.obj')].filter(g => g.querySelector('.badge'));
  return gs.map(g => {
    const t = g.querySelector('.badge text');
    const r = g.querySelector('.badge rect');
    const b = g.querySelector('.badge');
    return {
      no: t ? t.textContent : null,
      fontSize: t ? +t.getAttribute('font-size') : null,
      badgeW: r ? +r.getAttribute('width') : null,
      // バッジの中心のy。枠があるときは枠の上、番号のみのときは作品の位置(0)
      badgeY: b ? +b.getAttribute('transform').match(/translate\([-\d.]+,\s*([-\d.]+)\)/)[1] : null,
      hasFrame: !!g.querySelector('rect.body'),
      hasImage: !!g.querySelector('image'),
      hasSlash: !!g.querySelector('line'),
    };
  });
});

async function run() {
  const t = mkRunner('fp18 図面上の表示設定');
  const browser = await chromium.launch(launchOpts);
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console error: ' + m.text()); });
  await page.goto(FP_URL);
  await page.waitForTimeout(300);

  // 展示台1台 / 画像ありの作品1点 / 画像なしの作品1点を置く
  await page.evaluate(png => {
    state.library = [{ id: 1, name: '5.png', no: '5', img: png }];
    state.objects = [
      { id: 101, type: 'fixture', stockKey: 'p_120', x: 8000, y: 8000, rot: 0,
        w: 1200, h: 900, label: '1.2×0.9' },
      { id: 102, type: 'work', x: 14000, y: 8000, rot: 0, w: 1200, h: 1200, no: '5', imgId: 1 },
      { id: 103, type: 'work', x: 20000, y: 8000, rot: 0, w: 1200, h: 1200, no: '12' },
    ];
    render(); renderSide();
  }, PNG1);
  await page.waitForTimeout(150);

  // --- 操作部が出ている ---
  t.eq(await page.locator('#dispFurnLabel').count(), 1, '「ケース・展示台の名前」の欄が出る');
  t.eq(await page.locator('#dispWorkNoOnly').count(), 1, '「作品は番号のみ」の欄が出る');
  t.eq(await page.locator('#dispWorkNoPct').count(), 1, '「作品番号の大きさ」の欄が出る');
  t.ok(await page.$eval('#dispFurnLabel', e => e.checked), '名前は既定で表示');
  t.ok(!(await page.$eval('#dispWorkNoOnly', e => e.checked)), '番号のみは既定でオフ');
  t.eq(await page.$eval('#dispWorkNoPct', e => e.value), '100', '番号の大きさの既定は100%');

  // --- 既定の見た目(これまでどおり) ---
  t.eq(await furnLabels(page), ['1.2×0.9'], '既定では展示台に名前(寸法)が出る');
  let parts = await workParts(page);
  t.eq(parts.length, 2, '作品が2点ある(前提確認)');
  t.ok(parts.every(p => p.hasFrame), '既定では作品の枠が出る');
  t.ok(parts[0].hasImage && !parts[0].hasSlash, '画像のある作品は画像が出る');
  t.ok(!parts[1].hasImage && parts[1].hasSlash, '画像のない作品は斜線が出る(これまでどおり)');
  t.eq(parts.map(p => p.no), ['5', '12'], '番号はどちらも出る');
  t.ok(parts[0].badgeY < 0, '枠があるときは番号を枠の上に出す');
  const baseFont = parts[0].fontSize, baseW = parts[0].badgeW;
  t.ok(baseFont > 0 && baseW > 0, '番号の文字とバッジに大きさがある(前提確認)');

  // --- ケース・展示台の名前を消せる ---
  await page.uncheck('#dispFurnLabel');
  await page.waitForTimeout(150);
  t.eq(await furnLabels(page), [], 'チェックを外すと展示台の名前が消える');
  t.eq(await page.locator('g.obj[data-id="101"] rect.body').count(), 1,
    '名前を消しても展示台の枠は残る');
  t.eq(await page.$$eval('g.stock text.stock-name', ts => ts.length > 0), true,
    '在庫パレット(編集用)の名前は消さない');
  await page.check('#dispFurnLabel');
  await page.waitForTimeout(150);
  t.eq(await furnLabels(page), ['1.2×0.9'], 'チェックを戻すと名前も戻る');

  // --- 作品を番号のみにできる(枠も画像も出さない) ---
  await page.check('#dispWorkNoOnly');
  await page.waitForTimeout(150);
  parts = await workParts(page);
  t.ok(parts.every(p => !p.hasImage), '番号のみにすると作品画像が消える');
  t.ok(parts.every(p => !p.hasFrame), '番号のみにすると作品の枠も消える');
  t.ok(parts.every(p => !p.hasSlash), '番号のみでは画像のかわりの斜線も引かない');
  t.eq(parts.map(p => p.no), ['5', '12'], '番号のみでも番号は残る');
  t.ok(parts.every(p => p.badgeY === 0), '枠が無いので番号は作品の位置そのものに出る');
  // 枠が無くても番号をクリックして選べる(当たり判定が残っている)
  await page.click('g.obj[data-id="102"] .badge text');
  await page.waitForTimeout(150);
  t.eq(await page.locator('g.obj[data-id="102"].selected').count(), 1,
    '番号のみでも番号をクリックして作品を選べる');
  t.eq(await page.locator('g.obj[data-id="102"].selected .badge rect').count(), 1,
    '選んだ番号には印がつく(枠が無いので印はバッジ側)');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);
  await page.uncheck('#dispWorkNoOnly');
  await page.waitForTimeout(150);
  parts = await workParts(page);
  t.ok(parts[0].hasImage && parts[0].hasFrame, 'チェックを戻すと画像も枠も戻る');

  // --- 番号の大きさを変えられる(拡大・縮小) ---
  await page.fill('#dispWorkNoPct', '200');
  await page.dispatchEvent('#dispWorkNoPct', 'change');
  await page.waitForTimeout(150);
  parts = await workParts(page);
  t.ok(Math.abs(parts[0].fontSize - baseFont * 2) < 1, '200%にすると番号の文字が2倍になる');
  t.ok(Math.abs(parts[0].badgeW - baseW * 2) < 1, 'バッジの幅も同じ倍率で大きくなる');

  await page.fill('#dispWorkNoPct', '50');
  await page.dispatchEvent('#dispWorkNoPct', 'change');
  await page.waitForTimeout(150);
  t.ok(Math.abs((await workParts(page))[0].fontSize - baseFont * 0.5) < 1, '50%にすると半分になる');

  // 番号のみのときも同じ倍率で拡大・縮小できる
  await page.check('#dispWorkNoOnly');
  await page.fill('#dispWorkNoPct', '800');
  await page.dispatchEvent('#dispWorkNoPct', 'change');
  await page.waitForTimeout(150);
  parts = await workParts(page);
  t.ok(Math.abs(parts[0].fontSize - baseFont * 8) < 1, '番号のみでも800%まで拡大できる');
  t.ok(Math.abs(parts[0].badgeW - baseW * 8) < 1, '番号のみでもバッジが同じ倍率で大きくなる');
  await page.fill('#dispWorkNoPct', '20');
  await page.dispatchEvent('#dispWorkNoPct', 'change');
  await page.waitForTimeout(150);
  t.ok(Math.abs((await workParts(page))[0].fontSize - baseFont * 0.2) < 1,
    '番号のみでも20%まで縮小できる');
  await page.uncheck('#dispWorkNoOnly');
  await page.waitForTimeout(150);

  // 範囲外は20〜1000%に丸める
  await page.fill('#dispWorkNoPct', '9999');
  await page.dispatchEvent('#dispWorkNoPct', 'change');
  await page.waitForTimeout(150);
  t.eq(await page.$eval('#dispWorkNoPct', e => e.value), '1000', '大きすぎる値は1000%に丸める');
  await page.fill('#dispWorkNoPct', '0');
  await page.dispatchEvent('#dispWorkNoPct', 'change');
  await page.waitForTimeout(150);
  t.eq(await page.$eval('#dispWorkNoPct', e => e.value), '20', '小さすぎる値は20%に丸める');

  // --- Undoで戻せる ---
  await page.click('#undoBtn');
  await page.waitForTimeout(150);
  t.eq(await page.$eval('#dispWorkNoPct', e => e.value), '1000',
    '番号の大きさの変更はUndoで戻せる(欄の表示も戻る)');
  await page.click('#redoBtn');
  await page.waitForTimeout(150);
  t.eq(await page.$eval('#dispWorkNoPct', e => e.value), '20', 'Redoでやり直せる');

  await page.uncheck('#dispFurnLabel');
  await page.waitForTimeout(150);
  await page.click('#undoBtn');
  await page.waitForTimeout(150);
  t.ok(await page.$eval('#dispFurnLabel', e => e.checked),
    '名前の表示・非表示もUndoで戻せる(欄の表示も戻る)');
  t.eq(await furnLabels(page), ['1.2×0.9'], 'Undoで図面上の名前も戻る');

  // --- 保存され、読み込みで戻る ---
  await page.uncheck('#dispFurnLabel');
  await page.check('#dispWorkNoOnly');
  await page.fill('#dispWorkNoPct', '250');
  await page.dispatchEvent('#dispWorkNoPct', 'change');
  await page.waitForTimeout(150);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#saveBtn'),
  ]);
  const savePath = path.join(os.tmpdir(), 'fp18_saved.json');
  await download.saveAs(savePath);
  const saved = JSON.parse(fs.readFileSync(savePath, 'utf8'));
  t.eq([saved.showFurnitureLabel, saved.workNoOnly, saved.workNoPct], [false, true, 250],
    '表示設定が図面データに保存される');

  await page.reload();
  await page.waitForTimeout(300);
  await page.setInputFiles('#fileInput', savePath);
  await page.waitForTimeout(400);
  t.ok(!(await page.$eval('#dispFurnLabel', e => e.checked)), '読み込むと名前の設定が戻る');
  t.ok(await page.$eval('#dispWorkNoOnly', e => e.checked), '読み込むと番号のみの設定が戻る');
  t.eq(await page.$eval('#dispWorkNoPct', e => e.value), '250', '読み込むと番号の大きさも戻る');
  t.eq(await furnLabels(page), [], '読み込んだ図面も名前なしで描かれる');
  parts = await workParts(page);
  t.ok(parts.length > 0 && parts.every(p => !p.hasImage && !p.hasFrame),
    '読み込んだ図面も番号のみ(画像も枠も無し)で描かれる');

  // --- 表示設定を持たない古い保存ファイルは、これまでどおりの見た目で開く ---
  const old = JSON.parse(fs.readFileSync(savePath, 'utf8'));
  delete old.showFurnitureLabel; delete old.workNoOnly; delete old.workNoPct;
  const oldPath = path.join(os.tmpdir(), 'fp18_old.json');
  fs.writeFileSync(oldPath, JSON.stringify(old));
  await page.setInputFiles('#fileInput', oldPath);
  await page.waitForTimeout(400);
  t.ok(await page.$eval('#dispFurnLabel', e => e.checked),
    '表示設定を持たない古いファイルは名前ありで開く');
  t.ok(!(await page.$eval('#dispWorkNoOnly', e => e.checked)),
    '表示設定を持たない古いファイルは画像ありで開く');
  t.eq(await page.$eval('#dispWorkNoPct', e => e.value), '100',
    '表示設定を持たない古いファイルは番号100%で開く');
  t.eq(await furnLabels(page), ['1.2×0.9'], '古いファイルでは名前がこれまでどおり出る');

  t.noErrors(errors);
  await context.close();
  await browser.close();
  fs.unlinkSync(savePath); fs.unlinkSync(oldPath);
  return t.finish();
}

module.exports = { run };
if (require.main === module) run();
