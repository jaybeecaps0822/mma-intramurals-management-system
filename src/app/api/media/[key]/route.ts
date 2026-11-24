import { readMedia } from "@/lib/media";

export const dynamic = "force-dynamic";
export async function GET(_request: Request, { params }: { params: Promise<{ key: string }> }) {
  return readMedia((await params).key);
}
