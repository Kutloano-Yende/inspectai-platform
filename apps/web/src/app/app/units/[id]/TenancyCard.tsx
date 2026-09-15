"use client";

import Link from "next/link";
import { Tenancy } from "@inspectai/contracts";
import styles from "./TenancyCard.module.css";

interface TenancyCardProps {
  tenancy: Tenancy & { invitations?: any[] };
  unitId: string;
}

export function TenancyCard({ tenancy }: TenancyCardProps) {
  const startDate = new Date(tenancy.startDate);
  const endDate = tenancy.endDate ? new Date(tenancy.endDate) : null;
  const invitations = tenancy.invitations || [];
  const hasInvitation = invitations.length > 0;
  const invitation = hasInvitation ? invitations[0] : null;

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <div>
          <h3 className={styles.title}>
            {invitation?.tenantFullName || "Unassigned"}
          </h3>
          {invitation?.tenantEmail && (
            <p className={styles.email}>{invitation.tenantEmail}</p>
          )}
        </div>
        {invitation && (
          <span className={`${styles.status} ${styles[`status-${invitation.status.toLowerCase()}`]}`}>
            {invitation.status}
          </span>
        )}
      </div>

      <div className={styles.dates}>
        <span>Start: {startDate.toLocaleDateString()}</span>
        {endDate && <span>End: {endDate.toLocaleDateString()}</span>}
      </div>

      <Link href={`/app/tenancies/${tenancy.id}`} className={styles.manageLink}>
        Manage Tenancy →
      </Link>
    </div>
  );
}
