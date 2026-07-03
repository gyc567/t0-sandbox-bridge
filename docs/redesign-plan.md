# T-0 Sandbox Bridge — 未来科技风全站重设计方案 (v2, 审计修正版)

> **状态**: 设计方案(纯文档,不含代码)
> **日期**: 2026-07-02
> **参考**: open-multi-agent.com 的 `demo-dashboard-hero.gif`(运行后回放面板)+ 官网深色科技风
> **相对 v1 的变化**: 本版基于对代码库的逐文件核对,修正了 v1 中的事实性错误,合并了重复的视觉系统,并重新排序了落地路径。

---

## 0. TL;DR

- 把代码库里**已存在但仅限 `.playground` 作用域**的深色科技语言(青蓝/玻璃/粒子/三节点拓扑)提升为**全站默认基调**,并补齐营销叙事。
- `/playground` **已经是可达路由**(v1 误判为死代码),且 `FlowCanvas` 已完成 Phase 2 静态拓扑。剩余工作不是「从零做 Live 页」,而是**完成 Phase 3(包流动)+ Artifact Drawer**,再重做 Landing。
- 全站从「Apple 明亮单卡」升级为「深空指挥中心 + 可观测资金流」。
- 明亮模式作为可切换项保留。

---

## 1. 审计意见(v1 方案的问题与修正)

v1 方案方向正确(深色 + 可观测 + OMA 风),但有几处事实性错误和工程浪费,逐一修正:

### 🔴 1.1 重大事实错误:`/playground` 不是死代码

**v1 称**:「`/playground` 是孤立死代码,未注册到 router,wiring 它是最高杠杆动作。」

**实际**(`src/routeTree.gen.ts:13,22-24,41,59`):`/playground` **已注册**,与 `/`、`/docs`、`/sandbox` 并列,共 **4 个可达路由**(非 v1 所说的 3 个)。`src/routes/playground.tsx` 已 import `playground.css`、`AmbientGrid`、`FlowCanvas`、`ChannelBar`、`LiveTicker` 并组合渲染。

**修正**:Live 页**不是新建**,而是**完成已在建的工程**。落地路径相应后置(见 §6)。

### 🟠 1.2 低估了已有资产的完成度

v1 把 `data/` 和 `FlowCanvas` 描述为「为未来 playground 准备的脚手架」。逐文件核对后发现完成度远高于此:

| 资产                                                                          | 实际完成度                                                                                                                                                                                | v1 的认知                |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| `src/data/flows.ts`                                                           | **完整**:3 个 flow(pay-out 10 步 / manual-aml 10 步 / payment-intent 8 步),每步含 `t` 阈值、source/target 节点、包颜色、artifact 类型、网络高亮标志——是一份**可直接驱动的滚动时间轴规格** | 「3 个 flow 编排」(低估) |
| `src/data/channels.ts`                                                        | **完整**:5 通道,含 context、summary、fee(5bps/10bps/indicative)                                                                                                                           | 笼统提及                 |
| `src/components/playground/FlowCanvas.tsx`                                    | **Phase 2 完成**:三节点拓扑(OFI / T-0 Network Core / POP)、子模块、hex ID 心跳动画、USDT 通道流光。注释明确写「Phase 3: wire packet trails to scroll-driven engine」                      | 未提及                   |
| `src/components/playground/{ChannelBar,LiveTicker,LiveClock,AmbientGrid}.tsx` | 均已存在                                                                                                                                                                                  | 部分提及                 |

**修正**:核心可视化页的「骨头」已搭好。真正缺的是 **Phase 3 包运动引擎** + **Artifact Drawer**(消费 `artifacts.ts`)。

### 🟠 1.3 重复造轮子:出现了第三套深色调色板

v1 提议的深色值(`#060912` 底 / `#00e0ff` 青 / `#f5b614` 琥珀)与代码库**已有的**两套深色都不完全一致:

- `src/styles.css` 的 `.dark`:`#000000` 纯黑 + `#2997ff` 浅蓝
- `src/playground.css`:`#0a0e1a` 深海军 + `#00d4ff` 青 + `#d4a017` 琥珀

v1 等于发明了**第三套**,造成三套并存的维护负担。

**修正**:直接**采纳 `playground.css` 的调色板作为全站深色基线**(见 §2.1),零 churn、单一事实源。v1 提议的 `#00e0ff`/`#f5b614` 仅作为微调备选,默认沿用现值。

### 🟡 1.4 次要问题

- **mono 字体不一致**:`styles.css` 全局 `--font-mono` 是 `ui-monospace, "SF Mono"…`(无 JetBrains),而 `playground.css` 覆盖为 `"JetBrains Mono"…`。全局应统一注册 JetBrains Mono(`__root.tsx:94` 已加载该字体,只是 `@theme` 没登记)。
- **`.container` 未定义**:`docs.tsx` 用了 `className="container"` 但全站无此 utility,当前静默失效。重设计时需补 `@theme` 的 `--breakpoint-*` 或定义 container utility。
- **无对比度校验**:v1 未给 WCAG 目标。深色面 `muted-foreground` 需满足 AA(见 §2.3)。
- **AmbientGrid 全站常驻的性能风险**:原 `AmbientGrid` 含漂浮粒子,若每页常驻会拖累长页性能。应限定为**仅 Hero 与 Live 页**的局部背景,其余页面用静态点阵。
- **「DAG」类比过度**:OMA 的 hero 是**带分支的任务依赖图**;本站是**线性三节点拓扑**。视觉语言可借鉴,但文案不宜号称 DAG,改为「资金流拓扑 / asset flow」更诚实。

---

## 2. 视觉系统(已对齐代码实际值)

### 2.1 配色 — 单一深色基线(采纳 playground.css)

| Token                        | 值(深色默认)                       | 用途                 |
| ---------------------------- | ---------------------------------- | -------------------- |
| `--background`               | `#0a0e1a`                          | 全站底色(深海军)     |
| `--foreground`               | `#f5f5f7`                          | 主文字               |
| `--card`                     | `rgba(10,14,26,0.7)`               | 玻璃卡片面           |
| `--secondary` / `--muted`    | `rgba(255,255,255,0.04)`           | 次级面               |
| `--muted-foreground`         | `#a1a1a6`                          | 次要文字             |
| `--border`                   | `rgba(255,255,255,0.08)`           | hairline 描边        |
| `--primary`                  | `#00d4ff`(青)                      | 实时/链接/CTA        |
| `--accent`                   | `rgba(0,212,255,0.08)`             | 强调底色             |
| `--usdt`                     | `#d4a017`(琥珀)                    | 资产/价值流          |
| `--success`                  | `#34c759`                          | 成功                 |
| `--destructive` / `--danger` | `#ff453a`                          | 失败/AML 拦截        |
| 辉光                         | `0 0 24px rgba(0,212,255,.06~.35)` | 活跃节点(强度按状态) |

**新增**(v1 提议、值得采纳的补充):

- `--accent-violet: #7c5cff` — 次强调,用于「智能编排/AI」语义(全站目前缺第二强调色,单青略单调)。

**统一策略**:把上述值写入 `styles.css` 的 `.dark`(覆盖现在纯黑/浅蓝的值),并让 `<html>` 默认带 `dark` 类(或 `color-scheme: dark`)。`playground.css` 的作用域覆盖即可移除(收敛为单一源)。明亮模式仍用 `:root` 现值,通过切换 `dark` 类还原。

### 2.2 字体

| 角色            | 字体                               | 备注                                                   |
| --------------- | ---------------------------------- | ------------------------------------------------------ |
| 展示/标题       | `Inter`(300–700,负字距)            | 现状,不变                                              |
| 数据/协议       | `JetBrains Mono` + `tabular-nums`  | **需在全局 `@theme` 登记**(目前仅 playground 作用域有) |
| 微标签(EYEBROW) | `Inter` 全大写 `tracking-[0.18em]` | 替代现在的蓝色小字                                     |

### 2.3 质感与无障碍

- **玻璃卡**:`backdrop-blur-xl` + 1px hairline + `inset 0 1px 0 rgba(255,255,255,0.04)` 顶部高光。
- **辉光按钮**:主 CTA 青→紫渐变 + 外发光,hover 扩散。
- **状态点**:复用 `.status-dot` + `playground-pulse`(已实现)。
- **对比度目标**:正文 `#f5f5f7` on `#0a0e1a`(≈17:1,AAA);`muted #a1a1a6` on `#0a0e1a`(≈7:1,AAA on text,达标);青 `#00d4ff` on dark(≈9:1,达标)。**琥珀 `#d4a017` on `#0a0e1a`≈8:1 达标;但琥珀 on 玻璃面需测试,必要时用 `#f5b614` 提亮**。
- **`prefers-reduced-motion`**:所有动画(脉冲、心跳、USDT 流光、包运动、粒子)降级为静态——沿用 `playground.css:129` 既有约定,扩展到新增动画。

---

## 3. 信息架构(已按真实路由修正)

```
全局 TopBar(粘性玻璃) + Footer
├── /            Landing   [重做:多段叙事 + 自动回放 Hero 动画]
├── /playground  Live      [完成 Phase 3:包流动 + Artifact Drawer]  ← 已存在,非新建
├── /sandbox     Console   [换肤,功能不变]
├── /docs        Docs      [换肤 + 粘性 TOC + 修 .container]
└── /api         API Lab   [新增:从 sandbox 的 API Tester 抽出]
```

> 注:v1 提议把 Live 命名为 `/live`。鉴于 `/playground` 已是既定路由且内部组件/数据均以 playground 命名,**保留 `/playground` 路径**,仅把面向用户的导航文案改为「Live Stream」/「实时流」。避免无谓的重命名 churn。

---

## 4. 关键页面详案

### 4.1 Landing `/`(重做)

v1 的六段结构保留,修正两处:

1. **Hero 自动回放动画依赖 Phase 3 引擎**。在引擎就绪前,Hero 先用**独立的轻量循环**(复用 `FlowCanvas` 的三节点静态拓扑 + 一个 JS 驱动的简单包往返,不接滚动),避免阻塞。引擎就绪后再升级为完整回放。
2. **「DAG」措辞改为「资金流拓扑」**。

**段落**(最终):

1. **Hero**:全屏 `AmbientGrid` + 透视地平线;EYEBROW `T-0 SANDBOX BRIDGE · INSTANT SETTLEMENT SIM`;超大标题(复用 `--text-display-mega` 4.5rem)「资金,在到达之前先被看见。」;发光 CTA `Open Live Stream → /playground`、次 `Read the Docs → /docs`;右侧轻量循环的三节点迷你动画。
2. **能力三栏玻璃卡**:Publish Quote / Move Funds / Verify & Pay Out。
3. **实时回放区**(引擎就绪后强化版,带通道切换 pill)。
4. **通道矩阵**:复用 `CHANNELS`(`channels.ts`),5 卡,显示 fee/summary,跳 `/playground?channel=…`。
5. **协议速览**:monospace 请求/签名/放款片段 → 引导 `/api`。
6. **页脚**:堆栈标签 + `MAINNET SIM` 状态徽章。

### 4.2 Live `/playground`(完成在建工程)— ★核心差异化

**已有**:ChannelBar(通道切换)、FlowCanvas(三节点静态拓扑)、LiveTicker、AmbientGrid、LiveClock。

**待建(Phase 3)**:

- **包运动引擎**:按 `flows.ts` 每步的 `t`(0–1)把「发光数据包」沿 `source → target` 插值移动,颜色取 `packetColor`(cyan/ochre/sage/slate),`highlightNetwork` 时 Network Core 外发光增强。进度可由**滚动**或**时间轴 scrubber** 驱动。
- **Artifact Drawer**:步进触发时,右侧抽屉展示 `artifacts.ts` 生成的协议载荷(update-quote / usdt-settle / ecdsa-sign / payout-rpc / ledger-entry…),monospace + 复制按钮。对应 OMA 的「agent output log」→ 这里是「protocol artifact」。
- **节点资金 breakdown**:每个 NodeCard 显示累计金额/状态(对应 OMA 的 token breakdown)。
- **底部事件流**:终端样式滚动日志(时间戳 + 彩色事件标签)。

> 这是把 OMA「运行后回放」隐喻落到本站业务的关键:OMA 回放任务 DAG + token 消耗;本站回放资金流 + 协议载荷。结构不同(线性三节点 vs 分支图),但「可观测的执行回放」体验一致。

### 4.3 Sandbox `/sandbox`(换肤)

功能不动。视觉迁移:卡片→玻璃面;数字→JetBrains Mono + `tabular-nums`;状态徽章→发光圆点;API Tester 结果→代码块 + 复制 + 校验通过的绿色脉冲。

### 4.4 Docs `/docs`(换肤 + 修 bug)

玻璃容器内的 `.prose`;**修 `.container` 失效**(定义 utility 或改用 `max-w-*` + `mx-auto`);加右侧粘性 TOC;代码块加 macOS 圆点 + 深色语法高亮。

### 4.5 API `/api`(新增)

从 sandbox 的 API Tester 抽出为独立「协议实验室」:左端点列表,右请求构造器 + ECDSA 签名 + cURL 导出。复用 `src/lib/t0/ecdsa.ts` 与 `csv.ts` 逻辑。

---

## 5. 组件规范

| 组件            | 规范                                                                                          | 现状                                       |
| --------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------ |
| **TopBar**      | 粘性、`backdrop-blur-xl`、底部 hairline;左 logo,中导航,右发光 `Open Console` + 脉冲 `LIVE` 点 | **缺失**(各页自写 header),需新建为共享组件 |
| **Footer**      | 堆栈标签 + 状态徽章 + 链接                                                                    | **缺失**,需新建                            |
| **GlassCard**   | `rounded-2xl` + 玻璃面 + hairline + hover 边框转青微光                                        | 部分(Card 组件可改造)                      |
| **NodeCard**    | 玻璃卡 + 角色 + 状态点 + mini 进度;活跃外发光                                                 | **已有**(`FlowCanvas.tsx`),扩展            |
| **Packet**      | 圆角胶囊 + 内发光 + 拖尾;颜色随 `packetColor`                                                 | **待建**(Phase 3)                          |
| **StatusBadge** | 脉冲圆点 + 文字(success/pending/failed/settled)                                               | `.status-dot` 已有,组件化封装              |
| **GlowButton**  | 主:青→紫渐变 + 外发光;次:描边玻璃;`active:scale-95`                                           | 改造 `button.tsx` variants                 |
| **MonoBlock**   | 哈希/代码:深一档背景 + JetBrains Mono + 行号 + 复制                                           | **待建**                                   |
| **AmbientGrid** | 点阵 + 径向光晕 + 粒子;**仅 Hero/Live 局部**                                                  | 已有,限定作用域                            |

---

## 6. 动效规范

- **入场**:各段 `fade-up + blur-in`,错峰 60ms,缓动 `cubic-bezier(0.16,1,0.3,1)`。
- **滚动驱动**:`/playground` 包位置随滚动 `t` 插值(核心体验)。
- **环境层**:径向光晕 8–12s 呼吸;粒子低速漂浮(限 Hero/Live)。
- **微交互**:数字 count-up;状态切换 dot 脉冲;复制成功绿色闪过。
- **红线**:`prefers-reduced-motion: reduce` 全降级静态。
- **性能**:AmbientGrid 不全站常驻;长页用 `content-visibility: auto`;粒子数量按视口限制。

---

## 7. 落地路径(已按真实状态重排序)

v1 把「接入 Live」当新建工作放在阶段 C。实际 Live 已存在,且 Hero 动画依赖其引擎。修正后的顺序:

| 阶段                     | 内容                                                                                                                                                                | 前置依赖                   | 产出                        |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- | --------------------------- |
| **A. 统一深色基线**      | 把 `playground.css` 调色板写入 `styles.css` 的 `.dark`;`<html>` 默认 dark;全局登记 JetBrains Mono `@theme`;建共享 TopBar/Footer;sandbox/docs 换肤 + 修 `.container` | 无                         | 全站「脱白转黑」,单一视觉源 |
| **B. 完成 Live Phase 3** | 包运动引擎(滚动 `t` 驱动)+ Artifact Drawer(消费 `artifacts.ts`)+ 节点 breakdown + 事件流                                                                            | A                          | ★核心差异化页上线           |
| **C. 重做 Landing**      | 多段叙事;Hero 先用轻量独立循环动画;通道矩阵;协议速览                                                                                                                | A(B 的引擎就绪后升级 Hero) | 未来感首屏                  |
| **D. 打磨**              | `/api` 实验室;Docs TOC;明亮模式切换器;性能/对比度复核                                                                                                               | A–C                        | 收尾                        |

> 关键调整:**A → B → C**,而非 v1 的 A → C → B。因为 Landing 的 Hero 回放动画依赖 B 的引擎,先完成 Live 才能让 Landing 借力。

---

## 8. 决策记录(已与用户确认)

| 决策点      | 选择                   |
| ----------- | ---------------------- |
| 配色策略    | 默认深色 + 可切明亮    |
| Hero 形式   | 自动循环的迷你流程动画 |
| Live 页范围 | 纳入,作为核心差异化页  |

---

## 附录 A:事实核对(代码实际状态,截至 2026-07-02)

- **可达路由(4)**:`/`、`/docs`、`/sandbox`、`/playground`(`src/routeTree.gen.ts` 已登记全部 4 个)。
- **深色 CSS 两套**:`src/styles.css` 的 `.dark`(纯黑/浅蓝,latent)、`src/playground.css`(海军/青,作用域 `.playground`)。本方案收敛为后者。
- **数据层完整**:`src/data/{flows,channels,artifacts}.ts` 均为成品规格,非脚手架。
- **可视化完成度**:`FlowCanvas.tsx` = Phase 2(静态拓扑),Phase 3(包运动)注释明确未做。
- **字体**:Inter + JetBrains Mono 已在 `__root.tsx:94` 加载;全局 `@theme` 仅登记了 `ui-monospace/SF Mono`,缺 JetBrains。
- **已知 bug**:`docs.tsx` 的 `className="container"` 无定义,静默失效。
