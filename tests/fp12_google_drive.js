// tests/fp12_google_drive.js
// Googleドライブからの直接読み込みのテスト。
//
// 本物のGoogleに接続するわけにはいかないので、アプリが読み込む2つのスクリプト
// (accounts.google.com / apis.google.com)をルーティングで差し替え、
// 認証とファイル選択画面のふりをする偽物を返して、その先の
// 「選んだファイルをDrive APIから取ってきて図面/作品リストに反映する」流れを検証する。
const fs = require('fs');
const path = require('path');
const { chromium, mkRunner } = require('./helpers');

const FP_URL = 'file://' + path.join(__dirname, '..', 'floorplan', 'index.html');
const PRESET_CHROMIUM = '/opt/pw-browsers/chromium';
const launchOpts = fs.existsSync(PRESET_CHROMIUM) ? { executablePath: PRESET_CHROMIUM } : {};

const PLAN = {
  meta: { title: 'ドライブの図面', venue: '', author: '', date: '2026-01-01' },
  sheet: { rot: 0 }, scalePct: 100,
  rooms: { current: '', list: [] }, workList: [], images: [], walls: [],
  objects: [
    { id: 1, type: 'fixture', stockKey: 'p_153', x: 12000, y: 9000, rot: 0, w: 1530, h: 900, label: '1.53×0.9' },
    { id: 2, type: 'case', stockKey: 'c_beta', x: 20000, y: 9000, rot: 0, w: 2400, h: 1200, label: 'β' },
  ],
};
const WORKLIST = '番号,作品名,作家名\n1001,壺,無名\n1002,鏡,無名\n';

// 偽のGoogle SDK。window.__drivePicked に「利用者が選んだファイル」を入れておくと、
// ファイル選択画面がそれを選んで返したことにする(nullなら閉じられたことにする)。
const fakeGoogleJs = `
window.__drive = {authCalls: 0, pickerOpened: 0, scopes: [], token: 'fake-token-1'};
window.google = {
  accounts: {oauth2: {initTokenClient(cfg){
    window.__drive.scopes.push(cfg.scope);
    window.__drive.clientId = cfg.client_id;
    return {requestAccessToken(){
      window.__drive.authCalls++;
      if (window.__drive.denyAuth) cfg.callback({error: 'access_denied'});
      else cfg.callback({access_token: window.__drive.token});
    }};
  }}},
  picker: {
    ViewId: {DOCS: 'docs'},
    Action: {PICKED: 'picked', CANCEL: 'cancel'},
    DocsView: class { constructor(){ this.mime = ''; }
      setIncludeFolders(){ return this; }
      setMimeTypes(m){ window.__drive.mimeTypes = m; return this; } },
    PickerBuilder: class {
      setOAuthToken(t){ window.__drive.usedToken = t; return this; }
      setDeveloperKey(k){ window.__drive.usedKey = k; return this; }
      setLocale(l){ window.__drive.locale = l; return this; }
      addView(){ return this; }
      setCallback(cb){ this.cb = cb; return this; }
      build(){ return this; }
      setVisible(){
        window.__drive.pickerOpened++;
        const p = window.__drivePicked;
        setTimeout(()=> this.cb(p ? {action:'picked', docs:[p]} : {action:'cancel'}), 0);
      }
    },
  },
};
window.gapi = {load(_, opts){ (opts.callback || opts)(); }};
`;

async function setup(page, seenAuth) {
  // Googleの2本のスクリプトを偽物に差し替える
  await page.route('https://accounts.google.com/gsi/client', r =>
    r.fulfill({ contentType: 'application/javascript', body: fakeGoogleJs }));
  await page.route('https://apis.google.com/js/api.js', r =>
    r.fulfill({ contentType: 'application/javascript', body: '' }));
  // Drive APIのファイル取得。Authorizationヘッダも記録して検証する
  await page.route(/googleapis\.com\/drive\/v3\/files\//, (route, req) => {
    const id = decodeURIComponent(req.url().split('/files/')[1].split('?')[0]);
    seenAuth.push(req.headers()['authorization'] || '');
    const body = id === 'plan-1' ? JSON.stringify(PLAN)
      : id === 'list-1' ? WORKLIST : '';
    if (!body) return route.fulfill({ status: 404, body: 'not found' });
    route.fulfill({
      status: 200, contentType: 'text/plain',
      body,
    });
  });
}

// 接続設定を入れて「保存してドライブを開く」を押す
async function configure(page, clientId = 'cid-123.apps.googleusercontent.com', apiKey = 'AIzaTEST') {
  await page.fill('#driveClientId', clientId);
  await page.fill('#driveApiKey', apiKey);
  await page.click('#driveSave');
}

async function run() {
  const t = mkRunner('fp12 Googleドライブからの読み込み');
  const browser = await chromium.launch(launchOpts);
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console error: ' + m.text()); });
  const dialogs = [];
  page.on('dialog', d => { dialogs.push(d.message()); d.dismiss(); });
  const seenAuth = [];
  await setup(page, seenAuth);
  await page.goto(FP_URL);
  await page.waitForTimeout(300);

  // --- 未設定のうちは接続設定の画面が出る ---
  t.ok(await page.locator('#driveBtn').isVisible(), 'ヘッダーに「☁ ドライブ」ボタンがある');
  t.ok(await page.locator('#driveModal').isHidden(), '最初は接続設定は閉じている');
  await page.click('#driveBtn');
  await page.waitForTimeout(100);
  t.ok(await page.locator('#driveModal').isVisible(),
    '未設定のまま押すと接続設定の画面が開く');
  t.ok((await page.$eval('#driveBody', e => e.textContent)).includes('Google Drive API'),
    '設定に必要な手順が画面に書かれている');

  // 片方だけでは保存できない
  await page.fill('#driveClientId', 'cid-only');
  await page.click('#driveSave');
  await page.waitForTimeout(100);
  t.ok(await page.locator('#driveModal').isVisible(), 'APIキーが空なら設定画面は閉じない');
  t.ok((await page.$eval('#driveNote', e => e.textContent)).includes('両方'),
    '足りない項目があることが画面に出る');

  // --- 図面データ(JSON)を選ぶと図面が置き換わる ---
  await page.evaluate(() => { window.__drivePicked = { id: 'plan-1', name: '展示室1-A.json', mimeType: 'application/json' }; });
  await configure(page);
  await page.waitForTimeout(500);

  t.eq(await page.locator('g.obj').count(), 2, 'ドライブで選んだ図面のオブジェクトが読み込まれる');
  t.eq(await page.$eval('#hint', e => e.textContent), '展示室1-A.json を読み込みました',
    '読み込んだファイル名が画面に出る');
  const drive = await page.evaluate(() => window.__drive);
  t.eq(drive.scopes[0], 'https://www.googleapis.com/auth/drive.file',
    '権限は「このアプリで選んだファイルだけ」(drive.file)に限定されている');
  t.eq(drive.clientId, 'cid-123.apps.googleusercontent.com', '入力したクライアントIDが使われる');
  t.eq(drive.usedKey, 'AIzaTEST', '入力したAPIキーが使われる');
  t.eq(drive.usedToken, 'fake-token-1', '取得したトークンでファイル選択画面が開く');
  t.eq(drive.locale, 'ja', 'ファイル選択画面は日本語で開く');
  t.eq(seenAuth[0], 'Bearer fake-token-1',
    'ファイルの取得はトークン付き(Bearer)で行う');
  t.ok((drive.mimeTypes || '').includes('application/json') && (drive.mimeTypes || '').includes('text/csv'),
    '図面データ(JSON)と作品リスト(CSV)が選べる');

  t.eq(await page.evaluate(() => state.meta.title), 'ドライブの図面',
    '図面の中身(展覧会名など)がまるごと置き換わっている');
  t.eq(await page.evaluate(() => stockRemain('c_beta')), 2,
    '読み込んだ図面の配置ぶんが在庫の残数に反映される(β 3台中1台使用)');

  // --- 作品リスト(CSV)を選ぶと作品リストとして読み込まれる ---
  await page.evaluate(() => {
    window.__drivePicked = { id: 'list-1', name: '作品リスト.csv', mimeType: 'text/csv' };
  });
  await page.click('#driveBtn');
  await page.waitForTimeout(400);
  t.eq(await page.$eval('#hint', e => e.textContent), '作品リスト 2件を読み込みました',
    'CSVを選ぶと作品リストとして取り込まれる');
  t.eq(await page.evaluate(() => state.workList.length), 2, '作品リストが2件入る');

  // 2回目は同意画面を出し直さない(トークンを使い回す)
  t.eq((await page.evaluate(() => window.__drive.authCalls)), 2,
    '2回目もトークン取得は呼ぶが、prompt無しで済ませている');

  // --- ファイル選択を閉じたときは何も変わらない ---
  const before = await page.evaluate(() => state.workList.length);
  await page.evaluate(() => { window.__drivePicked = null; });
  await page.click('#driveBtn');
  await page.waitForTimeout(400);
  t.eq(await page.$eval('#hint', e => e.textContent), 'ドライブからの読み込みを中止しました',
    '選ばずに閉じたときは中止と表示される');
  t.eq(await page.evaluate(() => state.workList.length), before, '中止しても図面は変わらない');

  // --- 許可が下りなかったときは、その場で設定を開き直せる ---
  await page.evaluate(() => { window.__drive.denyAuth = true; });
  await page.click('#driveBtn');
  await page.waitForTimeout(400);
  t.ok(dialogs.some(m => m.includes('失敗') && m.includes('接続設定')),
    '失敗すると理由と「接続設定を開き直すか」を尋ねる');

  // --- 設定はブラウザに保存され、次に開いたときも残る ---
  await page.reload();
  await page.waitForTimeout(300);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('floorplan.driveConfig')));
  t.eq(saved.clientId, 'cid-123.apps.googleusercontent.com', '設定はブラウザに保存される');
  t.ok(!saved.token && !saved.accessToken, 'アクセストークンは保存しない');

  // Shiftを押しながらだと設定済みでも設定画面が開く
  await page.click('#driveBtn', { modifiers: ['Shift'] });
  await page.waitForTimeout(150);
  t.ok(await page.locator('#driveModal').isVisible(), 'Shift+クリックで接続設定を開き直せる');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  t.ok(await page.locator('#driveModal').isHidden(), 'Escapeで接続設定を閉じられる');

  t.noErrors(errors);
  await context.close();
  await browser.close();
  return t.finish();
}

module.exports = { run };
if (require.main === module) run();
