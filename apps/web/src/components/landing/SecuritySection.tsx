import { LockKeyholeIcon, ShieldCheckIcon, Clock01Icon, ClipboardClockIcon } from "@hugeicons/core-free-icons";
import { HugeIcon } from "../HugeIcon";
import { Reveal } from "./Reveal";
import styles from "./SecuritySection.module.css";

const ITEMS = [
  { icon: LockKeyholeIcon, title: "Private evidence storage", description: "Evidence is stored privately, never on a public URL." },
  { icon: ShieldCheckIcon, title: "Secure authentication", description: "Landlord accounts are protected by authenticated sessions." },
  { icon: Clock01Icon, title: "Time-limited access", description: "Evidence is accessed through short-lived, authorised links." },
  { icon: ClipboardClockIcon, title: "Audit history", description: "Key actions are recorded in an append-only audit log." },
];

export function SecuritySection() {
  return (
    <section id="security" className={styles.section} aria-labelledby="security-heading">
      <div className={styles.container}>
        <Reveal className={styles.header}>
          <h2 id="security-heading">Your inspection evidence stays protected.</h2>
        </Reveal>

        <div className={styles.grid}>
          {ITEMS.map((item, i) => (
            <Reveal key={item.title} delayMs={i * 80} className={styles.card}>
              <div className={styles.iconWrap}>
                <HugeIcon icon={item.icon} size={20} />
              </div>
              <h3>{item.title}</h3>
              <p>{item.description}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
