"use client";

import { useForm } from "react-hook-form";
import { useCreateUnit } from "@/lib/hooks/usePortfolio";
import { CreateUnitRequest } from "@inspectai/contracts";
import styles from "./CreateUnitModal.module.css";

interface CreateUnitModalProps {
  propertyId: string;
  onClose: () => void;
}

export function CreateUnitModal({ propertyId, onClose }: CreateUnitModalProps) {
  const { register, handleSubmit, formState: { errors }, reset } = useForm<CreateUnitRequest>({
    defaultValues: {
      label: "",
      bedrooms: undefined,
      bathrooms: undefined,
    },
  });

  const { mutate: createUnit, isPending, error } = useCreateUnit(propertyId);

  const onSubmit = (data: CreateUnitRequest) => {
    createUnit(data, {
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
          <h2>Create Unit</h2>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className={styles.form}>
          <div className={styles.formGroup}>
            <label htmlFor="label">Unit Name *</label>
            <input
              id="label"
              {...register("label", { required: "Unit name is required" })}
              placeholder="e.g., Unit 4B, Main House"
              disabled={isPending}
            />
            {errors.label && <span className={styles.error}>{errors.label.message}</span>}
          </div>

          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label htmlFor="bedrooms">Bedrooms</label>
              <input
                id="bedrooms"
                type="number"
                {...register("bedrooms", { min: 0 })}
                placeholder="0"
                disabled={isPending}
              />
              {errors.bedrooms && <span className={styles.error}>{errors.bedrooms.message}</span>}
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="bathrooms">Bathrooms</label>
              <input
                id="bathrooms"
                type="number"
                {...register("bathrooms", { min: 0 })}
                placeholder="0"
                disabled={isPending}
              />
              {errors.bathrooms && <span className={styles.error}>{errors.bathrooms.message}</span>}
            </div>
          </div>

          {error && <div className={styles.errorAlert}>{error.message}</div>}

          <div className={styles.footer}>
            <button type="button" className={styles.cancelBtn} onClick={onClose} disabled={isPending}>
              Cancel
            </button>
            <button type="submit" className={styles.submitBtn} disabled={isPending}>
              {isPending ? "Creating..." : "Create Unit"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
