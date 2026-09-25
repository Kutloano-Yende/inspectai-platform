"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { LoadingState, ErrorState, EmptyState } from "@/components/States";
import { Button } from "@/components/ui/button";
import { CreateTenancyModal } from "./CreateTenancyModal";
import { TenancyCard } from "./TenancyCard";
import type { Tenancy } from "@inspectai/contracts";

interface UnitPageProps {
  params: { id: string };
}

export default function UnitPage({ params }: UnitPageProps) {
  const [showCreateTenancyModal, setShowCreateTenancyModal] = useState(false);

  const { data: tenancies, isLoading, error } = useQuery<Tenancy[]>({
    queryKey: ["unit-tenancies", params.id],
    queryFn: async () => {
      // The API has no "list a unit's tenancies" endpoint yet; creating a tenancy opens its page directly.
      return [];
    },
  });

  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState message={error?.message || "Error loading unit"} />;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight text-navy">Unit Tenancies</h1>
          <p className="text-sm text-muted-foreground">Manage tenants and their tenancy agreements</p>
        </div>
        <Button onClick={() => setShowCreateTenancyModal(true)}>+ New Tenancy</Button>
      </div>

      {!tenancies || tenancies.length === 0 ? (
        <EmptyState message="No tenancies yet. Create one to start managing a tenant." />
      ) : (
        <div className="flex flex-col gap-4">
          {tenancies.map((tenancy) => (
            <TenancyCard key={tenancy.id} tenancy={tenancy} unitId={params.id} />
          ))}
        </div>
      )}

      {showCreateTenancyModal && <CreateTenancyModal unitId={params.id} onClose={() => setShowCreateTenancyModal(false)} />}
    </div>
  );
}
