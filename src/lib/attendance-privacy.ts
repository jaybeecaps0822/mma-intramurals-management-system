import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";
import { and, eq, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { faceProfiles, loginLimits } from "@/db/schema";
import { hashToken } from "@/lib/auth";
import { fail } from "@/lib/validation";

function rootSecret(value?: string) {
  if (!value || !/^[A-Za-z0-9_-]{43}=?$|^[A-Za-z0-9+/]{43}=?$/.test(value)) return null;
  const key = Buffer.from(value, "base64url");
  return key.length === 32 ? key : null;
}
export const rfidConfigured = () => !!rootSecret(process.env.MMA_RFID_SECRET);
export const faceConfigured = () => !!rootSecret(process.env.MMA_FACE_SECRET);
function purposeKey(env: string | undefined, label: string, error: string) {
  const key = rootSecret(env);
  if (!key) return fail(error, 503);
  return createHmac("sha256", key).update(`mma:attendance:v1:${label}`).digest();
}
export function cardDigest(value: string) {
  const key = purposeKey(process.env.MMA_RFID_SECRET, "card", "RFID is not configured. Contact your system administrator.");
  // Different readers may emit decimal or hexadecimal IDs. Keep leading zeros; use the same reader output format everywhere.
  const uid = value.trim().toUpperCase().replace(/[:\-\s]/g, "");
  if (!/^[A-Z0-9]{4,64}$/.test(uid)) return fail("Tap a valid RFID card. Use a reader that types the ID followed by Enter.");
  return createHmac("sha256", key).update(uid).digest("hex");
}
export function pinDigest(eventId: number, pin: string) {
  return createHmac("sha256", purposeKey(process.env.MMA_FACE_SECRET, "pin", "Face verification is not configured.")).update(`${eventId}:${pin}`).digest("hex");
}
const encryptionKey = () => purposeKey(process.env.MMA_FACE_SECRET, "template", "Face verification is not configured.");
const aad = (studentId: number, version: string) => Buffer.from(`mma:${studentId}:${version}`, "utf8");
export function encryptFace(studentId: number, version: string, vector: Float32Array) {
  if (vector.length !== 128) throw new Error("Invalid template size");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(aad(studentId, version));
  const bytes = Buffer.alloc(512);
  for (let i = 0; i < vector.length; i++) bytes.writeFloatLE(vector[i], i * 4);
  try { const encrypted = Buffer.concat([cipher.update(bytes), cipher.final()]); return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url"); }
  finally { bytes.fill(0); }
}
export function matchesFace(studentId: number, version: string, encrypted: string, candidate: Float32Array) {
  const bytes = Buffer.from(encrypted, "base64url");
  if (bytes.length !== 540 || candidate.length !== 128) return false;
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), bytes.subarray(0, 12));
  decipher.setAAD(aad(studentId, version)); decipher.setAuthTag(bytes.subarray(12, 28));
  let decrypted: Buffer;
  try { decrypted = Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]); }
  catch { return fail("This enrollment could not be read. Use QR or RFID or re-enroll.", 409); }
  try {
    let score = 0;
    for (let i = 0; i < candidate.length; i++) score += decrypted.readFloatLE(i * 4) * candidate[i];
    return Number.isFinite(score) && score >= .50;
  } finally { decrypted.fill(0); }
}
export async function attendanceLimit(namespace: string, subject: number, max: number, windowMs: number) {
  const now = new Date(), until = new Date(now.getTime() + windowMs);
  const key = hashToken(`mma-attendance-limit:${namespace}:${subject}`);
  const [entry] = await db.insert(loginLimits).values({ key, attempts: 1, expiresAt: until }).onConflictDoUpdate({
    target: loginLimits.key, set: {
      attempts: sql`case when ${loginLimits.expiresAt} <= ${now} then 1 else least(${loginLimits.attempts} + 1, 10000) end`,
      expiresAt: sql`case when ${loginLimits.expiresAt} <= ${now} then ${until} else ${loginLimits.expiresAt} end`,
    },
  }).returning({ attempts: loginLimits.attempts });
  if (entry.attempts > max) fail("Too many attempts. Wait briefly, or use another attendance method.", 429);
}
export async function purgeExpiredFaces(studentId?: number) {
  await db.delete(faceProfiles).where(and(lte(faceProfiles.expiresAt, new Date()), studentId ? eq(faceProfiles.studentId, studentId) : undefined));
}
