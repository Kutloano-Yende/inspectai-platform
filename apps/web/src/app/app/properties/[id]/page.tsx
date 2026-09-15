"use client";

import { useState } from "react";
import { useProperty } from "@/lib/hooks/usePortfolio";
import { LoadingState, ErrorState } from "@/components/States";
import { CreateUnitModal } from "./CreateUnitModal";
import { UnitsSection } from "./UnitsSection";
import styles from "./page.module.css";

interface PropertyPageProps {
  params: { id: string };
}

export default function PropertyPage({ params }: PropertyPageProps) {
  const { data: property, isLoading, error } = useProperty(params.id);
  const [showCreateUnitModal, setShowCreateUnitModal] = useState(false);

  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState message={error.message} />;
  if (!property) return <ErrorState message="Property not found" />;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h1>{property.displayName}</h1>
          <p className={styles.address}>
            {property.address.line1}
            {property.address.line2 && `, ${property.address.line2}`}
          </p>
          <p className={styles.city}>{property.address.city}, {property.address.province} {property.address.postalCode}</p>
        </div>
        <span className={styles.type}>{property.propertyType}</span>
      </div>

      <div className={styles.content}>
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2>Units</h2>
            <button className={styles.addBtn} onClick={() => setShowCreateUnitModal(true)}>
              + Add Unit
            </button>
          </div>

          {property.units && property.units.length > 0 ? (
            <UnitsSection units={property.units} propertyId={property.id} />
          ) : (
            <div className={styles.emptyState}>
              <p>No units yet. Create your first unit to start managing tenancies.</p>
              <button className={styles.emptyActionBtn} onClick={() => setShowCreateUnitModal(true)}>
                Add First Unit
              </button>
            </div>
          )}
        </div>
      </div>

      {showCreateUnitModal && (
        <CreateUnitModal propertyId={property.id} onClose={() => setShowCreateUnitModal(false)} />
      )}
    </div>
  );
}
