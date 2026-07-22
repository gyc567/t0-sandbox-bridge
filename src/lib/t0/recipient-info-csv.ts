// recipient-info-csv.ts — CSV generation for payment recipient info download.
//
// Single responsibility: given a list of recipient records, produce a
// RFC 4180-compliant CSV blob and trigger browser download.
//
// Columns: 手机号,收款人钱包地址,收款人姓名,收款人国家,收款人邮箱,
//         收款人手机号,收款人地址,收款人邮政编码,收款人城市,
//         收款人省份,收款人国家

export interface RecipientInfoRecord {
  phoneNumber?: string;
  walletAddress?: string;
  recipientName: string;
  country: string;
  email?: string;
  mobilePhone?: string;
  address?: string;
  postalCode?: string;
  city?: string;
  province?: string;
}

const CSV_HEADERS = [
  "手机号",
  "收款人钱包地址",
  "收款人姓名",
  "收款人国家",
  "收款人邮箱",
  "收款人手机号",
  "收款人地址",
  "收款人邮政编码",
  "收款人城市",
  "收款人省份",
  "收款人国家",
] as const;

/**
 * Escape a value for CSV (RFC 4180 + CSV injection mitigation):
 * - Wrap in double quotes if contains comma, newline, or double quote
 * - Escape internal double quotes by doubling them
 * - Prefix formula-like values (=, +, -, @, tab, cr) with single quote
 *   to prevent CSV formula injection in Excel/Sheets/LibreOffice
 */
function escapeCSV(value: string | undefined | null): string {
  if (value == null || value === "") return "";
  let str = String(value);
  // Mitigate CSV formula injection: values starting with = + - @ \t \r
  // are prefixed with ' so they render as text, not formulas
  if (/^[=+\-@\t\r]/.test(str)) {
    str = "'" + str;
  }
  if (str.includes(",") || str.includes("\n") || str.includes('"')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function recordToRow(record: RecipientInfoRecord): string {
  return [
    escapeCSV(record.phoneNumber),
    escapeCSV(record.walletAddress),
    escapeCSV(record.recipientName),
    escapeCSV(record.country),
    escapeCSV(record.email),
    escapeCSV(record.mobilePhone),
    escapeCSV(record.address),
    escapeCSV(record.postalCode),
    escapeCSV(record.city),
    escapeCSV(record.province),
    escapeCSV(record.country), // 收款人国家 (duplicated as per spec)
  ].join(",");
}

/**
 * Generate CSV content string from recipient records.
 * Returns header + data rows joined by newline (no trailing newline).
 */
export function generateRecipientCSV(records: RecipientInfoRecord[]): string {
  const headerRow = CSV_HEADERS.join(",");
  if (records.length === 0) return headerRow;
  const dataRows = records.map(recordToRow).join("\n");
  return `${headerRow}\n${dataRows}`;
}

/**
 * Trigger a browser download of the CSV content.
 */
export function downloadRecipientCSV(
  records: RecipientInfoRecord[],
  filename = "recipient-info.csv",
): void {
  const csv = generateRecipientCSV(records);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
