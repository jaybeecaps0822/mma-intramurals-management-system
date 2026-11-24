import { db } from "@/db";
import { attendanceSanctions, roles } from "@/db/schema";

export const dynamic = "force-dynamic";
export async function GET() {
  const headers = { "Cache-Control": "no-store" };
  try {
    await db.select({ role: roles.key }).from(roles).limit(1);
    await db.select({ id: attendanceSanctions.id }).from(attendanceSanctions).limit(1);
    return Response.json({ ok: true }, { headers });
  } catch {
    return Response.json({ ok: false }, { status: 503, headers });
  }
}
