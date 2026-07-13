import { useState, useEffect } from "react";
import { Menu, X, Cpu } from "lucide-react";

const navItems = [
  { label: "系统架构", href: "#architecture" },
  { label: "交易流程", href: "#flow" },
  { label: "Onboarding", href: "#onboarding" },
  { label: "接口对接", href: "#integration" },
];

export default function Navigation() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const h = () => setScrolled(window.scrollY > 50);
    window.addEventListener("scroll", h);
    return () => window.removeEventListener("scroll", h);
  }, []);

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-[rgba(3,7,18,0.9)] backdrop-blur-xl border-b border-[var(--border-color)]"
          : "bg-transparent"
      }`}
    >
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg gradient-gold flex items-center justify-center">
            <Cpu className="w-4 h-4 text-[#030712]" />
          </div>
          <span className="font-bold text-sm tracking-wider">
            BAXS <span className="gradient-text-gold">×</span> T-0
          </span>
        </div>
        <div className="hidden md:flex items-center gap-8">
          {navItems.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="text-xs text-[var(--text-secondary)] hover:text-[var(--gold)] transition-colors tracking-wide"
            >
              {item.label}
            </a>
          ))}
        </div>
        <button className="md:hidden" onClick={() => setMobileOpen(!mobileOpen)}>
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>
      {mobileOpen && (
        <div className="md:hidden bg-[rgba(3,7,18,0.95)] backdrop-blur-xl border-t border-[var(--border-color)] px-6 py-4 space-y-3">
          {navItems.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="block text-sm text-[var(--text-secondary)]"
              onClick={() => setMobileOpen(false)}
            >
              {item.label}
            </a>
          ))}
        </div>
      )}
    </nav>
  );
}
