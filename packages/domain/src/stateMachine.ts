import { INSPECTION_TRANSITIONS, InspectionStatus } from "@inspectai/contracts";
import type { InspectionStatus as Status } from "@inspectai/contracts";

export class InvalidTransitionError extends Error {
  constructor(
    readonly from: Status,
    readonly to: Status,
  ) {
    super(`Illegal inspection transition ${from} → ${to}`);
  }
}

export function canTransition(from: Status, to: Status): boolean {
  return INSPECTION_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertTransition(from: Status, to: Status): void {
  if (!InspectionStatus.safeParse(from).success || !InspectionStatus.safeParse(to).success) {
    throw new InvalidTransitionError(from, to);
  }
  if (!canTransition(from, to)) throw new InvalidTransitionError(from, to);
}
