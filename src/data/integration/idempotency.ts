/**
 * Idempotency rules from spec §6.
 * Three rules + 2 levels.
 */

export interface IdempotencyRule {
  index: string;
  title: string;
  /** What the spec calls "wrong" behavior */
  wrong: string;
  /** What the spec calls "right" behavior */
  right: string;
}

export interface IdempotencyLevel {
  level: "IDEMPOTENT" | "NO_SIDE_EFFECTS";
  description: string;
  examples: string;
}

export const IDEMPOTENCY_RULES: readonly IdempotencyRule[] = [
  {
    index: "01",
    title: "Return the original response",
    wrong: '返回 {"failed": {"details": "already processed"}} — 网络视为真实失败并中止',
    right: "查找 payment_id，找到原响应并返回，让流程继续",
  },
  {
    index: "02",
    title: "Wait for in-flight to complete",
    wrong: '返回 "Request is already being processed" 错误',
    right: "等待原请求完成，再返回相同结果给两个请求",
  },
  {
    index: "03",
    title: "Never treat a duplicate as an error",
    wrong: "把重复请求当成 bug，主动报错",
    right: "重复是网络重试的正常事件，错误响应会破坏重试契约",
  },
];

export const IDEMPOTENCY_LEVELS: readonly IdempotencyLevel[] = [
  {
    level: "IDEMPOTENT",
    description: "改变状态的请求，必须基于业务标识符去重",
    examples: "CreatePayment · PayOut · FinalizePayout · UpdatePayment",
  },
  {
    level: "NO_SIDE_EFFECTS",
    description: "只读请求，无需去重，可安全缓存",
    examples: "GetQuote",
  },
];
