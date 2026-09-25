"use client";

import Link from "next/link";
import { Unit } from "@inspectai/contracts";
import { Card, CardPanel } from "@/components/ui/card";

interface UnitsSectionProps {
  units: Unit[];
  propertyId: string;
}

export function UnitsSection({ units }: UnitsSectionProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {units.map((unit) => (
        <Card key={unit.id}>
          <CardPanel className="flex flex-col gap-2">
            <h3 className="font-semibold text-navy">{unit.label}</h3>
            {unit.bedrooms !== undefined || unit.bathrooms !== undefined ? (
              <p className="text-sm text-muted-foreground">
                {unit.bedrooms !== undefined && `${unit.bedrooms} bed${unit.bedrooms !== 1 ? "s" : ""}`}
                {unit.bedrooms !== undefined && unit.bathrooms !== undefined && " • "}
                {unit.bathrooms !== undefined && `${unit.bathrooms} bath${unit.bathrooms !== 1 ? "s" : ""}`}
              </p>
            ) : null}
            <Link href={`/app/units/${unit.id}`} className="text-sm font-medium text-primary hover:underline">
              Manage Tenancies →
            </Link>
          </CardPanel>
        </Card>
      ))}
    </div>
  );
}
