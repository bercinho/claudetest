import crypto from "node:crypto";

/** PIN hashing with scrypt. Kept free of Next.js imports so scripts can use it too. */

export function hashPin(pin: string): string {
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(pin.normalize("NFKC"), salt, 32);
  return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
}

export function verifyPin(pin: string, stored: string): boolean {
  const [scheme, saltHex, hashHex] = stored.split("$");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = crypto.scryptSync(pin.normalize("NFKC"), Buffer.from(saltHex, "hex"), expected.length);
  return crypto.timingSafeEqual(expected, actual);
}

export function isValidPin(pin: string): boolean {
  return /^\d{4,8}$/.test(pin);
}
