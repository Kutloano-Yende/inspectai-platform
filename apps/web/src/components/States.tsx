"use client";

import styles from "./States.module.css";

export function LoadingState() {
  return (
    <div className={styles.state}>
      <div className={styles.spinner} />
      <p className={styles.text}>Loading...</p>
    </div>
  );
}

export function ErrorState({ message = "An error occurred" }: { message?: string }) {
  return (
    <div className={styles.state}>
      <div className={styles.errorIcon}>⚠</div>
      <p className={styles.text}>{message}</p>
    </div>
  );
}

export function EmptyState({ message = "No items found" }: { message?: string }) {
  return (
    <div className={styles.state}>
      <div className={styles.emptyIcon}>—</div>
      <p className={styles.text}>{message}</p>
    </div>
  );
}
