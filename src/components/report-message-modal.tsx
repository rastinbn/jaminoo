'use client';

import { useState } from 'react';
import { Ban, Check, Flag, HelpCircle, MessageCircleWarning, ShieldAlert, UserRoundX, X } from 'lucide-react';
import { api } from '@/lib/client-api';
import { toast } from '@/components/toast';
import { useTranslations } from '@/providers/use-translations';
import { REPORT_REASON_CODES, type ReportReasonCode } from '@/lib/report-reasons';

type ReportTarget = { jamMessageId?: number; dmMessageId?: number };

const ICONS = {
  SPAM: Ban,
  HARASSMENT: MessageCircleWarning,
  HATE_OR_VIOLENCE: ShieldAlert,
  SEXUAL_CONTENT: UserRoundX,
  IMPERSONATION: Flag,
  OTHER: HelpCircle,
} satisfies Record<ReportReasonCode, typeof Ban>;

export function ReportMessageModal({ target, onClose }: { target: ReportTarget; onClose: () => void }) {
  const t = useTranslations();
  const [selected, setSelected] = useState<ReportReasonCode>('SPAM');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      await api('/api/reports', {
        method: 'POST',
        body: JSON.stringify({ ...target, category: selected, details: details.trim() }),
      });
      toast(t('report.sent'), 'ok');
      onClose();
    } catch (error) {
      toast(error instanceof Error ? error.message : t('toast.unknownError'), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="message-report-backdrop" role="presentation" onMouseDown={onClose}>
      <form className="message-report-modal" onSubmit={submit} onMouseDown={(event) => event.stopPropagation()}>
        <div className="message-report-head">
          <div>
            <span className="message-report-kicker"><Flag size={13} /> {t('report.kicker')}</span>
            <h2>{t('report.title')}</h2>
            <p>{t('report.subtitle')}</p>
          </div>
          <button type="button" className="btn-icon" onClick={onClose} title={t('modal.close')}>
            <X size={16} />
          </button>
        </div>

        <div className="message-report-options" role="radiogroup" aria-label={t('report.title')}>
          {REPORT_REASON_CODES.map((code) => {
            const Icon = ICONS[code];
            return (
              <button
                key={code}
                type="button"
                className={`message-report-option ${selected === code ? 'active' : ''}`}
                onClick={() => setSelected(code)}
                role="radio"
                aria-checked={selected === code}
              >
                <span className="message-report-option-icon"><Icon size={17} /></span>
                <span className="message-report-option-copy">
                  <strong>{t(`report.${code.toLowerCase()}.label`)}</strong>
                  <small>{t(`report.${code.toLowerCase()}.description`)}</small>
                </span>
                <span className="message-report-check">{selected === code && <Check size={14} />}</span>
              </button>
            );
          })}
        </div>

        <label className="message-report-details">
          <span>{t('report.details')}</span>
          <textarea value={details} onChange={(event) => setDetails(event.target.value)} maxLength={240} placeholder={t('report.detailsPlaceholder')} rows={3} />
        </label>

        <div className="message-report-actions">
          <button type="button" className="btn btn-ghost pill-sm" onClick={onClose} disabled={busy}>{t('modal.cancel')}</button>
          <button type="submit" className="btn btn-violet pill-sm" disabled={busy}>
            <Flag size={14} /> {busy ? t('report.sending') : t('report.submit')}
          </button>
        </div>
      </form>
    </div>
  );
}
