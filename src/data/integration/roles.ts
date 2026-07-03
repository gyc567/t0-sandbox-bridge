/**
 * BAXS dual-role position on T-0 Network.
 * Source: BAXS × T-0 接入规范 §1.1 + §3 + §4.
 */

export type Role = "OFI" | "Provider";

export interface RoleSpec {
  id: Role;
  /** Full English name */
  title: string;
  /** Short uppercase abbreviation */
  abbreviation: string;
  /** Responsibility line from spec §1.1 */
  responsibility: string;
  /** BAXS concrete position from spec §1.1 */
  baxsPosition: string;
  /** RPCs BAXS calls (NetworkService) or implements (ProviderService) */
  methods: readonly string[];
  /** Accent token for visual: cyan=ofi, violet=provider */
  accent: "cyan" | "violet";
}

export const ROLES: readonly RoleSpec[] = [
  {
    id: "OFI",
    title: "Originating Financial Institution",
    abbreviation: "OFI",
    responsibility: "发起支付/换币请求，持有 USDT 并进行结算",
    baxsPosition: "BAXS 作为 OFI 发起 USDT→法币的换币请求",
    methods: ["GetQuote", "CreatePayment", "FinalizePayout", "CompleteManualAmlCheck"],
    accent: "cyan",
  },
  {
    id: "Provider",
    title: "Payout Provider",
    abbreviation: "Provider",
    responsibility: "在目标国家执行本地法币付款",
    baxsPosition: "BAXS 接收 T-0 付款指令，通过本地银行系统执行 CAD/USD/HKD/SGD 付款",
    methods: ["PayOut", "UpdatePayment", "UpdateLimit", "AppendLedgerEntries", "ApprovePaymentQuotes", "UpdateQuote"],
    accent: "violet",
  },
] as const;

export function getRole(id: Role): RoleSpec {
  const r = ROLES.find((x) => x.id === id);
  if (!r) throw new Error(`Unknown role: ${id}`);
  return r;
}
