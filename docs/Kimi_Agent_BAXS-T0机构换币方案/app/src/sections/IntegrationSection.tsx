import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import {
  Code2,
  KeyRound,
  Database,
  ArrowRightLeft,
  FileCode,
  ShieldCheck,
  Globe2,
  Wallet,
  ArrowRight,
} from "lucide-react";

const apis = [
  {
    role: "OFI（BAXS 调用）",
    color: "var(--blue)",
    icon: Globe2,
    endpoints: [
      { method: "GetQuote", desc: "获取最优报价（20-50ms）", type: "UNARY" },
      { method: "CreatePayment", desc: "创建换币付款", type: "UNARY" },
      { method: "FinalizePayout", desc: "报告付款最终状态", type: "UNARY" },
      { method: "CompleteManualAmlCheck", desc: "AML 审核结果", type: "UNARY" },
    ],
  },
  {
    role: "Provider（BAXS 实现）",
    color: "var(--green)",
    icon: Wallet,
    endpoints: [
      { method: "PayOut", desc: "接收法币付款指令", type: "UNARY" },
      { method: "UpdatePayment", desc: "支付状态通知", type: "UNARY" },
      { method: "UpdateLimit", desc: "信用额度变更", type: "UNARY" },
      { method: "AppendLedgerEntries", desc: "账本条目推送", type: "UNARY" },
    ],
  },
];

const techStack = [
  { icon: Code2, label: "Connect RPC", desc: "gRPC + REST/JSON 双协议", color: "var(--purple)" },
  { icon: KeyRound, label: "ECDSA + Keccak-256", desc: "以太坊兼容签名认证", color: "var(--gold)" },
  { icon: Database, label: "Protobuf", desc: "强类型消息序列化", color: "var(--blue)" },
  { icon: ArrowRightLeft, label: "幂等性设计", desc: "at-least-once + 去重", color: "var(--cyan)" },
  { icon: FileCode, label: "IVMS101", desc: "FATF Travel Rule 标准", color: "var(--green)" },
  { icon: ShieldCheck, label: "HSM 密钥管理", desc: "Thales Luna / AWS KMS", color: "var(--gold)" },
];

export default function IntegrationSection() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <section id="integration" className="py-24 relative" ref={ref}>
      <div className="divider-gold mb-16" />
      <div className="max-w-7xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5 }}
          className="text-center mb-16"
        >
          <span className="tag-blue mb-4 inline-block">API INTEGRATION</span>
          <h2 className="text-3xl sm:text-4xl font-bold mt-4">
            接口对接 <span className="gradient-text-gold">技术方案</span>
          </h2>
          <p className="mt-4 text-[var(--text-secondary)] max-w-2xl mx-auto">
            BAXS 需要同时实现 OFI 客户端和 Provider 服务端
            <br />
            基于 Connect RPC 框架，支持 gRPC 和 REST/JSON 双协议
          </p>
        </motion.div>

        <div className="grid lg:grid-cols-2 gap-6 mb-12">
          {apis.map((api, i) => (
            <motion.div
              key={api.role}
              initial={{ opacity: 0, y: 30 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: 0.1 + i * 0.15 }}
            >
              <div className="glass-panel p-6 h-full">
                <div className="flex items-center gap-3 mb-5">
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center"
                    style={{ background: `${api.color}15` }}
                  >
                    <api.icon className="w-5 h-5" style={{ color: api.color }} />
                  </div>
                  <h3 className="text-sm font-bold" style={{ color: api.color }}>
                    {api.role}
                  </h3>
                </div>
                <div className="space-y-2">
                  {api.endpoints.map((ep) => (
                    <div
                      key={ep.method}
                      className="flex items-center justify-between py-2.5 px-3 rounded-lg bg-[rgba(6,10,18,0.5)] border border-[var(--border-color)] hover:border-[var(--gold)]/20 transition-all"
                    >
                      <div>
                        <div className="text-xs font-mono font-semibold text-[var(--text-primary)]">
                          {ep.method}
                        </div>
                        <div className="text-[10px] text-[var(--text-muted)]">{ep.desc}</div>
                      </div>
                      <span
                        className="text-[9px] font-mono px-1.5 py-0.5 rounded"
                        style={{ background: `${api.color}15`, color: api.color }}
                      >
                        {ep.type}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 0.4 }}
        >
          <h3 className="text-center text-lg font-bold text-[var(--text-primary)] mb-6">
            核心技术栈
          </h3>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            {techStack.map((t, i) => (
              <motion.div
                key={t.label}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={isInView ? { opacity: 1, scale: 1 } : {}}
                transition={{ delay: 0.5 + i * 0.08 }}
                className="glass-panel p-4 flex items-center gap-3 hover:border-[var(--gold)]/25 transition-all"
              >
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: `${t.color}12` }}
                >
                  <t.icon className="w-5 h-5" style={{ color: t.color }} />
                </div>
                <div>
                  <div className="text-xs font-semibold text-[var(--text-primary)]">{t.label}</div>
                  <div className="text-[10px] text-[var(--text-muted)]">{t.desc}</div>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 0.7 }}
          className="mt-12 glass-panel p-6"
        >
          <div className="flex items-center gap-3 mb-5">
            <KeyRound className="w-5 h-5 text-[var(--gold)]" />
            <h3 className="text-sm font-bold text-[var(--text-primary)]">ECDSA 认证流程</h3>
          </div>
          <div className="grid sm:grid-cols-5 gap-3">
            {[
              { step: "1", label: "获取时间戳", desc: "Unix ms little-endian" },
              { step: "2", label: "拼接数据", desc: "body + timestamp" },
              { step: "3", label: "Keccak-256", desc: "哈希计算" },
              { step: "4", label: "ECDSA 签名", desc: "secp256k1 私钥" },
              { step: "5", label: "HTTP Header", desc: "X-Signature" },
            ].map((s, i) => (
              <div key={s.step} className="relative">
                <div className="bg-[rgba(6,10,18,0.6)] rounded-lg p-3 border border-[var(--border-color)] text-center">
                  <div className="text-lg font-bold gradient-text-gold">{s.step}</div>
                  <div className="text-xs font-semibold text-[var(--text-primary)] mt-1">
                    {s.label}
                  </div>
                  <div className="text-[10px] text-[var(--text-muted)]">{s.desc}</div>
                </div>
                {i < 4 && (
                  <div className="hidden sm:block absolute -right-2 top-1/2 -translate-y-1/2 z-10">
                    <ArrowRight className="w-3 h-3 text-[var(--gold)]" />
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-4 text-[10px] text-[var(--text-muted)]">
            <span>必需 Header:</span>
            <code className="text-[var(--gold)]">X-Signature</code>
            <code className="text-[var(--gold)]">X-Public-Key</code>
            <code className="text-[var(--gold)]">X-Signature-Timestamp</code>
            <span className="text-[var(--cyan)]">窗口: ±1 分钟</span>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
