// bt30【新機能】作品リストのCSV書き出し（Excel対応）・表コピー（TSV）・再取り込みの往復
const path = require('path');
const fs = require('fs');
const { mkRunner, chromium } = require('./helpers');

async function run() {
  const t = mkRunner('bt30 CSV書き出し・表コピー');
  const browser = await chromium.launch({});
  try {
    const context = await browser.newContext({ acceptDownloads: true });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push('console error: ' + m.text()); });
    await page.goto('file://' + path.join(__dirname, '..', 'index.html'));
    await page.waitForTimeout(300);

    // カンマ・改行・引用符を含む値でエスケープを確認できるようにしておく
    await page.evaluate(() => {
      proj().works[0].description = '雨の線, 竹林の"濃淡"\n二行目';
      save(); renderList();
    });
    await page.waitForTimeout(300);

    // ---- TSV/CSV生成ロジック ----
    const gen = await page.evaluate(() => {
      const csv = worksToDelimited(',');
      const tsv = worksToDelimited('\t');
      return {
        csvHead: csv.split('\r\n')[0],
        tsvHead: tsv.split('\r\n')[0],
        csv, tsv,
        labels: FIELDS.map(f => f.label),
        works: proj().works.length
      };
    });
    t.eq(gen.csvHead, gen.labels.join(','), 'CSVの見出し行は台帳の全項目ラベル');
    t.eq(gen.tsvHead, gen.labels.join('\t'), 'TSVの見出し行も同じラベル（タブ区切り）');
    t.ok(gen.csv.includes('"雨の線, 竹林の""濃淡""\n二行目"'), 'カンマ・改行・引用符を含むセルが正しくエスケープされる');

    // ---- CSVダウンロード ----
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.click('#btnExportCsv')
    ]);
    const file = await download.path();
    const content = fs.readFileSync(file, 'utf8');
    t.ok(content.charCodeAt(0) === 0xFEFF, 'Excel文字化け防止のUTF-8 BOMが付く');
    t.eq(content.slice(1), gen.csv, 'ダウンロード内容が生成CSVと一致する');

    // ---- 再取り込みの往復（TSVを「スプレッドシートから貼り付け」に入れる） ----
    const orig = await page.evaluate(() => proj().works.map(w => FIELDS.map(f => w[f.key] || '')));
    await page.click('#btnOpenImport');
    await page.waitForTimeout(200);
    await page.fill('#importText', gen.tsv);
    await page.waitForTimeout(300);
    const mapping = await page.evaluate(() => impMap);
    t.eq(mapping, await page.evaluate(() => FIELDS.map(f => f.key)), '書き出した見出しが全列とも自動で正しい取り込み先に判定される');
    page.once('dialog', d => d.accept()); // 「◯件を取り込みました」alert
    await page.click('#btnImportReplace');
    await page.waitForTimeout(200);
    await page.click('#confirmOk'); // 独自の置き換え確認ダイアログ
    await page.waitForTimeout(400);
    const roundtrip = await page.evaluate(() => proj().works.map(w => FIELDS.map(f => w[f.key] || '')));
    t.eq(roundtrip, orig, '書き出し→再取り込みで全項目が元どおり（往復可能）');

    // ---- 表コピー（クリップボード権限が無い環境でも失敗せず完了すること） ----
    let alertMsg = '';
    page.once('dialog', d => { alertMsg = d.message(); d.accept(); });
    await page.click('#btnCopyTsv');
    await page.waitForTimeout(400);
    t.ok(/コピーしました|コピーできませんでした/.test(alertMsg), '表コピーで結果の案内が表示される（例外を出さない）');

    /* ---- すべての展覧会をまとめて扱うときは、全展覧会ぶんを1つの表に書き出す ---- */
    await page.evaluate(() => {
      const a = newProject('展示A');
      ['A1', 'A2'].forEach(n => {
        const w = newWork(); w.no = n; w.title = '作品' + n; w.origin = '美濃'; a.works.push(w);
      });
      store.projects.push(a);
      save(); renderAll();
    });
    await page.waitForTimeout(300);
    const one = await page.evaluate(() => worksToDelimited(',').split('\r\n'));
    t.eq(one.length, 3, 'まとめて扱わないときは、いまの展覧会の作品だけ（見出し＋2件）');
    t.eq(one[0].startsWith('展覧会'), false, 'そのときは展覧会の列を付けない');

    await page.check('#allWorksToggle');
    await page.waitForTimeout(500);
    const all = await page.evaluate(() => worksToDelimited(',').split('\r\n'));
    t.eq(all.length, 5, '全展覧会の作品が1つの表に出る（見出し＋4件）');
    t.eq(all[0].split(',')[0], '展覧会', '先頭に展覧会の列を足す');
    t.eq(all.slice(1).map(r => r.split(',')[0]),
      ['見本の展覧会', '見本の展覧会', '展示A', '展示A'],
      'どの展覧会の作品かが列に入る');
    t.eq(all[3].split(',').slice(1, 3).join('/'), 'A1/', '他の展覧会の作品も中身ごと書き出される');

    // 書き出すファイル名も「すべての展覧会」と分かるようにする
    const nameAll = await page.evaluate(() => {
      let got = null; const keep = window.download;
      window.download = (fn) => { got = fn; };
      document.getElementById('btnExportCsv').click();
      window.download = keep; return got;
    });
    t.ok(/^作品リスト_すべての展覧会_\d{8}\.csv$/.test(nameAll),
      `まとめて書き出したファイル名で分かる（${nameAll}）`);

    // 表コピーも全展覧会ぶん
    page.once('dialog', d => { alertMsg = d.message(); d.accept(); });
    await page.click('#btnCopyTsv');
    await page.waitForTimeout(400);
    t.ok(/4件/.test(alertMsg), `表コピーも全展覧会ぶんの件数になる（${alertMsg.split('\n')[0]}）`);

    // 書き出した表をそのまま貼り付け直しても、展覧会の列は取り込み対象にしない
    const back = await page.evaluate(() => worksToDelimited('\t'));
    await page.click('#btnOpenImport');
    await page.waitForTimeout(300);
    await page.fill('#importText', back);
    await page.waitForTimeout(600);
    const map = await page.evaluate(() => [...document.querySelectorAll('#mapArea select[data-col]')]
      .slice(0, 2).map(s => s.selectedOptions[0].textContent));
    t.eq(map, ['— 取り込まない —', '番号'],
      '書き出した表を戻すとき、展覧会の列は取り込まない扱いになる');
    await page.evaluate(() => document.getElementById('importDialog').close());
    await page.waitForTimeout(300);
    await page.uncheck('#allWorksToggle');
    await page.waitForTimeout(400);
    await page.evaluate(() => {
      store.projects = store.projects.filter(p => p.name !== '展示A');
      save(); renderAll();
    });
    await page.waitForTimeout(300);

    // ---- 作品0件のとき ----
    await page.evaluate(() => { proj().works = []; save(); renderList(); });
    await page.waitForTimeout(300);
    page.once('dialog', d => { alertMsg = d.message(); d.accept(); });
    await page.click('#btnExportCsv');
    await page.waitForTimeout(200);
    t.ok(alertMsg.includes('書き出せる作品がありません'), '0件のときは書き出さず案内する');

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
