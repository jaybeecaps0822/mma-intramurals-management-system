import { authorizeWrite, apiError, AppError } from "@/lib/auth";
import { manageAttendance, scanAttendance } from "@/lib/attendance";
import { faceAction, faceUpload, rfidAction } from "@/lib/attendance-access";
import { getSchool } from "@/lib/data";
import { sanctionAction } from "@/lib/sanctions";
import { competitionAction } from "@/lib/competition";
import { galleryAction, uploadMedia } from "@/lib/media";
import { readStudents } from "@/lib/import";
import { publishingAction } from "@/lib/publishing";
import { importStudents, registry } from "@/lib/registry";
import { optionalId, type Payload } from "@/lib/validation";

const MAX_JSON = 32 * 1024;
const MAX_UPLOAD = 2 * 1024 * 1024 + 16 * 1024;
async function boundedRequest(request: Request, max: number) {
  if (Number(request.headers.get("content-length")) > max) throw new AppError(413, "The request is too large.");
  const reader = request.body?.getReader();
  if (!reader) throw new AppError(400, "Request data is missing.");
  const chunks: Buffer[] = [];
  let size = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > max) { await reader.cancel(); throw new AppError(413, "The request is too large."); }
      chunks.push(Buffer.from(next.value));
    }
  } finally { reader.releaseLock(); }
  return new Response(new Uint8Array(Buffer.concat(chunks, size)), { headers: { "content-type": request.headers.get("content-type") || "" } });
}

export async function POST(request: Request, context: { params: Promise<{ action: string }> }) {
  try {
    const { action } = await context.params;
    const studentAction = ["attendance.scan", "face.enroll", "face.verify", "face.withdraw"].includes(action);
    const session = await authorizeWrite(request, studentAction ? "student" : "admin");
    const response = (data: unknown) => Response.json(data, { headers: { "Cache-Control": "no-store" } });
    if (action === "face.enroll" || action === "face.verify") {
      if (!request.headers.get("content-type")?.startsWith("multipart/form-data;")) throw new AppError(415, "A camera frame is required.");
      const form = await (await boundedRequest(request, 540 * 1024)).formData().catch(() => null);
      if (!form) throw new AppError(400, "The camera frame could not be read.");
      return response(await faceUpload(action, session, form, (await getSchool()).timezone));
    }
    if (action === "student.import" || ["student.photo", "house.logo", "school.logo", "gallery.upload"].includes(action)) {
      if (!request.headers.get("content-type")?.startsWith("multipart/form-data;")) throw new AppError(415, "Choose a file to upload.");
      const form = await (await boundedRequest(request, MAX_UPLOAD)).formData().catch(() => null);
      if (!form) throw new AppError(400, "The file could not be read.");
      if (action !== "student.import") return response(await uploadMedia(action.split(".")[0] as "student" | "house" | "school" | "gallery", session.id, form));
      const file = form.get("file");
      if (!(file instanceof File)) throw new AppError(400, "Choose a CSV or XLSX file.");
      return response(await importStudents(session.id, await readStudents(file), optionalId({ eventId: form?.get("eventId") }, "eventId")));
    }
    if (!request.headers.get("content-type")?.startsWith("application/json")) throw new AppError(415, "Expected a JSON request.");
    const payload: Payload = await (await boundedRequest(request, MAX_JSON)).json().catch(() => null);
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new AppError(400, "Invalid request data.");
    if (action === "attendance.scan") return response(await scanAttendance(session, payload));
    if (action.startsWith("rfid.") || action.startsWith("face.") || action.startsWith("sanction.")) {
      const result = action.startsWith("face.") ? await faceAction(action, session, payload) : action.startsWith("rfid.") ? await rfidAction(action, session, payload, (await getSchool()).timezone) : await sanctionAction(action, session.id, payload, (await getSchool()).timezone);
      if (!result) throw new AppError(404, "This action does not exist.");
      return response(result);
    }
    const outcome = await registry(action, session.id, payload) || await manageAttendance(action, session.id, payload) || await competitionAction(action, session.id, payload) || await publishingAction(action, session.id, payload) || await galleryAction(action, session.id, payload);
    if (!outcome) throw new AppError(404, "This action does not exist.");
    return response(outcome);
  } catch (error) { return apiError(error); }
}
