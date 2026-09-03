// tests/fp15_library_bulk_delete.js
// 画像フォルダの複数削除・一斉削除のテスト。
//
// 仕様:
//  ・一覧モードでは各画像にチェック欄が出る。チェックしたものだけをまとめて削除できる。
//  ・「すべて選択」で全部にチェック(押し直すと解除)、「すべて削除」で中身を空にできる。
//  ・削除は元に戻せないので必ず確認を出す。図面上で使われている画像があればその件数も知らせ、
//    消したらその作品の画像指定(imgId)も外す。
//  ・作品の画像を選ぶモード(図面上でダブルクリック)では、削除系のボタンは出さない。
const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium, mkRunner } = require('./helpers');

const FP_URL = 'file://' + path.join(__dirname, '..', 'floorplan', 'index.html');
const PRESET_CHROMIUM = '/opt/pw-browsers/chromium';
const launchOpts = fs.existsSync(PRESET_CHROMIUM) ? { executablePath: PRESET_CHROMIUM } : {};

async function makePng(page, outPath, color) {
  const dataUrl = await page.evaluate(c => {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 40;
    const g = cv.getContext('2d');
    g.fillStyle = c; g.fillRect(0, 0, 40, 40);
    return cv.toDataURL('image/png');
  }, color);
  fs.writeFileSync(outPath, Buffer.from(dataUrl.split(',')[1], 'base64'));
}

const libCount = page => page.evaluate(() => state.library.length);
const cardCount = page => page.locator('.libcard').count();

async function run() {
  const t = mkRunner('fp15 画像フォルダの複数削除・一斉削除');
  const browser = await chromium.launch(launchOpts);
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console error: ' + m.text()); });

  // 確認ダイアログは既定でOK。内容は記録しておく
  const dialogs = [];
  let answer = true;
  page.on('dialog', d => { dialogs.push(d.message()); answer ? d.accept() : d.dismiss(); });

  await page.goto(FP_URL);
  await page.waitForTimeout(300);

  // 6枚入れる
  const files = [];
  for (let i = 1; i <= 6; i++) {
    const fp = path.join(os.tmpdir(), `4000${i}.png`);
    await makePng(page, fp, `hsl(${i * 50},60%,55%)`);
    files.push(fp);
  }
  await page.click('#imgsBtn');
  await page.waitForTimeout(100);
  await page.setInputFiles('#imgsInput', files);
  await page.waitForTimeout(900);
  t.eq(await cardCount(page), 6, '画像を6枚入れた(前提確認)');

  // --- 一覧モードの見た目 ---
  t.eq(await page.locator('.libcard .pick input').count(), 6, '各画像にチェック欄が出る');
  t.ok(await page.locator('#libSelAll').isVisible(), '「すべて選択」ボタンが出る');
  t.ok(await page.locator('#libDelAll').isVisible(), '「すべて削除」ボタンが出る');
  t.eq(await page.$eval('#libDelSel', e => e.textContent), '選択したものを削除',
    '何も選んでいないときの表示');
  t.ok(await page.$eval('#libDelSel', e => e.disabled), '何も選んでいなければ削除は押せない');
  t.ok((await page.$eval('#libDelAll', e => e.textContent)).includes('6件'),
    '「すべて削除」に件数が出る');

  // --- チェックして選んだものだけ削除できる ---
  await page.locator('.libcard .pick input').nth(0).check();
  await page.locator('.libcard .pick input').nth(2).check();
  await page.waitForTimeout(100);
  t.eq(await page.$eval('#libDelSel', e => e.textContent), '選択した2件を削除',
    '選んだ件数がボタンに出る');
  t.ok(!(await page.$eval('#libDelSel', e => e.disabled)), '選ぶと削除ボタンが押せるようになる');
  t.eq(await page.locator('.libcard.marked').count(), 2, '選んだカードに印がつく');

  const before = await page.evaluate(() => state.library.map(it => it.name));
  await page.click('#libDelSel');
  await page.waitForTimeout(300);
  t.ok(dialogs.some(m => m.includes('2件') && m.includes('元に戻せません')),
    '削除前に件数と「元に戻せない」ことを確認する');
  t.eq(await libCount(page), 4, '選んだ2件だけが消える');
  const after = await page.evaluate(() => state.library.map(it => it.name));
  t.eq(after, before.filter((_, i) => i !== 0 && i !== 2), '消えたのはチェックした2件だけ');
  t.eq(await page.locator('.libcard.marked').count(), 0, '削除後は選択が解除される');
  t.ok((await page.$eval('#libDelAll', e => e.textContent)).includes('4件'),
    '残りの件数が「すべて削除」に反映される');

  // --- 確認でキャンセルすると消えない ---
  answer = false;
  await page.locator('.libcard .pick input').nth(0).check();
  await page.waitForTimeout(100);
  await page.click('#libDelSel');
  await page.waitForTimeout(300);
  t.eq(await libCount(page), 4, '確認でキャンセルすると1件も消えない');
  t.eq(await page.locator('.libcard.marked').count(), 1, 'キャンセル後も選択は残る');
  answer = true;

  // --- 「すべて選択」で全部にチェック、押し直すと解除 ---
  await page.click('#libSelAll');
  await page.waitForTimeout(150);
  t.eq(await page.locator('.libcard.marked').count(), 4, '「すべて選択」で全部に印がつく');
  t.eq(await page.$eval('#libSelAll', e => e.textContent), '選択を解除',
    '全部選ぶとボタンの文言が「選択を解除」に変わる');
  await page.click('#libSelAll');
  await page.waitForTimeout(150);
  t.eq(await page.locator('.libcard.marked').count(), 0, '押し直すと選択が解除される');
  t.eq(await page.$eval('#libSelAll', e => e.textContent), 'すべて選択', '文言も戻る');

  // --- 図面で使っている画像を消すと、その作品の画像指定も外れる ---
  // 作品を1つ置き、画像フォルダの1枚を割り当てる
  await page.click('#libClose');
  await page.waitForTimeout(100);
  const svgBox = await page.locator('svg#plan').boundingBox();
  const cx = svgBox.x + svgBox.width / 2, cy = svgBox.y + svgBox.height / 2;
  await page.click('.tool[data-tool="work"]');
  await page.mouse.click(cx, cy);
  await page.waitForTimeout(150);
  await page.mouse.dblclick(cx, cy);
  await page.waitForTimeout(250);
  await page.locator('.libcard').first().click();
  await page.waitForTimeout(250);
  const usedId = await page.evaluate(() => state.objects.find(o => o.type === 'work').imgId);
  t.ok(!!usedId, '作品に画像フォルダの画像を割り当てた(前提確認)');

  await page.click('#imgsBtn');
  await page.waitForTimeout(150);
  dialogs.length = 0;
  await page.locator(`.libcard[data-lib="${usedId}"] .pick input`).check();
  await page.waitForTimeout(100);
  await page.click('#libDelSel');
  await page.waitForTimeout(300);
  t.ok(dialogs.some(m => m.includes('1件は図面上の作品で使われています')),
    '図面で使われている画像は、その件数を知らせてから消す');
  t.eq(await page.evaluate(() => state.objects.find(o => o.type === 'work').imgId), undefined,
    '消した画像を使っていた作品の画像指定も外れる');

  // --- 「すべて削除」で空になる ---
  dialogs.length = 0;
  const rest = await libCount(page);
  await page.click('#libDelAll');
  await page.waitForTimeout(300);
  t.ok(dialogs.some(m => m.includes(`画像${rest}件`)), '「すべて削除」も件数を確認してから消す');
  t.eq(await libCount(page), 0, '「すべて削除」で画像フォルダが空になる');
  t.eq(await page.locator('#libGrid .empty').count(), 1, '空の案内が出る');
  t.ok(await page.locator('#libSelAll').isHidden(), '空になったら「すべて選択」は消える');
  t.ok(await page.locator('#libDelAll').isHidden(), '空になったら「すべて削除」も消える');

  // --- 画像を選ぶモードでは削除系のボタンを出さない ---
  await page.setInputFiles('#imgsInput', files.slice(0, 3));
  await page.waitForTimeout(700);
  await page.click('#libClose');
  await page.waitForTimeout(100);
  await page.mouse.dblclick(cx, cy);
  await page.waitForTimeout(250);
  t.ok(await page.locator('#libModal').isVisible(), '作品のダブルクリックで選ぶモードが開く(前提確認)');
  t.ok(await page.locator('#libDelSel').isHidden(), '選ぶモードでは「選択したものを削除」を出さない');
  t.ok(await page.locator('#libDelAll').isHidden(), '選ぶモードでは「すべて削除」を出さない');
  t.eq(await page.locator('.libcard .pick input').count(), 0, '選ぶモードではチェック欄も出さない');

  t.noErrors(errors);
  await context.close();
  await browser.close();
  for (const f of files) fs.unlinkSync(f);
  return t.finish();
}

module.exports = { run };
if (require.main === module) run();
