import { eq, and } from "drizzle-orm";
import { db } from "@/db";
import { users, authSessions } from "@/db/schema";
import { hashPassword, validPassword } from "@/lib/password";

async function main() {
  const password = process.env.MMA_ADMIN_PASSWORD;

  if (!password || !validPassword(password)) {
    throw new Error("A valid password of at least 12 characters is required.");
  }

  const passwordHash = await hashPassword(password);

  await db.transaction(async (tx) => {
    const [admin] = await tx
      .update(users)
      .set({ passwordHash, updatedAt: new Date() })
      .where(and(eq(users.username, "admin"), eq(users.role, "admin")))
      .returning({ id: users.id });

    if (!admin) {
      throw new Error("Admin account not found. No password was changed.");
    }

    await tx.delete(authSessions).where(eq(authSessions.userId, admin.id));
  });

  console.log("Administrator password reset successfully.");
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
