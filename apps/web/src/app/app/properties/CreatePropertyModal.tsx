"use client";

import { useForm } from "react-hook-form";
import { useCreateProperty } from "@/lib/hooks/usePortfolio";
import { CreatePropertyRequest } from "@inspectai/contracts";
import styles from "./CreatePropertyModal.module.css";

interface CreatePropertyModalProps {
  onClose: () => void;
}

export function CreatePropertyModal({ onClose }: CreatePropertyModalProps) {
  const { register, handleSubmit, formState: { errors }, reset } = useForm<CreatePropertyRequest>({
    defaultValues: {
      displayName: "",
      propertyType: "RESIDENTIAL",
      address: {
        line1: "",
        city: "",
        province: "",
        postalCode: "",
        country: "ZA",
      },
    },
  });

  const { mutate: createProperty, isPending, error } = useCreateProperty();

  const onSubmit = async (data: CreatePropertyRequest) => {
    createProperty(data, {
      onSuccess: () => {
        reset();
        onClose();
      },
    });
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2>Create Property</h2>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className={styles.form}>
          <div className={styles.formGroup}>
            <label htmlFor="displayName">Property Name *</label>
            <input
              id="displayName"
              {...register("displayName", { required: "Property name is required" })}
              placeholder="e.g., 24 Oak Street"
              disabled={isPending}
            />
            {errors.displayName && <span className={styles.error}>{errors.displayName.message}</span>}
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="propertyType">Property Type *</label>
            <select {...register("propertyType")} disabled={isPending}>
              <option value="RESIDENTIAL">Residential</option>
              <option value="COMMERCIAL">Commercial</option>
            </select>
          </div>

          <fieldset className={styles.fieldset}>
            <legend>Address</legend>

            <div className={styles.formGroup}>
              <label htmlFor="line1">Street Address *</label>
              <input
                id="line1"
                {...register("address.line1", { required: "Street address is required" })}
                placeholder="24 Oak Street"
                disabled={isPending}
              />
              {errors.address?.line1 && <span className={styles.error}>{errors.address.line1.message}</span>}
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="line2">Street Address (Line 2)</label>
              <input
                id="line2"
                {...register("address.line2")}
                placeholder="Apartment, suite, etc."
                disabled={isPending}
              />
            </div>

            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label htmlFor="city">City *</label>
                <input
                  id="city"
                  {...register("address.city", { required: "City is required" })}
                  placeholder="Johannesburg"
                  disabled={isPending}
                />
                {errors.address?.city && <span className={styles.error}>{errors.address.city.message}</span>}
              </div>

              <div className={styles.formGroup}>
                <label htmlFor="province">Province *</label>
                <input
                  id="province"
                  {...register("address.province", { required: "Province is required" })}
                  placeholder="Gauteng"
                  disabled={isPending}
                />
                {errors.address?.province && <span className={styles.error}>{errors.address.province.message}</span>}
              </div>
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="postalCode">Postal Code *</label>
              <input
                id="postalCode"
                {...register("address.postalCode", { required: "Postal code is required" })}
                placeholder="2196"
                disabled={isPending}
              />
              {errors.address?.postalCode && <span className={styles.error}>{errors.address.postalCode.message}</span>}
            </div>
          </fieldset>

          {error && <div className={styles.errorAlert}>{error.message}</div>}

          <div className={styles.footer}>
            <button type="button" className={styles.cancelBtn} onClick={onClose} disabled={isPending}>
              Cancel
            </button>
            <button type="submit" className={styles.submitBtn} disabled={isPending}>
              {isPending ? "Creating..." : "Create Property"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
