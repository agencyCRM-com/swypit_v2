import { NextResponse } from "next/server";
import { ZodType } from "zod";

export async function parseRequestBody<T>(request: Request, schema: ZodType<T>) {
  const json = (await request.json()) as unknown;
  return schema.parse(json);
}

export function ok(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function fail(error: unknown, status = 400) {
  const message = error instanceof Error ? error.message : "Unexpected error.";
  return NextResponse.json({ error: message }, { status });
}
