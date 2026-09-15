export type InvitationStatusLike = "PENDING" | "ACCEPTED" | "EXPIRED" | "REVOKED";

export class InvitationNotUsableError extends Error {}

/**
 * An invitation token may drive tenant flows only while PENDING and unexpired.
 * Terminal states (ACCEPTED/EXPIRED/REVOKED) fail permanently.
 */
export function assertInvitationUsable(status: InvitationStatusLike, now: Date, expiresAt: Date): void {
  if (status === "ACCEPTED") throw new InvitationNotUsableError("Invitation already accepted");
  if (status === "REVOKED") throw new InvitationNotUsableError("Invitation revoked");
  if (status === "EXPIRED" || now >= expiresAt) {
    throw new InvitationNotUsableError("Invitation expired");
  }
}
