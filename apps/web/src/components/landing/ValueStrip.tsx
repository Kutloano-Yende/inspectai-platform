import { Image01Icon, LockKeyholeIcon, ShieldUserIcon, ClipboardListIcon } from "@hugeicons/core-free-icons";
import { HugeIcon } from "../HugeIcon";
import styles from "./ValueStrip.module.css";

const ITEMS = [
  { icon: Image01Icon, title: "Evidence first", description: "Capture clear property condition evidence." },
  { icon: LockKeyholeIcon, title: "Secure by design", description: "Keep inspection evidence protected." },
  { icon: ShieldUserIcon, title: "Landlord controlled", description: "AI advises. You decide." },
  { icon: ClipboardListIcon, title: "Clear records", description: "Keep a reliable inspection history." },
];

export function ValueStrip() {
  return (
    <section className={styles.strip} aria-label="Product principles">
      <div className={styles.container}>
        <div className={styles.grid}>
          {ITEMS.map((item) => (
            <div className={styles.item} key={item.title}>
              <div className={styles.iconWrap}>
                <HugeIcon icon={item.icon} size={20} />
              </div>
              <div>
                <h3>{item.title}</h3>
                <p>{item.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
