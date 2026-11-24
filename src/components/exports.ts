import { attendanceLabel, dateLabel, durationLabel, methodLabel, timeLabel, type AttendanceRow, type WorkspaceData } from "@/lib/model";

export function downloadBlob(file: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = file;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
export function downloadCsv(file: string, header: string[], rows: (string | number | null | undefined)[][]) {
  const escape = (value: string | number | null | undefined) => {
    let cell = String(value ?? "");
    if (/^[\s\u200B\uFEFF]*[=+\-@]/.test(cell) || /^[\r\t\n]/.test(cell)) cell = `'${cell}`;
    return `"${cell.replaceAll('"', '""')}"`;
  };
  downloadBlob(file, new Blob(["\ufeff" + [header, ...rows].map((row) => row.map(escape).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" }));
}
export async function downloadReport(data: WorkspaceData, mode: "attendance" | "participation", rows: AttendanceRow[], from: string, until: string, house: string, verifier: string) {
  const { PDFDocument, rgb, StandardFonts } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const reportLogo = data.schoolLogoUrl ? await (async () => {
    try {
      const response = await fetch(data.schoolLogoUrl!, { cache: "no-store" });
      if (!response.ok || !response.headers.get("content-type")?.startsWith("image/")) return null;
      const bitmap = await createImageBitmap(await response.blob());
      const image = document.createElement("canvas"); image.width = bitmap.width; image.height = bitmap.height;
      image.getContext("2d")?.drawImage(bitmap, 0, 0); bitmap.close();
      const png = await new Promise<Blob | null>((resolve) => image.toBlob(resolve, "image/png"));
      return png ? await doc.embedPng(await png.arrayBuffer()) : null;
    } catch { return null; }
  })() : null;
  const navy = rgb(.078, .126, .215), muted = rgb(.34, .39, .47), gold = rgb(.98, .67, .26), light = rgb(.94, .95, .97);
  const selectedHouse = house && house !== "all" ? data.houses.find((h) => String(h.id) === house)?.name || "Assigned houses" : data.role === "adviser" ? data.houses.filter((h) => data.scopedHouseIds.includes(h.id)).map((h) => h.name).join(", ") || "Assigned houses" : "All houses";
  const cols = mode === "attendance" ? [
    { label: "Date", width: 68 }, { label: "Student ID", width: 75 }, { label: "Full name", width: 121 }, { label: "House", width: 84 }, { label: "Time in", width: 53 }, { label: "Time out", width: 53 }, { label: "Status", width: 104 }, { label: "Duration", width: 57 }, { label: "IN / OUT method", width: 102 },
  ] : [{ label: "Student ID", width: 114 }, { label: "Full name", width: 186 }, { label: "House", width: 125 }, { label: "Sport", width: 181 }, { label: "Division", width: 112 }];
  const getHouse = (id: number | null) => data.houses.find((h) => h.id === id)?.name || "Unassigned";
  const tableData = mode === "attendance" ? rows.map((row) => [row.date, row.number, row.name, getHouse(row.houseId), timeLabel(row.timeIn, data.timezone), timeLabel(row.timeOut, data.timezone), row.timeIn && !row.timeOut ? `${attendanceLabel[row.status]} / pending out` : attendanceLabel[row.status], durationLabel(row.timeIn, row.timeOut), [row.inMethod ? methodLabel[row.inMethod] : "—", row.outMethod ? methodLabel[row.outMethod] : "—"].join(" / ")]) : data.athletes.flatMap((a) => {
    const student = data.students.find((s) => s.id === a.studentId);
    const sport = data.sports.find((s) => s.id === a.sportId);
    return student && sport && (!house || house === "all" || house === String(student.houseId)) ? [[student.number, student.name, getHouse(student.houseId), sport.name, sport.division]] : [];
  });
  function safe(raw: string) {
    return [...raw.replace(/\s+/g, " ")].map((char) => { try { font.encodeText(char); return char; } catch { return "?"; } }).join("");
  }
  function fit(raw: string, width: number, size: number) {
    const text = safe(raw);
    if (font.widthOfTextAtSize(text, size) <= width) return text;
    let cut = text.length;
    while (cut > 0 && font.widthOfTextAtSize(text.slice(0, cut) + "...", size) > width) cut--;
    return `${text.slice(0, cut)}...`;
  }
  const pageTotal = Math.max(1, Math.ceil(tableData.length / 19));
  for (let index = 0; index < pageTotal; index++) {
    const page = doc.addPage([792, 612]);
    page.drawRectangle({ x: 0, y: 508, width: 792, height: 104, color: navy });
    page.drawRectangle({ x: 36, y: 542, width: 36, height: 36, color: gold });
    if (reportLogo) {
      const size = reportLogo.scaleToFit(32, 32);
      page.drawImage(reportLogo, { ...size, x: 36 + (36 - size.width) / 2, y: 542 + (36 - size.height) / 2 });
    } else page.drawText("MMA", { x: 41, y: 555, size: 10, font: bold, color: navy });
    page.drawText(fit(data.schoolName, 650, 12), { x: 85, y: 566, size: 12, font: bold, color: gold });
    page.drawText(mode === "attendance" ? "Attendance report" : "Team participation report", { x: 85, y: 539, size: 21, font: bold, color: rgb(1, 1, 1) });
    page.drawText(fit(`${data.season?.title || "Intramurals"}   |   ${selectedHouse}${data.preview ? "   |   FICTIONAL PREVIEW" : ""}`, 717, 11), { x: 36, y: 484, size: 11, font: bold, color: navy });
    page.drawText(safe(mode === "attendance" ? `${dateLabel(from)} – ${dateLabel(until)}  ·  ${data.timezone}` : "Registered athletes by sport and division"), { x: 36, y: 466, size: 9, font, color: muted });
    page.drawRectangle({ x: 36, y: 426, width: 720, height: 23, color: light });
    let x = 42;
    cols.forEach((c) => { page.drawText(c.label, { x, y: 434, size: 9, font: bold, color: navy }); x += c.width; });
    const items = tableData.slice(index * 19, (index + 1) * 19);
    if (!items.length) page.drawText("No records match the selected filters.", { x: 42, y: 406, size: 10, font, color: muted });
    items.forEach((row, ri) => {
      const y = 410 - 17 * ri;
      let start = 42;
      row.forEach((value, ci) => { const col = cols[ci]; page.drawText(fit(value, col.width - 8, 8.5), { x: start, y, size: 8.5, font, color: navy }); start += col.width; });
      page.drawLine({ start: { x: 36, y: y - 6 }, end: { x: 756, y: y - 6 }, thickness: .35, color: light });
    });
    page.drawLine({ start: { x: 36, y: 75 }, end: { x: 756, y: 75 }, thickness: .7, color: light });
    page.drawText(fit(`Prepared by: ${data.viewer.name}`, 325, 9), { x: 36, y: 56, size: 9, font, color: navy });
    page.drawText(fit(`Verified by: ${verifier.trim() || "____________________________"}`, 710 - 329, 9), { x: 380, y: 56, size: 9, font, color: navy });
    page.drawText(safe(`Generated: ${new Intl.DateTimeFormat("en-US", { timeZone: data.timezone, dateStyle: "medium" }).format(new Date())}  ·  ${tableData.length} records`), { x: 36, y: 35, size: 8.5, font, color: muted });
    page.drawText(`Page ${index + 1} of ${pageTotal}`, { x: 690, y: 35, size: 8.5, font, color: muted });
  }
  const bytes = await doc.save();
  const result = new Uint8Array(bytes.length); result.set(bytes);
  downloadBlob(`mma-${mode}-${data.season?.slug || "event"}-${until}.pdf`, new Blob([result], { type: "application/pdf" }));
}
