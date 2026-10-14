import { parseRosterCsv, type CsvPreview, type RosterRow } from './csv';

const quote = (value: string) => `"${value.replace(/"/g, '""')}"`;
export function validateStudentRows(rows: RosterRow[]): CsvPreview {
  return parseRosterCsv('id,name,emailid\n' + rows.map(row => [row.id, row.name, row.emailid].map(quote).join(',')).join('\n'));
}
export function parsePastedStudents(text: string): CsvPreview {
  if (text.length > 256 * 1024) return {rows: [], errors: ['Paste a student list smaller than 256 KB.']};
  const source = text.replace(/^\uFEFF/, '').trim();
  if (!source.includes('\t')) return parseRosterCsv(/^id\s*,\s*name\s*,\s*emailid\s*(?:\r?\n|$)/i.test(source) ? source : 'id,name,emailid\n' + source);
  const lines = source.split(/\r?\n/).filter(line => line.trim());
  if (lines[0]?.split('\t').map(v => v.trim().toLowerCase()).join(',') === 'id,name,emailid') lines.shift();
  const rows: RosterRow[] = [], errors: string[] = [];
  lines.forEach((line, i) => {
    const cells = line.split('\t');
    if (cells.length < 2 || cells.length > 3) errors.push(`Row ${i + 1}: use ID, full name and optional email in separate columns.`);
    else rows.push({id: cells[0], name: cells[1], emailid: cells[2] ?? ''});
  });
  const validated = validateStudentRows(rows);
  return {rows: validated.rows, errors: [...errors, ...validated.errors]};
}
export function checkRoomAddition(preview: CsvPreview, current: RosterRow[]): CsvPreview {
  const enrolled = new Set(current.map(s => s.id.trim().toUpperCase()));
  const errors = [...preview.errors];
  for (const row of preview.rows) if (enrolled.has(row.id.toUpperCase())) errors.push(`ID ${row.id} is already in this room. Use Edit to change their details.`);
  if (current.length + preview.rows.length > 150) errors.push(`This room has ${current.length} students. You can add up to ${150 - current.length} more.`);
  return {rows: preview.rows, errors};
}
