import { inflateRawSync } from "node:zlib";
import { parse } from "csv-parse/sync";
import { readSheet } from "read-excel-file/node";
import { fail, type Payload } from "@/lib/validation";

const fields: Record<string, string> = {
  studentid: "number", studentnumber: "number", number: "number", firstname: "firstName", middlename: "middleName", lastname: "lastName",
  course: "course", department: "course", year: "year", yearlevel: "year", gender: "gender", phone: "phone", contactnumber: "phone", email: "email", house: "house",
};
// Check archive expansion before handing the workbook to the in-memory spreadsheet parser.
function guardWorkbook(bytes: Buffer) {
  let end = bytes.length - 22;
  while (end >= 0 && bytes.length - end <= 65557 && bytes.readUInt32LE(end) !== 0x06054b50) end--;
  if (end < 0 || bytes.length - end > 65557 || bytes.readUInt16LE(end + 4) || bytes.readUInt16LE(end + 6)) return fail("The Excel archive could not be read.");
  const count = bytes.readUInt16LE(end + 10);
  const start = bytes.readUInt32LE(end + 16);
  const length = bytes.readUInt32LE(end + 12);
  if (!count || count > 300 || start + length !== end || end + 22 + bytes.readUInt16LE(end + 20) !== bytes.length) return fail("This Excel file is too complex or has an invalid archive.");
  let pos = start, size = 0;
  for (let i = 0; i < count; i++) {
    if (pos + 46 > end || bytes.readUInt32LE(pos) !== 0x02014b50) return fail("The Excel archive is invalid.");
    const packed = bytes.readUInt32LE(pos + 20), expanded = bytes.readUInt32LE(pos + 24);
    const offset = bytes.readUInt32LE(pos + 42), method = bytes.readUInt16LE(pos + 10), flags = bytes.readUInt16LE(pos + 8);
    size += expanded;
    if (size > 16 * 1024 * 1024) return fail("The expanded workbook is too large.");
    if (offset + 30 > start || bytes.readUInt32LE(offset) !== 0x04034b50 || bytes.readUInt16LE(offset + 8) !== method || bytes.readUInt16LE(offset + 6) !== flags || flags & 1) return fail("Encrypted or invalid Excel archives are not supported.");
    const headerEnd = offset + 30 + bytes.readUInt16LE(offset + 26) + bytes.readUInt16LE(offset + 28);
    if (headerEnd + packed > start) return fail("The Excel archive is invalid.");
    if (method === 8) {
      let length: number;
      try { length = inflateRawSync(bytes.subarray(headerEnd, headerEnd + packed), { maxOutputLength: Math.max(1, expanded) }).length; }
      catch { return fail("Invalid or oversized compressed workbook data."); }
      if (length !== expanded) return fail("The Excel archive has invalid entry sizes.");
    } else if (method !== 0 || packed !== expanded) return fail("Unsupported Excel archive entry.");
    pos += 46 + bytes.readUInt16LE(pos + 28) + bytes.readUInt16LE(pos + 30) + bytes.readUInt16LE(pos + 32);
  }
  if (pos !== end) return fail("The Excel archive is invalid.");
}
export async function readStudents(file: File): Promise<Payload[]> {
  if (!file.size || file.size > 2 * 1024 * 1024) return fail("Choose a CSV or XLSX file no larger than 2 MB.");
  const name = file.name.toLowerCase();
  let rows: unknown[][];
  if (name.endsWith(".csv")) {
    try { rows = parse(await file.text(), { bom: true, skip_empty_lines: true, relax_column_count: true, max_record_size: 8192, to: 502 }); }
    catch { return fail("The CSV format could not be read. Use the provided template."); }
  } else if (name.endsWith(".xlsx")) {
    const bytes = Buffer.from(await file.arrayBuffer());
    guardWorkbook(bytes);
    try { rows = await readSheet(bytes, 1); }
    catch { return fail("The XLSX workbook could not be read. Check that the first sheet contains student records."); }
  } else return fail("Only .csv and .xlsx files are supported.");
  if (!rows[0] || rows[0].length > 50 || rows.length > 501) return fail("Files must contain a header and at most 500 records.");
  const str = (value: unknown) => typeof value === "string" ? value : typeof value === "number" ? String(value) : "";
  const keys = rows[0].map((header) => fields[str(header).trim().toLowerCase().replace(/[^a-z]/g, "")]);
  const recognized = keys.filter(Boolean);
  if (new Set(recognized).size !== recognized.length || !["number", "firstName", "lastName", "course", "year"].every((k) => recognized.includes(k))) return fail("Use unique Student ID, First Name, Last Name, Course, and Year Level columns.");
  return rows.slice(1).filter((row) => row.some((cell) => str(cell).trim())).map((row) => Object.fromEntries(keys.flatMap((key, i) => key ? [[key, str(row[i])]] : [])));
}
