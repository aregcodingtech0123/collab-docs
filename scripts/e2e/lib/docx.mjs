// Builds tiny but REAL .docx files (a .docx is a ZIP of XML parts) with a minimal store-only
// ZIP writer, so tests and e2e fixtures need no binary files and no extra dependency.
// Used by tests/helpers/docx.ts (unit tests) and by the e2e suites.

// ---- minimal ZIP writer (method 0 = stored) ---------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

/** @param {Uint8Array} data */
function crc32(data) {
  let c = 0xffffffff;
  for (const byte of data) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * @param {Record<string, string | Uint8Array>} entries file name -> contents
 * @returns {Buffer}
 */
export function zip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const [name, value] of Object.entries(entries)) {
    const nameBuf = Buffer.from(name, "utf8");
    const data = typeof value === "string" ? Buffer.from(value, "utf8") : Buffer.from(value);
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18); // compressed size
    local.writeUInt32LE(data.length, 22); // uncompressed size
    local.writeUInt16LE(nameBuf.length, 26);
    locals.push(local, nameBuf, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6); // version needed
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);

    offset += local.length + nameBuf.length + data.length;
  }

  const centralBuf = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(entries).length, 8);
  end.writeUInt16LE(Object.keys(entries).length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBuf, end]);
}

// ---- WordprocessingML helpers ------------------------------------------------

/** @param {string} s */
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * A text run.
 * @param {string} text
 * @param {{ bold?: boolean, italic?: boolean, underline?: boolean }} [o]
 */
export function run(text, o = {}) {
  const props = `${o.bold ? "<w:b/>" : ""}${o.italic ? "<w:i/>" : ""}${o.underline ? '<w:u w:val="single"/>' : ""}`;
  return `<w:r><w:rPr>${props}</w:rPr><w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;
}

/**
 * A paragraph. `style` is a style id such as "Heading1"; `list` is 1 (bullet) or 2 (numbered).
 * @param {string | string[]} runs
 * @param {{ style?: string, list?: 1 | 2 }} [o]
 */
export function para(runs, o = {}) {
  const body = Array.isArray(runs) ? runs.join("") : runs;
  const pPr =
    (o.style ? `<w:pStyle w:val="${o.style}"/>` : "") +
    (o.list ? `<w:numPr><w:ilvl w:val="0"/><w:numId w:val="${o.list}"/></w:numPr>` : "");
  return `<w:p><w:pPr>${pPr}</w:pPr>${body}</w:p>`;
}

/**
 * A paragraph of plain text.
 * @param {string} t
 * @param {{ style?: string, list?: 1 | 2 }} [o]
 */
export const text = (t, o = {}) => para(run(t), o);

/** @param {string[][]} rows */
export function table(rows) {
  const tr = rows.map((cells) => `<w:tr>${cells.map((c) => `<w:tc>${text(c)}</w:tc>`).join("")}</w:tr>`).join("");
  return `<w:tbl><w:tblPr/><w:tblGrid/>${tr}</w:tbl>`;
}

/** A paragraph containing an inline picture (relationship rId2 -> word/media/image1.png). */
export const imageParagraph = () =>
  `<w:p><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="95250" cy="95250"/>` +
  `<wp:docPr id="1" name="Picture 1" descr="a picture"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
  `<pic:pic><pic:nvPicPr><pic:cNvPr id="0" name="image1.png"/><pic:cNvPicPr/></pic:nvPicPr>` +
  `<pic:blipFill><a:blip r:embed="rId2"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
  `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="95250" cy="95250"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>` +
  `</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;

/** 1x1 transparent PNG. */
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

const NS =
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
  'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" ' +
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
  'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';

const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

const headingStyles = [1, 2, 3, 4, 5, 6]
  .map((n) => `<w:style w:type="paragraph" w:styleId="Heading${n}"><w:name w:val="heading ${n}"/></w:style>`)
  .join("");

const numbering =
  `<w:numbering ${NS}>` +
  `<w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/></w:lvl></w:abstractNum>` +
  `<w:abstractNum w:abstractNumId="1"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/></w:lvl></w:abstractNum>` +
  `<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num><w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num>` +
  `</w:numbering>`;

/**
 * A valid .docx whose body is the given WordprocessingML.
 * @param {string} bodyXml
 * @returns {Buffer}
 */
export function buildDocx(bodyXml) {
  return zip({
    "[Content_Types].xml":
      `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
      `<Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/>` +
      `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
      `<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>` +
      `<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>` +
      `</Types>`,
    "_rels/.rels":
      `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
    "word/_rels/document.xml.rels":
      `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
      `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png"/>` +
      `<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/></Relationships>`,
    "word/document.xml": `${XML}<w:document ${NS}><w:body>${bodyXml}</w:body></w:document>`,
    "word/styles.xml": `${XML}<w:styles ${NS}>${headingStyles}</w:styles>`,
    "word/numbering.xml": `${XML}${numbering}`,
    "word/media/image1.png": PNG_1X1,
  });
}
