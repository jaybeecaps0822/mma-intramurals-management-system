import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import sharp from "sharp";
import { db } from "@/db";
import * as s from "@/db/schema";
import { getSession } from "@/lib/auth";
import * as v from "@/lib/validation";

const MAX_BYTES = 2 * 1024 * 1024;
const pathFor = (key: string) => `/api/media/${key}`;
const keyFor = (path: string | null | undefined) => path?.match(/^\/api\/media\/([a-f0-9]{32})$/)?.[1];
type Scope = typeof s.mediaAssets.$inferInsert["scope"];

export async function uploadMedia(scope: Scope, actor: number, form: FormData) {
  const file = form.get("file");
  if (!(file instanceof File) || file.size <= 0 || file.size > MAX_BYTES) return v.fail("Choose a JPG, PNG or WebP image no larger than 2 MB.");
  const d = Object.fromEntries(form);
  const owner = scope === "student" || scope === "house" ? v.integer(d, "id") : null;
  const eventId = scope === "gallery" ? v.integer(d, "eventId") : null;
  const caption = eventId ? v.text(d, "caption", 200) : "";
  const rasterize = async () => {
    const pipeline = sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 20_000_000, failOn: "warning" });
    const image = await pipeline.metadata();
    if (!image.format || !["jpeg", "png", "webp"].includes(image.format) || (image.pages || 1) > 1) return v.fail("The file must be a single JPG, PNG, or WebP image.");
    const size = scope === "gallery" ? 1440 : scope === "student" ? 420 : 500;
    return pipeline.rotate().resize({ width: size, height: size, fit: "inside", withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
  };
  const image = await rasterize().catch(() => v.fail("This image could not be read. Choose a valid JPG, PNG, or WebP within the upload limits."));
  if (image.length > MAX_BYTES) return v.fail("Use a smaller image.");
  const key = randomBytes(16).toString("hex"), url = pathFor(key);
  return db.transaction(async (tx) => {
    await tx.insert(s.mediaAssets).values({ key, scope, data: image.toString("base64"), createdBy: actor });
    let previous: string | null | undefined, recordId: number | string = owner || "main";
    if (scope === "school") {
      const [record] = await tx.select({ logo: s.settings.logoUrl }).from(s.settings).where(eq(s.settings.key, "main")).for("update");
      previous = record?.logo;
      await tx.insert(s.settings).values({ key: "main", schoolName: "MMA", timezone: "Asia/Manila", logoUrl: url }).onConflictDoUpdate({ target: s.settings.key, set: { logoUrl: url, updatedAt: new Date() } });
    } else if (scope === "student") {
      const [student] = await tx.select({ photo: s.students.photoUrl }).from(s.students).where(eq(s.students.id, owner!)).for("update");
      if (!student) return v.fail("Student profile not found.", 404);
      previous = student.photo;
      await tx.update(s.students).set({ photoUrl: url, updatedAt: new Date() }).where(eq(s.students.id, owner!));
    } else if (scope === "house") {
      const [house] = await tx.select({ logo: s.houses.logoUrl }).from(s.houses).where(eq(s.houses.id, owner!)).for("update");
      if (!house) return v.fail("House not found.", 404);
      previous = house.logo;
      await tx.update(s.houses).set({ logoUrl: url, updatedAt: new Date() }).where(eq(s.houses.id, owner!));
    } else {
      await v.eventFor(tx, eventId!);
      const [photo] = await tx.insert(s.galleryPhotos).values({ eventId: eventId!, url, caption, published: v.flag(d, "publish") }).returning({ id: s.galleryPhotos.id });
      recordId = photo.id;
    }
    const oldKey = keyFor(previous);
    if (oldKey) await tx.delete(s.mediaAssets).where(and(eq(s.mediaAssets.key, oldKey), eq(s.mediaAssets.scope, scope)));
    await v.audit(tx, actor, "Uploaded image", scope === "gallery" ? "Gallery" : `${scope} image`, recordId, eventId);
    return { message: scope === "gallery" ? "Gallery photo added." : "Image updated.", url, id: typeof recordId === "number" ? recordId : undefined };
  });
}

export async function galleryAction(action: string, actor: number, d: v.Payload) {
  if (action !== "gallery.save" && action !== "gallery.remove") return null;
  const eventId = v.integer(d, "eventId"), id = v.integer(d, "id");
  return db.transaction(async (tx) => {
    await v.eventFor(tx, eventId);
    const filter = and(eq(s.galleryPhotos.id, id), eq(s.galleryPhotos.eventId, eventId));
    if (action === "gallery.save") {
      const [row] = await tx.update(s.galleryPhotos).set({ caption: v.text(d, "caption", 200), published: v.flag(d, "publish") }).where(filter).returning({ id: s.galleryPhotos.id });
      if (!row) return v.fail("Photo not found.", 404);
    } else {
      const [row] = await tx.delete(s.galleryPhotos).where(filter).returning({ url: s.galleryPhotos.url });
      if (!row) return v.fail("Photo not found.", 404);
      const key = keyFor(row.url);
      if (key) await tx.delete(s.mediaAssets).where(and(eq(s.mediaAssets.key, key), eq(s.mediaAssets.scope, "gallery")));
    }
    await v.audit(tx, actor, action === "gallery.save" ? "Updated gallery photo" : "Removed gallery photo", "Gallery", id, eventId);
    return { message: action === "gallery.save" ? "Gallery photo updated." : "Gallery photo removed." };
  });
}

export async function readMedia(key: string) {
  const notFound = () => new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  if (!/^[a-f0-9]{32}$/.test(key)) return notFound();
  const [asset] = await db.select({ scope: s.mediaAssets.scope }).from(s.mediaAssets).where(eq(s.mediaAssets.key, key));
  if (!asset) return notFound();
  const url = pathFor(key);
  if (asset.scope === "student") {
    const session = await getSession();
    if (!session) return notFound();
    if (session.role === "student") {
      const [own] = await db.select({ id: s.students.id }).from(s.students).where(and(eq(s.students.photoUrl, url), eq(s.students.userId, session.id)));
      if (!own) return notFound();
    }
    if (session.role === "adviser") {
      const [member] = await db.select({ id: s.students.id }).from(s.students).innerJoin(s.teamMembers, eq(s.teamMembers.studentId, s.students.id)).innerJoin(s.houseAdvisers, and(eq(s.houseAdvisers.eventId, s.teamMembers.eventId), eq(s.houseAdvisers.houseId, s.teamMembers.houseId))).innerJoin(s.advisers, eq(s.advisers.id, s.houseAdvisers.adviserId)).where(and(eq(s.students.photoUrl, url), eq(s.advisers.userId, session.id))).limit(1);
      if (!member) return notFound();
    }
  } else if (asset.scope === "gallery") {
    const [photo] = await db.select({ id: s.galleryPhotos.id }).from(s.galleryPhotos).innerJoin(s.intramurals, eq(s.intramurals.id, s.galleryPhotos.eventId)).where(and(eq(s.galleryPhotos.url, url), eq(s.galleryPhotos.published, true), eq(s.intramurals.published, true))).limit(1);
    if (!photo && (await getSession())?.role !== "admin") return notFound();
  }
  const [record] = await db.select({ data: s.mediaAssets.data }).from(s.mediaAssets).where(eq(s.mediaAssets.key, key));
  if (!record) return notFound();
  return new Response(new Uint8Array(Buffer.from(record.data, "base64")), { headers: { "Content-Type": "image/webp", "Cache-Control": "private, no-store", "Cross-Origin-Resource-Policy": "same-origin", "X-Content-Type-Options": "nosniff" } });
}
