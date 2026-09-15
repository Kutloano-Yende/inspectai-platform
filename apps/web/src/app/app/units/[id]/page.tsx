"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { LoadingState, ErrorState, EmptyState } from "@/components/States";
import { CreateTenancyModal } from "./CreateTenancyModal";
import { TenancyCard } from "./TenancyCard";
import styles from "./page.module.css";
import type { Tenancy } from "@inspectai/contracts";

interface UnitPageProps {
  params: { id: string };
}

export default function UnitPage({ params }: UnitPageProps) {
  const [showCreateTenancyModal, setShowCreateTenancyModal] = useState(false);

  const { data: tenancies, isLoading, error } = useQuery<Tenancy[]>({
    queryKey: ["unit-tenancies", params.id],
    queryFn: async () => {
      // We need a way to get unit tenancies - for now this would need an endpoint
      // that lists tenancies for a unit
      return [];
    },
  });

  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState message={error?.message || "Error loading unit"} />;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h1>Unit Tenancies</h1>
          <p className={styles.subtitle}>Manage tenants and their tenancy agreements</p>
        </div>
        <button className={styles.createBtn} onClick={() => setShowCreateTenancyModal(true)}>
          + New Tenancy
        </button>
      </div>

      <div className={styles.content}>
        {!tenancies || tenancies.length === 0 ? (
          <EmptyState message="No tenancies yet. Create one to start managing a tenant." />
        ) : (
          <div className={styles.tenanciesList}>
            {tenancies.map((tenancy) => (
              <TenancyCard key={tenancy.id} tenancy={tenancy} unitId={params.id} />
            ))}
          </div>
        )}
      </div>

      {showCreateTenancyModal && (
        <CreateTenancyModal unitId={params.id} onClose={() => setShowCreateTenancyModal(false)} />
      )}
    </div>
  );
}
