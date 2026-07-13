import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import { FileCheck, Key, CreditCard, TestTube, Rocket, CheckCircle2, Shield } from "lucide-react";

const phases = [
  {
    phase: "Phase 1",
    title: "KYB 机构准入",
    color: "var(--blue)",
    icon: FileCheck,
    items: [
      "提交 BAXS 牌照资质（波兰 VASP / 英国 EMI / 美国 MSB / 加拿大 MSB）",
      "T-0 Network 手动审核监管状态、运营能力、财务稳定性",
      "审核通过后获得 Network Member ID",
    ],
  },
  {
    phase: "Phase 2",
    title: "密钥注册",
    color: "var(--gold)",
    icon: Key,
    items: [
      "生成 secp256k1 ECDSA 密钥对（HSM 安全存储）",
      "注册公钥到 T-0 Network 管理后台",
      "注册 Webhook URL（接收异步通知）",
      "注册 Ethereum 兼容区块链地址（白名单钱包）",
    ],
  },
  {
    phase: "Phase 3",
    title: "信用额度建立",
    color: "var(--purple)",
    icon: CreditCard,
    items: [
      "与每个 Counterparty 建立双边信用额度（Pre-funding 或 Post-settlement）",
      "选择结算链（ETH / Tron / BSC，需双方共同支持）",
      "Post-settlement：协商信用上限 + 结算频率（推荐每 8 小时）",
      "签署信用协议，Network 记录额度到 Credit Ledger",
    ],
  },
  {
    phase: "Phase 4",
    title: "技术集成测试",
    color: "var(--green)",
    icon: TestTube,
    items: [
      "Sandbox 环境联调（api-sandbox.t-0.network）",
      "测试 GetQuote → CreatePayment → PayOut → FinalizePayout 完整流程",
      "验证 ECDSA 签名认证（X-Signature / X-Public-Key / X-Signature-Timestamp）",
      "测试幂等性（重复请求返回原始响应）",
    ],
  },
  {
    phase: "Phase 5",
    title: "生产上线",
    color: "var(--cyan)",
    icon: Rocket,
    items: [
      "切换至生产环境（api.t-0.network）",
      "灰度发布：先开通 USD→PHP / USD→MXN 核心走廊",
      "全量监控：报价延迟、付款成功率、信用额度使用率",
      "日终对账：USDT 链上哈希 + Network 账本 + 本地银行流水",
    ],
  },
];

export default function OnboardingSection() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <section id="onboarding" className="py-24 relative" ref={ref}>
      <div className="divider-gold mb-16" />
      <div className="max-w-7xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5 }}
          className="text-center mb-16"
        >
          <span className="tag-gold mb-4 inline-block">ONBOARDING PROCESS</span>
          <h2 className="text-3xl sm:text-4xl font-bold mt-4">
            T-0 Network <span className="gradient-text-gold">五阶段 Onboarding</span>
          </h2>
          <p className="mt-4 text-[var(--text-secondary)] max-w-2xl mx-auto">
            基于 T-0 Network 官方 Onboarding 文档，BAXS 从准入到上线的完整流程
          </p>
        </motion.div>

        <div className="relative">
          <div className="hidden lg:block absolute left-[140px] top-0 bottom-0 w-px bg-gradient-to-b from-[var(--blue)] via-[var(--gold)] to-[var(--cyan)] opacity-20" />

          <div className="space-y-8">
            {phases.map((p, i) => (
              <motion.div
                key={p.phase}
                initial={{ opacity: 0, x: -30 }}
                animate={isInView ? { opacity: 1, x: 0 } : {}}
                transition={{ delay: 0.1 + i * 0.12 }}
                className="flex flex-col lg:flex-row gap-6"
              >
                <div className="flex lg:flex-col items-center gap-3 lg:w-[140px] flex-shrink-0">
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center"
                    style={{ background: `${p.color}15`, border: `1px solid ${p.color}30` }}
                  >
                    <p.icon className="w-5 h-5" style={{ color: p.color }} />
                  </div>
                  <div className="text-center">
                    <div className="text-[10px] font-mono font-bold" style={{ color: p.color }}>
                      {p.phase}
                    </div>
                    <div className="text-xs font-semibold text-[var(--text-primary)]">
                      {p.title}
                    </div>
                  </div>
                </div>
                <div className="flex-1 glass-panel p-5">
                  <div className="space-y-3">
                    {p.items.map((item, ii) => (
                      <div key={ii} className="flex items-start gap-3">
                        <CheckCircle2
                          className="w-3.5 h-3.5 mt-0.5 flex-shrink-0"
                          style={{ color: p.color }}
                        />
                        <span className="text-xs text-[var(--text-secondary)] leading-relaxed">
                          {item}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 0.8 }}
          className="mt-12 glass-panel p-6"
        >
          <div className="flex items-center gap-3 mb-5">
            <Shield className="w-5 h-5 text-[var(--gold)]" />
            <h3 className="text-sm font-bold text-[var(--text-primary)]">结算模型对比</h3>
          </div>
          <div className="grid sm:grid-cols-2 gap-6">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div
                  className="w-2 h-2 rounded-full bg-[var(--green)]"
                  style={{ boxShadow: "0 0 6px var(--green)" }}
                />
                <span className="text-xs font-semibold text-[var(--green)]">
                  Pre-funding（推荐初期）
                </span>
              </div>
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                先向 Provider 转入 USDT → 获得信用额度 → 再请求付款。资金占用较高但风险最低。 BAXS
                从 Blockchain Wallet 发起 ERC20 转账，Network 监控 12 区块确认后更新额度。
              </p>
            </div>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div
                  className="w-2 h-2 rounded-full bg-[var(--cyan)]"
                  style={{ boxShadow: "0 0 6px var(--cyan)" }}
                />
                <span className="text-xs font-semibold text-[var(--cyan)]">
                  Post-settlement（成熟期）
                </span>
              </div>
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                先执行付款 → 后结算 USDT。Provider 授予信用额度，允许临时负债。 双方互付时可 netting
                轧差，理论上可完全抵消。推荐每 8 小时结算一次。
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
