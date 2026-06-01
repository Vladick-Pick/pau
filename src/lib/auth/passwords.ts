import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = await deriveScryptHash(password, salt);
  return `scrypt:${salt}:${hash}`;
}

export async function verifyPassword(password: string, storedHash: string) {
  const parts = storedHash.split(":");
  if (parts.length !== 2 && parts.length !== 3) {
    return false;
  }

  const algorithm = parts.length === 3 ? parts[0] : "sha256";
  const salt = parts.length === 3 ? parts[1] : parts[0];
  const expected = parts.length === 3 ? parts[2] : parts[1];
  if (!algorithm || !salt || !expected) {
    return false;
  }

  let actual: string;
  if (algorithm === "scrypt") {
    actual = await deriveScryptHash(password, salt);
  } else if (algorithm === "sha256") {
    actual = createHash("sha256").update(`${salt}:${password}`).digest("hex");
  } else {
    return false;
  }

  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

function deriveScryptHash(password: string, salt: string) {
  return new Promise<string>((resolve, reject) => {
    scrypt(password, salt, 64, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(derivedKey.toString("hex"));
    });
  });
}
