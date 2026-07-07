import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';
import { Building2, Landmark, Wallet, Brain, ArrowRight, Server, Key, CreditCard, Globe2, Lock } from 'lucide-react';

const layers = [
  {
    title: 'Layer 3 · BAXS 下游客户层',
    color: 'var(--purple)',
    items: [
      { icon: Building2, label: '跨境电商', desc: '全球供应商收付款' },
      { icon: CreditCard, label: 'Fintech / Neobank', desc: '白标 API 集成' },
      { icon: Landmark, label: '贸易公司', desc: '跨境 B2B 付款' },
      { icon: Globe2, label: '薪资平台', desc: '全球员工发薪' },
    ],
  },
  {
    title: 'Layer 2 · BAXS 中间编排层（核心）',
    color: 'var(--gold)',
    items: [
      { icon: Wallet, label: 'BAXS Global Account', desc: 'EUR/USD/CNH 多币种' },
      { icon: Wallet, label: 'BAXS Blockchain Wallet', desc: 'ERC20 USDT 白名单' },
      { icon: Brain, label: 'AI 交易枢纽', desc: '智能路由 + 报价择优' },
      { icon: Server, label: 'T-0 适配层', desc: 'gRPC ↔ REST 转换' },
    ],
  },
  {
    title: 'Layer 1 · T-0 Network 基础设施层',
    color: 'var(--blue)',
    items: [
      { icon: Server, label: 'Quote Engine', desc: '报价订单簿' },
      { icon: CreditCard, label: 'Credit Ledger', desc: '信用额度管理' },
      { icon: Lock, label: 'Blockchain Monitor', desc: '链上交易监控' },
      { icon: Key, label: 'Compliance Center', desc: 'Travel Rule / AML' },
    ],
  },
];

export default function ArchitectureSection() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-100px' });

  return (
    <section id="architecture" className="py-24 relative" ref={ref}>
      <div className="divider-gold mb-16" />
      <div className="max-w-7xl mx-auto px-6">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={isInView ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.5 }} className="text-center mb-16">
          <span className="tag-blue mb-4 inline-block">SYSTEM ARCHITECTURE</span>
          <h2 className="text-3xl sm:text-4xl font-bold mt-4">
            未来感 <span className="gradient-text-gold">三层系统架构</span>
          </h2>
          <p className="mt-4 text-[var(--text-secondary)] max-w-2xl mx-auto">
            BAXS 作为双重角色（OFI + Provider）与 T-0 Network 深度耦合<br />
            赋能下游客户无感知使用全球 1200+ 货币对清结算能力
          </p>
        </motion.div>

        <div className="space-y-6">
          {layers.map((layer, li) => (
            <motion.div key={layer.title} initial={{ opacity: 0, y: 30 }} animate={isInView ? { opacity: 1, y: 0 } : {}} transition={{ delay: 0.1 + li * 0.15 }}>
              <div className="glass-panel p-6 neon-border">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-1 h-6 rounded-full" style={{ background: layer.color }} />
                  <h3 className="text-sm font-bold tracking-wider" style={{ color: layer.color }}>{layer.title}</h3>
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  {layer.items.map((item) => (
                    <div key={item.label} className="bg-[rgba(6,10,18,0.6)] rounded-lg p-4 border border-[var(--border-color)] hover:border-[var(--gold)]/30 transition-all group">
                      <item.icon className="w-5 h-5 mb-2 group-hover:scale-110 transition-transform" style={{ color: layer.color }} />
                      <div className="text-xs font-semibold text-[var(--text-primary)]">{item.label}</div>
                      <div className="text-[10px] text-[var(--text-muted)] mt-1">{item.desc}</div>
                    </div>
                  ))}
                </div>
              </div>
              {li < layers.length - 1 && (
                <div className="flex justify-center my-3">
                  <ArrowRight className="w-5 h-5 text-[var(--gold)] rotate-90" />
                </div>
              )}
            </motion.div>
          ))}
        </div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={isInView ? { opacity: 1, y: 0 } : {}} transition={{ delay: 0.6 }}
          className="mt-12 grid sm:grid-cols-2 gap-6">
          <div className="glass-panel p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(16,185,129,0.1)' }}>
              <div className="w-3 h-3 rounded-full bg-[var(--green)]" style={{ boxShadow: '0 0 10px var(--green)' }} />
            </div>
            <div>
              <div className="text-sm font-semibold text-[var(--text-primary)]">Pre-funding 模型</div>
              <div className="text-xs text-[var(--text-secondary)]">USDT 预结算 → 创建付款 → 本地兑付</div>
            </div>
          </div>
          <div className="glass-panel p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(6,182,212,0.1)' }}>
              <div className="w-3 h-3 rounded-full bg-[var(--cyan)]" style={{ boxShadow: '0 0 10px var(--cyan)' }} />
            </div>
            <div>
              <div className="text-sm font-semibold text-[var(--text-primary)]">Post-settlement 模型</div>
              <div className="text-xs text-[var(--text-secondary)]">先付款 → 后结算（信用额度内）</div>
            </div>
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={isInView ? { opacity: 1, y: 0 } : {}} transition={{ delay: 0.7 }}
          className="mt-12 glass-panel p-6">
          <div className="flex items-center gap-3 mb-4">
            <span className="tag-gold">DUAL ROLE</span>
            <span className="text-xs text-[var(--text-muted)]">BAXS 在 T-0 Network 中的双重角色定位</span>
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <div className="text-sm font-semibold text-[var(--blue)]">OFI（始发金融机构）</div>
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                BAXS 代表下游客户发起 USDT→法币换币请求。客户资金存入 BAXS Global Account，
                BAXS 通过 T-0 GetQuote 获取最优汇率，调用 CreatePayment 创建付款，
                接收 UpdatePayment 状态回调。
              </p>
            </div>
            <div className="space-y-2">
              <div className="text-sm font-semibold text-[var(--green)]">Provider（本地兑付方）</div>
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                BAXS 接收 T-0 Network 的 PayOut 请求，通过本地银行网络（SEPA/ACH/Interac/RTGS）
                执行法币 disbursement。支持 EUR/USD/CNH/GBP/CAD 多币种兑付。
                通过 UpdateQuote 持续推送报价流。
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
