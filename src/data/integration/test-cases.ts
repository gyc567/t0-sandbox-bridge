/**
 * Test case catalog from spec §7.2 (4 phases, 30+ cases).
 * Only the representative case per phase is shown on the page.
 */

export type Priority = "P0" | "P1";
export type TestPhase = "AUTH" | "NET" | "PRO" | "E2E";

export interface TestCase {
  id: string;
  phase: TestPhase;
  description: string;
  expected: string;
  priority: Priority;
}

export interface TestPhaseSummary {
  id: TestPhase;
  title: string;
  description: string;
  counts: { p0: number; p1: number };
  representative: string;
  fixtureHint: string;
}

export const TEST_CASES: readonly TestCase[] = [
  // Phase 1: Authentication (spec §7.2 表 7-2)
  {
    id: "AUTH-001",
    phase: "AUTH",
    description: "正确密钥签名调用 GetQuote",
    expected: "200 + 正常响应",
    priority: "P0",
  },
  {
    id: "AUTH-002",
    phase: "AUTH",
    description: "错误私钥签名",
    expected: "401 认证失败",
    priority: "P0",
  },
  {
    id: "AUTH-003",
    phase: "AUTH",
    description: "时间戳超出 ±1 分钟窗口",
    expected: "401 时间戳无效",
    priority: "P0",
  },
  {
    id: "AUTH-004",
    phase: "AUTH",
    description: "未提供 X-Public-Key",
    expected: "400 缺少参数",
    priority: "P1",
  },
  {
    id: "AUTH-005",
    phase: "AUTH",
    description: "使用未注册的公钥",
    expected: "403 公钥未授权",
    priority: "P1",
  },
  // Phase 2: NetworkService (spec §7.2 表 7-3)
  {
    id: "NET-001",
    phase: "NET",
    description: "GetQuote 正常询价 HKD 50000",
    expected: "成功报价 + quote_id/rate/expiration",
    priority: "P0",
  },
  {
    id: "NET-002",
    phase: "NET",
    description: "GetQuote 不支持的货币",
    expected: "REASON_CURRENCY_NOT_SUPPORTED",
    priority: "P0",
  },
  {
    id: "NET-003",
    phase: "NET",
    description: "GetQuote 金额超出限额",
    expected: "REASON_LIMIT_EXCEEDED",
    priority: "P0",
  },
  {
    id: "NET-004",
    phase: "NET",
    description: "CreatePayment 使用有效 quote_id",
    expected: "Accepted + payment_id",
    priority: "P0",
  },
  {
    id: "NET-005",
    phase: "NET",
    description: "CreatePayment 不指定 quote_id",
    expected: "自动选择最优报价",
    priority: "P0",
  },
  {
    id: "NET-006",
    phase: "NET",
    description: "CreatePayment 使用过期 quote_id",
    expected: "REASON_QUOTE_EXPIRED",
    priority: "P0",
  },
  {
    id: "NET-007",
    phase: "NET",
    description: "CreatePayment 重复 payment_client_id",
    expected: "返回原始响应（幂等性）",
    priority: "P0",
  },
  {
    id: "NET-008",
    phase: "NET",
    description: "FinalizePayout 报告成功",
    expected: "成功确认",
    priority: "P0",
  },
  {
    id: "NET-009",
    phase: "NET",
    description: "FinalizePayout 报告失败",
    expected: "成功确认 + 释放额度",
    priority: "P0",
  },
  {
    id: "NET-010",
    phase: "NET",
    description: "CompleteManualAmlCheck 批准",
    expected: "Approved + 更新金额",
    priority: "P1",
  },
  // Phase 3: ProviderService (spec §7.2 表 7-4)
  {
    id: "PRO-001",
    phase: "PRO",
    description: "PayOut 收到付款请求正常处理",
    expected: "Accepted + 本地银行转账",
    priority: "P0",
  },
  {
    id: "PRO-002",
    phase: "PRO",
    description: "PayOut 收到重复 payment_id",
    expected: "返回原始响应（不重复付款）",
    priority: "P0",
  },
  {
    id: "PRO-003",
    phase: "PRO",
    description: "PayOut 收到处理中重复",
    expected: "等待原请求完成 + 相同结果",
    priority: "P0",
  },
  {
    id: "PRO-004",
    phase: "PRO",
    description: "PayOut 不支持的货币",
    expected: "Failed REASON_CURRENCY_NOT_SUPPORTED",
    priority: "P0",
  },
  {
    id: "PRO-005",
    phase: "PRO",
    description: "PayOut 触发 AML 人工审核",
    expected: "ManualAmlCheck",
    priority: "P1",
  },
  {
    id: "PRO-006",
    phase: "PRO",
    description: "UpdatePayment 收到 Accepted 通知",
    expected: "更新本地订单状态",
    priority: "P0",
  },
  {
    id: "PRO-007",
    phase: "PRO",
    description: "UpdateLimit 收到额度更新",
    expected: "更新可用额度缓存",
    priority: "P0",
  },
  {
    id: "PRO-008",
    phase: "PRO",
    description: "AppendLedgerEntries 收到账本更新",
    expected: "正确入账 + 更新余额",
    priority: "P1",
  },
  // Phase 4: E2E (spec §7.2 表 7-5)
  {
    id: "E2E-001",
    phase: "E2E",
    description: "完整换币 USDT→CAD (Interac)",
    expected: "3 分钟内完成 + CAD 到账",
    priority: "P0",
  },
  {
    id: "E2E-002",
    phase: "E2E",
    description: "完整换币 USDT→HKD (RTGS)",
    expected: "3 分钟内完成 + HKD 到账",
    priority: "P0",
  },
  {
    id: "E2E-003",
    phase: "E2E",
    description: "完整换币 USDT→USD (Wire)",
    expected: "全流程完成 + USD 到账",
    priority: "P0",
  },
  {
    id: "E2E-004",
    phase: "E2E",
    description: "网络中断后重试",
    expected: "交易最终成功 + 无重复付款",
    priority: "P0",
  },
  {
    id: "E2E-005",
    phase: "E2E",
    description: "高并发 10 笔同时交易",
    expected: "全部成功 + 无冲突/重复",
    priority: "P1",
  },
  {
    id: "E2E-006",
    phase: "E2E",
    description: "24 小时持续交易",
    expected: "无内存泄漏 + 连接稳定",
    priority: "P1",
  },
];

export const TEST_PHASES: readonly TestPhaseSummary[] = [
  {
    id: "AUTH",
    title: "Authentication & Connectivity",
    description: "ECDSA 签名、时间戳窗口、公钥注册",
    counts: { p0: 3, p1: 2 },
    representative: "AUTH-001",
    fixtureHint: "src/lib/t0/ecdsa.test.ts",
  },
  {
    id: "NET",
    title: "NetworkService (OFI)",
    description: "GetQuote · CreatePayment · FinalizePayout · ManualAml",
    counts: { p0: 9, p1: 1 },
    representative: "NET-007",
    fixtureHint: "src/lib/t0/client.test.ts",
  },
  {
    id: "PRO",
    title: "ProviderService (Provider)",
    description: "PayOut · UpdatePayment · UpdateLimit · Ledger · Last Look",
    counts: { p0: 5, p1: 3 },
    representative: "PRO-002",
    fixtureHint: "src/lib/t0/provider.test.ts",
  },
  {
    id: "E2E",
    title: "End-to-end (Sandbox)",
    description: "完整换币流程：USDT → CAD/HKD/USD，幂等性 & 并发",
    counts: { p0: 4, p1: 2 },
    representative: "E2E-001",
    fixtureHint: "e2e-reports/",
  },
];

/**
 * First 30 lines of spec §7.3 E2E-001 vitest snippet.
 * Used inside FlowSandboxPhases code block.
 */
export const E2E_SNIPPET = `import { describe, it, expect } from 'vitest';
import { T0Client } from './t0-client';

describe('E2E Exchange Flow', () => {
  const client = new T0Client({
    endpoint: 'https://api-sandbox.t-0.network',
    privateKey: process.env.T0_PRIVATE_KEY!,
  });

  it('E2E-001: USDT → CAD (Interac)', async () => {
    // Step 1: Get Quote
    const quote = await client.getQuote({
      amount: { unscaled: 10000n, exponent: 0 },
      currency: 'CAD',
    });
    expect(quote.success).toBeDefined();
    expect(quote.success!.quoteId).toBeDefined();

    // Step 2: Create Payment
    const payment = await client.createPayment({
      paymentClientId: \`test_\${Date.now()}\`,
      amount: { value: { unscaled: 10000n, exponent: 0 } },
      currency: 'CAD',
      paymentDetails: { /* ... */ },
      quoteId: quote.success!.quoteId,
      travelRuleData: generateMockTravelRule(),
    });
    expect(payment.accepted).toBeDefined();
    const paymentId = payment.accepted!.paymentId;`;
