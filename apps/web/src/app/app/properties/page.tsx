"use client";

import Link from "next/link";
import { useState } from "react";
import { useProperties } from "@/lib/hooks/usePortfolio";
import { LoadingState, ErrorState } from "@/components/States";
import { CreatePropertyModal } from "./CreatePropertyModal";
import styles from "./page.module.css";

export default function PropertiesPage() {
  const { data: properties, isLoading, error } = useProperties();
  const [showCreateModal, setShowCreateModal] = useState(false);

  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState message={error.message} />;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1>Properties</h1>
        <button className={styles.createBtn} onClick={() => setShowCreateModal(true)}>
          + New Property
        </button>
      </div>

      {!properties || properties.length === 0 ? (
        <div className={styles.emptyStateCard}>
          <div className={styles.emptyIcon}>🏠</div>
          <h2>No properties yet</h2>
          <p>Get started by creating your first property</p>
          <button className={styles.emptyActionBtn} onClick={() => setShowCreateModal(true)}>
            Create Property
          </button>
        </div>
      ) : (
        <div className={styles.propertyGrid}>
          {properties.map((property) => (
            <Link href={`/app/properties/${property.id}`} key={property.id} className={styles.propertyCard}>
              <h3>{property.displayName}</h3>
              <p className={styles.address}>
                {property.address.line1}
                {property.address.line2 && `, ${property.address.line2}`}
              </p>
              <p className={styles.city}>{property.address.city}, {property.address.province}</p>
              <span className={styles.type}>{property.propertyType}</span>
            </Link>
          ))}
        </div>
      )}

      {showCreateModal && <CreatePropertyModal onClose={() => setShowCreateModal(false)} />}
    </div>
  );
}
