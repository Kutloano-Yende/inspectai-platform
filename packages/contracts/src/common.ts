import { z } from "zod";

/** CUID-style identifier. All entity ids are opaque strings. */
export const Id = z.string().min(1).brand<"Id">();
export type Id = z.infer<typeof Id>;

export const Uuid = z.string().uuid();

/** ISO-8601 UTC timestamp string. */
export const IsoDateTime = z.string().datetime({ offset: true });
export type IsoDateTime = z.infer<typeof IsoDateTime>;

/** RFC 7807 problem+json error envelope. All API errors use this shape. */
export const ProblemDetail = z.object({
  type: z.string().url().default("about:blank"),
  title: z.string(),
  status: z.number().int().min(400).max(599),
  detail: z.string().optional(),
  /** Machine-readable error code from the contracts error-code registry. */
  code: z.string(),
  instance: z.string().optional(),
});
export type ProblemDetail = z.infer<typeof ProblemDetail>;

/** Cursor pagination request/response. */
export const PageQuery = z.object({
  limit: z.number().int().min(1).max(100).default(25),
  cursor: z.string().optional(),
});
export type PageQuery = z.infer<typeof PageQuery>;

export const Page = <T extends z.ZodTypeAny>(item: T) =>
  z.object({
    items: z.array(item),
    nextCursor: z.string().nullable(),
  });
