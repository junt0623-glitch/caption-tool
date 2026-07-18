// tests/run-all.js
// tests/ 配下の bt*.js を番号順にすべて実行し、合否を集計する。
// 使い方: node tests/run-all.js
const fs = require('fs');
const path = require('path');

async function main() {
  const dir = __dirname;
  const files = fs.readdirSync(dir)
    .filter(f => /^(bt|fp)\d+.*\.js$/.test(f))
    .sort();

  console.log(`=== 展覧会キャプション工房 テストスイート実行（${files.length}ファイル） ===\n`);

  let totalPass = 0, totalFail = 0;
  const results = [];
  const failedFiles = [];

  for (const file of files) {
    const mod = require(path.join(dir, file));
    if (typeof mod.run !== 'function') {
      console.log(`スキップ（run関数が無い）: ${file}`);
      continue;
    }
    try {
      const r = await mod.run();
      totalPass += r.pass;
      totalFail += r.fail;
      results.push({ file, ...r });
      if (r.fail > 0) failedFiles.push(file);
    } catch (e) {
      console.log(`  ✗ ${file} で捕捉されない例外: ${e.message}`);
      totalFail += 1;
      failedFiles.push(file);
    }
  }

  console.log('\n=== 集計結果 ===');
  console.log(`合計: ${totalPass} passed, ${totalFail} failed （${files.length}ファイル中 ${failedFiles.length}ファイルに失敗あり）`);
  if (failedFiles.length) {
    console.log('失敗のあったファイル: ' + failedFiles.join(', '));
  }

  process.exit(totalFail ? 1 : 0);
}

main();
