import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const options = { N: 32768, r: 8, p: 2, maxmem: 96 * 1024 * 1024 };
const stretch = (password: string, salt: string) => new Promise<Buffer>((resolve, reject) => {
  scrypt(password, salt, 64, options, (error, key) => error ? reject(error) : resolve(key));
});

export const DUMMY_HASH = `scrypt-v1$${"0".repeat(32)}$${"0".repeat(128)}`;
export const validUsername = (value: string) => /^[a-z\d][a-z\d_.@-]{2,79}$/.test(value);
export const normalizeUsername = (value: string) => value.trim().toLowerCase();
export const validPassword = (value: string) => value.length >= 12 && Buffer.byteLength(value) <= 256 && value.trim().length > 0;

export async function hashPassword(password: string) {
  if (!validPassword(password)) throw new Error("Use a password with at least 12 characters and at most 256 bytes.");
  const salt = randomBytes(16).toString("hex");
  return `scrypt-v1$${salt}$${(await stretch(password, salt)).toString("hex")}`;
}
export async function verifyPassword(password: string, encoded: string) {
  if (Buffer.byteLength(password) > 256) return false;
  const valid = /^scrypt-v1\$[a-f\d]{32}\$[a-f\d]{128}$/.test(encoded);
  const [, salt, digest] = (valid ? encoded : DUMMY_HASH).split("$");
  return timingSafeEqual(await stretch(password, salt), Buffer.from(digest, "hex")) && valid;
}
