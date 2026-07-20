// bt33【新機能】システムフォント追加：UDデジタル教科書体 太字（NP-B）・MS UI Gothic
// これらはWindows同梱の商用フォント（再配布不可・Google Fonts非提供）のため、
// アプリ既存の方式どおり「端末に入っていれば使う」CSS名参照として登録される。
const path = require('path');
const { openApp, mkRunner, chromium } = require('./helpers');

async function run() {
  const t = mkRunner('bt33 追加システムフォント');
  const browser = await chromium.launch({});
  try {
    const { page, errors } = await openApp(browser, { waitTab: 'layout' });

    // ---- FONTS登録簿に2書体が正しく登録されている ----
    const reg = await page.evaluate(() => ({
      npb: FONTS.udkyokashob, msui: FONTS.msuigothic,
      // 既存NP-Rが太字と別に残っていること
      npr: FONTS.udkyokasho
    }));
    t.ok(reg.npb && reg.npb.group === 'UD・視認性重視', 'UDデジタル教科書体 太字(NP-B)がUD・視認性重視グループに登録される');
    t.ok(reg.npb && reg.npb.stack.includes('UD デジタル教科書体 NP-B'), 'NP-Bのスタックに「UD デジタル教科書体 NP-B」ファミリ名が含まれる');
    // Windowsの正式ファミリ名は「UD デジタル 教科書体 NP-B」（デジタルと教科書体の間にもスペース）。
    // この名前が無いと実フォントに一致せず代替書体で表示されてしまう（PowerPointと見た目が変わる不具合の原因）
    t.ok(reg.npb && reg.npb.stack.includes('UD デジタル 教科書体 NP-B'), 'NP-BのスタックにWindows正式名「UD デジタル 教科書体 NP-B」（スペース入り）が先頭側に含まれる');
    t.ok(reg.npb && reg.npb.stack.indexOf('UD デジタル 教科書体 NP-B') < reg.npb.stack.indexOf('BIZ UDPGothic'), '正式名が代替書体より前に並ぶ');
    t.ok(reg.npr && reg.npr.stack.includes('UD デジタル 教科書体 NP-R'), 'NP-R（標準）のスタックにもWindows正式名（スペース入り）が含まれる');
    t.ok(reg.npb && reg.npb.stack.includes('UD Digi Kyokasho NP-B'), 'NP-Bのスタックに英語ファミリ名も含まれる');
    t.eq(reg.npb && reg.npb.weight, 700, 'NP-Bは太字（weight:700）として登録される');
    t.ok(reg.npb && !reg.npb.gf, 'NP-Bはオンライン書体ではない（ダウンロードせずシステムフォント参照）');
    t.ok(reg.msui && reg.msui.group === 'ゴシック体', 'MS UI Gothicがゴシック体グループに登録される');
    t.ok(reg.msui && reg.msui.stack.includes('MS UI Gothic'), 'MS UI Gothicのスタックに「MS UI Gothic」ファミリ名が含まれる');
    t.ok(reg.msui && !reg.msui.gf, 'MS UI Gothicはオンライン書体ではない（システムフォント参照）');
    t.ok(reg.npr && reg.npr.stack.includes('UD デジタル教科書体 NP-R'), '既存のNP-R（標準）も残っている');

    // ---- 書体セレクトに両方が選択肢として並ぶ ----
    const inSelect = await page.evaluate(() => {
      const opts = [...document.querySelectorAll('#fontKind option')].map(o => o.value);
      return { npb: opts.includes('udkyokashob'), msui: opts.includes('msuigothic') };
    });
    t.eq(inSelect.npb, true, '全体の書体セレクトにNP-Bが並ぶ');
    t.eq(inSelect.msui, true, '全体の書体セレクトにMS UI Gothicが並ぶ');

    // ---- NP-Bを選ぶと、プレビューの項目に太字(700)と該当フォントファミリが適用される ----
    await page.selectOption('#fontKind', 'udkyokashob');
    await page.waitForTimeout(200);
    const npbApplied = await page.evaluate(() => {
      const el = document.querySelector('#editHolder .cap-item');
      const cs = getComputedStyle(el);
      return { weight: cs.fontWeight, family: cs.fontFamily };
    });
    t.eq(String(npbApplied.weight), '700', 'NP-B選択時、項目が太字(font-weight:700)で描画される');
    t.ok(npbApplied.family.includes('UD デジタル教科書体 NP-B'), 'NP-B選択時、項目のfont-familyにNP-Bが先頭で入る');

    // ---- MS UI Gothicを選ぶと標準の太さ（400相当）で該当フォントが適用される ----
    await page.selectOption('#fontKind', 'msuigothic');
    await page.waitForTimeout(200);
    const msuiApplied = await page.evaluate(() => {
      const el = document.querySelector('#editHolder .cap-item');
      const cs = getComputedStyle(el);
      return { weight: cs.fontWeight, family: cs.fontFamily };
    });
    t.ok(msuiApplied.family.includes('MS UI Gothic'), 'MS UI Gothic選択時、項目のfont-familyにMS UI Gothicが入る');
    t.ok(String(msuiApplied.weight) === '400' || String(msuiApplied.weight) === 'normal',
      'MS UI Gothicは太字指定なし（通常の太さ）で描画される');

    // ---- 標準書体に戻すと太字指定が残らない（NP-Bのweightが引きずられない） ----
    await page.selectOption('#fontKind', 'gothic');
    await page.waitForTimeout(200);
    const back = await page.evaluate(() => String(getComputedStyle(document.querySelector('#editHolder .cap-item')).fontWeight));
    t.ok(back === '400' || back === 'normal', '別書体に戻すと太字指定は引きずられない');

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
