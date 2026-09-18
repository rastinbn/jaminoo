'use client';

import { useMemo, useState } from 'react';
import { api } from '@/lib/client-api';
import { Flag, Check, Eye } from 'lucide-react';
import { useTranslations } from '@/providers/use-translations';
import { useAdminList, SearchBar, Pager, LoadingRow, EmptyRow, Badge, fmtDateTime, useSelection, SelectCheckbox, SelectionToolbar } from './admin-ui';

interface ReportRow {
  id: number;
  status: string;
  reason: string;
  createdAt: string;
  reporter: string;
  kind: 'jam' | 'dm' | 'video' | 'tweet';
  message: { id: number; text?: string; title?: string; user?: { username: string }; sender?: { username: string }; author?: { username: string }; jam?: { name: string } } | null;
}

export function AdminReports() {
  const t = useTranslations();
  const [status, setStatus] = useState('OPEN');
  const extra = useMemo(() => ({ status }), [status]);
  const list = useAdminList<ReportRow>({ path: '/api/admin/reports', extra, per: 20 });
  const selection = useSelection(list.rows.map((row) => row.id));

  async function update(id: number, next: string) {
    await api('/api/admin/reports', { method: 'PATCH', body: JSON.stringify({ id, status: next }) });
    list.reload();
  }

  async function resolveMany(ids: string[]) {
    await Promise.allSettled(ids.map((id) => api('/api/admin/reports', { method: 'PATCH', body: JSON.stringify({ id: Number(id), status: 'RESOLVED' }) })));
    selection.clear();
    list.reload();
  }

  return (
    <div className="admin-card admin-table-card">
      <div className="admin-toolbar">
        <SearchBar value={list.q} onChange={list.setQ} onSearch={() => list.setQuery(list.q.trim())} placeholder={t('admin.searchReports')} />
        <select className="admin-select" value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="OPEN">{t('admin.openStatus')}</option>
          <option value="REVIEWED">{t('admin.reviewed')}</option>
          <option value="RESOLVED">{t('admin.resolved')}</option>
          <option value="DISMISSED">{t('admin.dismissed')}</option>
          <option value="">{t('admin.all')}</option>
        </select>
        <span className="admin-count">{t('admin.reportsCount', { n: list.total })}</span>
      </div>
      <SelectionToolbar count={selection.count} onClear={selection.clear}>
        <button type="button" className="btn btn-violet pill-sm" onClick={() => void resolveMany(selection.selectedIds)}>
          <Check size={13} /> {t('admin.bulkResolve')}
        </button>
      </SelectionToolbar>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead><tr><th className="admin-check-cell"><SelectCheckbox checked={selection.allSelected} indeterminate={selection.count > 0 && !selection.allSelected} onChange={() => selection.toggleAll(list.rows.map((row) => row.id))} label={t('admin.selectAll')} /></th><th>#</th><th>{t('admin.reporter')}</th><th>{t('admin.message')}</th><th>{t('admin.reason')}</th><th>{t('admin.status')}</th><th>{t('admin.date')}</th><th>{t('admin.actions')}</th></tr></thead>
          <tbody>
            {list.loading && <LoadingRow text={t('admin.loadingReports')} />}
            {!list.loading && list.rows.length === 0 && <EmptyRow text={t('admin.noReports')} />}
            {list.rows.map((row) => {
              const messageUser = row.message?.user?.username ?? row.message?.sender?.username ?? row.message?.author?.username ?? 'unknown';
              const messageText = row.kind === 'video' ? `[${t('admin.video')}] ${row.message?.title || t('admin.untitled')}` : row.kind === 'tweet' ? `[tweet] ${row.message?.text || ''}` : row.message?.text || `[${t('admin.voice')}]`;
              return <tr key={row.id}>
                <td className="admin-check-cell"><SelectCheckbox checked={selection.isSelected(row.id)} onChange={() => selection.toggle(row.id)} label={String(row.id)} /></td>
                <td className="admin-mono"><Flag size={13} /> {row.id}</td>
                <td>@{row.reporter}</td>
                <td className="admin-ellipsis" title={messageText}>@{messageUser}: {messageText}</td>
                <td>{row.reason}</td>
                <td><Badge tone={row.status === 'OPEN' ? 'red' : row.status === 'RESOLVED' ? 'green' : 'amber'}>{statusLabel(t, row.status)}</Badge></td>
                <td className="admin-dim">{fmtDateTime(row.createdAt)}</td>
                <td className="admin-actions">
                  {row.status === 'OPEN' && <button className="btn-icon" title={t('admin.markReviewed')} onClick={() => update(row.id, 'REVIEWED')}><Eye size={14} /></button>}
                  {row.status !== 'RESOLVED' && <button className="btn-icon" title={t('admin.resolve')} onClick={() => update(row.id, 'RESOLVED')}><Check size={14} /></button>}
                </td>
              </tr>;
            })}
          </tbody>
        </table>
      </div>
      <Pager page={list.page} pages={list.pages} setPage={list.setPage} />
    </div>
  );
}

function statusLabel(t: (key: string, vars?: Record<string, string | number>) => string, status: string) {
  const keys: Record<string, string> = {
    OPEN: 'admin.openStatus',
    REVIEWED: 'admin.reviewed',
    RESOLVED: 'admin.resolved',
    DISMISSED: 'admin.dismissed',
  };
  return t(keys[status] ?? 'admin.status');
}
