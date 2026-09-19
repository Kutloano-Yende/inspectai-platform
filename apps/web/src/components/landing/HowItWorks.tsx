import { Building06Icon, Camera01Icon, Search01Icon, CheckmarkCircle02Icon } from "@hugeicons/core-free-icons";
import { HugeIcon } from "../HugeIcon";
import { Reveal } from "./Reveal";
import styles from "./HowItWorks.module.css";

const STEPS = [
  { number: "01", title: "Create inspection", description: "Landlord creates an inspection for the property.", icon: Building06Icon },
  { number: "02", title: "Capture evidence", description: "Tenant captures photos and evidence room by room.", icon: Camera01Icon },
  { number: "03", title: "Review findings", description: "InspectAI organises evidence and provides advisory observations.", icon: Search01Icon },
  { number: "04", title: "Make the decision", description: "The landlord reviews the evidence and makes the final decision.", icon: CheckmarkCircle02Icon },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className={styles.section} aria-labelledby="how-it-works-heading">
      <div className={styles.container}>
        <Reveal className={styles.header}>
          <h2 id="how-it-works-heading">From inspection to decision.</h2>
          <p>One simple workflow for landlords and tenants.</p>
        </Reveal>

        <div className={styles.steps}>
          <div className={styles.line} aria-hidden="true" />
          {STEPS.map((step, i) => (
            <Reveal key={step.number} delayMs={i * 100} className={styles.step}>
              <div className={styles.iconWrap}>
                <HugeIcon icon={step.icon} size={22} />
              </div>
              <span className={styles.number}>{step.number}</span>
              <h3>{step.title}</h3>
              <p>{step.description}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
