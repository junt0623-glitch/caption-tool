// bt41【不具合修正】詰めて並べる（tight）モードで上端・左端の枠線が印刷範囲から外れる問題
// 原因：用紙端から1mmの位置に外周の枠線を引いていたが、多くのプリンタは用紙端から
// 3〜5mmが印字不可領域のため、上端・左端の線が消えていた。
const { openApp, mkRunner, chromium } = require('./helpers');

async function run() {
  const t = mkRunner('bt41 詰めて並べる：安全余白');
  const browser = await chromium.launch({});
  try {
    const { page, errors } = await openApp(browser, { waitTab: 'print' });

    // 作品を増やして面付けさせる
    await page.evaluate(() => {
      const p = proj();
      for (let i = 0; i < 10; i++) { const w = newWork(); Object.assign(w, { no: 't' + i, title: '作品' + i }); p.works.push(w); }
      save();
    });
    await page.check('#prTight');
    await page.waitForTimeout(500);

    // ---- 全カードの外周が用紙端から安全余白以上内側にある ----
    const m = await page.evaluate(() => {
      const px2mm = px => px / (96 / 25.4);
      const sheets = buildSheets();
      const host = document.createElement('div');
      host.style.cssText = 'position:absolute;left:-99999px;top:0';
      document.body.appendChild(host);
      sheets.forEach(s => { s.style.transform = ''; host.appendChild(s); });
      const sheet = host.querySelector('.sheet');
      const sr = sheet.getBoundingClientRect();
      const cards = [...sheet.querySelectorAll('.cap-card')];
      const gaps = cards.map(c => {
        const b = c.getBoundingClientRect();
        return {
          left: px2mm(b.left - sr.left), top: px2mm(b.top - sr.top),
          right: px2mm(sr.right - b.right), bottom: px2mm(sr.bottom - b.bottom)
        };
      });
      const res = {
        safeEdge: SAFE_EDGE,
        cards: cards.length,
        minLeft: +Math.min(...gaps.map(g => g.left)).toFixed(2),
        minTop: +Math.min(...gaps.map(g => g.top)).toFixed(2),
        minRight: +Math.min(...gaps.map(g => g.right)).toFixed(2),
        minBottom: +Math.min(...gaps.map(g => g.bottom)).toFixed(2),
        // 枠線クラスが左上端のカードに付いていること
        hasEdgeL: cards.some(c => c.classList.contains('edge-l')),
        hasEdgeT: cards.some(c => c.classList.contains('edge-t')),
        tightClass: sheet.classList.contains('tight')
      };
      host.remove();
      return res;
    });
    t.eq(m.tightClass, true, 'tightモードのシートとして描画される');
    t.ok(m.cards >= 1, 'カードが面付けされる');
    t.ok(m.minLeft >= m.safeEdge - 0.05, `左端の枠線が印字可能域内（左余白 ${m.minLeft}mm ≥ ${m.safeEdge}mm）`);
    t.ok(m.minTop >= m.safeEdge - 0.05, `上端の枠線が印字可能域内（上余白 ${m.minTop}mm ≥ ${m.safeEdge}mm）`);
    t.ok(m.minRight >= m.safeEdge - 0.05, `右端の枠線が印字可能域内（右余白 ${m.minRight}mm）`);
    t.ok(m.minBottom >= m.safeEdge - 0.05, `下端の枠線が印字可能域内（下余白 ${m.minBottom}mm）`);
    t.eq(m.hasEdgeL && m.hasEdgeT, true, '左端・上端のカードに外周の枠線クラスが付く');

    // ---- 並べたブロックが用紙の中央に配置される（左右・上下の余白がほぼ均等） ----
    t.ok(Math.abs(m.minLeft - m.minRight) <= 0.3, `左右の余白がほぼ均等（左${m.minLeft} / 右${m.minRight}）`);
    t.ok(Math.abs(m.minTop - m.minBottom) <= 0.3, `上下の余白がほぼ均等（上${m.minTop} / 下${m.minBottom}）`);

    // ---- 既定サイズ（140×100mm）で1枚あたりの取り数が落ちていない ----
    const yieldInfo = await page.evaluate(() => {
      const sheets = buildSheets();
      const first = sheets[0];
      return { perSheet: first.querySelectorAll('.cap-card').length, sheets: sheets.length };
    });
    t.ok(yieldInfo.perSheet >= 2, `A4・140×100mmで1枚に2点以上取れる（実際: ${yieldInfo.perSheet}点）`);

    // ---- 小さい札でも上端・左端が安全余白内に収まる ----
    const small = await page.evaluate(() => {
      const px2mm = px => px / (96 / 25.4);
      const p = proj(); p.size.w = 68; p.size.h = 48; p.size.preset = 'custom'; save();
      const sheets = buildSheets();
      const host = document.createElement('div');
      host.style.cssText = 'position:absolute;left:-99999px;top:0';
      document.body.appendChild(host);
      sheets.forEach(s => { s.style.transform = ''; host.appendChild(s); });
      const sheet = host.querySelector('.sheet');
      const sr = sheet.getBoundingClientRect();
      const cards = [...sheet.querySelectorAll('.cap-card')];
      const gaps = cards.map(c => {
        const b = c.getBoundingClientRect();
        return { left: px2mm(b.left - sr.left), top: px2mm(b.top - sr.top) };
      });
      const res = {
        perSheet: cards.length,
        minLeft: +Math.min(...gaps.map(g => g.left)).toFixed(2),
        minTop: +Math.min(...gaps.map(g => g.top)).toFixed(2)
      };
      host.remove();
      return res;
    });
    t.ok(small.minLeft >= 4.95, `小さい札でも左端が安全余白内（${small.minLeft}mm）`);
    t.ok(small.minTop >= 4.95, `小さい札でも上端が安全余白内（${small.minTop}mm）`);
    t.ok(small.perSheet >= 8, `小さい札は1枚に多数取れる（実際: ${small.perSheet}点）`);

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
