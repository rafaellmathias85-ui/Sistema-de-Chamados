import Header from '@/components/header';
import HeroSection from '@/components/hero-section';
import StatsSection from '@/components/stats-section';
import AboutSection from '@/components/about-section';
import ServicesSection from '@/components/services-section';
import MethodologySection from '@/components/methodology-section';
import PartnersSection from '@/components/partners-section';
import DifferentialsSection from '@/components/differentials-section';
import CtaSection from '@/components/cta-section';
import ContactSection from '@/components/contact-section';
import Footer from '@/components/footer';

export default function Home() {
  return (
    <main className="min-h-screen">
      <Header />
      <HeroSection />
      <StatsSection />
      <AboutSection />
      <ServicesSection />
      <MethodologySection />
      <PartnersSection />
      <DifferentialsSection />
      <CtaSection />
      <ContactSection />
      <Footer />
    </main>
  );
}
