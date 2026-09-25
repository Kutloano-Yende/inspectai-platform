"use client";

import Link from "next/link";
import { Tenancy } from "@inspectai/contracts";
import { InvitationStatusBadge } from "@/components/InvitationStatusBadge";
import { Card, CardPanel } from "@/components/ui/card";

interface TenancyCardProps {
  tenancy: Tenancy & { invitations?: any[] };
  unitId: string;
}

export function TenancyCard({ tenancy }: TenancyCardProps) {
  const startDate = new Date(tenancy.startDate);
  const endDate = tenancy.endDate ? new Date(tenancy.endDate) : null;
  const invitation = tenancy.invitations?.[0] ?? null;

  return (
    <Card>
      <CardPanel className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-0.5">
            <h3 className="font-semibold text-navy">{invitation?.tenantFullName || "Unassigned"}</h3>
            {invitation?.tenantEmail && <p className="text-sm text-muted-foreground">{invitation.tenantEmail}</p>}
          </div>
          {invitation && <InvitationStatusBadge status={invitation.status} />}
        </div>

        <div className="flex gap-4 text-sm text-muted-foreground">
          <span>Start: {startDate.toLocaleDateString()}</span>
          {endDate && <span>End: {endDate.toLocaleDateString()}</span>}
        </div>

        <Link href={`/app/tenancies/${tenancy.id}`} className="text-sm font-medium text-primary hover:underline">
          Manage Tenancy →
        </Link>
      </CardPanel>
    </Card>
  );
}
