// bt53【不具合修正】作品ごとの編集で複数選択しても操作が効かない
//   個別編集で上書きOFFのとき、整列バーだけが灰色で小パネルは触れてしまい、
//   しかもパネルの操作はマスター（＝全作品）を書き換えていた。
const { openApp, mkRunner, chromium } = require('./helpers');

async function run() {
  const t = mkRunner('bt53 個別編集での複数選択と操作の整合');
  const browser = await chromium.launch();
  try {
    const { page, errors } = await openApp(browser, { waitTab: 'layout' });
    await page.setViewportSize({ width: 1500, height: 950 });

    const enterOne = (ovOn) => page.evaluate((on) => {
      switchEditScope('one');
      const w = proj().works[previewIndex];
      if (on) { w._ovEditing = true; } else { delete w._ovEditing; delete w.layoutOverride; }
      applyEditScope(); renderEditor();
      sel.clear(); sel.add('title'); sel.add('origin'); renderEditor(); showPanel();
    }, ovOn);

    /* ===== 上書きOFF：選べるが触れない。その理由と直し方を示す ===== */
    await enterOne(false);
    await page.waitForTimeout(400);

    const off = await page.evaluate(() => ({
      sel: [...sel],
      panelShown: document.getElementById('itemPanel').classList.contains('show'),
      locked: getComputedStyle(document.getElementById('ipLocked')).display,
      rowPointer: getComputedStyle(document.querySelector('#itemPanel .prow')).pointerEvents,
      alignPointer: getComputedStyle(document.getElementById('alignBar')).pointerEvents,
      unlockPointer: getComputedStyle(document.getElementById('ipUnlock')).pointerEvents,
      note: document.getElementById('ipLocked').textContent
    }));
    t.eq(off.sel, ['title', 'origin'], '複数選択そのものはできる');
    t.eq(off.panelShown, true, '小パネルは出る');
    t.eq(off.locked, 'block', '触れない理由の案内が出る');
    t.ok(off.note.includes('全作品'), `マスターを書き換えてしまうためだと説明する（${off.note.trim().slice(0, 34)}…）`);
    t.eq(off.rowPointer, 'none', '小パネルの各項目は触れない');
    t.eq(off.alignPointer, 'none', '整列バーも触れない（従来どおり）');
    t.eq(off.unlockPointer, 'auto', '案内の中の解除ボタンだけは押せる');

    // 実際にクリックできないこと（＝誤ってマスターを書き換えない）
    const master0 = await page.evaluate(() => proj().style.layout.title.size);
    const clickable = await page.locator('#ipSize').click({ timeout: 1200 }).then(() => true).catch(() => false);
    t.eq(clickable, false, '文字サイズ欄は実際にクリックできない');
    const alignClickable = await page.locator('#alignBar [data-align="left"]').click({ timeout: 1200 }).then(() => true).catch(() => false);
    t.eq(alignClickable, false, '整列ボタンも実際にクリックできない');
    t.eq(await page.evaluate(() => proj().style.layout.title.size), master0,
      'この間にマスターの値は書き換わらない');

    /* ===== 案内のボタンから、選択を保ったまま編集に進める ===== */
    await page.click('#ipUnlock');
    await page.waitForTimeout(400);
    const unlocked = await page.evaluate(() => ({
      ov: !!proj().works[previewIndex]._ovEditing,
      checkbox: document.getElementById('ovToggle').checked,
      sel: [...sel],
      locked: getComputedStyle(document.getElementById('ipLocked')).display,
      rowPointer: getComputedStyle(document.querySelector('#itemPanel .prow')).pointerEvents,
      alignPointer: getComputedStyle(document.getElementById('alignBar')).pointerEvents
    }));
    t.eq(unlocked.ov, true, '解除ボタンでこの作品だけの上書きがONになる');
    t.eq(unlocked.checkbox, true, '「この作品だけ配置を上書きする」のチェックも入る');
    t.eq(unlocked.sel, ['title', 'origin'], '選び直さずに済むよう選択が保たれる');
    t.eq(unlocked.locked, 'none', '案内は消える');
    t.eq(unlocked.rowPointer, 'auto', '小パネルが触れるようになる');
    t.eq(unlocked.alignPointer, 'auto', '整列バーも触れるようになる');

    /* ===== 解除後は複数選択した項目に操作が効き、他の作品には及ばない ===== */
    await page.fill('#ipSize', '26');
    await page.waitForTimeout(350);
    const applied = await page.evaluate(() => ({
      picked: [...sel].map(k => curLayoutRead()[k].size),
      master: [proj().style.layout.title.size, proj().style.layout.origin.size],
      otherWork: proj().works.findIndex((w, i) => i !== previewIndex && w.layoutOverride)
    }));
    t.eq(applied.picked, [26, 26], '選んだ2項目にまとめて効く');
    t.ok(applied.master[0] !== 26 && applied.master[1] !== 26,
      `マスターは変わらない（${applied.master.join(' / ')}）`);
    t.eq(applied.otherWork, -1, '他の作品にも何も付かない');

    // 整列も効く
    const aligned = await page.evaluate(async () => {
      const L = curLayout(); L.title.x = 10; L.origin.x = 40; save(); renderEditor();
      await new Promise(r => setTimeout(r, 100));
      document.querySelector('#alignBar [data-align="left"]').click();
      await new Promise(r => setTimeout(r, 150));
      return [...sel].map(k => curLayoutRead()[k].x);
    });
    t.eq(aligned, [10, 10], '整列（左）も選んだ項目に効く');

    /* ===== マスター編集では従来どおり（案内は出さない） ===== */
    await page.evaluate(() => {
      switchEditScope('master');
      sel.clear(); sel.add('title'); sel.add('origin'); renderEditor(); showPanel();
    });
    await page.waitForTimeout(350);
    const master = await page.evaluate(() => ({
      locked: getComputedStyle(document.getElementById('ipLocked')).display,
      rowPointer: getComputedStyle(document.querySelector('#itemPanel .prow')).pointerEvents,
      alignPointer: getComputedStyle(document.getElementById('alignBar')).pointerEvents
    }));
    t.eq(master.locked, 'none', 'マスター編集では案内を出さない');
    t.eq(master.rowPointer, 'auto', 'マスター編集では小パネルが触れる');
    t.eq(master.alignPointer, 'auto', 'マスター編集では整列バーが触れる');

    await page.fill('#ipSize', '13');
    await page.waitForTimeout(300);
    t.eq(await page.evaluate(() => [proj().style.layout.title.size, proj().style.layout.origin.size]),
      [13, 13], 'マスター編集では従来どおり全作品向けの値を変えられる');

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
