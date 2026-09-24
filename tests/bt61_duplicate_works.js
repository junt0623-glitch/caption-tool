// bt61【新機能】作品台帳で選んだ作品をコピーして、リストに加える
//   同じ体裁でもう1枚作りたいときに、一から入れ直さずに済むようにする。
//   中身（文章・画像・ルビ・文字ごとの書式）も、作品ごとの体裁（配置・寸法・書体・背景）も引き継ぐ。
const { openApp, mkRunner, chromium } = require('./helpers');

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAAAgCAYAAACinX6EAAAAKklEQVR42u3OMQEAAAgDoC251a3gLzhQwOlWAAAAAAAAAAAAAAAAAADwYQF0AAABmb6NTQAAAABJRU5ErkJggg==';

async function run() {
  const t = mkRunner('bt61 選んだ作品をコピーして台帳に加える');
  const browser = await chromium.launch();
  try {
    const { page, errors } = await openApp(browser, { waitTab: 'daicho' });

    const setup = () => page.evaluate((img) => {
      const p = proj();
      p.works = [];
      ['A', 'B', 'C', 'D'].forEach((n, i) => {
        const w = newWork();
        w.no = String(i + 1); w.title = '作品' + n; w.origin = '産地' + n;
        w.period = '江戸時代'; w.description = '解説' + n;
        p.works.push(w);
      });
      // Bだけ、引き継ぐべきものをひととおり持たせる
      const b = p.works[1];
      b.section = '第一章';
      b.image = img;
      b.images = [{ id: 'orig1', url: img, x: 5, y: 50, w: 30, opacity: 0.8 }];
      b.ruby = { title: [{ start: 0, end: 2, text: 'さくひん' }] };
      b.charFmt = { origin: [{ start: 0, end: 2, ls: 0.2, size: 14 }] };
      b.layoutOverride = { cap: { title: { x: 12, y: 20, w: 90, h: null, font: 'inherit', size: 18, ls: 0, align: 'left', color: null, sx: 100, sy: 100, lh: null } } };
      b.sizeOverride = { cap: { w: 120, h: 90 } };
      b.textOverride = { lh: 2.0, font: 'gothic' };
      b.styleOverride = { bg: 'washi', bgOpacity: 0.7, imgScale: 120 };
      b._ovEditing = true;
      save(); renderAll();
    }, PNG);

    const rows = () => page.evaluate(() =>
      proj().works.map(w => `${w.no || '(空)'}/${w.title}`));
    const pick = (list) => page.evaluate((idxs) => {
      bulkSel.clear(); idxs.forEach(i => bulkSel.add(i));
      renderList(); updateBulkBar();
    }, list);
    const duplicate = async () => {
      await page.click('#bulkDuplicate');
      await page.waitForTimeout(200);
      const msg = await page.evaluate(() => document.getElementById('confirmMsg').textContent);
      await page.click('#confirmOk');
      await page.waitForTimeout(500);
      return msg;
    };

    await setup();
    await page.waitForTimeout(400);

    /* ===== 1. ボタンの出かた ===== */
    const before = await page.evaluate(() => ({
      barHidden: document.getElementById('bulkBar').style.display === 'none',
      btn: !!document.getElementById('bulkDuplicate')
    }));
    t.eq(before.btn, true, '台帳に「選択した作品をコピーして追加」がある');
    t.eq(before.barHidden, true, '何も選んでいないうちは一括バーが出ない');

    await pick([1, 3]);
    await page.waitForTimeout(300);
    t.eq(await page.evaluate(() => document.getElementById('bulkBar').style.display !== 'none'),
      true, '選ぶと一括バーが出る');

    /* ===== 2. それぞれの1つ下にコピーが入る ===== */
    await page.evaluate(() => { previewIndex = 3; });   // Dを見ている状態
    const msg = await duplicate();
    t.ok(msg.includes('2件'), `何件コピーするか知らせる（${msg.split('\n')[0]}）`);
    t.ok(msg.includes('番号'), '番号もそのままコピーされることを知らせる');

    t.eq(await rows(),
      ['1/作品A', '2/作品B', '2/作品B', '3/作品C', '4/作品D', '4/作品D'],
      'それぞれの1つ下に、番号も含めてそっくり同じものが入る');
    t.eq(await page.evaluate(() => [...bulkSel].sort((a, b) => a - b)), [2, 5],
      'コピーしてできた行が選ばれた状態になる（続けて操作しやすいように）');
    t.eq(await page.evaluate(() => proj().works[previewIndex].title), '作品D',
      '見ていた作品を見失わない（行がずれても追いかける）');

    /* ===== 3. 中身も作品ごとの体裁もそのまま引き継ぐ ===== */
    const deep = await page.evaluate(() => {
      const p = proj(), src = p.works[1], cp = p.works[2];
      const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
      return {
        title: cp.title, origin: cp.origin, desc: cp.description, section: cp.section,
        no: cp.no,
        idDiffers: src.id !== cp.id,
        image: !!cp.image && cp.image === src.image,
        ruby: same(src.ruby, cp.ruby),
        charFmt: same(src.charFmt, cp.charFmt),
        layoutOverride: same(src.layoutOverride, cp.layoutOverride),
        sizeOverride: same(src.sizeOverride, cp.sizeOverride),
        textOverride: same(src.textOverride, cp.textOverride),
        styleOverride: same(src.styleOverride, cp.styleOverride),
        img2Url: src.images[0].url === cp.images[0].url,
        img2IdDiffers: src.images[0].id !== cp.images[0].id,
        ovFlag: cp._ovEditing
      };
    });
    t.eq([deep.title, deep.origin, deep.desc, deep.section],
      ['作品B', '産地B', '解説B', '第一章'], '文章と章はそのまま引き継ぐ');
    t.eq(deep.no, '2', '番号もそのまま引き継ぐ（既定）');
    t.eq(deep.idDiffers, true, 'コピーには別の作品として印を付ける');
    t.eq(deep.image, true, '作品の画像を引き継ぐ');
    t.eq(deep.img2Url, true, '追加画像も引き継ぐ');
    t.eq(deep.img2IdDiffers, true, '追加画像の目印は振り直す（元とぶつからないように）');
    t.eq(deep.ruby, true, 'ルビを引き継ぐ');
    t.eq(deep.charFmt, true, '文字ごとの書式（字間・大きさ）を引き継ぐ');
    t.eq(deep.layoutOverride, true, '作品ごとの配置を引き継ぐ');
    t.eq(deep.sizeOverride, true, '作品ごとの札の寸法を引き継ぐ');
    t.eq(deep.textOverride, true, '作品ごとの書体・行間を引き継ぐ');
    t.eq(deep.styleOverride, true, '作品ごとの背景・画像の設定を引き継ぐ');
    t.eq(deep.ovFlag, undefined, '一時的な編集中の印は持ち越さない');

    /* ===== 4. コピーと元は別物（片方を直してももう片方は変わらない） ===== */
    const indep = await page.evaluate(() => {
      const p = proj();
      p.works[2].title = '書き換えた';
      p.works[2].textOverride.lh = 1.2;
      p.works[2].ruby.title[0].text = 'べつ';
      p.works[2].images[0].x = 99;
      return { title: p.works[1].title, lh: p.works[1].textOverride.lh,
               ruby: p.works[1].ruby.title[0].text, x: p.works[1].images[0].x };
    });
    t.eq([indep.title, indep.lh, indep.ruby, indep.x], ['作品B', 2.0, 'さくひん', 5],
      'コピーを直しても元の作品は変わらない');

    /* ===== 5. 元に戻す（Undo）で取り消せる ===== */
    await setup();
    await page.waitForTimeout(400);
    await pick([1]);
    await duplicate();
    t.eq((await rows()).length, 5, 'コピーが1件加わる');
    await page.evaluate(() => { flushSave(); doUndo(); });
    await page.waitForTimeout(600);
    t.eq(await rows(), ['1/作品A', '2/作品B', '3/作品C', '4/作品D'],
      '「元に戻す」でコピーを加える前に戻せる');

    /* ===== 6. 1件だけ・続けて2回でも正しく入る ===== */
    await setup();
    await page.waitForTimeout(400);
    await pick([0]);
    await duplicate();
    t.eq(await rows(), ['1/作品A', '1/作品A', '2/作品B', '3/作品C', '4/作品D'],
      '1件だけでもその下に入る');
    await duplicate();   // いまは「コピーしてできた行」が選ばれている
    t.eq(await rows(), ['1/作品A', '1/作品A', '1/作品A', '2/作品B', '3/作品C', '4/作品D'],
      '続けてコピーすると、コピーのコピーがそのまた下に入る');

    /* ===== 7. 表示中をすべて選んでコピーしても順番が崩れない ===== */
    await setup();
    await page.waitForTimeout(400);
    await pick([0, 1, 2, 3]);
    await duplicate();
    t.eq(await rows(),
      ['1/作品A', '1/作品A', '2/作品B', '2/作品B', '3/作品C', '3/作品C', '4/作品D', '4/作品D'],
      'すべて選んでも、元とコピーが交互に正しく並ぶ');
    t.eq(await page.evaluate(() => proj().works.length), 8, '件数が倍になる');

    /* ===== 8. 保存され、読み直しても残る ===== */
    await page.evaluate(() => flushSave());
    await page.reload();
    await page.waitForTimeout(900);
    t.eq(await rows(),
      ['1/作品A', '1/作品A', '2/作品B', '2/作品B', '3/作品C', '3/作品C', '4/作品D', '4/作品D'],
      '読み直してもコピーが残る');

    /* ===== 9. 絞り込み中でもコピーできる ===== */
    await setup();
    await page.waitForTimeout(400);
    await page.evaluate(() => {
      document.getElementById('searchBox').value = '作品B';
      document.getElementById('searchBox').dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForTimeout(400);
    const filtered = await page.evaluate(() => document.querySelectorAll('#worksListArea tr.work-row').length);
    t.eq(filtered, 1, '検索で1件に絞り込まれる');
    await pick([1]);
    await duplicate();
    t.eq(await rows(), ['1/作品A', '2/作品B', '2/作品B', '3/作品C', '4/作品D'],
      '絞り込み中でも、元の並びの正しい位置にコピーが入る');
    t.eq(await page.evaluate(() => document.querySelectorAll('#worksListArea tr.work-row').length), 2,
      'コピーも同じ検索に引っかかるので一覧に出る');

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
