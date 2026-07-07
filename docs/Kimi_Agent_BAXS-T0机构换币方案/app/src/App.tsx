import Navigation from './sections/Navigation';
import HeroSection from './sections/HeroSection';
import ArchitectureSection from './sections/ArchitectureSection';
import FlowSection from './sections/FlowSection';
import OnboardingSection from './sections/OnboardingSection';
import IntegrationSection from './sections/IntegrationSection';
import Footer from './sections/Footer';

function App() {
  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] overflow-x-hidden relative">
      <div className="fixed inset-0 grid-bg opacity-40 pointer-events-none z-0" />
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-[radial-gradient(ellipse,rgba(212,168,83,0.04),transparent_70%)] pointer-events-none z-0" />
      <div className="fixed bottom-0 right-0 w-[500px] h-[500px] bg-[radial-gradient(ellipse,rgba(59,130,246,0.03),transparent_70%)] pointer-events-none z-0" />
      <div className="relative z-10">
        <Navigation />
        <HeroSection />
        <ArchitectureSection />
        <FlowSection />
        <OnboardingSection />
        <IntegrationSection />
        <Footer />
      </div>
    </div>
  );
}

export default App;
