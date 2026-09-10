// bt50【新機能】JSONをGoogleドライブから直接読み込む（接続設定・ファイル選択・取り込み・失敗時の案内）
const { openApp, mkRunner, chromium } = require('./helpers');

async function run() {
  const t = mkRunner('bt50 Googleドライブからの読み込み');
  const browser = await chromium.launch();
  try {
    const { page, errors } = await openApp(browser, { waitTab: 'daicho' });

    // ---- ボタンと設定画面がある ----
    const ui = await page.evaluate(() => {
      const b = document.getElementById('btnDriveOpen');
      return {
        btn: !!b, label: b && b.textContent, title: b && b.title,
        dlg: !!document.getElementById('driveDialog'),
        fields: ['driveClientId', 'driveApiKey', 'driveOrigin', 'driveSave'].every(id => !!document.getElementById(id)),
        scope: DRIVE_SCOPE
      };
    });
    t.eq(ui.btn, true, '「ドライブから読み込み」ボタンがある');
    t.ok(ui.label.includes('ドライブ'), `ボタン名にドライブと入る（${ui.label}）`);
    t.ok(ui.title.includes('Shift'), 'Shift＋クリックで接続設定を開ける旨が説明に入る');
    t.eq(ui.dlg, true, '接続設定のダイアログがある');
    t.eq(ui.fields, true, 'クライアントID・APIキー・生成元・保存ボタンがそろっている');
    t.eq(ui.scope, 'https://www.googleapis.com/auth/drive.file',
      '権限は drive.file（選んだファイルだけ）に限る');

    // ---- 未設定でボタンを押すと、まず接続設定が開く ----
    await page.click('#btnDriveOpen');
    await page.waitForTimeout(300);
    const opened = await page.evaluate(() => ({
      open: document.getElementById('driveDialog').open,
      origin: document.getElementById('driveOrigin').textContent,
      note: document.getElementById('driveNote').textContent
    }));
    t.eq(opened.open, true, '未設定のときは接続設定が先に開く');
    t.ok(opened.origin.length > 0, `登録用の生成元が表示される（${opened.origin}）`);
    t.ok(opened.note.includes('https'), 'file:// で開いている場合はGitHub Pagesで開くよう案内する');

    // ---- 片方だけの入力では保存しない ----
    const partial = await page.evaluate(() => {
      document.getElementById('driveClientId').value = 'x.apps.googleusercontent.com';
      document.getElementById('driveApiKey').value = '';
      document.getElementById('driveSave').click();
      return {
        note: document.getElementById('driveNote').textContent,
        stored: localStorage.getItem('caption-koubou.driveConfig'),
        stillOpen: document.getElementById('driveDialog').open
      };
    });
    t.ok(partial.note.includes('両方'), '片方だけだと入力を促す');
    t.eq(partial.stored, null, '片方だけのときは保存しない');
    t.eq(partial.stillOpen, true, '設定画面は開いたまま');

    // ---- 設定はこのブラウザの中だけに保存される ----
    await page.evaluate(() => { document.getElementById('driveDialog').close(); });
    const saved = await page.evaluate(() => {
      localStorage.setItem('caption-koubou.driveConfig', JSON.stringify({ clientId: 'cid', apiKey: 'key' }));
      return driveCfg();
    });
    t.eq(saved, { clientId: 'cid', apiKey: 'key' }, '保存した設定が読み出される');

    // ---- 図面アプリ側の設定も引き継げる（同じ端末で二度入力させない）----
    const inherited = await page.evaluate(() => {
      localStorage.removeItem('caption-koubou.driveConfig');
      localStorage.setItem('floorplan.driveConfig', JSON.stringify({ clientId: 'fp', apiKey: 'fpkey' }));
      return driveCfg();
    });
    t.eq(inherited, { clientId: 'fp', apiKey: 'fpkey' }, '図面アプリで設定済みならその値を使う');
    const priority = await page.evaluate(() => {
      localStorage.setItem('caption-koubou.driveConfig', JSON.stringify({ clientId: 'own', apiKey: 'ownkey' }));
      return driveCfg();
    });
    t.eq(priority, { clientId: 'own', apiKey: 'ownkey' }, 'このアプリ側の設定があればそちらが優先される');

    // ---- 取り込み処理はファイル選択と共通で、ドライブから来たJSONも同じ経路で入る ----
    const applied = await page.evaluate(() => {
      const before = store.projects.length;
      const json = JSON.stringify({
        projects: [{
          name: 'ドライブから読んだ展覧会',
          size: { preset: '140x100', w: 140, h: 100 },
          works: [{ no: '1', title: '青花双耳瓶', origin: '景徳鎮' }]
        }]
      });
      const n = applyProjectsJson(json);
      const p = proj();
      return { n, added: store.projects.length - before, name: p.name, work: p.works[0] && p.works[0].title,
               hasStyle: !!(p.style && p.style.layout && p.style.layout.title) };
    });
    t.eq(applied.n, 1, '読み込んだ展覧会の件数が返る');
    t.eq(applied.added, 1, '既存データに追加される（置き換えない）');
    t.eq(applied.name, 'ドライブから読んだ展覧会', '読み込んだ展覧会が現在の展覧会になる');
    t.eq(applied.work, '青花双耳瓶', '作品も一緒に入る');
    t.eq(applied.hasStyle, true, '体裁が既定値で補われる（古い書き出しでも開ける）');

    // ---- 中身が違うJSONははっきり弾く ----
    const bad = await page.evaluate(() => {
      try { applyProjectsJson('{"foo":1}'); return 'なぜか成功した'; }
      catch (e) { return e.message; }
    });
    t.ok(bad.includes('展覧会'), `展覧会のデータでなければ読み込まない（${bad}）`);

    // ---- 書き出し→ドライブ経由での読み戻しが成り立つ ----
    const roundTrip = await page.evaluate(() => {
      const before = proj().works.length;
      const json = JSON.stringify(store);          // 書き出しと同じ形
      const n = applyProjectsJson(json);
      return { n, before, worksNow: proj().works.length };
    });
    t.ok(roundTrip.n >= 1, '書き出したJSONをそのまま読み戻せる');
    t.eq(roundTrip.worksNow, roundTrip.before, '読み戻した展覧会の作品数が元と一致する');

    // ---- 接続できないときは設定を開き直せる案内を出す（落ちない）----
    await page.evaluate(() => {
      // Googleのスクリプトを読みにいけない状況を作る
      window.loadScriptOnce = () => Promise.reject(new Error('読み込めませんでした: テスト'));
    });
    const failed = await page.evaluate(async () => {
      const p = openFromDrive();
      await new Promise(r => setTimeout(r, 300));
      const dlg = document.getElementById('confirmDialog');
      const shown = dlg.open, msg = document.getElementById('confirmMsg').textContent;
      document.getElementById('confirmOk').click();   // 「設定を開く」を押す
      await p;
      return { shown, msg, settingsOpen: document.getElementById('driveDialog').open };
    });
    t.eq(failed.shown, true, '接続に失敗したら案内が出る');
    t.ok(failed.msg.includes('失敗'), `何が起きたかを伝える（${failed.msg.split('\n')[0]}）`);
    t.eq(failed.settingsOpen, true, 'その場で接続設定を開き直せる');
    const btnBack = await page.evaluate(() => {
      const b = document.getElementById('btnDriveOpen');
      return { disabled: b.disabled, label: b.textContent };
    });
    t.eq(btnBack.disabled, false, '失敗してもボタンは押せる状態に戻る');
    t.ok(btnBack.label.includes('ドライブ'), 'ボタンの表示も元に戻る');

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
