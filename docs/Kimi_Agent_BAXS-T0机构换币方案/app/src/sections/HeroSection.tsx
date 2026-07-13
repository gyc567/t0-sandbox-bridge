import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Zap, Globe, Shield, TrendingUp } from "lucide-react";

export default function HeroSection() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let animId: number;
    const particles: Array<{
      x: number;
      y: number;
      vx: number;
      vy: number;
      size: number;
      opacity: number;
    }> = [];

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    for (let i = 0; i < 80; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        size: Math.random() * 2 + 0.5,
        opacity: Math.random() * 0.5 + 0.1,
      });
    }

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.vy *= -1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(212,168,83,${p.opacity})`;
        ctx.fill();
      });
      particles.forEach((p1, i) => {
        particles.slice(i + 1).forEach((p2) => {
          const dx = p1.x - p2.x,
            dy = p1.y - p2.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 180) {
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.strokeStyle = `rgba(212,168,83,${0.05 * (1 - dist / 180)})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        });
      });
      animId = requestAnimationFrame(animate);
    };
    animate();
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  const stats = [
    { icon: Zap, label: "结算速度", value: "< 3 分钟", desc: "传统需 2-3 个工作日" },
    { icon: Globe, label: "覆盖范围", value: "1200+", desc: "货币对" },
    { icon: Shield, label: "合规标准", value: "IVMS101", desc: "Travel Rule 合规" },
    { icon: TrendingUp, label: "成本降低", value: "80%", desc: "FX 成本节省" },
  ];

  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
      <canvas ref={canvasRef} className="absolute inset-0 z-0" />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[var(--bg-primary)] z-[1]" />
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[700px] h-[500px] bg-[radial-gradient(ellipse,rgba(59,130,246,0.06),transparent_70%)] z-[1]" />

      <div className="relative z-10 max-w-6xl mx-auto px-6 pt-24 pb-16 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <div className="flex items-center justify-center gap-2 mb-6">
            <span className="pulse-dot" />
            <span className="tag-gold">Integration Architecture v1.0</span>
          </div>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.1 }}
          className="text-4xl sm:text-5xl lg:text-7xl font-bold tracking-tight mb-6"
        >
          <span className="text-[var(--text-primary)]">BAXS × T-0 Network</span>
          <br />
          <span className="gradient-text-gold">接口对接与系统架构</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.2 }}
          className="text-lg text-[var(--text-secondary)] max-w-3xl mx-auto mb-4 leading-relaxed"
        >
          基于 T-0 Network 官方 Onboarding 文档与 BAXS 业务体系的深度集成方案
          <br className="hidden sm:block" />
          覆盖 KYB 准入、密钥管理、信用额度、报价引擎、Payment Flow 全流程
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.3 }}
          className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-10"
        >
          <a href="#architecture" className="btn-gold flex items-center gap-2 text-sm">
            查看系统架构 <ArrowRight className="w-4 h-4" />
          </a>
          <a
            href="#flow"
            className="px-6 py-3 rounded-lg text-sm font-semibold border border-[var(--gold)] text-[var(--gold)] hover:bg-[rgba(212,168,83,0.1)] transition-all"
          >
            交易流程图
          </a>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.5 }}
          className="mt-16 grid grid-cols-2 lg:grid-cols-4 gap-4 max-w-4xl mx-auto"
        >
          {stats.map((s, i) => (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.6 + i * 0.1 }}
              className="glass-panel p-5 text-left group"
            >
              <s.icon className="w-5 h-5 text-[var(--gold)] mb-2" />
              <div className="text-xs text-[var(--text-muted)] uppercase tracking-wider">
                {s.label}
              </div>
              <div className="text-xl font-bold gradient-text-gold mt-1">{s.value}</div>
              <div className="text-xs text-[var(--text-secondary)] mt-1">{s.desc}</div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
