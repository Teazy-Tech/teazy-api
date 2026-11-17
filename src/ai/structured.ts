import { z } from "zod";

/**
 * Helpers for schema-first AI output (AI-03): pull JSON out of a model reply,
 * apply light generic repairs, then validate with Zod.
 */

export type Repair = (value: unknown) => unknown;

export type ParseOutcome<T> = { ok: true; data: T } | { ok: false; issues: string[] };

const MAX_ISSUES = 10;

/** Strips code fences and any text around the outermost JSON object or array. */
export function extractJson(text: string): string {
  const unfenced = text
    .replace(/```(?:json)?\s*/gi, "")
    .replace(/```/g, "")
    .trim();
  const start = unfenced.search(/[[{]/);
  if (start === -1) return unfenced;
  const close = unfenced[start] === "{" ? "}" : "]";
  const end = unfenced.lastIndexOf(close);
  return end > start ? unfenced.slice(start, end + 1) : unfenced.slice(start);
}

/** Removes trailing commas before a closing bracket, the most common JSON slip. */
function withoutTrailingCommas(json: string): string {
  return json.replace(/,\s*([}\]])/g, "$1");
}

function parseJson(text: string): { ok: true; value: unknown } | { ok: false } {
  const candidate = extractJson(text);
  for (const attempt of [candidate, withoutTrailingCommas(candidate)]) {
    try {
      return { ok: true, value: JSON.parse(attempt) as unknown };
    } catch {
      // try the next repair
    }
  }
  return { ok: false };
}

/** Paths and messages only; never the offending values, which may be student text. */
export function describeIssues(error: z.ZodError): string[] {
  return error.issues.slice(0, MAX_ISSUES).map((issue) => {
    const path = issue.path.length ? issue.path.join(".") : "(root)";
    return `${path}: ${issue.message}`;
  });
}

export function parseStructured<T>(
  text: string,
  schema: z.ZodType<T>,
  repair?: Repair,
): ParseOutcome<T> {
  const parsed = parseJson(text);
  if (!parsed.ok) return { ok: false, issues: ["(root): reply is not valid JSON"] };
  let value = parsed.value;
  if (repair) {
    try {
      value = repair(value);
    } catch {
      return { ok: false, issues: ["(root): repair step failed"] };
    }
  }
  const result = schema.safeParse(value);
  return result.success
    ? { ok: true, data: result.data }
    : { ok: false, issues: describeIssues(result.error) };
}

/** JSON Schema for providers that can enforce it natively; undefined if Zod cannot express it. */
export function toProviderSchema(schema: z.ZodType): Record<string, unknown> | undefined {
  try {
    const json = z.toJSONSchema(schema, { unrepresentable: "throw" }) as Record<string, unknown>;
    delete json.$schema;
    return json;
  } catch {
    return undefined;
  }
}

/** The follow-up message for the single retry, with the validation errors attached. */
export function retryInstruction(issues: string[]): string {
  return [
    "Your previous reply did not match the required JSON format.",
    "Problems found:",
    ...issues.map((issue) => `- ${issue}`),
    "Reply again with only the corrected JSON object. No markdown, no commentary.",
  ].join("\n");
}
