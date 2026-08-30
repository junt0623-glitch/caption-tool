// tests/fp04_large_image_no_freeze.js
// 回帰テスト: 大きな画像(高解像度スキャン等)を展示室図面/作品画像として
// 読み込んでもフリーズしないことを確認する。
//
// 原因だったバグ: roomFile / pImgFile の読み込みが圧縮なしの生dataURLを
// state に格納していた。render() はドラッグやスライダー操作のたびにSVGを
// 総入れ替えするため、巨大なdataURLを毎回<image>のhrefに設定し直すことになり、
// ブラウザが画像を毎フレーム再デコードしてタブがフリーズしていた。
// 修正: compressImage()/compressRoomImage() を必ず経由してから保存する。
const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium, mkRunner } = require('./helpers');

const FP_URL = 'file://' + path.join(__dirname, '..', 'floorplan', 'index.html');
const PRESET_CHROMIUM = '/opt/pw-browsers/chromium';
const launchOpts = fs.existsSync(PRESET_CHROMIUM) ? { executablePath: PRESET_CHROMIUM } : {};

// ブラウザのcanvasで大きめの画像(3000x2000、単純な塗りつぶしでは終わらない
// グラデーション+格子柄でそこそこ複雑にする)を生成し、PNGファイルとして保存する。
async function makeLargeTestImage(page, outPath) {
  const dataUrl = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 3000; c.height = 2000;
    const ctx = c.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, c.width, c.height);
    grad.addColorStop(0, '#204060'); grad.addColorStop(1, '#e0a030');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, c.width, c.height);
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    for (let x = 0; x < c.width; x += 17) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, c.height); ctx.stroke(); }
    for (let y = 0; y < c.height; y += 13) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(c.width, y); ctx.stroke(); }
    return c.toDataURL('image/png');
  });
  const base64 = dataUrl.split(',')[1];
  fs.writeFileSync(outPath, Buffer.from(base64, 'base64'));
  return Buffer.byteLength(base64, 'base64');
}

async function run() {
  const t = mkRunner('fp04 大きな画像でもフリーズしない');
  const browser = await chromium.launch(launchOpts);
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console error: ' + m.text()); });

  const bigPngPath = path.join(os.tmpdir(), 'fp04_large_room.png');
  const bigPngBytes = await makeLargeTestImage(page, bigPngPath);
  t.ok(bigPngBytes > 3_000_000, `テスト用画像は3MB超(実際 ${(bigPngBytes/1e6).toFixed(1)}MB)`);

  await page.goto(FP_URL);
  await page.waitForTimeout(300);

  // --- 展示室図面として読み込む: 完了までの時間とタブの応答性を確認 ---
  await page.selectOption('#roomSel', 'r1a1');
  await page.waitForTimeout(100);
  const t0 = Date.now();
  await page.setInputFiles('#roomFile', bigPngPath);
  await page.waitForSelector('svg#plan > image', { timeout: 10000 }); // フリーズしていればここでタイムアウトする
  const loadMs = Date.now() - t0;
  t.ok(loadMs < 10000, `巨大画像の読み込みが10秒以内に完了する(実際 ${loadMs}ms)`);

  const href = await page.$eval('svg#plan > image', i => i.getAttribute('href'));
  t.ok(href.startsWith('data:image/jpeg'), '圧縮されてJPEGとして保存される');
  t.ok(href.length < bigPngBytes, `保存されるdataURLは元画像より小さい(href ${href.length}字 < 元PNG ${bigPngBytes}バイト相当)`);

  // --- 読み込み後もタブが応答すること(スライダー操作を連続実行して確認) ---
  const t1 = Date.now();
  for (const v of [80, 40, 90, 60, 70]) {
    await page.fill('#rOp', String(v));
    await page.dispatchEvent('#rOp', 'input');
  }
  const interactMs = Date.now() - t1;
  t.ok(interactMs < 5000, `画像読み込み後も透明度スライダー操作が5秒以内に応答する(実際 ${interactMs}ms)`);
  t.eq(await page.$eval('svg#plan > image', i => i.getAttribute('opacity')), '0.7',
    '最後に設定した透明度70%が反映されている(=UIが固まらず処理を追えている)');

  // --- 画像フォルダに入れる作品画像でも同様にフリーズしないこと ---
  // 巨大画像を「番号つきファイル名」で画像フォルダに追加し、同じ番号の作品に自動対応させる
  const numberedPath = path.join(os.tmpdir(), '10001.png');
  fs.copyFileSync(bigPngPath, numberedPath);
  const svgBox = await page.locator('svg#plan').boundingBox();
  await page.click('.tool[data-tool="work"]');
  await page.mouse.click(svgBox.x + svgBox.width / 2, svgBox.y + svgBox.height / 2);
  await page.waitForTimeout(100);
  await page.fill('#pNo', '10001');
  await page.dispatchEvent('#pNo', 'input');
  await page.waitForTimeout(100);
  const t2 = Date.now();
  await page.setInputFiles('#imgsInput', numberedPath);
  await page.waitForSelector('g.obj image', { timeout: 10000 });
  const workLoadMs = Date.now() - t2;
  t.ok(workLoadMs < 10000, `作品への巨大画像の読み込みも10秒以内に完了する(実際 ${workLoadMs}ms)`);
  const workHref = await page.$eval('g.obj image', i => i.getAttribute('href'));
  t.ok(workHref.startsWith('data:image/jpeg'), '作品画像も圧縮されてJPEGとして保存される');
  fs.unlinkSync(numberedPath);

  t.noErrors(errors);
  await context.close();
  await browser.close();
  fs.unlinkSync(bigPngPath);
  return t.finish();
}

module.exports = { run };
if (require.main === module) run();
