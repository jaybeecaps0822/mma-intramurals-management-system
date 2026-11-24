import { apiError, AppError, assertOrigin, signIn, signOut } from "@/lib/auth";

export async function POST(request: Request, context: { params: Promise<{ action: string }> }) {
  try {
    const { action } = await context.params;
    if (action === "logout") return await signOut(request);
    if (action !== "login") throw new AppError(404, "This endpoint does not exist.");
    assertOrigin(request);
    if (!request.headers.get("content-type")?.startsWith("application/json")) throw new AppError(415, "Expected a JSON request.");
    if (Number(request.headers.get("content-length")) > 4096) throw new AppError(413, "The sign-in request is too large.");
    const body = await request.json().catch(() => null);
    if (!body || typeof body.username !== "string" || typeof body.password !== "string" || body.username.length > 100) throw new AppError(400, "Enter your username and password.");
    return await signIn(request, body.username, body.password);
  } catch (error) { return apiError(error); }
}
