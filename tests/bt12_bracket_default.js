// bt12【新機能】作品名の《》は新規展覧会で既定OFF。既存データには影響しない
const { openApp, mkRunner, chromium } = require('./helpers');

async function run() {
  const t = mkRunner('bt12 《》の既定値');
  const browser = await chromium.launch();
  try {
    const { page, errors } = await openApp(browser, { waitTab: 'layout' });

    t.eq(await page.isChecked('#stBracket'), false, '新規（サンプル）展覧会では《》が既定OFF');
    t.eq(await page.evaluate(() => proj().style.bracket), false, 'style.bracketの値もfalse');

    // 新規展覧会を作っても既定OFF
    page.once('dialog', d => d.accept('別の展覧会'));
    await page.click('#btnNewProject');
    await page.waitForTimeout(300);
    t.eq(await page.evaluate(() => proj().style.bracket), false, '新規作成した展覧会でも《》は既定OFF');

    // 既存プロジェクト（bracket:trueとして保存されたもの）を模擬的に読み込み、影響を受けないことを確認
    await page.evaluate(() => {
      const legacy = { app: 'caption-koubou', version: 1, projects: [{
        id: 'legacy1', name: '旧データの展覧会',
        style: Object.assign(defaultStyle(), { bracket: true }),
        size: { preset: '140x100', w: 140, h: 100 }, works: []
      }] };
      const list = legacy.projects;
      list.forEach(p => { p.id = 'legacy_' + Date.now(); fixStyle(p); store.projects.push(p); });
      store.currentId = store.projects[store.projects.length - 1].id;
      save(); renderAll();
    });
    await page.waitForTimeout(300);
    t.eq(await page.evaluate(() => proj().style.bracket), true, '既存データでbracket:trueが保存されていた場合はそのまま維持される（新規既定値の変更で上書きされない）');

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
