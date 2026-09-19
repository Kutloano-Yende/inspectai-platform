import { Tick02Icon, Search01Icon } from "@hugeicons/core-free-icons";
import { HugeIcon } from "../HugeIcon";
import { Reveal } from "./Reveal";
import styles from "./ProductExperience.module.css";

const POINTS = [
  "Room-by-room evidence",
  "Inspection history",
  "Clear findings",
  "Landlord review",
  "Secure evidence storage",
];

export function ProductExperience() {
  return (
    <section id="features" className={styles.section} aria-labelledby="product-heading">
      <div className={styles.container}>
        <div className={styles.grid}>
          <Reveal className={`${styles.visual} ${styles.left}`}>
            <div className={styles.app}>
              <div className={styles.appHeader}>
                <strong>Evidence Gallery</strong>
                <span className={styles.badge}>Complete</span>
              </div>
              <div className={styles.photos}>
                <div className={styles.photo}>
                  <span>Living Room</span>
                </div>
                <div className={styles.photo}>
                  <span>Kitchen</span>
                </div>
                <div className={styles.photo}>
                  <span>Bedroom</span>
                </div>
                <div className={styles.photo}>
                  <span>Bathroom</span>
                </div>
                <div className={styles.photo}>
                  <span>Garage</span>
                </div>
                <div className={styles.photo}>
                  <span>Exterior</span>
                </div>
              </div>
            </div>

            <div className={styles.findingCard}>
              <div className={styles.findingHeader}>
                <HugeIcon icon={Search01Icon} size={16} className={styles.findingIcon} />
                <div>
                  <span>Finding</span>
                  <strong>Possible wall damage</strong>
                </div>
              </div>
              <span className={styles.findingTag}>Advisory — review required</span>
            </div>
          </Reveal>

          <Reveal delayMs={120} className={`${styles.content} ${styles.right}`}>
            <span className={styles.eyebrow}>BUILT AROUND EVIDENCE</span>
            <h2 id="product-heading">See what happened. Not just what someone says happened.</h2>
            <p>
              Every inspection in InspectAI is built around recorded evidence — not memory, not opinion.
              Photos and details are organised by room, so what was captured is always clear.
            </p>

            <ul className={styles.checklist}>
              {POINTS.map((point) => (
                <li key={point}>
                  <span className={styles.check}>
                    <HugeIcon icon={Tick02Icon} size={12} />
                  </span>
                  {point}
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
