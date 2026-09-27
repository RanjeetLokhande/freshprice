import { strToU8, zipSync } from 'fflate';

// One tabular shape feeds every export format, so CSV/Excel always match the screen.
export type ColumnType = 'text' | 'number' | 'money' | 'date';

export interface ExportColumn {
  key: string;
  label: string;
  type: ColumnType;
}

export interface ExportTable {
  title: string;
  columns: ExportColumn[];
  rows: Record<string, string | number | null>[];
}

/** Stops spreadsheet formula injection from user-entered text (e.g. an item named "=HYPERLINK(...)"). */
function neutralizeFormula(text: string) {
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

function cellText(col: ExportColumn, value: string | number | null): string {
  if (value === null || value === undefined) return '';
  if (col.type === 'money') return Number(value).toFixed(2);
  return col.type === 'text' ? neutralizeFormula(String(value)) : String(value);
}

export function toCsv(table: ExportTable): Uint8Array {
  const esc = (s: string) => (/[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const lines = [
    table.columns.map((c) => esc(c.label)).join(','),
    ...table.rows.map((r) => table.columns.map((c) => esc(cellText(c, r[c.key]))).join(',')),
  ];
  // BOM so Excel reads UTF-8 (₹, non-English names) correctly
  return strToU8(`﻿${lines.join('\r\n')}\r\n`);
}

const xml = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    // strip characters that are invalid in XML 1.0
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

function colName(i: number) {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

/** Minimal, standards-compliant .xlsx (one sheet, bold header, number formats, frozen header row). */
export function toXlsx(table: ExportTable): Uint8Array {
  const cell = (ref: string, col: ExportColumn, value: string | number | null, header = false) => {
    if (header) return `<c r="${ref}" t="inlineStr" s="1"><is><t>${xml(col.label)}</t></is></c>`;
    if (value === null || value === undefined || value === '') return '';
    if ((col.type === 'number' || col.type === 'money') && Number.isFinite(Number(value))) {
      return `<c r="${ref}" s="${col.type === 'money' ? 2 : 3}"><v>${Number(value)}</v></c>`;
    }
    return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xml(cellText(col, value))}</t></is></c>`;
  };

  const header = `<row r="1">${table.columns.map((c, i) => cell(`${colName(i)}1`, c, null, true)).join('')}</row>`;
  const body = table.rows
    .map((r, ri) => `<row r="${ri + 2}">${table.columns.map((c, ci) => cell(`${colName(ci)}${ri + 2}`, c, r[c.key])).join('')}</row>`)
    .join('');
  const widths = table.columns
    .map((c, i) => {
      const longest = Math.max(c.label.length, ...table.rows.map((r) => cellText(c, r[c.key]).length));
      return `<col min="${i + 1}" max="${i + 1}" width="${Math.min(Math.max(longest + 2, 10), 60)}" customWidth="1"/>`;
    })
    .join('');

  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${widths}</cols><sheetData>${header}${body}</sheetData></worksheet>`;

  const sheetName = xml(table.title.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Sheet1');

  return zipSync({
    '[Content_Types].xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`),
    '_rels/.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    'xl/workbook.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${sheetName}" sheetId="1" r:id="rId1"/></sheets></workbook>`),
    'xl/_rels/workbook.xml.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
    // xf 0 normal, 1 bold header, 2 money #,##0.00 (numFmt 4), 3 number 0.###
    'xl/styles.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="0.###"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs></styleSheet>`),
    'xl/worksheets/sheet1.xml': strToU8(sheet),
  });
}
