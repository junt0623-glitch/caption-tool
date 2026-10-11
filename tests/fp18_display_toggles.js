// tests/fp18_display_toggles.js
// 図面上の表示設定(ケース・展示台の名前 / 作品を番号のみ / 作品番号の大きさ)のテスト。
//
// 仕様:
//  ・右パネルの「表示」で3つを切り替えられる。
//  ・「ケース・展示台の名前(寸法)」を外すと、図面上の名前の文字が消える(枠は残る)。
//  ・「作品は番号のみ」にすると作品画像を出さない。画像のかわりの斜線も引かず枠だけにする。
//    番号のバッジは残る(番号で図面を作るための表示なので)。
//  ・「作品番号の大きさ」は50〜400%。文字もバッジも同じ倍率で大きくなる。
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
    return {
      no: t ? t.textContent : null,
      fontSize: t ? +t.getAttribute('font-size') : null,
      badgeW: r ? +r.getAttribute('width') : null,
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
  t.ok(parts[0].hasImage && !parts[0].hasSlash, '画像のある作品は画像が出る');
  t.ok(!parts[1].hasImage && parts[1].hasSlash, '画像のない作品は斜線が出る(これまでどおり)');
  t.eq(parts.map(p => p.no), ['5', '12'], '番号はどちらも出る');
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

  // --- 作品を番号のみにできる ---
  await page.check('#dispWorkNoOnly');
  await page.waitForTimeout(150);
  parts = await workParts(page);
  t.ok(parts.every(p => !p.hasImage), '番号のみにすると作品画像が消える');
  t.ok(parts.every(p => !p.hasSlash), '番号のみでは画像のかわりの斜線も引かない');
  t.eq(parts.map(p => p.no), ['5', '12'], '番号のみでも番号は残る');
  t.eq(await page.locator('g.obj[data-id="102"] rect.body').count(), 1,
    '番号のみでも作品の枠は残る');
  await page.uncheck('#dispWorkNoOnly');
  await page.waitForTimeout(150);
  t.ok((await workParts(page))[0].hasImage, 'チェックを戻すと画像も戻る');

  // --- 番号の大きさを変えられる ---
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

  // 範囲外は50〜400%に丸める
  await page.fill('#dispWorkNoPct', '9999');
  await page.dispatchEvent('#dispWorkNoPct', 'change');
  await page.waitForTimeout(150);
  t.eq(await page.$eval('#dispWorkNoPct', e => e.value), '400', '大きすぎる値は400%に丸める');
  await page.fill('#dispWorkNoPct', '0');
  await page.dispatchEvent('#dispWorkNoPct', 'change');
  await page.waitForTimeout(150);
  t.eq(await page.$eval('#dispWorkNoPct', e => e.value), '50', '小さすぎる値は50%に丸める');

  // --- Undoで戻せる ---
  await page.click('#undoBtn');
  await page.waitForTimeout(150);
  t.eq(await page.$eval('#dispWorkNoPct', e => e.value), '400',
    '番号の大きさの変更はUndoで戻せる(欄の表示も戻る)');
  await page.click('#redoBtn');
  await page.waitForTimeout(150);
  t.eq(await page.$eval('#dispWorkNoPct', e => e.value), '50', 'Redoでやり直せる');

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
  t.ok(parts.length > 0 && parts.every(p => !p.hasImage), '読み込んだ図面も番号のみで描かれる');

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
