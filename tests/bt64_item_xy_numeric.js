// bt64【新機能】項目の配置を座標（mm）で数値指定できる
//   ドラッグだけだと1mm単位で合わせるのが難しいので、小パネルで「左から」「上から」を
//   直接入力して置けるようにする。ドラッグした結果もその数値に出る。
const { openApp, mkRunner, chromium } = require('./helpers');

async function run() {
  const t = mkRunner('bt64 項目の座標を数値で指定');
  const browser = await chromium.launch();
  try {
    const { page, errors } = await openApp(browser, { waitTab: 'layout' });

    const panel = () => page.evaluate(() => ({
      x: document.getElementById('ipX').value,
      y: document.getElementById('ipY').value
    }));
    const lay = (k) => page.evaluate((k) => {
      const L = curLayoutRead()[k];
      const el = document.querySelector(`#editHolder [data-item="${k}"]`);
      return { x: L.x, y: L.y, left: el && el.style.left, top: el && el.style.top };
    }, k);
    const select = async (k) => { await page.click(`#editHolder [data-item="${k}"]`); await page.waitForTimeout(150); };
    // 項目が重なっていてクリックで選べないことがあるので、複数選択はアプリ側で選ぶ
    const selectKeys = async (keys) => {
      await page.evaluate((ks) => { sel.clear(); ks.forEach(k => sel.add(k)); updateSelUI(); showPanel(); }, keys);
      await page.waitForTimeout(200);
    };

    /* ===== 1. 選ぶと、いまの座標が数値で出る ===== */
    await page.evaluate(() => {
      const L = proj().style.layout;
      L.title.x = 8; L.title.y = 17.1;
      save(); renderEditor();
    });
    await select('title');
    let p0 = await panel();
    t.eq([p0.x, p0.y], ['8', '17.1'], '選んだ項目の座標（左から・上から）が数値で出る');

    /* ===== 2. 数値を入れるとその位置へ動く ===== */
    await page.fill('#ipX', '12.5');
    await page.waitForTimeout(200);
    await page.fill('#ipY', '40');
    await page.waitForTimeout(250);
    let L = await lay('title');
    t.eq([L.x, L.y], [12.5, 40], '入力した座標が配置に入る');
    t.eq([L.left, L.top], ['12.5mm', '40mm'], 'キャンバス上の位置も入力どおりに動く');

    // 0.1mm刻みに丸める（ドラッグと同じ精度）
    await page.fill('#ipX', '20.04');
    await page.waitForTimeout(250);
    t.eq((await lay('title')).x, 20, '細かすぎる値は0.1mm刻みに丸める');
    await page.fill('#ipX', '20.46');
    await page.waitForTimeout(250);
    t.eq((await lay('title')).x, 20.5, '0.1mm刻みへの丸めは四捨五入');

    /* ===== 3. 保存され、読み直しても残る ===== */
    await page.reload();
    await page.waitForTimeout(500);
    await page.click('nav.tabs button[data-tab="layout"]');
    await page.waitForTimeout(400);
    t.eq((await lay('title')).x, 20.5, '読み直しても入力した座標のまま');
    await select('title');
    t.eq((await panel()).x, '20.5', '読み直してもパネルに同じ値が出る');

    /* ===== 4. ドラッグした結果も、その数値に出る ===== */
    const box = await page.locator('#editHolder [data-item="title"]').boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 30, box.y + box.height / 2 + 20, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(300);
    const dragged = await lay('title');
    const shown = await panel();
    t.ok(dragged.x > 20.5, 'ドラッグで右へ動く');
    t.eq([shown.x, shown.y], [String(dragged.x), String(dragged.y)],
      'ドラッグしたあとの座標がパネルの数値に出る');

    /* ===== 5. 整列ボタンで動かしたときも数値が追従する ===== */
    await page.click('.ab[data-align="left"]');
    await page.waitForTimeout(300);
    const aligned = await lay('title');
    t.eq((await panel()).x, String(aligned.x), '整列で動かしたあともパネルの数値が合う');

    /* ===== 6. 複数選択：ばらばらなら空、入力すればそろう ===== */
    await page.evaluate(() => {
      const L = proj().style.layout;
      L.title.x = 10; L.origin.x = 30;
      L.title.y = 20; L.origin.y = 60;
      save(); renderEditor();
    });
    await selectKeys(['title', 'origin']);
    let p1 = await panel();
    t.eq([p1.x, p1.y], ['', ''], '座標がばらばらの複数選択では空にする');

    await page.fill('#ipX', '15');
    await page.waitForTimeout(300);
    const both = await page.evaluate(() => {
      const L = curLayoutRead();
      return [L.title.x, L.origin.x, L.title.y, L.origin.y];
    });
    t.eq(both, [15, 15, 20, 60], '複数選択で入力すると、入れた座標に全部そろう（もう一方の軸はそのまま）');

    // 同じ座標どうしなら、その値を出す
    await selectKeys(['title', 'origin']);
    t.eq((await panel()).x, '15', '座標が同じ複数選択では、その値を出す');

    /* ===== 7. 解説の面でも同じ ===== */
    await page.evaluate(() => { proj().style.show.desc = true; save(); renderAll(); });
    await page.click('.mode-sw button[data-mode="desc"]');
    await page.waitForTimeout(500);
    await selectKeys(['description']);
    await page.fill('#ipY', '33');
    await page.waitForTimeout(300);
    t.eq(await page.evaluate(() => proj().style.descLayout.description.y), 33,
      '解説の面でも座標を数値で指定できる');
    await page.click('.mode-sw button[data-mode="cap"]');
    await page.waitForTimeout(500);

    /* ===== 8. 作品ごとの編集：上書きONにするまで触れない ===== */
    await page.evaluate(() => {
      const p = proj();
      if (!p.works.length) { const w = newWork(); w.no = '1'; w.title = 'テスト'; p.works.push(w); }
      save(); renderAll();
    });
    await page.click('#emodeOne');
    await page.waitForTimeout(500);
    await selectKeys(['title']);
    const oneMode = await page.evaluate(() => document.getElementById('tab-layout').classList.contains('one-mode'));
    if (oneMode) {
      const locked = await page.evaluate(() => {
        const row = document.getElementById('ipX').closest('.prow');
        return getComputedStyle(row).pointerEvents;
      });
      t.eq(locked, 'none', '作品ごとの編集で上書きOFFのときは座標も触れない');
    } else {
      t.ok(true, '作品ごとの編集に入れない構成のため、この確認は省略');
    }

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
