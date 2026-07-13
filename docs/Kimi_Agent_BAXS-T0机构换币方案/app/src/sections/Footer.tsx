import { Cpu, ExternalLink } from "lucide-react";

export default function Footer() {
  return (
    <footer className="border-t border-[var(--border-color)] mt-12">
      <div className="max-w-7xl mx-auto px-6 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="md:col-span-2">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded-lg gradient-gold flex items-center justify-center">
                <Cpu className="w-4 h-4 text-[#030712]" />
              </div>
              <span className="font-bold text-sm">BAXS × T-0 Network</span>
            </div>
            <p className="text-xs text-[var(--text-muted)] leading-relaxed max-w-sm">
              基于 T-0 Network 官方 Onboarding 文档与 BAXS 业务体系的深度集成方案。 覆盖 KYB
              准入、密钥管理、信用额度、报价引擎、Payment Flow 全流程。
            </p>
          </div>
          <div>
            <h4 className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider mb-4">
              文档
            </h4>
            <ul className="space-y-2">
              {[
                {
                  label: "T-0 Onboarding",
                  href: "https://docs.t-0.network/docs/network/onboarding/",
                },
                {
                  label: "T-0 Payment Flow",
                  href: "https://docs.t-0.network/docs/network/payment-flow/",
                },
                {
                  label: "T-0 Integration",
                  href: "https://docs.t-0.network/docs/integration-guidance/introduction/",
                },
              ].map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-[var(--text-muted)] hover:text-[var(--gold)] transition-colors inline-flex items-center gap-1"
                  >
                    {link.label} <ExternalLink className="w-3 h-3" />
                  </a>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider mb-4">
              参考
            </h4>
            <ul className="space-y-2">
              {[
                { label: "BAXS 官网", href: "https://www.baxs.ca" },
                { label: "T-0 Network", href: "https://t-0.network" },
                { label: "Connect RPC", href: "https://connectrpc.com" },
              ].map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-[var(--text-muted)] hover:text-[var(--gold)] transition-colors inline-flex items-center gap-1"
                  >
                    {link.label} <ExternalLink className="w-3 h-3" />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="mt-10 pt-6 border-t border-[var(--border-color)] flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-[10px] text-[var(--text-muted)]">
            © 2026 BAXS. Internal Technical Document. Confidential.
          </p>
          <div className="flex items-center gap-4">
            <span className="text-[10px] text-[var(--text-muted)]">Powered by</span>
            <span className="text-[10px] font-semibold gradient-text-gold">T-0 Network</span>
            <span className="text-[var(--border-color)]">|</span>
            <span className="text-[10px] text-[var(--text-muted)]">Backed by</span>
            <span className="text-[10px] font-semibold text-[var(--blue)]">Tether</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
