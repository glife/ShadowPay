import { NextResponse } from "next/server";
import { toErrorResponse } from "@/lib/errors";

export const json = (data: unknown, status = 200) => {
  return NextResponse.json(JSON.parse(JSON.stringify(data)), { status });
};

export const withErrorHandling = async <T>(fn: () => Promise<T>) => {
  try {
    return await fn();
  } catch (error) {
    const { status, body } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
};
