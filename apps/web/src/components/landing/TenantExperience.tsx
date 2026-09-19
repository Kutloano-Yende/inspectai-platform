import { MailSend01Icon, PlayCircle02Icon, Camera01Icon, CloudUploadIcon } from "@hugeicons/core-free-icons";
import { HugeIcon } from "../HugeIcon";
import { Reveal } from "./Reveal";
import styles from "./TenantExperience.module.css";

const STEPS = [
  { icon: MailSend01Icon, title: "Open invitation", description: "No account needed — just an invite link from the landlord." },
  { icon: PlayCircle02Icon, title: "Start inspection", description: "The inspection opens with a simple, guided flow." },
  { icon: Camera01Icon, title: "Capture each room", description: "Photograph the property room by room, at their own pace." },
  { icon: CloudUploadIcon, title: "Submit evidence", description: "Evidence is securely submitted for review." },
];

export function TenantExperience() {
  return (
    <section id="for-tenants" className={styles.section} aria-labelledby="tenant-heading">
      <div className={styles.container}>
        <div className={styles.grid}>
          <Reveal delayMs={0} className={`${styles.content} ${styles.left}`}>
            <span className={styles.eyebrow}>FOR TENANTS</span>
            <h2 id="tenant-heading">Simple for tenants.</h2>
            <p>
              Tenants don&apos;t need to understand inspection software. They just need to open a link and
              take photos — InspectAI handles the rest.
            </p>

            <ol className={styles.steps}>
              {STEPS.map((step, i) => (
                <li key={step.title}>
                  <span className={styles.stepIcon}>
                    <HugeIcon icon={step.icon} size={18} />
                  </span>
                  <div>
                    <span className={styles.stepNumber}>{String(i + 1).padStart(2, "0")}</span>
                    <strong>{step.title}</strong>
                    <p>{step.description}</p>
                  </div>
                </li>
              ))}
            </ol>
          </Reveal>

          {/* Phone mockup — static visual only */}
          <Reveal delayMs={120} className={`${styles.phoneWrap} ${styles.right}`} >
            <div className={styles.phone} aria-hidden="true">
              <div className={styles.phoneNotch} />
              <div className={styles.phoneScreen}>
                <div className={styles.phoneHeader}>
                  <span>Oakwood Apartment</span>
                  <span className={styles.phoneStep}>Room 2 of 4</span>
                </div>

                <div className={styles.phoneRoom}>
                  <span>Kitchen</span>
                </div>

                <div className={styles.phoneChecklist}>
                  <div className={styles.phoneChecked}>
                    <span className={styles.dot} />
                    Living Room
                  </div>
                  <div className={styles.phoneActive}>
                    <span className={styles.dot} />
                    Kitchen
                  </div>
                  <div>
                    <span className={styles.dot} />
                    Bedroom
                  </div>
                  <div>
                    <span className={styles.dot} />
                    Bathroom
                  </div>
                </div>

                <div className={styles.phoneShutter}>
                  <HugeIcon icon={Camera01Icon} size={22} />
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
