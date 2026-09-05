// bt45【新機能】GN-きんいろサンセリフの追加（書体一覧への登録・未インストール時の警告が代替書体で潰れないこと）
const { openApp, mkRunner, chromium } = require('./helpers');

const FAMS = ['GN-きんいろサンセリフ', 'GN-Kin-iro_SansSerif', 'GN-Kin-iro SansSerif', 'GNきんいろサンセリフ'];

async function run() {
  const t = mkRunner('bt45 GN-きんいろサンセリフ');
  const browser = await chromium.launch();
  try {
    const { page, errors } = await openApp(browser, { waitTab: 'layout' });

    // ---- 登録内容 ----
    const reg = await page.evaluate(() => {
      const f = FONTS.kiniro;
      return f ? { label: f.label, group: f.group, stack: f.stack, gf: !!f.gf, probe: f.probe } : null;
    });
    t.ok(reg, '書体「kiniro」が登録されている');
    t.eq(reg && reg.label, 'GN-きんいろサンセリフ', '書体名が「GN-きんいろサンセリフ」で登録される');
    t.eq(reg && reg.group, 'ゴシック体', 'ゴシック体グループに入る');
    t.eq(reg && reg.gf, false, 'オンライン書体ではない（システムにインストールされた実フォントを参照する）');
    FAMS.forEach(fam => t.ok(reg && reg.stack.includes(fam), `スタックにファミリ名「${fam}」を含む`));
    t.ok(reg && reg.stack.includes('BIZ UDPGothic'), '未インストール端末向けに代替のゴシック体を末尾に持つ');

    // ---- 書体セレクトに選択肢として並ぶ ----
    const inSelect = await page.evaluate(() => {
      const opts = [...document.querySelectorAll('#fontKind option')];
      const o = opts.find(x => x.value === 'kiniro');
      return o ? { text: o.textContent, group: o.parentElement.label } : null;
    });
    t.ok(inSelect, '書体の選択肢に「kiniro」が並ぶ');
    t.eq(inSelect && inSelect.text, 'GN-きんいろサンセリフ', '選択肢の表示名が「GN-きんいろサンセリフ」');
    t.eq(inSelect && inSelect.group, 'ゴシック体', '選択肢が「ゴシック体」グループに入る');

    // ---- 選択するとカードに実際に適用される ----
    await page.evaluate(() => { proj().style.font = 'kiniro'; save(); renderEditor(); });
    await page.waitForTimeout(200);
    const applied = await page.evaluate(() => {
      const el = document.querySelector('#editHolder [data-item="title"]');
      return el ? getComputedStyle(el).fontFamily : null;
    });
    t.ok(applied && applied.includes('GN-'), `作品名にきんいろサンセリフのスタックが適用される（${applied}）`);

    // ---- 未インストール時に警告が出る（代替書体で判定が潰れない）----
    const warn = await page.evaluate(() => {
      updateFontMissingWarn();
      const w = document.getElementById('fontMissingWarn');
      return { shown: w.style.display !== 'none', html: w.innerHTML, unavailable: selectedFontUnavailable('kiniro') };
    });
    t.eq(warn.unavailable, true, 'フォント未インストールの端末では「見つからない」と判定される');
    t.eq(warn.shown, true, '未インストール時に警告が表示される');
    t.ok(warn.html.includes('GN-きんいろサンセリフ'), '警告文にどの書体が見つからないかが出る');

    // 代替に並べたBIZ UDPゴシック等が判定に混ざっていないことの直接確認
    const probeOnly = await page.evaluate(() => {
      const f = FONTS.kiniro;
      return {
        probeHasFallback: (f.probe || []).some(p => /BIZ|Meiryo|sans-serif/i.test(p)),
        stackHasFallback: f.stack.includes('Meiryo')
      };
    });
    t.eq(probeOnly.probeHasFallback, false, '判定用の候補（probe）に代替書体が混ざっていない');
    t.eq(probeOnly.stackHasFallback, true, '一方で描画用のスタックには代替書体が残っている（前提確認）');

    // ---- probeの有無で判定範囲が変わる（同じスタックでも、probeがあれば代替書体を無視する）----
    const mech = await page.evaluate(() => {
      // この端末に確実にある書体を1つ見つけ、それを「代替」として末尾に置く
      const present = ['Arial', 'Helvetica', 'DejaVu Sans', 'Liberation Sans', 'Times New Roman']
        .find(f => isFontAvailable(f));
      if (!present) return { skip: true };
      const stack = `"存在しない架空書体ZZZ","${present}",sans-serif`;
      FONTS.__t1 = { label: 't1', stack, group: 'ゴシック体' };                        // probeなし
      FONTS.__t2 = { label: 't2', stack, group: 'ゴシック体', probe: ['存在しない架空書体ZZZ'] }; // probeあり
      const r = { skip: false, present, noProbe: selectedFontUnavailable('__t1'), withProbe: selectedFontUnavailable('__t2') };
      delete FONTS.__t1; delete FONTS.__t2;
      return r;
    });
    if (mech.skip) {
      t.ok(false, '判定の仕組みを確かめるための既存フォントが見つからなかった');
    } else {
      t.eq(mech.noProbe, false, `probeが無い書体は、代替書体が入っていれば「あり」と判定される（従来どおり／${mech.present}で確認）`);
      t.eq(mech.withProbe, true, 'probeを持つ書体は、代替書体が入っていても本体が無ければ「無し」と判定される');
    }
    const hasProbe = await page.evaluate(() => !!FONTS.mincho.probe);
    t.eq(hasProbe, false, '従来から登録されている書体はprobeを持たない（挙動が変わらない）');

    // ---- オンライン書体は従来どおり警告の対象外 ----
    const online = await page.evaluate(() => selectedFontUnavailable('notoserif'));
    t.eq(online, false, 'オンライン書体は警告の対象外のまま');

    // ---- 候補フォントの利用可否一覧にファミリ名が並ぶ ----
    await page.click('#btnFontCheck');
    await page.waitForTimeout(300);
    const check = await page.evaluate(() => document.getElementById('fontCheckResult').textContent);
    FAMS.forEach(fam => t.ok(check.includes(fam), `フォント診断の一覧に「${fam}」が出る`));

    // ---- 印刷プレビューにも同じ書体指定が渡る ----
    await page.click('nav.tabs button[data-tab="print"]');
    await page.waitForTimeout(600);
    const printed = await page.evaluate(() => {
      const el = document.querySelector('#sheetScroll .cap-card [data-item="title"]');
      return el ? getComputedStyle(el).fontFamily : null;
    });
    t.ok(printed && printed.includes('GN-'), '印刷プレビューにもきんいろサンセリフの指定が渡る');

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
