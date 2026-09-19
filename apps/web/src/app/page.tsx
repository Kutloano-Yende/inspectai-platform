import { LandingNav } from "@/components/landing/LandingNav";
import { HeroSection } from "@/components/landing/HeroSection";
import { ValueStrip } from "@/components/landing/ValueStrip";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { ProductExperience } from "@/components/landing/ProductExperience";
import { TenantExperience } from "@/components/landing/TenantExperience";
import { LandlordReview } from "@/components/landing/LandlordReview";
import { SecuritySection } from "@/components/landing/SecuritySection";
import { FinalCTA } from "@/components/landing/FinalCTA";
import { LandingFooter } from "@/components/landing/LandingFooter";
import tokens from "@/components/landing/landing-tokens.module.css";

export default function LandingPage() {
  return (
    <div className={tokens.landingRoot}>
      <LandingNav />
      <main>
        <HeroSection />
        <ValueStrip />
        <HowItWorks />
        <ProductExperience />
        <TenantExperience />
        <LandlordReview />
        <SecuritySection />
        <FinalCTA />
      </main>
      <LandingFooter />
    </div>
  );
}
