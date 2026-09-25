"use client";

import Link from "next/link";
import { useState } from "react";
import { useProperties } from "@/lib/hooks/usePortfolio";
import { LoadingState, ErrorState } from "@/components/States";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardPanel } from "@/components/ui/card";
import { CreatePropertyModal } from "./CreatePropertyModal";

export default function PropertiesPage() {
  const { data: properties, isLoading, error } = useProperties();
  const [showCreateModal, setShowCreateModal] = useState(false);

  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState message={error.message} />;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold tracking-tight text-navy">Properties</h1>
        <Button onClick={() => setShowCreateModal(true)}>+ New Property</Button>
      </div>

      {!properties || properties.length === 0 ? (
        <Card className="border-dashed">
          <CardPanel className="flex flex-col items-center gap-3 py-12 text-center">
            <h2 className="text-lg font-semibold">No properties yet</h2>
            <p className="text-sm text-muted-foreground">Get started by creating your first property</p>
            <Button onClick={() => setShowCreateModal(true)}>Create Property</Button>
          </CardPanel>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {properties.map((property) => (
            <Link href={`/app/properties/${property.id}`} key={property.id} className="block">
              <Card className="h-full transition-shadow hover:shadow-md">
                <CardPanel className="flex flex-col gap-1.5">
                  <h3 className="font-semibold text-navy">{property.displayName}</h3>
                  <p className="text-sm text-muted-foreground">
                    {property.address.line1}
                    {property.address.line2 && `, ${property.address.line2}`}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {property.address.city}, {property.address.province}
                  </p>
                  <div className="pt-1">
                    <Badge variant="secondary">{property.propertyType}</Badge>
                  </div>
                </CardPanel>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {showCreateModal && <CreatePropertyModal onClose={() => setShowCreateModal(false)} />}
    </div>
  );
}
