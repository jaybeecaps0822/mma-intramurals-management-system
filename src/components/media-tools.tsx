"use client";

import Image from "next/image";
import { ImagePlus, Pencil, Trash2 } from "lucide-react";
import { Badge, Empty, Panel, useWorkspace, type Field } from "@/components/ui";

const fileField: Field = { name: "file", label: "Choose an image", type: "file", required: true, accept: "image/jpeg,image/png,image/webp", hint: "JPG, PNG or WebP · Maximum 2 MB · Single image only" };
export function useUploadImage() {
  const { open } = useWorkspace();
  return (scope: "student" | "house" | "school", id?: number, name?: string) => {
    const title = scope === "student" ? "Update student photo" : scope === "school" ? "Upload school logo" : "Upload house logo";
    const description = scope === "student" ? `${name || "Student"} · This photo is restricted to staff and the student.` : scope === "school" ? "The selected logo appears on PDF reports. It is safe to publish this asset." : `${name || "House"} · The logo appears wherever this house is shown, including its public profile.`;
    open({ title, description, action: scope === "student" ? "student.photo" : `${scope}.logo`, payload: { id }, fields: [fileField], submit: "Upload image" });
  };
}
export function GalleryManager() {
  const { data, open } = useWorkspace();
  const admin = data.role === "admin", eventId = data.season?.id;
  const photos = admin || data.season?.published ? data.gallery : [];
  const caption: Field = { name: "caption", label: "Photo caption", maxLength: 200, full: true, required: true };
  const publish: Field = { name: "publish", label: "Publish in the event gallery", type: "checkbox", full: true, hint: "Public visitors can only see this photo when the event is also published." };
  function upload() { open({ title: "Add a gallery photo", description: "Only upload event images that are approved for publication.", action: "gallery.upload", payload: { eventId }, defaults: { publish: false }, fields: [caption, fileField, publish], submit: "Add photo" }); }
  return <Panel title="Event gallery" description="Manage images for the selected event’s public gallery." action={admin && <button className="btn btn-primary btn-sm" disabled={!eventId} onClick={upload}><ImagePlus size={16} /> Add photo</button>}>
    {photos.length ? <div className="padded tile-grid gallery-grid">{photos.map((photo) => <figure className="panel" key={photo.id}><a href={photo.url} target="_blank" rel="noreferrer" aria-label={`Open photo: ${photo.caption}`}><Image src={photo.url} alt={photo.caption} width={600} height={375} unoptimized /></a><figcaption>{photo.caption}{admin && <div className="gallery-item-actions"><Badge tone={photo.published === false ? "gray" : "green"}>{photo.published === false ? "Draft" : "Published"}</Badge><div className="row-actions"><button className="icon-button" aria-label={`Edit ${photo.caption}`} onClick={() => open({ title: "Edit gallery photo", description: "Change this photo’s caption or publication status.", action: "gallery.save", payload: { eventId, id: photo.id }, defaults: { caption: photo.caption, publish: photo.published !== false }, fields: [caption, publish] })}><Pencil size={15} /></button><button className="icon-button" aria-label={`Remove ${photo.caption}`} onClick={() => open({ title: "Remove gallery photo?", description: "This removes the photo and unpublishes it immediately.", action: "gallery.remove", payload: { eventId, id: photo.id }, danger: true, submit: "Remove photo" })}><Trash2 size={15} /></button></div></div>}</figcaption></figure>)}</div> : <Empty title="No photos in this gallery" hint={admin ? "Add an approved image to publish it for this event." : "Published event photos will appear here."} />}
  </Panel>;
}
