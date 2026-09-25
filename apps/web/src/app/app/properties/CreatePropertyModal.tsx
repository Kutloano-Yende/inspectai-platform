"use client";

import { Controller, useForm } from "react-hook-form";
import { useCreateProperty } from "@/lib/hooks/usePortfolio";
import { CreatePropertyRequest } from "@inspectai/contracts";
import { FormDialog } from "@/components/FormDialog";
import { FormField } from "@/components/FormField";
import { Input } from "@/components/ui/input";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "@/components/ui/select";

interface CreatePropertyModalProps {
  onClose: () => void;
}

const PROPERTY_TYPES = [
  { value: "RESIDENTIAL", label: "Residential" },
  { value: "COMMERCIAL", label: "Commercial" },
];

export function CreatePropertyModal({ onClose }: CreatePropertyModalProps) {
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<CreatePropertyRequest>({
    defaultValues: {
      displayName: "",
      propertyType: "RESIDENTIAL",
      address: { line1: "", city: "", province: "", postalCode: "", country: "ZA" },
    },
  });

  const { mutate: createProperty, isPending, error } = useCreateProperty();

  const onSubmit = (data: CreatePropertyRequest) => {
    createProperty(data, {
      onSuccess: () => {
        reset();
        onClose();
      },
    });
  };

  return (
    <FormDialog
      title="Create Property"
      submitLabel="Create Property"
      pendingLabel="Creating..."
      isPending={isPending}
      error={error?.message}
      onClose={onClose}
      onSubmit={handleSubmit(onSubmit)}
    >
      <FormField label="Property Name" required error={errors.displayName?.message}>
        <Input
          {...register("displayName", { required: "Property name is required" })}
          placeholder="e.g., 24 Oak Street"
          disabled={isPending}
        />
      </FormField>

      <FormField label="Property Type" required>
        <Controller
          control={control}
          name="propertyType"
          render={({ field }) => (
            <Select
              value={field.value}
              onValueChange={(value) => field.onChange(value)}
              items={PROPERTY_TYPES}
              disabled={isPending}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectPopup>
                {PROPERTY_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          )}
        />
      </FormField>

      <div className="flex flex-col gap-4 rounded-lg border p-4">
        <p className="text-sm font-medium">Address</p>

        <FormField label="Street Address" required error={errors.address?.line1?.message}>
          <Input
            {...register("address.line1", { required: "Street address is required" })}
            placeholder="24 Oak Street"
            disabled={isPending}
          />
        </FormField>

        <FormField label="Street Address (Line 2)">
          <Input {...register("address.line2")} placeholder="Apartment, suite, etc." disabled={isPending} />
        </FormField>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="City" required error={errors.address?.city?.message}>
            <Input
              {...register("address.city", { required: "City is required" })}
              placeholder="Johannesburg"
              disabled={isPending}
            />
          </FormField>

          <FormField label="Province" required error={errors.address?.province?.message}>
            <Input
              {...register("address.province", { required: "Province is required" })}
              placeholder="Gauteng"
              disabled={isPending}
            />
          </FormField>
        </div>

        <FormField label="Postal Code" required error={errors.address?.postalCode?.message}>
          <Input
            {...register("address.postalCode", { required: "Postal code is required" })}
            placeholder="2196"
            disabled={isPending}
          />
        </FormField>
      </div>
    </FormDialog>
  );
}
