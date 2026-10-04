// bt65【新機能】すべての展覧会をまとめて扱う／保存データの一括削除
//   ・作品台帳を全展覧会の作品でひとつの表にし、印刷も展覧会をまたいで一度にできるようにする
//     （作品はそれぞれ元の展覧会の寸法・配置・体裁のまま組まれる）
//   ・このブラウザに保存された展覧会をすべて消すボタン（書き出し→二段階確認→「戻す」で復帰可）
const { openApp, mkRunner, chromium } = require('./helpers');

async function run() {
  const t = mkRunner('bt65 全展覧会まとめ表示とデータ一括削除');
  const browser = await chromium.launch();
  try {
    const { page, errors } = await openApp(browser, { waitTab: 'daicho' });
    page.on('download', d => d.delete().catch(() => {}));

    // 見本の展覧会（2件）に加えて、別寸法の展覧会をもう1つ用意する
    const setup = () => page.evaluate(() => {
      const a = newProject('展示A');
      a.size = { preset: 'custom', w: 100, h: 60 };
      a.descSize = { w: 100, h: 60 };
      a.style.show.desc = true;
      ['A1', 'A2'].forEach(n => {
        const w = newWork();
        w.no = n; w.title = '作品' + n; w.origin = '美濃'; w.description = '解説' + n;
        a.works.push(w);
      });
      store.projects.push(a);
      store.allWorks = false;
      save(); renderAll();
    });
    await setup();

    const rows = () => page.evaluate(() =>
      [...document.querySelectorAll('#worksListArea tr.work-row')]
        .map(r => [...r.children].slice(0, 3).map(c => c.textContent.trim()).join('|')));

    /* ===== 1. 既定は1つの展覧会だけ ===== */
    let r = await rows();
    t.eq(r.length, 2, '既定ではいまの展覧会の作品だけが出る');
    t.eq(await page.evaluate(() => document.getElementById('allWorksToggle').checked), false,
      '「すべての展覧会をまとめて扱う」は既定でオフ');

    /* ===== 2. まとめて扱うと、全展覧会の作品が1つの表に出る ===== */
    await page.check('#allWorksToggle');
    await page.waitForTimeout(500);
    r = await rows();
    t.eq(r.length, 4, '全展覧会の作品がならぶ');
    t.eq(r.map(x => x.split('|')[0]), ['見本の展覧会', '見本の展覧会', '展示A', '展示A'],
      'どの展覧会の作品かが列で分かる');
    t.eq(await page.evaluate(() =>
      document.querySelector('#worksListArea th').textContent), '展覧会',
      '先頭の列は展覧会名');
    t.ok(await page.evaluate(() => /2件の展覧会/.test(document.getElementById('worksListArea').textContent)),
      '何件の展覧会をまとめているか知らせる');

    // 検索は展覧会をまたいで効く
    await page.fill('#searchBox', '美濃');
    await page.waitForTimeout(400);
    r = await rows();
    t.eq(r.length, 2, '検索は展覧会をまたいで効く');
    t.eq(r.every(x => x.startsWith('展示A')), true, '別の展覧会の作品も検索で拾える');
    await page.fill('#searchBox', '');
    await page.waitForTimeout(400);

    /* ===== 3. 「編集」はその展覧会に切り替えてから開く ===== */
    await page.evaluate(() => {
      const btns = [...document.querySelectorAll('#worksListArea button[data-edit]')];
      btns[btns.length - 1].click();          // 展示A の最後の作品
    });
    await page.waitForTimeout(500);
    t.eq(await page.evaluate(() => proj().name), '展示A',
      '別の展覧会の作品を編集すると、その展覧会に切り替わる');
    t.eq(await page.evaluate(() => document.getElementById('f_title').value), '作品A2',
      '選んだ作品の内容が開く');
    await page.evaluate(() => document.getElementById('workDialog').close());
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      store.currentId = store.projects[0].id; save(); renderAll();
    });
    await page.waitForTimeout(400);

    /* ===== 4. 印刷も展覧会をまたいで一度にできる ===== */
    await page.click('nav.tabs button[data-tab="print"]');
    await page.waitForTimeout(900);
    const printed = () => page.evaluate(() => ({
      note: document.getElementById('printAllNote').textContent,
      noteShown: getComputedStyle(document.getElementById('printAllNote')).display !== 'none',
      count: document.getElementById('sheetCount').textContent,
      nos: [...document.querySelectorAll('#sheetScroll .cap-card [data-item="no"]')].map(e => e.textContent.trim()),
      sizes: [...document.querySelectorAll('#sheetScroll .cap-card')].map(c => c.style.width + 'x' + c.style.height)
    }));
    let pr = await printed();
    t.eq(pr.noteShown, true, '印刷画面にも、全展覧会が対象であることを出す');
    t.ok(/2件の展覧会・作品4件/.test(pr.note), '対象の展覧会数と作品数を知らせる');
    t.eq(pr.nos, ['1-01', '1-02', 'A1', 'A2'], '全展覧会の作品が刷られる');
    t.eq(pr.sizes, ['140mmx100mm', '140mmx100mm', '100mmx60mm', '100mmx60mm'],
      '作品はそれぞれ元の展覧会の寸法のまま刷られる');

    // キャプション＋解説でも同じ
    await page.evaluate(() => {
      proj().printOpt.face = 'both'; save(); refreshPrintControls(); renderSheets();
    });
    await page.waitForTimeout(1000);
    pr = await printed();
    t.eq(pr.nos.length, 8, 'キャプション＋解説では1作品につき2枚の札（4作品で8枚）');
    t.ok(pr.sizes.slice(0, 2).every(x => x.startsWith('140mm'))
      && pr.sizes.slice(-2).every(x => x.startsWith('100mm')),
      'キャプション＋解説でも元の展覧会の寸法のまま');
    await page.evaluate(() => {
      proj().printOpt.face = 'cap'; save(); refreshPrintControls(); renderSheets();
    });
    await page.waitForTimeout(700);

    /* ===== 5. 「選んだ作品だけ」も展覧会をまたいで選べる ===== */
    await page.selectOption('#printSection', '__pick');
    await page.waitForTimeout(500);
    const picks = await page.evaluate(() =>
      [...document.querySelectorAll('#pickList label')].map(l => l.textContent.trim()));
    t.eq(picks.length, 4, '一覧には全展覧会の作品が出る');
    t.ok(/見本の展覧会/.test(picks[0]) && /展示A/.test(picks[3]),
      '作品がどの展覧会のものか分かるように展覧会名を添える');

    await page.fill('#pickRange', '1-01, A2');
    await page.click('#pickApplyRange');
    await page.waitForTimeout(800);
    t.eq((await printed()).nos, ['1-01', 'A2'],
      '番号で選び直すと、展覧会をまたいで選べる（「1-01」は範囲ではなく番号そのもの）');

    await page.selectOption('#printSection', '');
    await page.waitForTimeout(700);

    /* ===== 6. 設定は保存され、読み直しても残る ===== */
    await page.reload();
    await page.waitForTimeout(600);
    await page.click('nav.tabs button[data-tab="daicho"]');
    await page.waitForTimeout(500);
    t.eq(await page.evaluate(() => document.getElementById('allWorksToggle').checked), true,
      '読み直しても「まとめて扱う」のまま');
    t.eq((await rows()).length, 4, '読み直しても全展覧会の作品が出る');

    // 外すと元どおり1つの展覧会だけ
    await page.uncheck('#allWorksToggle');
    await page.waitForTimeout(500);
    t.eq((await rows()).length, 2, '外すといまの展覧会の作品だけに戻る');
    t.eq(await page.evaluate(() => document.querySelector('#worksListArea th input') ? true : false),
      true, '元の表（チェック欄つき）に戻る');

    /* ===== 7. 保存データの一括削除 ===== */
    await page.waitForTimeout(300);
    const before = await page.evaluate(() =>
      store.projects.map(p => p.name + ':' + p.works.length).join(' / '));
    t.eq(before, '見本の展覧会:2 / 展示A:2', '削除前は2つの展覧会がある');

    // 1回目の確認で取り消せば、何も消えない
    await page.click('#btnWipeAll');
    await page.waitForTimeout(500);
    const msg1 = await page.evaluate(() => document.getElementById('confirmMsg').textContent);
    t.ok(/展覧会 2件/.test(msg1) && /作品 4件/.test(msg1), '消える件数を具体的に知らせる');
    t.ok(/書き出し/.test(msg1), '先に書き出すことをすすめる');
    await page.evaluate(() => document.getElementById('confirmDialog').close());
    await page.waitForTimeout(400);
    t.eq(await page.evaluate(() => store.projects.length), 2, '取り消せば何も消えない');

    // 2段階とも進めると消える
    await page.click('#btnWipeAll');
    await page.waitForTimeout(500);
    await page.click('#confirmOk');
    await page.waitForTimeout(900);
    t.eq(await page.evaluate(() => document.getElementById('confirmDialog').open), true,
      '書き出したあと、もう一度確認する');
    t.eq(await page.evaluate(() => document.getElementById('confirmOk').textContent), 'すべて削除',
      '2回目は「すべて削除」と明示する');
    page.once('dialog', d => d.accept());
    await page.click('#confirmOk');
    await page.waitForTimeout(900);
    const after = await page.evaluate(() => ({
      projects: store.projects.length,
      works: store.projects.reduce((a, p) => a + p.works.length, 0),
      saved: JSON.parse(localStorage.getItem('caption-koubou-v1') || '{}').projects.length,
      all: !!store.allWorks
    }));
    t.eq([after.projects, after.works, after.saved], [1, 0, 1],
      'すべて消えて、まっさらな展覧会が1つだけになる（保存先も同じ）');
    t.eq(after.all, false, '「まとめて扱う」も初期状態に戻る');

    // 直後なら「戻す」で元に戻せる
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(800);
    t.eq(await page.evaluate(() =>
      store.projects.map(p => p.name + ':' + p.works.length).join(' / ')),
      before, '直後であれば「戻す」で元に戻せる');

    t.noErrors(errors);
    const r2 = t.finish();
    await browser.close();
    return r2;
  } catch (e) {
    console.log('  ✗ EXCEPTION: ' + e.message);
    await browser.close();
    t.ok(false, '例外: ' + e.message);
    return t.finish();
  }
}
module.exports = { run };
if (require.main === module) { run().then(r => process.exit(r.fail ? 1 : 0)); }
