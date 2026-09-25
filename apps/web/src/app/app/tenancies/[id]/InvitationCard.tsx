"use client";

import { useState } from "react";
import { useRevokeInvitation } from "@/lib/hooks/usePortfolio";
import { InvitationStatusBadge } from "@/components/InvitationStatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardPanel } from "@/components/ui/card";

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
    revokeInvitation(invitation.id, { onSuccess: () => setConfirmRevoke(false) });
  };

  return (
    <Card>
      <CardPanel className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-0.5">
            <h3 className="font-semibold text-navy">{invitation.tenantFullName}</h3>
            <p className="text-sm text-muted-foreground">{invitation.tenantEmail}</p>
            {invitation.tenantPhone && <p className="text-sm text-muted-foreground">{invitation.tenantPhone}</p>}
          </div>
          <InvitationStatusBadge status={invitation.status} />
        </div>

        <dl className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <dt className="text-muted-foreground">Sent</dt>
            <dd className="font-medium">{new Date(invitation.createdAt).toLocaleDateString()}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Expires</dt>
            <dd className={isExpired ? "font-medium text-destructive-foreground" : "font-medium"}>
              {expiresAt.toLocaleDateString()}
            </dd>
          </div>
          {invitation.acceptedAt && (
            <div>
              <dt className="text-muted-foreground">Accepted</dt>
              <dd className="font-medium">{new Date(invitation.acceptedAt).toLocaleDateString()}</dd>
            </div>
          )}
        </dl>

        {invitation.status === "PENDING" && !isExpired && (
          <div className="flex items-center gap-3 border-t pt-4">
            {!confirmRevoke ? (
              <Button variant="destructive-outline" size="sm" onClick={() => setConfirmRevoke(true)} disabled={isPending}>
                Revoke Invitation
              </Button>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">Are you sure?</p>
                <Button variant="outline" size="sm" onClick={() => setConfirmRevoke(false)} disabled={isPending}>
                  Cancel
                </Button>
                <Button variant="destructive" size="sm" onClick={handleRevoke} disabled={isPending}>
                  {isPending ? "Revoking..." : "Confirm Revoke"}
                </Button>
              </>
            )}
          </div>
        )}
      </CardPanel>
    </Card>
  );
}
