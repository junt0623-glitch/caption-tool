// bt25【不具合修正】ルビ調整のプレビュー反映／Googleフォント読み込みの優先順位／選択可能フォントの拡充
const { openApp, mkRunner, chromium } = require('./helpers');

async function run() {
  const t = mkRunner('bt25 ルビ調整・Googleフォント・フォント選択肢');
  const browser = await chromium.launch();
  try {
    const { page, errors } = await openApp(browser, { waitTab: 'layout' });

    // ---- ルビ調整がマスターの初期プレビューに反映されるか ----
    const rubyDefault = await page.evaluate(() => {
      const rt = document.querySelector('#editHolder rt');
      return { hasRuby: !!document.querySelector('#editHolder ruby'), rtText: rt ? rt.textContent : null };
    });
    t.eq(rubyDefault.hasRuby, true, 'マスターの初期プレビューに、調整結果を確認できるルビのサンプルが表示されている');
    t.eq(rubyDefault.rtText, 'さくひんめい', 'ルビのサンプルテキストが表示されている');

    await page.fill('#rubySizePt', '24');
    await page.dispatchEvent('#rubySizePt', 'input');
    await page.waitForTimeout(150);
    const sizeAfter = await page.evaluate(() => {
      const rt = document.querySelector('#editHolder rt');
      return rt ? getComputedStyle(rt).fontSize : null;
    });
    t.eq(sizeAfter, '32px', 'ルビのサイズを24ptに設定するとプレビューのrt要素のfont-sizeが32pxになる（24pt→px換算）');

    const offsetBefore = await page.evaluate(() => getComputedStyle(document.querySelector('#editHolder rt')).marginBlockEnd);
    await page.fill('#rubySizePt', '');
    await page.dispatchEvent('#rubySizePt', 'input');
    const oRubyOffset = page.locator('#rubyOffset');
    await oRubyOffset.fill('8');
    await oRubyOffset.dispatchEvent('input');
    await page.waitForTimeout(150);
    const offsetAfter = await page.evaluate(() => getComputedStyle(document.querySelector('#editHolder rt')).marginBlockEnd);
    t.ok(offsetAfter !== offsetBefore, 'ルビのオフセットを変更するとプレビューのrt要素のmargin-block-endが変わる');

    // オフセットの最小値・最大値で、実際に画面上のルビと本文の間隔（項目の高さ）が変わることを確認
    await oRubyOffset.fill('-2');
    await oRubyOffset.dispatchEvent('input');
    await page.waitForTimeout(150);
    const heightMin = await page.evaluate(() => document.querySelector('#editHolder [data-item="title"]').getBoundingClientRect().height);
    await oRubyOffset.fill('10');
    await oRubyOffset.dispatchEvent('input');
    await page.waitForTimeout(150);
    const heightMax = await page.evaluate(() => document.querySelector('#editHolder [data-item="title"]').getBoundingClientRect().height);
    t.ok(heightMax > heightMin + 5, `オフセットを最小(-2pt)から最大(10pt)にすると、実際に画面上のルビと本文の間隔（項目の高さ）が広がる（${heightMin.toFixed(1)}px → ${heightMax.toFixed(1)}px）`);

    await page.selectOption('#rubyFont', 'gothic');
    await page.waitForTimeout(150);
    const fontAfter = await page.evaluate(() => getComputedStyle(document.querySelector('#editHolder rt')).fontFamily);
    t.ok(fontAfter.includes('BIZ UDPGothic') || fontAfter.includes('Gothic'), 'ルビのフォントを変更するとプレビューのrt要素のfont-familyが変わる');

    // ---- Googleフォントのオンライン読み込みトグル ----
    const mBefore = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--mincho').trim());
    t.ok(!mBefore.startsWith('"Noto Serif JP"'), 'トグルOFFの間は--minchoの最優先はNotoではない（フォールバックの一つとしては含まれてよい）');
    await page.click('#gfontToggle');
    await page.waitForTimeout(150);
    const mAfter = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--mincho').trim());
    t.ok(mAfter.startsWith('"Noto Serif JP"'), 'トグルONにすると--minchoの最優先がNoto Serif JPになる（システムフォントに隠れず反映される）');
    const linkExists = await page.evaluate(() => !!document.getElementById('gfontsLink'));
    t.eq(linkExists, true, 'ONにするとGoogle Fontsの<link>タグが追加される');
    await page.click('#gfontToggle');
    await page.waitForTimeout(150);
    const linkRemoved = await page.evaluate(() => !document.getElementById('gfontsLink'));
    t.eq(linkRemoved, true, 'OFFに戻すと<link>タグが削除される');
    const gfontsOnRemoved = await page.evaluate(() => !document.documentElement.classList.contains('gfonts-on'));
    t.eq(gfontsOnRemoved, true, 'OFFに戻すとgfonts-onクラスも外れる');

    // ---- フォント選択肢の拡充・グループ順 ----
    const fontInfo = await page.evaluate(() => {
      const sel = document.getElementById('fontKind');
      const groups = [...sel.querySelectorAll('optgroup')].map(g => g.label);
      return { totalOptions: sel.options.length, groups };
    });
    t.ok(fontInfo.totalOptions >= 20, `選択可能なフォントが20種類以上に拡充されている（実際: ${fontInfo.totalOptions}種類）`);
    t.eq(fontInfo.groups[0], 'UD・視認性重視', 'UD・視認性重視グループが先頭に表示される');
    t.ok(fontInfo.groups.includes('明朝体') && fontInfo.groups.includes('ゴシック体') && fontInfo.groups.includes('英字'), '明朝体・ゴシック体・英字のグループも存在する');

    const ipFontInfo = await page.evaluate(() => {
      const sel = document.getElementById('ipFont');
      return { firstOption: sel.options[0] ? sel.options[0].textContent : null, hasInherit: sel.options[0] ? sel.options[0].value === 'inherit' : false };
    });
    t.eq(ipFontInfo.hasInherit, true, '項目ごとのフォント選択でも「全体に従う」の継承オプションが維持されている');

    t.noErrors(errors.filter(e => !e.includes('fonts.googleapis.com') && !e.includes('403')), 'コンソール/ページエラーが無いこと（Google Fonts CDNへの実ネットワークアクセスは検証環境の制約により除外）');
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
