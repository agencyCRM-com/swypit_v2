import { NextResponse } from "next/server";
import { ZodError, ZodType } from "zod";

export async function parseRequestBody<T>(request: Request, schema: ZodType<T>) {
  const json = (await request.json()) as unknown;
  return schema.parse(json);
}

export function ok(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

function serializeError(error: unknown) {
  if (error instanceof ZodError) {
    return {
      type: "ZodError",
      message: error.message,
      issues: error.issues,
    };
  }

  if (error instanceof Error) {
    return {
      type: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return {
    type: typeof error,
    value: error,
  };
}

export function fail(error: unknown, status = 400) {
  const details = serializeError(error);
  const message =
    error instanceof ZodError
      ? `Validation failed: ${error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join(", ")}`
      : error instanceof Error
        ? error.message
        : "Unexpected error.";

  console.error("[api.fail]", details);

  return NextResponse.json({ error: message }, { status });
}
