// tests/fp14_work_sequence.js
// 作品ツールで、画像フォルダの番号を「任意の番号から順番に」配置できることのテスト。
//
// 仕様:
//  ・配置に使う番号は画像フォルダにある画像の番号を小さい順に並べたもの。
//    画像フォルダが空なら作品リストの番号、どちらも無ければ従来どおりの連番。
//  ・右パネルの「開始番号」を入れると、その番号以降だけを順番に配置する。
//  ・すでに図面に置いてある番号は飛ばす。
//  ・1つ置いたら必ず選択ツールに戻る(作品ツールのままだと、置いた作品を触ろうとした
//    タップで次の作品が増えてしまうため)。次を置くときはもう一度「作品」を押す。
const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium, mkRunner } = require('./helpers');

const FP_URL = 'file://' + path.join(__dirname, '..', 'floorplan', 'index.html');
const PRESET_CHROMIUM = '/opt/pw-browsers/chromium';
const launchOpts = fs.existsSync(PRESET_CHROMIUM) ? { executablePath: PRESET_CHROMIUM } : {};

// 指定した色の小さなPNGを作ってファイルに書き出す(画像フォルダ用のダミー)
async function makeColorPng(page, filePath, color) {
  const dataUrl = await page.evaluate(c => {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 24;
    const g = cv.getContext('2d');
    g.fillStyle = c; g.fillRect(0, 0, 24, 24);
    return cv.toDataURL('image/png');
  }, color);
  fs.writeFileSync(filePath, Buffer.from(dataUrl.split(',')[1], 'base64'));
}

// 画像フォルダに、指定した番号のファイル名で画像を入れる
async function uploadNumbered(page, nos) {
  const paths = [];
  for (const no of nos) {
    const p = path.join(os.tmpdir(), `${no}.png`);
    await makeColorPng(page, p, '#3366cc');
    paths.push(p);
  }
  await page.click('#imgsBtn');
  await page.waitForTimeout(100);
  await page.setInputFiles('#imgsInput', paths);
  await page.waitForTimeout(600);
  await page.click('#libClose');
  await page.waitForTimeout(100);
  return paths;
}

const placedNos = page => page.evaluate(() =>
  state.objects.filter(o => o.type === 'work').map(o => String(o.no)));
const curTool = page => page.evaluate(() => tool);

async function run() {
  const t = mkRunner('fp14 作品を任意の番号から順番に配置');
  const browser = await chromium.launch(launchOpts);
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console error: ' + m.text()); });
  await page.goto(FP_URL);
  await page.waitForTimeout(300);

  const files = await uploadNumbered(page, [10001, 10002, 10003, 10004, 10005]);

  const svgBox = await page.locator('svg#plan').boundingBox();
  const cy = svgBox.y + svgBox.height / 2;
  const spot = i => ({ x: svgBox.x + svgBox.width * 0.3 + i * 90, y: cy });
  // 1つ置くたびに選択ツールへ戻るので、置くときは毎回「作品」を押し直す
  const placeAt = async i => {
    await page.click('.tool[data-tool="work"]');
    await page.waitForTimeout(80);
    const s = spot(i);
    await page.mouse.click(s.x, s.y);
    await page.waitForTimeout(120);
  };

  // --- 開始番号の欄は作品ツールのときだけ出る ---
  t.eq(await page.locator('#workStart').count(), 0, '選択ツールのときは開始番号の欄は出ない');
  await page.click('.tool[data-tool="work"]');
  await page.waitForTimeout(150);
  t.eq(await page.locator('#workStart').count(), 1, '作品ツールにすると開始番号の欄が出る');
  t.ok((await page.$eval('#workQueueNote', e => e.textContent)).includes('10001'),
    '次に置く番号が案内に出る(いちばん小さい10001から)');
  t.ok((await page.$eval('#workQueueNote', e => e.textContent)).includes('残り5件'),
    '残りの件数が出る');

  // --- 開始番号を入れると、その番号から順番に置かれる ---
  await page.fill('#workStart', '10003');
  await page.dispatchEvent('#workStart', 'change');
  await page.waitForTimeout(150);
  t.ok((await page.$eval('#workQueueNote', e => e.textContent)).includes('10003 → 10004 → 10005'),
    '開始番号以降だけが並ぶ');
  t.ok((await page.$eval('#workQueueNote', e => e.textContent)).includes('残り3件'),
    '開始番号より前の番号は数に入らない');

  await placeAt(0);
  t.eq(await placedNos(page), ['10003'], '1つ目は開始番号の10003');
  t.eq(await curTool(page), 'select',
    '1つ置いたら選択ツールに戻る(続けてタップしても作品が増えない)');
  // 置いた直後に図面をタップしても、作品は増えない
  const s0 = spot(5);
  await page.mouse.click(s0.x, s0.y);
  await page.waitForTimeout(120);
  t.eq(await placedNos(page), ['10003'], '置いた直後にタップしても作品は増えない');

  await placeAt(1);
  await placeAt(2);
  t.eq(await placedNos(page), ['10003', '10004', '10005'],
    '「作品」を押すたびに次の番号が順番に置かれる');

  // 画像フォルダの画像が番号一致で表示される
  t.eq(await page.locator('g.obj image').count(), 3,
    '置いた作品には画像フォルダの画像が番号で結びついて表示される');

  t.eq(await page.locator('#workStart').count(), 0, '選択ツールに戻ると開始番号の欄も消える');

  // --- 開始番号を戻すと、まだ置いていない番号だけが残っている ---
  await page.click('.tool[data-tool="work"]');
  await page.waitForTimeout(150);
  await page.fill('#workStart', '');
  await page.dispatchEvent('#workStart', 'change');
  await page.waitForTimeout(150);
  t.ok((await page.$eval('#workQueueNote', e => e.textContent)).includes('10001 → 10002'),
    '開始番号を消すと、置いていない小さい番号が並ぶ');
  t.ok((await page.$eval('#workQueueNote', e => e.textContent)).includes('残り2件'),
    'すでに置いた番号は数に入らない');
  await placeAt(3);
  t.eq((await placedNos(page)).slice(-1), ['10001'], '置いていない番号から続けられる');

  // --- 全部置くと案内が変わる ---
  await placeAt(4);
  t.eq((await placedNos(page)).sort(), ['10001', '10002', '10003', '10004', '10005'],
    '画像フォルダの番号を全部配置できた');
  await page.click('.tool[data-tool="work"]');
  await page.waitForTimeout(150);
  t.ok((await page.$eval('#workQueueNote', e => e.textContent)).includes('ありません'),
    '置く番号が無くなったことが案内に出る');

  // --- 全角や「No.」つきで入れても番号として読み取る ---
  await page.fill('#workStart', 'Ｎｏ．１０００２');
  await page.dispatchEvent('#workStart', 'change');
  await page.waitForTimeout(150);
  t.eq(await page.$eval('#workStart', e => e.value), '10002',
    '全角数字や「No.」つきで入れても番号として読み取る');

  // --- 開始番号は図面と一緒に保存され、読み込みで戻る ---
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#saveBtn'),
  ]);
  const savePath = path.join(os.tmpdir(), 'fp14_saved.json');
  await download.saveAs(savePath);
  t.eq(JSON.parse(fs.readFileSync(savePath, 'utf8')).workStartNo, '10002',
    '開始番号は図面データに保存される');

  await page.reload();
  await page.waitForTimeout(300);
  await page.setInputFiles('#fileInput', savePath);
  await page.waitForTimeout(400);
  await page.click('.tool[data-tool="work"]');
  await page.waitForTimeout(150);
  t.eq(await page.$eval('#workStart', e => e.value), '10002', '読み込むと開始番号が戻る');

  // --- 画像フォルダも作品リストも空なら、従来どおり1つ置いて選択ツールに戻る ---
  await page.reload();
  await page.waitForTimeout(300);
  await page.click('.tool[data-tool="work"]');
  await page.waitForTimeout(150);
  t.ok((await page.$eval('#workQueueNote', e => e.textContent)).includes('画像フォルダ'),
    '番号の当てが無いときは、画像フォルダか作品リストを用意するよう案内する');
  await placeAt(0);
  t.eq(await placedNos(page), ['1'], '当てが無いときは連番(1から)を振る');
  t.eq(await curTool(page), 'select', '当てが無いときも1つ置いて選択ツールに戻る');

  t.noErrors(errors);
  await context.close();
  await browser.close();
  for (const f of [...files, savePath]) fs.unlinkSync(f);
  return t.finish();
}

module.exports = { run };
if (require.main === module) run();
