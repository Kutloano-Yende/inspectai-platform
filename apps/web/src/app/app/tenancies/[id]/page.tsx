"use client";

import { useState } from "react";
import { useTenancy } from "@/lib/hooks/usePortfolio";
import { LoadingState, ErrorState } from "@/components/States";
import { Button } from "@/components/ui/button";
import { Card, CardPanel } from "@/components/ui/card";
import { CreateInvitationModal } from "./CreateInvitationModal";
import { InvitationCard } from "./InvitationCard";

interface TenancyPageProps {
  params: { id: string };
}

export default function TenancyPage({ params }: TenancyPageProps) {
  const { data: tenancy, isLoading, error } = useTenancy(params.id);
  const [showCreateInvitationModal, setShowCreateInvitationModal] = useState(false);

  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState message={error.message} />;
  if (!tenancy) return <ErrorState message="Tenancy not found" />;

  const startDate = new Date(tenancy.startDate);
  const endDate = tenancy.endDate ? new Date(tenancy.endDate) : null;
  const invitations = tenancy.invitations || [];
  const activeInvitation = invitations.find((inv: any) => inv.status === "PENDING" || inv.status === "ACCEPTED");

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-navy">Tenancy</h1>
        <p className="text-sm text-muted-foreground">Manage tenant and lease dates</p>
      </div>

      <Card>
        <CardPanel className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold">Lease Dates</h2>
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-muted-foreground">Start Date</dt>
              <dd className="font-medium">{startDate.toLocaleDateString()}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{endDate ? "End Date" : "Status"}</dt>
              <dd className="font-medium">{endDate ? endDate.toLocaleDateString() : "Open-ended"}</dd>
            </div>
          </dl>
        </CardPanel>
      </Card>

      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold">Tenant Invitation</h2>
          {!activeInvitation && (
            <Button size="sm" onClick={() => setShowCreateInvitationModal(true)}>
              + Invite Tenant
            </Button>
          )}
        </div>

        {activeInvitation ? (
          <InvitationCard invitation={activeInvitation} tenancyId={params.id} />
        ) : (
          <Card className="border-dashed">
            <CardPanel className="py-8 text-center text-sm text-muted-foreground">
              No active invitation. Create one to send to a tenant.
            </CardPanel>
          </Card>
        )}
      </section>

      {showCreateInvitationModal && (
        <CreateInvitationModal tenancyId={params.id} onClose={() => setShowCreateInvitationModal(false)} />
      )}
    </div>
  );
}
