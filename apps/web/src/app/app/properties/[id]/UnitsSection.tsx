"use client";

import Link from "next/link";
import { Unit } from "@inspectai/contracts";
import styles from "./UnitsSection.module.css";

interface UnitsSectionProps {
  units: Unit[];
  propertyId: string;
}

export function UnitsSection({ units }: UnitsSectionProps) {
  return (
    <div className={styles.unitsGrid}>
      {units.map((unit) => (
        <div key={unit.id} className={styles.unitCard}>
          <h3>{unit.label}</h3>
          {unit.bedrooms !== undefined || unit.bathrooms !== undefined ? (
            <p className={styles.specs}>
              {unit.bedrooms !== undefined && `${unit.bedrooms} bed${unit.bedrooms !== 1 ? 's' : ''}`}
              {unit.bedrooms !== undefined && unit.bathrooms !== undefined && ' • '}
              {unit.bathrooms !== undefined && `${unit.bathrooms} bath${unit.bathrooms !== 1 ? 's' : ''}`}
            </p>
          ) : null}
          <Link href={`/app/units/${unit.id}`} className={styles.viewLink}>
            Manage Tenancies →
          </Link>
        </div>
      ))}
    </div>
  );
}
