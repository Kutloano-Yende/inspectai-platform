"use client";

import { useState } from "react";
import { useRevokeInvitation } from "@/lib/hooks/usePortfolio";
import styles from "./InvitationCard.module.css";

interface InvitationCardProps {
  invitation: any;
  tenancyId: string;
}

export function InvitationCard({ invitation }: InvitationCardProps) {
  const { mutate: revokeInvitation, isPending } = useRevokeInvitation();
  const [confirmRevoke, setConfirmRevoke] = useState(false);

  const expiresAt = new Date(invitation.expiresAt);
  const isExpired = expiresAt < new Date();

  const handleRevoke = () => {
    revokeInvitation(invitation.id, {
      onSuccess: () => setConfirmRevoke(false),
    });
  };

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <div>
          <h3>{invitation.tenantFullName}</h3>
          <p className={styles.email}>{invitation.tenantEmail}</p>
          {invitation.tenantPhone && <p className={styles.phone}>{invitation.tenantPhone}</p>}
        </div>
        <span className={`${styles.status} ${styles[`status-${invitation.status.toLowerCase()}`]}`}>
          {invitation.status}
        </span>
      </div>

      <div className={styles.details}>
        <div>
          <label>Sent</label>
          <p>{new Date(invitation.createdAt).toLocaleDateString()}</p>
        </div>
        <div>
          <label>Expires</label>
          <p className={isExpired ? styles.expired : ""}>{expiresAt.toLocaleDateString()}</p>
        </div>
        {invitation.acceptedAt && (
          <div>
            <label>Accepted</label>
            <p>{new Date(invitation.acceptedAt).toLocaleDateString()}</p>
          </div>
        )}
      </div>

      {invitation.status === "PENDING" && !isExpired && (
        <div className={styles.actions}>
          {!confirmRevoke ? (
            <button
              className={styles.revokeBtn}
              onClick={() => setConfirmRevoke(true)}
              disabled={isPending}
            >
              Revoke Invitation
            </button>
          ) : (
            <>
              <p className={styles.confirmText}>Are you sure?</p>
              <div className={styles.confirmButtons}>
                <button
                  className={styles.cancelBtn}
                  onClick={() => setConfirmRevoke(false)}
                  disabled={isPending}
                >
                  Cancel
                </button>
                <button
                  className={styles.confirmBtn}
                  onClick={handleRevoke}
                  disabled={isPending}
                >
                  {isPending ? "Revoking..." : "Confirm Revoke"}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
