"use client";

import { useState } from "react";
import { useTenancy } from "@/lib/hooks/usePortfolio";
import { LoadingState, ErrorState } from "@/components/States";
import { CreateInvitationModal } from "./CreateInvitationModal";
import { InvitationCard } from "./InvitationCard";
import styles from "./page.module.css";

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
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h1>Tenancy</h1>
          <p className={styles.subtitle}>Manage tenant and lease dates</p>
        </div>
      </div>

      <div className={styles.card}>
        <h2>Lease Dates</h2>
        <div className={styles.dates}>
          <div>
            <label>Start Date</label>
            <p>{startDate.toLocaleDateString()}</p>
          </div>
          {endDate && (
            <div>
              <label>End Date</label>
              <p>{endDate.toLocaleDateString()}</p>
            </div>
          )}
          {!endDate && (
            <div>
              <label>Status</label>
              <p>Open-ended</p>
            </div>
          )}
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2>Tenant Invitation</h2>
          {!activeInvitation && (
            <button className={styles.createBtn} onClick={() => setShowCreateInvitationModal(true)}>
              + Invite Tenant
            </button>
          )}
        </div>

        {activeInvitation ? (
          <InvitationCard invitation={activeInvitation} tenancyId={params.id} />
        ) : (
          <div className={styles.emptyState}>
            <p>No active invitation. Create one to send to a tenant.</p>
          </div>
        )}
      </div>

      {showCreateInvitationModal && (
        <CreateInvitationModal tenancyId={params.id} onClose={() => setShowCreateInvitationModal(false)} />
      )}
    </div>
  );
}
