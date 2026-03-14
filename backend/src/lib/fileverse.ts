import { createHash } from "crypto";
import { fail } from "@/lib/errors";

type UploadInput = {
  file: Buffer;
  filename: string;
  mimeType: string;
};

export type FileverseUploadResult = {
  docId: string;
  storageRef: string;
  contentHash: string;
  byteSize: number;
  mimeType: string;
  filename: string;
};

const getConfig = () => {
  const baseUrl = process.env.FILEVERSE_BASE_URL || "https://api.fileverse.io";
  const apiKey = process.env.FILEVERSE_API_KEY;
  const timeoutMs = Number(process.env.FILEVERSE_TIMEOUT_MS || 15000);

  if (!apiKey) throw fail("FILEVERSE_API_KEY is not configured", 500);

  return { baseUrl, apiKey, timeoutMs };
};

export const sha256Hex = (file: Buffer | Uint8Array) =>
  createHash("sha256").update(file).digest("hex");

const requestWithRetry = async (
  path: string,
  init: RequestInit,
  retries = 2,
): Promise<Response> => {
  const { baseUrl, apiKey, timeoutMs } = getConfig();
  let attempt = 0;
  let lastErr: unknown;

  while (attempt <= retries) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(`${baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          ...(init.headers || {}),
        },
      });
      clearTimeout(timer);

      if (res.ok) return res;
      if (res.status >= 500 && attempt < retries) {
        attempt += 1;
        continue;
      }

      const text = await res.text();
      throw fail(`Fileverse request failed (${res.status}): ${text}`, 502);
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      if (attempt >= retries) break;
      attempt += 1;
    }
  }

  throw fail(`Fileverse request failed: ${String(lastErr)}`, 502);
};

export const uploadBuffer = async ({
  file,
  filename,
  mimeType,
}: UploadInput): Promise<FileverseUploadResult> => {
  const form = new FormData();
  const blob = new Blob([new Uint8Array(file)], { type: mimeType });
  form.append("file", blob, filename);

  const res = await requestWithRetry("/v1/files", {
    method: "POST",
    body: form,
  });

  const data = (await res.json()) as {
    id?: string;
    url?: string;
    storageRef?: string;
  };
  const docId = data.id;
  const storageRef = data.storageRef || data.url;

  if (!docId || !storageRef) {
    throw fail("Invalid Fileverse upload response", 502);
  }

  const computedHash = sha256Hex(file);
  const responseHash =
    (data as { contentHash?: string; hash?: string }).contentHash ||
    (data as { contentHash?: string; hash?: string }).hash;

  if (
    responseHash &&
    responseHash.toLowerCase() !== computedHash.toLowerCase()
  ) {
    throw fail("Fileverse hash mismatch detected", 502);
  }

  return {
    docId,
    storageRef,
    contentHash: computedHash,
    byteSize: file.byteLength,
    mimeType,
    filename,
  };
};

export const getDocument = async (docId: string) => {
  const res = await requestWithRetry(`/v1/files/${docId}`, { method: "GET" });
  return res.json();
};
