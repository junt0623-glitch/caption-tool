// tests/fp07_stock_refreshes_on_load.js
// 回帰テスト: 古い在庫総数(total)を保存した図面JSONを読み込んでも、
// 在庫パレットの総数が「今のアプリの既定値」に上書きされることを確認する。
//
// 背景: 展示台の総数を18→27台、12→24台に変更したが、それ以前に保存された
// JSONファイルには古い総数(18/12)がstate.stockとしてそのまま入っている。
// 読み込み時に `if (!state.stock) state.stock = defaultStock();` としていたため、
// 保存済みファイルを開くと古い総数のまま据え置かれてしまう不具合があった。
const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium, mkRunner } = require('./helpers');

const FP_URL = 'file://' + path.join(__dirname, '..', 'floorplan', 'index.html');
const PRESET_CHROMIUM = '/opt/pw-browsers/chromium';
const launchOpts = fs.existsSync(PRESET_CHROMIUM) ? { executablePath: PRESET_CHROMIUM } : {};

// アプリ変更前の(古い)総数を持つ最小限の保存ファイルを模したデータ。
// p_153に1台配置済みとして、上書き後の残数計算(27-1=26)も検証する。
const OLD_SAVE = {
  meta: { title: '', venue: '', author: '', date: '2020-01-01' },
  sheet: { rot: 0 },
  scalePct: 100,
  rooms: { current: '', list: [] },
  workList: [],
  images: {},
  stock: [
    { key: 'c_alpha', cat: 'case', name: 'α', w: 2400, h: 1800, total: 2 },   // 変更なしの項目
    { key: 'p_153', cat: 'ped', name: '1.53×0.9', w: 1530, h: 900, total: 18 }, // 旧総数(今は27)
    { key: 'p_180', cat: 'ped', name: '1.8×0.9', w: 1800, h: 900, total: 12 },  // 旧総数(今は24)
  ],
  walls: [],
  objects: [
    { id: 1, type: 'fixture', stockKey: 'p_153', x: 10000, y: 10000, rot: 0, w: 1530, h: 900, label: '1.53×0.9' },
  ],
};

async function run() {
  const t = mkRunner('fp07 保存ファイル読込で在庫総数が最新に更新される');
  const browser = await chromium.launch(launchOpts);
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console error: ' + m.text()); });
  await page.goto(FP_URL);
  await page.waitForTimeout(300);

  const filePath = path.join(os.tmpdir(), 'fp07_old_stock.json');
  fs.writeFileSync(filePath, JSON.stringify(OLD_SAVE));
  await page.setInputFiles('#fileInput', filePath);
  await page.waitForTimeout(200);

  const remainOf = key => page.$eval(`g[data-stock="${key}"] .stock-remain`, e => e.textContent);
  t.eq(await remainOf('p_153'), '残 26 / 27', '1.53×0.9の総数が最新の27に更新され、配置済み1台ぶん残26になる');
  t.eq(await remainOf('p_180'), '残 24 / 24', '1.8×0.9の総数も保存ファイルの古い12ではなく最新の24になる');
  t.eq(await remainOf('c_alpha'), '残 2 / 2', '変更していない項目(α)の総数はそのまま2');
  t.eq(await page.locator('g.obj').count(), 1, '配置済みだった展示台1台はそのまま復元される');

  t.noErrors(errors);
  await context.close();
  await browser.close();
  fs.unlinkSync(filePath);
  return t.finish();
}

module.exports = { run };
if (require.main === module) run();
