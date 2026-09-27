import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const { toCsv, toXlsx } = await import('./table');

const table = {
  title: 'Items 27 Sep',
  columns: [
    { key: 'name', label: 'Item', type: 'text' as const },
    { key: 'qty', label: 'Quantity', type: 'number' as const },
    { key: 'amount', label: 'Amount', type: 'money' as const },
  ],
  rows: [
    { name: 'Potato', qty: 1.5, amount: '45' },
    { name: 'Green "Chilli", fresh', qty: 10, amount: 800 },
    { name: '=HYPERLINK("http://x")', qty: null, amount: 0 },
  ],
};

describe('toCsv', () => {
  it('escapes quotes/commas, formats money, adds a BOM and neutralizes formulas', () => {
    const bytes = toCsv(table);
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]); // UTF-8 BOM
    const text = strFromU8(bytes.slice(3));
    expect(text.split('\r\n')).toEqual([
      'Item,Quantity,Amount',
      'Potato,1.5,45.00',
      '"Green ""Chilli"", fresh",10,800.00',
      `"'=HYPERLINK(""http://x"")",,0.00`,
      '',
    ]);
  });
});

describe('toXlsx', () => {
  it('produces a valid workbook package with typed cells', () => {
    const files = unzipSync(toXlsx(table));
    expect(Object.keys(files).sort()).toEqual([
      '[Content_Types].xml',
      '_rels/.rels',
      'xl/_rels/workbook.xml.rels',
      'xl/styles.xml',
      'xl/workbook.xml',
      'xl/worksheets/sheet1.xml',
    ]);
    const sheet = strFromU8(files['xl/worksheets/sheet1.xml']);
    expect(sheet).toContain('<c r="C2" s="2"><v>45</v></c>'); // money as a real number
    expect(sheet).toContain('<c r="B3" s="3"><v>10</v></c>');
    expect(sheet).toContain('Green &quot;Chilli&quot;, fresh');
    expect(sheet).toContain(`'=HYPERLINK`);
    expect(sheet).not.toContain('<c r="B4"'); // empty cell omitted
    expect(strFromU8(files['xl/workbook.xml'])).toContain('name="Items 27 Sep"');
  });
});
