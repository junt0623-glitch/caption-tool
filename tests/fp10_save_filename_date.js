// tests/fp10_save_filename_date.js
// 回帰テスト: 保存ファイル名の日付が「保存した日」になること。
//
// 背景: state.meta.date はページを開いたときに today() で一度だけ入り、
// さらに図面JSONを読み込むと保存ファイル側の古い日付で上書きされていた。
// そのため「読み込んで編集して保存し直す」と、ファイル名の日付が
// 元ファイルの日付のまま更新されない不具合があった。
const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium, mkRunner } = require('./helpers');

const FP_URL = 'file://' + path.join(__dirname, '..', 'floorplan', 'index.html');
const PRESET_CHROMIUM = '/opt/pw-browsers/chromium';
const launchOpts = fs.existsSync(PRESET_CHROMIUM) ? { executablePath: PRESET_CHROMIUM } : {};

// 2020年の古い日付を持つ、読み込み用の最小限の図面データ。
// titleを英字にしているのはテスト側の都合: 日本語のファイル名だとPlaywrightの
// download.suggestedFilename() が "download" を返してしまい、名前を検証できない。
// (アプリ自体は日本語の展覧会名でも問題なく保存できる)
const OLD_SAVE = {
  meta: { title: 'OldPlan', venue: '', author: '', date: '2020-01-01' },
  sheet: { rot: 0 },
  scalePct: 100,
  rooms: { current: '', list: [] },
  workList: [],
  images: {},
  walls: [],
  objects: [],
};

const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

async function saveAndGetName(page) {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#saveBtn'),
  ]);
  return download;
}

async function run() {
  const t = mkRunner('fp10 保存ファイル名の日付が保存日になる');
  const browser = await chromium.launch(launchOpts);
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console error: ' + m.text()); });
  await page.goto(FP_URL);
  await page.waitForTimeout(300);

  const day = todayStr();

  // --- 新規図面をそのまま保存 ---
  let dl = await saveAndGetName(page);
  t.eq(dl.suggestedFilename(), `floorplan_${day}.json`, '新規図面の保存名は floorplan_<今日>.json');

  // --- 古い日付の図面を読み込んでから保存し直す ---
  const filePath = path.join(os.tmpdir(), 'fp10_old_date.json');
  fs.writeFileSync(filePath, JSON.stringify(OLD_SAVE));
  await page.setInputFiles('#fileInput', filePath);
  await page.waitForTimeout(300);

  dl = await saveAndGetName(page);
  t.eq(dl.suggestedFilename(), `OldPlan_${day}.json`,
    '2020-01-01の図面を読み込んで保存し直すと、日付は今日に更新される');
  t.ok(!dl.suggestedFilename().includes('2020-01-01'),
    '読み込んだファイルの古い日付がファイル名に残らない');

  // --- 保存されたJSONの中身の日付も更新されている ---
  const outPath = path.join(os.tmpdir(), 'fp10_resaved.json');
  await dl.saveAs(outPath);
  const saved = JSON.parse(fs.readFileSync(outPath, 'utf8'));
  t.eq(saved.meta.date, day, 'JSON内のmeta.dateも保存日に更新される');
  t.eq(saved.meta.title, 'OldPlan', '展覧会名など他のmetaは読み込んだ値のまま保持される');

  t.noErrors(errors);
  await context.close();
  await browser.close();
  fs.unlinkSync(filePath);
  fs.unlinkSync(outPath);
  return t.finish();
}

module.exports = { run };
if (require.main === module) run();
