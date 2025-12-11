// lib/password.ts

import crypto from "crypto";

const SCRYPT_CONFIG = {
  N: 16384,
  r: 16,
  p: 1,
  keyLength: 64,
  maxmem: 128 * 16384 * 16 * 2,
};

export function getScryptConfig() {
  return SCRYPT_CONFIG;
}

export function hashPassword(password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const normalized = password.normalize("NFKC");
    const salt = crypto.randomBytes(16).toString("hex");

    crypto.scrypt(
      normalized,
      salt,
      SCRYPT_CONFIG.keyLength,
      {
        N: SCRYPT_CONFIG.N,
        r: SCRYPT_CONFIG.r,
        p: SCRYPT_CONFIG.p,
        maxmem: SCRYPT_CONFIG.maxmem,
      },
      (err, derivedKey) => {
        if (err) return reject(err);
        resolve(`${salt}:${derivedKey.toString("hex")}`);
      }
    );
  });
}

export function verifyPassword(
  password: string,
  hashed: string | null | undefined
): Promise<boolean> {
  return new Promise((resolve) => {
    if (!hashed) {
      return resolve(false);
    }

    const [salt, storedKey] = hashed.split(":");
    if (!salt || !storedKey) {
      return resolve(false);
    }

    const normalized = password.normalize("NFKC");
    const storedBuffer = Buffer.from(storedKey, "hex");

    crypto.scrypt(
      normalized,
      salt,
      SCRYPT_CONFIG.keyLength,
      {
        N: SCRYPT_CONFIG.N,
        r: SCRYPT_CONFIG.r,
        p: SCRYPT_CONFIG.p,
        maxmem: SCRYPT_CONFIG.maxmem,
      },
      (err, derivedKey) => {
        if (err) return resolve(false);
        if (derivedKey.length !== storedBuffer.length) {
          return resolve(false);
        }

        try {
          const match = crypto.timingSafeEqual(derivedKey, storedBuffer);
          resolve(match);
        } catch {
          resolve(false);
        }
      }
    );
  });
}
