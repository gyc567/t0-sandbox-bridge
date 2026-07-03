/**
 * RPC method catalog from spec §3 (NetworkService) + §4 (ProviderService).
 * 9 methods total: 4 OFI + 5 Provider.
 */

import type { Role } from "./roles";

export type RpcMode = "UNARY" | "STREAMING";
export type MethodRole = Role | "BOTH";
type RpcIdempotencyLevel = "IDEMPOTENT" | "NO_SIDE_EFFECTS";

export interface FailureReason {
  code: string;
  description: string;
}

export interface RpcMethod {
  /** RPC name (e.g. "GetQuote") */
  name: string;
  /** Service the method belongs to */
  service: "NetworkService" | "ProviderService";
  /** Which side BAXS plays in this call */
  role: MethodRole;
  /** Wire pattern */
  mode: RpcMode;
  /** One-line summary */
  description: string;
  /** Idempotency classification per spec §6 */
  idempotency: RpcIdempotencyLevel;
  /** Failure reason enum values (when applicable) */
  failureReasons?: readonly FailureReason[];
  /** Visual: cyan (OFI/NetworkService) or violet (Provider/ProviderService) */
  accent: "cyan" | "violet";
}

export const RPC_METHODS: readonly RpcMethod[] = [
  // NetworkService — BAXS as OFI (spec §3)
  {
    name: "UpdateQuote",
    service: "NetworkService",
    role: "Provider",
    mode: "STREAMING",
    description: "推送报价到网络（BAXS 作为 Provider 时使用）",
    idempotency: "IDEMPOTENT",
    accent: "violet",
  },
  {
    name: "GetQuote",
    service: "NetworkService",
    role: "OFI",
    mode: "UNARY",
    description: "获取指定币种和金额的最优报价",
    idempotency: "NO_SIDE_EFFECTS",
    failureReasons: [
      { code: "REASON_NO_QUOTE_AVAILABLE", description: "无可用报价" },
      { code: "REASON_LIMIT_EXCEEDED", description: "信用额度不足" },
      { code: "REASON_CURRENCY_NOT_SUPPORTED", description: "不支持的货币" },
      { code: "REASON_INVALID_AMOUNT", description: "无效金额" },
    ],
    accent: "cyan",
  },
  {
    name: "CreatePayment",
    service: "NetworkService",
    role: "OFI",
    mode: "UNARY",
    description: "创建新的付款请求（可锁定 quote_id 或自动选择）",
    idempotency: "IDEMPOTENT",
    failureReasons: [
      { code: "REASON_NO_QUOTE_AVAILABLE", description: "无可用报价" },
      { code: "REASON_LIMIT_EXCEEDED", description: "信用额度不足" },
      { code: "REASON_INVALID_QUOTE_ID", description: "无效的 quote_id" },
      { code: "REASON_QUOTE_EXPIRED", description: "报价已过期" },
      { code: "REASON_INVALID_PAYMENT_DETAILS", description: "付款详情无效" },
    ],
    accent: "cyan",
  },
  {
    name: "FinalizePayout",
    service: "NetworkService",
    role: "OFI",
    mode: "UNARY",
    description: "报告付款最终结果（成功/失败）",
    idempotency: "IDEMPOTENT",
    failureReasons: [
      { code: "REASON_INSUFFICIENT_FUNDS", description: "余额不足" },
      { code: "REASON_ACCOUNT_NOT_FOUND", description: "账户不存在" },
      { code: "REASON_ACCOUNT_FROZEN", description: "账户已冻结" },
      { code: "REASON_AML_REJECTED", description: "AML 拒绝" },
      { code: "REASON_PROVIDER_ERROR", description: "Provider 错误" },
    ],
    accent: "cyan",
  },
  {
    name: "CompleteManualAmlCheck",
    service: "NetworkService",
    role: "OFI",
    mode: "UNARY",
    description: "报告人工 AML 检查结果（批准/拒绝）",
    idempotency: "IDEMPOTENT",
    accent: "cyan",
  },
  // ProviderService — BAXS implements (spec §4)
  {
    name: "PayOut",
    service: "ProviderService",
    role: "Provider",
    mode: "UNARY",
    description: "T-0 请求 BAXS 执行法币付款",
    idempotency: "IDEMPOTENT",
    failureReasons: [
      { code: "REASON_INSUFFICIENT_FUNDS", description: "余额不足" },
      { code: "REASON_ACCOUNT_NOT_FOUND", description: "账户不存在" },
      { code: "REASON_ACCOUNT_FROZEN", description: "账户已冻结" },
      { code: "REASON_LIMIT_EXCEEDED", description: "信用额度不足" },
      { code: "REASON_CURRENCY_NOT_SUPPORTED", description: "不支持的货币" },
    ],
    accent: "violet",
  },
  {
    name: "UpdatePayment",
    service: "ProviderService",
    role: "Provider",
    mode: "UNARY",
    description: "T-0 通知 BAXS 支付状态更新（Accepted/Confirmed/Failed/ManualAml）",
    idempotency: "IDEMPOTENT",
    accent: "violet",
  },
  {
    name: "UpdateLimit",
    service: "ProviderService",
    role: "Provider",
    mode: "UNARY",
    description: "T-0 推送信用额度与已使用额度信息",
    idempotency: "IDEMPOTENT",
    accent: "violet",
  },
  {
    name: "AppendLedgerEntries",
    service: "ProviderService",
    role: "Provider",
    mode: "UNARY",
    description: "T-0 推送账本条目（双借贷方分录）",
    idempotency: "IDEMPOTENT",
    accent: "violet",
  },
  {
    name: "ApprovePaymentQuotes",
    service: "ProviderService",
    role: "Provider",
    mode: "UNARY",
    description: "\"Last Look\" 报价审批（人工 AML 后）",
    idempotency: "IDEMPOTENT",
    accent: "violet",
  },
] as const;

export function methodsForService(service: RpcMethod["service"]): readonly RpcMethod[] {
  return RPC_METHODS.filter((m) => m.service === service);
}
