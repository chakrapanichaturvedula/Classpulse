export type RosterRow = { id: string; name: string; emailid: string };
export type CsvPreview = { rows: RosterRow[]; errors: string[] };
export const rosterTemplate = 'id,name,emailid\r\n';

export function parseRosterCsv(input: string): CsvPreview {
  if (input.length > 256 * 1024) return { rows: [], errors: ['Use a CSV smaller than 256 KB.'] };
  const source = input.replace(/^\uFEFF/, '');
  const records: string[][] = [];
  let row: string[] = [], field = '', quoted = false, closed = false;
  const fail = (message: string): CsvPreview => ({ rows: [], errors: [message] });
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (quoted) {
      if (char === '"') {
        if (source[i + 1] === '"') { field += '"'; i++; }
        else { quoted = false; closed = true; }
      } else field += char;
    } else if (char === '"') {
      if (field || closed) return fail('A quoted field is malformed. Export the file again as CSV.');
      quoted = true;
    } else if (char === ',' || char === '\n' || char === '\r') {
      row.push(field); field = ''; closed = false;
      if (char !== ',') {
        records.push(row); row = [];
        if (char === '\r' && source[i + 1] === '\n') i++;
      }
    } else {
      if (closed) return fail('There is extra text after a quoted field. Export the file again as CSV.');
      field += char;
    }
  }
  if (quoted) return fail('A quoted field is missing its closing quote.');
  if (field || row.length || closed) { row.push(field); records.push(row); }
  const header = records.shift()?.map(value => value.trim().toLowerCase());
  if (!header || header.join(',') !== 'id,name,emailid' || header.length !== 3) return fail('Use the template columns in this order: id,name,emailid.');
  const rows: RosterRow[] = [], errors: string[] = [], seen = new Set<string>();
  records.forEach((values, index) => {
    if (values.every(value => !value.trim())) return;
    const line = index + 2;
    if (values.length !== 3) { errors.push(`Row ${line}: expected 3 columns. Keep the comma for a blank emailid.`); return; }
    const [id, name, emailid] = values.map(value => value.trim());
    if (!id || !name) errors.push(`Row ${line}: id and name are required.`);
    if (id.length > 64 || name.length > 200) errors.push(`Row ${line}: ID or name is too long.`);
    if (id && /[\r\n\t]/.test(id)) errors.push(`Row ${line}: ID must be on one line.`);
    if (name && /[\r\n]/.test(name)) errors.push(`Row ${line}: name must be on one line.`);
    if (seen.has(id.toUpperCase())) errors.push(`Row ${line}: duplicate ID ${id}.`);
    if (id) seen.add(id.toUpperCase());
    if (emailid && (emailid.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailid))) errors.push(`Row ${line}: emailid is invalid.`);
    rows.push({ id, name, emailid });
  });
  if (!rows.length) errors.push('Add at least one student below the header.');
  if (rows.length > 150) errors.push('A class can contain up to 150 students.');
  return { rows, errors };
}
