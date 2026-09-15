/** Freshness window: capturedAt must fall within [nonceIssuedAt - skew, now]. */
export const CAPTURE_MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes
export const CAPTURE_CLOCK_SKEW_MS = 2 * 60 * 1000; // device clocks may drift

export function isCaptureFresh(capturedAt: Date, nonceIssuedAt: Date, now: Date): boolean {
  const age = now.getTime() - capturedAt.getTime();
  return (
    age <= CAPTURE_MAX_AGE_MS + CAPTURE_CLOCK_SKEW_MS &&
    capturedAt.getTime() >= nonceIssuedAt.getTime() - CAPTURE_CLOCK_SKEW_MS
  );
}

/** Photos must be at least this size to be analysable. */
export const MIN_PHOTO_DIMENSION_PX = 480;

export function isQualityAcceptable(widthPx?: number, heightPx?: number): boolean {
  if (widthPx == null || heightPx == null) return true; // metadata absent: verify later passes; do not fabricate a failure
  return widthPx >= MIN_PHOTO_DIMENSION_PX && heightPx >= MIN_PHOTO_DIMENSION_PX;
}

/**
 * Duplicate detection (FR-007): the same content hash must not be committed twice
 * within one inspection. Scope is per-inspection, not global — the same photo may
 * legitimately appear in different inspections.
 */
export function isDuplicateWithinInspection(
  contentSha256: string,
  existingHashes: readonly string[],
): boolean {
  return existingHashes.includes(contentSha256);
}
