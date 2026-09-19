import type { InspectionDetail } from "@/lib/hooks/useInspections";
import styles from "./RoomCheckpointNav.module.css";

interface RoomCheckpointNavProps {
  plan: InspectionDetail["plan"];
  evidence: InspectionDetail["evidence"];
  selectedRoom: string | null;
  onSelectRoom: (roomCategory: string | null) => void;
}

export function RoomCheckpointNav({
  plan,
  evidence,
  selectedRoom,
  onSelectRoom,
}: RoomCheckpointNavProps) {
  const evidenceByRoom = evidence.reduce(
    (acc, ev) => {
      const checkpoint = plan.rooms
        .flatMap((r) => r.checkpoints)
        .find((c) => c.id === ev.checkpointId);
      if (checkpoint) {
        const key = checkpoint.roomCategory;
        acc[key] = (acc[key] || 0) + 1;
      }
      return acc;
    },
    {} as Record<string, number>
  );

  const mandatoryCheckpoints = plan.rooms.flatMap((r) =>
    r.checkpoints.filter((c) => c.mandatory).map((c) => ({ ...c, roomLabel: r.label }))
  );

  const missingMandatory = mandatoryCheckpoints.filter((c) => {
    const hasCommitted = evidence.some(
      (e) => e.checkpointId === c.id && e.committedAt
    );
    return !hasCommitted;
  });

  return (
    <nav className={styles.nav}>
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Rooms</h3>
        <ul className={styles.list}>
          <li>
            <button
              className={`${styles.navButton} ${!selectedRoom ? styles.active : ""}`}
              onClick={() => onSelectRoom(null)}
            >
              <span className={styles.navLabel}>All Evidence</span>
              <span className={styles.navCount}>{evidence.length}</span>
            </button>
          </li>
          {plan.rooms.map((room) => (
            <li key={room.roomCategory}>
              <button
                className={`${styles.navButton} ${selectedRoom === room.roomCategory ? styles.active : ""}`}
                onClick={() => onSelectRoom(room.roomCategory)}
              >
                <span className={styles.navLabel}>{room.label}</span>
                <span className={styles.navCount}>{evidenceByRoom[room.roomCategory] || 0}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      {missingMandatory.length > 0 && (
        <div className={styles.section}>
          <h3 className={styles.sectionTitleWarning}>Missing Evidence</h3>
          <ul className={styles.missingList}>
            {missingMandatory.map((checkpoint) => (
              <li key={checkpoint.id} className={styles.missingItem}>
                <span className={styles.missingLabel}>{checkpoint.roomLabel}</span>
                <span className={styles.missingFlag}>Required</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </nav>
  );
}
