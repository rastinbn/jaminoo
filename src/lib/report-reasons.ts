export const REPORT_REASON_CODES = ['SPAM', 'HARASSMENT', 'HATE_OR_VIOLENCE', 'SEXUAL_CONTENT', 'IMPERSONATION', 'OTHER'] as const;

export type ReportReasonCode = (typeof REPORT_REASON_CODES)[number];

export function isReportReasonCode(value: unknown): value is ReportReasonCode {
  return typeof value === 'string' && REPORT_REASON_CODES.includes(value as ReportReasonCode);
}
