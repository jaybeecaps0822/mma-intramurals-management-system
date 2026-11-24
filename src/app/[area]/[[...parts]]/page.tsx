import { notFound, redirect } from "next/navigation";
import Workspace from "@/components/workspace";
import { getSession } from "@/lib/auth";
import { loadWorkspace } from "@/lib/data";
import { rolesList, type Role } from "@/lib/model";
import { canView } from "@/lib/navigation";

export const dynamic = "force-dynamic";
export default async function ProtectedPage({ params, searchParams }: { params: Promise<{ area: string; parts?: string[] }>; searchParams: Promise<{ event?: string; day?: string; from?: string }> }) {
  const { area, parts = [] } = await params;
  const role = area as Role;
  const section = parts[0] || "overview";
  if (!rolesList.includes(role) || parts.length > 1 || !canView(role, section)) notFound();
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== role) redirect(`/${session.role}`);
  const { event, day, from } = await searchParams;
  return <Workspace section={section} data={await loadWorkspace(session, typeof event === "string" ? event : undefined, typeof day === "string" ? day : undefined, section === "reports" && typeof from === "string" ? from : undefined, section)} />;
}
