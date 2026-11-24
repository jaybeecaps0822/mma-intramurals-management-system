import { redirect } from "next/navigation";
import Workspace from "@/components/workspace";
import { getSession } from "@/lib/auth";
import { demoWorkspace } from "@/lib/demo";

export const dynamic = "force-dynamic";
export default async function HomePage({ searchParams }: { searchParams: Promise<{ event?: string; day?: string }> }) {
  const session = await getSession();
  if (session) redirect(`/${session.role}`);
  const { event, day } = await searchParams;
  return <Workspace data={demoWorkspace("admin", typeof event === "string" ? event : undefined, typeof day === "string" ? day : undefined)} />;
}
