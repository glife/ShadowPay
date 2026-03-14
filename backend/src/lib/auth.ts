import { randomUUID } from "crypto";
import { SignJWT, jwtVerify } from "jose";
import { SiweMessage } from "siwe";
import { fail } from "@/lib/errors";

type NonceRecord = {
  nonce: string;
  expiresAt: number;
};

const nonceStore = new Map<string, NonceRecord>();
const NONCE_TTL_MS = 5 * 60 * 1000;

export type AuthTokenPayload = {
  sub: string;
  walletAddress: string;
};

const getJwtSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw fail("Missing JWT_SECRET", 500);
  return new TextEncoder().encode(secret);
};

export const issueNonce = (walletAddress: string) => {
  const nonce = randomUUID();
  nonceStore.set(walletAddress.toLowerCase(), {
    nonce,
    expiresAt: Date.now() + NONCE_TTL_MS,
  });
  return nonce;
};

export const consumeNonce = (walletAddress: string, nonce: string) => {
  const key = walletAddress.toLowerCase();
  const rec = nonceStore.get(key);
  if (!rec) return false;
  const valid = rec.nonce === nonce && rec.expiresAt > Date.now();
  nonceStore.delete(key);
  return valid;
};

export const signToken = async (payload: AuthTokenPayload) => {
  const expiresIn = process.env.JWT_EXPIRES_IN || "7d";
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(getJwtSecret());
};

export const verifyToken = async (token: string): Promise<AuthTokenPayload> => {
  const { payload } = await jwtVerify(token, getJwtSecret());
  if (!payload.sub || !payload.walletAddress) throw fail("Invalid token payload", 401);

  return {
    sub: payload.sub as string,
    walletAddress: payload.walletAddress as string,
  };
};

export const verifySiwe = async (message: string, signature: string, expectedNonce: string) => {
  const siwe = new SiweMessage(message);
  const domain = process.env.SIWE_DOMAIN || "localhost";
  const origin = process.env.SIWE_ORIGIN || "http://localhost:3000";

  const result = await siwe.verify({
    signature,
    domain,
    nonce: expectedNonce,
    time: new Date().toISOString(),
  });

  if (!result.success) throw fail("SIWE verification failed", 401);
  if (siwe.uri !== origin) throw fail("Invalid SIWE origin", 401);

  return siwe.address.toLowerCase();
};

export const getBearerToken = (authHeader: string | null) => {
  if (!authHeader) throw fail("Missing Authorization header", 401);
  const [scheme, token] = authHeader.split(" ");
  if (scheme !== "Bearer" || !token) throw fail("Invalid Authorization header", 401);
  return token;
};
