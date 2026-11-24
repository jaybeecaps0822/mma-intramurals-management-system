import { notFound, redirect } from "next/navigation";
import Workspace from "@/components/workspace";
import { demoWorkspace } from "@/lib/demo";
import { rolesList, type Role } from "@/lib/model";
import { canView } from "@/lib/navigation";

export default async function PreviewPage({ params, searchParams }: { params: Promise<{ role: string; parts?: string[] }>; searchParams: Promise<{ event?: string; day?: string; from?: string }> }) {
  const { role: value, parts = [] } = await params;
  const role = value as Role;
  const section = parts[0] || "overview";
  if (!rolesList.includes(role) || parts.length > 1 || !canView(role, section)) notFound();
  if (role === "admin" && section === "overview") redirect("/");
  const { event, day, from } = await searchParams;
  return <Workspace section={section} data={demoWorkspace(role, typeof event === "string" ? event : undefined, typeof day === "string" ? day : undefined, typeof from === "string" ? from : undefined)} />;
}
