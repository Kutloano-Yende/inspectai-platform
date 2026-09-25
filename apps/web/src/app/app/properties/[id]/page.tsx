"use client";

import { useState } from "react";
import { useProperty } from "@/lib/hooks/usePortfolio";
import { LoadingState, ErrorState } from "@/components/States";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardPanel } from "@/components/ui/card";
import { CreateUnitModal } from "./CreateUnitModal";
import { UnitsSection } from "./UnitsSection";

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
    <div className="flex flex-col gap-8">
      <Card>
        <CardPanel className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-bold tracking-tight text-navy">{property.displayName}</h1>
            <p className="text-sm text-muted-foreground">
              {property.address.line1}
              {property.address.line2 && `, ${property.address.line2}`}
            </p>
            <p className="text-sm text-muted-foreground">
              {property.address.city}, {property.address.province} {property.address.postalCode}
            </p>
          </div>
          <Badge variant="secondary">{property.propertyType}</Badge>
        </CardPanel>
      </Card>

      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold">Units</h2>
          <Button size="sm" onClick={() => setShowCreateUnitModal(true)}>
            + Add Unit
          </Button>
        </div>

        {property.units && property.units.length > 0 ? (
          <UnitsSection units={property.units} propertyId={property.id} />
        ) : (
          <Card className="border-dashed">
            <CardPanel className="flex flex-col items-center gap-3 py-10 text-center">
              <p className="text-sm text-muted-foreground">
                No units yet. Create your first unit to start managing tenancies.
              </p>
              <Button onClick={() => setShowCreateUnitModal(true)}>Add First Unit</Button>
            </CardPanel>
          </Card>
        )}
      </section>

      {showCreateUnitModal && <CreateUnitModal propertyId={property.id} onClose={() => setShowCreateUnitModal(false)} />}
    </div>
  );
}
