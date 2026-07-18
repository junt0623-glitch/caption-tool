// bt34【不具合修正】透過PNGを取り込んでも透明部分が黒くならない
// 原因：loadImageScaledが常にJPEG（透過非対応）へ変換していたため、透明部分が黒く潰れていた。
// 修正：アルファを持つ画像はPNGで保存し、透過のない画像は従来どおりJPEGで圧縮する。
const path = require('path');
const { openApp, mkRunner, chromium } = require('./helpers');

async function run() {
  const t = mkRunner('bt34 透過PNGの保持');
  const browser = await chromium.launch({});
  try {
    const { page, errors } = await openApp(browser, { waitTab: 'layout' });

    // ---- 透過PNG（左半分=不透明な赤／右半分=透明）を loadImageScaled に通す ----
    const res = await page.evaluate(async () => {
      const cv = document.createElement('canvas'); cv.width = 20; cv.height = 20;
      const ctx = cv.getContext('2d');
      ctx.clearRect(0, 0, 20, 20);
      ctx.fillStyle = 'rgba(200,0,0,1)'; ctx.fillRect(0, 0, 10, 20); // 左半分だけ不透明
      const blob = await new Promise(r => cv.toBlob(r, 'image/png'));
      const file = new File([blob], 't.png', { type: 'image/png' });
      const url = await new Promise(done => loadImageScaled(file, 1400, u => done(u)));
      // 出力データURLを読み込み直して、右半分（透明だった領域）のアルファを確認
      const alpha = await new Promise(done => {
        const im = new Image();
        im.onload = () => {
          const c2 = document.createElement('canvas'); c2.width = im.naturalWidth; c2.height = im.naturalHeight;
          const cx = c2.getContext('2d'); cx.drawImage(im, 0, 0);
          const rightX = Math.floor(im.naturalWidth * 0.75), midY = Math.floor(im.naturalHeight / 2);
          const leftX = Math.floor(im.naturalWidth * 0.25);
          const aRight = cx.getImageData(rightX, midY, 1, 1).data[3];
          const leftPx = cx.getImageData(leftX, midY, 1, 1).data;
          done({ aRight, leftPx: [...leftPx] });
        };
        im.src = url;
      });
      return { prefix: url.slice(0, 22), alphaRight: alpha.aRight, leftPx: alpha.leftPx };
    });
    t.ok(res.prefix.startsWith('data:image/png'), '透過を持つPNGはPNGとして保存される（JPEGに変換されない）');
    t.eq(res.alphaRight, 0, '透明だった領域が透明のまま保たれる（黒く塗り潰されない）');
    t.ok(res.leftPx[0] > 150 && res.leftPx[3] === 255, '不透明な赤の領域はそのまま（アルファ255・赤が残る）');

    // ---- 透過のない画像（JPEG）は従来どおりJPEGで圧縮される ----
    const jpg = await page.evaluate(async () => {
      const cv = document.createElement('canvas'); cv.width = 20; cv.height = 20;
      const ctx = cv.getContext('2d'); ctx.fillStyle = '#3366cc'; ctx.fillRect(0, 0, 20, 20);
      const blob = await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.9));
      const file = new File([blob], 'p.jpg', { type: 'image/jpeg' });
      const url = await new Promise(done => loadImageScaled(file, 1400, u => done(u)));
      return url.slice(0, 22);
    });
    t.ok(jpg.startsWith('data:image/jpeg'), '透過のないJPEGはJPEGのまま（データ量を抑える）');

    // ---- 不透明なPNG（写真をPNG保存したもの等）はJPEGへ圧縮される ----
    const opaquePng = await page.evaluate(async () => {
      const cv = document.createElement('canvas'); cv.width = 20; cv.height = 20;
      const ctx = cv.getContext('2d'); ctx.fillStyle = '#228844'; ctx.fillRect(0, 0, 20, 20); // 全面不透明
      const blob = await new Promise(r => cv.toBlob(r, 'image/png'));
      const file = new File([blob], 'o.png', { type: 'image/png' });
      const url = await new Promise(done => loadImageScaled(file, 1400, u => done(u)));
      return url.slice(0, 22);
    });
    t.ok(opaquePng.startsWith('data:image/jpeg'), '透過のないPNGはJPEGへ圧縮される（不要にPNGで肥大化させない）');

    t.noErrors(errors);
    const r = t.finish();
    await browser.close();
    return r;
  } catch (e) {
    console.log('  ✗ EXCEPTION: ' + e.message);
    await browser.close();
    t.ok(false, '例外: ' + e.message);
    return t.finish();
  }
}
module.exports = { run };
if (require.main === module) { run().then(r => process.exit(r.fail ? 1 : 0)); }
