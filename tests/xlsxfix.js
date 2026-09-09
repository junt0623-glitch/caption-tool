// テスト用に .xlsx（ZIP+XML）を組み立てるヘルパー。
// 実物のExcelブックと同じ構造（sharedStrings・styles・複数シート・rId参照）を作り、
// アプリ側のExcel読み取りが本物に対して正しく動くかを確かめる。
const zlib = require('zlib');

function zipEntry(name, text) {
  const data = Buffer.from(text, 'utf8');
  return { name: Buffer.from(name, 'utf8'), data, deflated: zlib.deflateRawSync(data), crc: zlib.crc32(data) };
}
/** {ファイル名: 中身} から .xlsx のバイト列を作る */
function makeZip(files) {
  const entries = Object.entries(files).map(([n, t]) => zipEntry(n, t));
  const locals = [], central = [];
  let offset = 0;
  for (const e of entries) {
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0, 6);
    lh.writeUInt16LE(8, 8);                       // deflate
    lh.writeUInt32LE(e.crc, 14);
    lh.writeUInt32LE(e.deflated.length, 18); lh.writeUInt32LE(e.data.length, 22);
    lh.writeUInt16LE(e.name.length, 26); lh.writeUInt16LE(0, 28);
    locals.push(lh, e.name, e.deflated);

    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(8, 10);
    ch.writeUInt32LE(e.crc, 16);
    ch.writeUInt32LE(e.deflated.length, 20); ch.writeUInt32LE(e.data.length, 24);
    ch.writeUInt16LE(e.name.length, 28);
    ch.writeUInt32LE(offset, 42);
    central.push(ch, e.name);
    offset += 30 + e.name.length + e.deflated.length;
  }
  const cd = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8); eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cd.length, 12); eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, eocd]);
}

const X = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

/**
 * sheets: [{name, rows}] rows は [{v, t}] の配列の配列
 *   t 未指定=共有文字列 / 'n'=数値 / 'd'=日付（連番＋日付書式） / 'inline'=インライン文字列 / 'b'=真偽
 */
function buildXlsx(sheets) {
  const shared = [];
  const sidx = v => { let i = shared.indexOf(v); if (i < 0) { shared.push(v); i = shared.length - 1; } return i; };
  const colName = n => { let s = ''; n++; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = (n - m - 1) / 26; } return s; };

  const sheetXml = sheets.map(sh => {
    const rows = sh.rows.map((row, r) => {
      const cells = row.map((cell, c) => {
        if (cell == null || cell === '') return '';
        const ref = colName(c) + (r + 1);
        const t = (typeof cell === 'object' && cell.t) || 's';
        const v = (typeof cell === 'object') ? cell.v : cell;
        if (t === 'n') return `<c r="${ref}"><v>${v}</v></c>`;
        if (t === 'd') return `<c r="${ref}" s="1"><v>${v}</v></c>`;   // s="1" が日付書式
        if (t === 'b') return `<c r="${ref}" t="b"><v>${v ? 1 : 0}</v></c>`;
        if (t === 'inline') return `<c r="${ref}" t="inlineStr"><is><t>${X(v)}</t></is></c>`;
        return `<c r="${ref}" t="s"><v>${sidx(String(v))}</v></c>`;
      }).join('');
      return `<row r="${r + 1}">${cells}</row>`;
    }).join('');
    return `<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows}</sheetData></worksheet>`;
  });

  const files = {
    '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>`,
    '_rels/.rels': `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    'xl/workbook.xml': `<?xml version="1.0" encoding="UTF-8"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${
      sheets.map((sh, i) => `<sheet name="${X(sh.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${
      sheets.map((sh, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}</Relationships>`,
    // s="0" は既定、s="1" は yyyy/mm/dd（組み込み書式14）
    'xl/styles.xml': `<?xml version="1.0" encoding="UTF-8"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="14" applyNumberFormat="1"/></cellXfs></styleSheet>`
  };
  sheets.forEach((sh, i) => { files[`xl/worksheets/sheet${i + 1}.xml`] = sheetXml[i]; });
  files['xl/sharedStrings.xml'] = `<?xml version="1.0" encoding="UTF-8"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${shared.length}" uniqueCount="${shared.length}">${
    shared.map(v => `<si><t xml:space="preserve">${X(v)}</t></si>`).join('')}</sst>`;
  return makeZip(files);
}

module.exports = { buildXlsx, makeZip };
