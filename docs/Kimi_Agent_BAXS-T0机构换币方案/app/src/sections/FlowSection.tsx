import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import { Check, Clock, AlertTriangle, ShieldCheck, Wallet, Landmark, Server } from "lucide-react";

const flowSteps = [
  {
    num: 1,
    title: "UpdateQuote",
    actor: "Provider",
    desc: "推送 pay-out 报价流到网络",
    icon: Server,
    color: "var(--purple)",
    type: "stream",
  },
  {
    num: 2,
    title: "GetQuote",
    actor: "OFI (BAXS)",
    desc: "获取指定币种和金额的最优报价",
    icon: Wallet,
    color: "var(--blue)",
    type: "action",
  },
  {
    num: 3,
    title: "Quote Response",
    actor: "T-0 Network",
    desc: "返回含 quote_id、汇率、过期时间",
    icon: Check,
    color: "var(--green)",
    type: "response",
  },
  {
    num: 4,
    title: "USDT Settlement Transfer",
    actor: "OFI (BAXS)",
    desc: "从白名单钱包向 Provider 转入 USDT",
    icon: Wallet,
    color: "var(--gold)",
    type: "action",
  },
  {
    num: 5,
    title: "Transaction Notification",
    actor: "Blockchain Monitor",
    desc: "监控到链上确认（12 blocks ETH）",
    icon: ShieldCheck,
    color: "var(--green)",
    type: "response",
  },
  {
    num: 6,
    title: "Credit Usage Notification",
    actor: "T-0 Network",
    desc: "增加 OFI 在 Provider 处的信用额度",
    icon: Check,
    color: "var(--cyan)",
    type: "notify",
  },
  {
    num: 7,
    title: "Create Payment",
    actor: "OFI (BAXS)",
    desc: "携带 IVMS101 Travel Rule 创建付款",
    icon: Landmark,
    color: "var(--blue)",
    type: "action",
  },
  {
    num: 8,
    title: "Payment Accepted",
    actor: "T-0 Network",
    desc: "校验报价有效期 + 信用额度",
    icon: Check,
    color: "var(--green)",
    type: "response",
  },
  {
    num: 9,
    title: "Payout Request",
    actor: "T-0 Network",
    desc: "向 Provider 发送 PayOut 指令",
    icon: Server,
    color: "var(--purple)",
    type: "action",
  },
  {
    num: 10,
    title: "Payout Accepted",
    actor: "Provider (BAXS)",
    desc: "30 秒内响应接受 + AML 校验",
    icon: Check,
    color: "var(--green)",
    type: "response",
  },
  {
    num: 11,
    title: "Local Disbursement",
    actor: "Provider (BAXS)",
    desc: "通过 SEPA/ACH/Interac 执行法币付款",
    icon: Landmark,
    color: "var(--gold)",
    type: "action",
  },
  {
    num: 12,
    title: "Payout Success",
    actor: "Provider (BAXS)",
    desc: "调用 FinalizePayout 回传成功",
    icon: Check,
    color: "var(--green)",
    type: "response",
  },
  {
    num: 13,
    title: "Payment Confirmed",
    actor: "T-0 Network",
    desc: "通知 OFI 付款完成，扣除信用额度",
    icon: ShieldCheck,
    color: "var(--cyan)",
    type: "notify",
  },
  {
    num: 14,
    title: "Status Sync",
    actor: "BAXS Adapter",
    desc: "接收回调，更新客户仪表盘",
    icon: Server,
    color: "var(--blue)",
    type: "action",
  },
];

export default function FlowSection() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <section id="flow" className="py-24 relative" ref={ref}>
      <div className="divider-gold mb-16" />
      <div className="max-w-7xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5 }}
          className="text-center mb-16"
        >
          <span className="tag-green mb-4 inline-block">PAYMENT FLOW</span>
          <h2 className="text-3xl sm:text-4xl font-bold mt-4">
            完整 <span className="gradient-text-gold">交易流程图</span>
          </h2>
          <p className="mt-4 text-[var(--text-secondary)] max-w-2xl mx-auto">
            基于 T-0 Network 官方 Payment Flow 文档的 14 步完整流程
            <br />
            从报价推送到本地兑付，全流程 near-instant
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={isInView ? { opacity: 1 } : {}}
          transition={{ delay: 0.2 }}
          className="flex flex-wrap items-center justify-center gap-4 mb-10"
        >
          {[
            { label: "OFI (BAXS)", color: "var(--blue)" },
            { label: "T-0 Network", color: "var(--purple)" },
            { label: "Provider (BAXS)", color: "var(--green)" },
            { label: "Blockchain", color: "var(--gold)" },
          ].map((role) => (
            <div key={role.label} className="flex items-center gap-2">
              <div
                className="w-2.5 h-2.5 rounded-full"
                style={{ background: role.color, boxShadow: `0 0 6px ${role.color}` }}
              />
              <span className="text-xs text-[var(--text-secondary)]">{role.label}</span>
            </div>
          ))}
        </motion.div>

        <div className="relative">
          <div className="absolute left-6 top-0 bottom-0 w-px bg-gradient-to-b from-[var(--gold)] via-[var(--blue)] to-[var(--purple)] opacity-30" />

          <div className="space-y-4">
            {flowSteps.map((step, i) => (
              <motion.div
                key={step.num}
                initial={{ opacity: 0, x: -20 }}
                animate={isInView ? { opacity: 1, x: 0 } : {}}
                transition={{ delay: 0.1 + i * 0.05 }}
                className="relative pl-16"
              >
                <div
                  className="absolute left-[19px] top-5 w-2.5 h-2.5 rounded-full border-2 border-[var(--bg-primary)]"
                  style={{ background: step.color, boxShadow: `0 0 8px ${step.color}` }}
                />
                <div className="glass-panel p-4 flex flex-col sm:flex-row sm:items-center gap-3 group hover:border-[var(--gold)]/30 transition-all">
                  <div className="flex items-center gap-3 flex-1">
                    <div
                      className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ background: `${step.color}15` }}
                    >
                      <step.icon className="w-4 h-4" style={{ color: step.color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded"
                          style={{ background: `${step.color}20`, color: step.color }}
                        >
                          #{step.num}
                        </span>
                        <span className="text-sm font-semibold text-[var(--text-primary)]">
                          {step.title}
                        </span>
                      </div>
                      <p className="text-xs text-[var(--text-secondary)] mt-0.5">{step.desc}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <div className="w-1.5 h-1.5 rounded-full" style={{ background: step.color }} />
                    <span className="text-[10px] text-[var(--text-muted)] font-mono">
                      {step.actor}
                    </span>
                    {step.type === "stream" && (
                      <span className="tag-blue text-[9px] py-0 px-1.5">STREAM</span>
                    )}
                    {step.type === "response" && (
                      <span className="tag-green text-[9px] py-0 px-1.5">RESPONSE</span>
                    )}
                    {step.type === "notify" && (
                      <span className="text-[9px] py-0 px-1.5 rounded bg-[rgba(6,182,212,0.1)] text-[var(--cyan)] border border-[rgba(6,182,212,0.2)]">
                        NOTIFY
                      </span>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 0.9 }}
          className="mt-12 grid sm:grid-cols-3 gap-4"
        >
          <div className="glass-panel p-4 border-l-2" style={{ borderLeftColor: "var(--gold)" }}>
            <Clock className="w-4 h-4 text-[var(--gold)] mb-2" />
            <div className="text-xs font-semibold text-[var(--text-primary)]">
              总耗时 &lt; 3 分钟
            </div>
            <div className="text-[10px] text-[var(--text-secondary)] mt-1">
              传统 SWIFT 需 2-3 个工作日
            </div>
          </div>
          <div className="glass-panel p-4 border-l-2" style={{ borderLeftColor: "var(--blue)" }}>
            <AlertTriangle className="w-4 h-4 text-[var(--blue)] mb-2" />
            <div className="text-xs font-semibold text-[var(--text-primary)]">
              30 秒 Payout 超时
            </div>
            <div className="text-[10px] text-[var(--text-secondary)] mt-1">
              Provider 必须在 30s 内响应
            </div>
          </div>
          <div className="glass-panel p-4 border-l-2" style={{ borderLeftColor: "var(--green)" }}>
            <ShieldCheck className="w-4 h-4 text-[var(--green)] mb-2" />
            <div className="text-xs font-semibold text-[var(--text-primary)]">
              IVMS101 Travel Rule
            </div>
            <div className="text-[10px] text-[var(--text-secondary)] mt-1">
              每笔交易自动填充合规数据
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
