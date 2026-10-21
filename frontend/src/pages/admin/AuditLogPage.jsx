/**
 * ExamProctor.ai — Audit Log Page (Admin)
 * Enhanced with server-side pagination, resolved actor/target display names,
 * 3 deletion selection modes (individual, current-page, all-matching),
 * typed confirmation modal, and protected Deletion History tab.
 */

import { useEffect, useState, useCallback } from 'react';
import {
  RefreshCw, Filter, Trash2, CheckSquare, Square,
  AlertTriangle, ShieldCheck, History, ChevronLeft, ChevronRight, X,
} from 'lucide-react';
import api from '../../services/api';
import { useToast } from '../../contexts/ToastContext';

const ACTION_TYPES = [
  '',
  'login', 'logout',
  'attempt_authorized', 'attempt_submitted',
  'retake_granted',
  'setting_changed',
  'user_created', 'user_activated', 'user_deactivated',
  'exam_published', 'exam_closed', 'exam_started', 'exam_restarted', 'exam_deleted',
  'grade_corrected', 'answer_key_corrected',
];

function fmtDT(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
}

export default function AuditLogPage() {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState('logs'); // 'logs' | 'history'

  // Audit Logs State
  const [logs, setLogs] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, page_size: 20, total: 0, total_pages: 1 });
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');

  // Selection & Deletion State
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [isAllMatchingSelected, setIsAllMatchingSelected] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmCheckbox, setConfirmCheckbox] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Deletion History State
  const [deletionHistory, setDeletionHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Fetch Logs with server-side pagination
  const fetchLogs = useCallback(async (page = pagination.page, actionType = filter) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        page_size: '20',
      });
      if (actionType) params.set('action_type', actionType);
      const { data } = await api.get(`/audit-logs?${params}`);
      setLogs(data.data || []);
      if (data.pagination) {
        setPagination(data.pagination);
      }
      setSelectedIds(new Set());
      setIsAllMatchingSelected(false);
    } catch {
      toast('Could not load audit logs.', 'error');
    } finally {
      setLoading(false);
    }
  }, [pagination.page, filter, toast]);

  // Fetch Deletion History
  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const { data } = await api.get('/audit-logs/deletion-history');
      setDeletionHistory(data.data || []);
    } catch {
      toast('Could not load deletion history.', 'error');
    } finally {
      setHistoryLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (activeTab === 'logs') {
      fetchLogs();
    } else {
      fetchHistory();
    }
  }, [activeTab, fetchLogs, fetchHistory]);

  const handleFilterChange = (e) => {
    const newFilter = e.target.value;
    setFilter(newFilter);
    fetchLogs(1, newFilter);
  };

  const handlePageChange = (newPage) => {
    if (newPage < 1 || newPage > pagination.total_pages) return;
    fetchLogs(newPage, filter);
  };

  // Selection Handlers
  const toggleSelectId = (id) => {
    setIsAllMatchingSelected(false);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAllOnPage = () => {
    setIsAllMatchingSelected(false);
    const currentPageIds = logs.map((l) => l.audit_log_id);
    setSelectedIds(new Set(currentPageIds));
  };

  const handleSelectAllMatching = () => {
    setSelectedIds(new Set(logs.map((l) => l.audit_log_id)));
    setIsAllMatchingSelected(true);
  };

  const handleClearSelection = () => {
    setSelectedIds(new Set());
    setIsAllMatchingSelected(false);
    setSelectionMode(false);
  };

  // Execute Deletion
  const executeDeletion = async () => {
    if (!confirmCheckbox) return;
    setDeleting(true);
    try {
      const mode = isAllMatchingSelected
        ? 'all_matching'
        : selectedIds.size === logs.length && logs.length > 0
        ? 'current_page'
        : 'individual';

      const payload = {
        mode,
        ids: isAllMatchingSelected ? [] : Array.from(selectedIds),
        filter_action_type: filter || null,
      };

      const { data } = await api.post('/audit-logs/delete', payload);
      toast(`Successfully deleted ${data.data.deleted_count} audit record(s).`, 'success');

      setShowConfirmModal(false);
      setConfirmCheckbox(false);
      handleClearSelection();
      fetchLogs(1, filter);
    } catch (err) {
      toast(err?.response?.data?.message || 'Deletion failed.', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const selectedCount = isAllMatchingSelected ? pagination.total : selectedIds.size;

  const ACTION_COLOR = {
    login: 'badge-green',
    logout: 'badge-blue',
    attempt_submitted: 'badge-green',
    attempt_authorized: 'badge-blue',
    retake_granted: 'badge-orange',
    setting_changed: 'badge-yellow',
    user_deactivated: 'badge-red',
    user_activated: 'badge-green',
    exam_published: 'badge-orange',
    exam_started: 'badge-green',
    exam_closed: 'badge-red',
    exam_deleted: 'badge-red',
    grade_corrected: 'badge-blue',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)', maxWidth: 1150 }}>
      {/* Header & Tabs */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 'var(--font-size-3xl)', fontWeight: 800, color: 'var(--color-text-heading)', letterSpacing: '-0.02em' }}>
            Audit &amp; Compliance Logs
          </h1>
          <p style={{ color: 'var(--color-text-secondary)', fontWeight: 600, marginTop: 'var(--space-1)', fontSize: 'var(--font-size-sm)' }}>
            Authoritative, tamper-evident security records of platform operations.
          </p>
        </div>

        {/* Tab Controls */}
        <div style={{ display: 'flex', gap: 'var(--space-2)', background: 'var(--color-surface)', padding: 4, borderRadius: 'var(--radius-md)', border: 'var(--border-base)' }}>
          <button
            className={`btn btn-sm ${activeTab === 'logs' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setActiveTab('logs')}
            id="tab-audit-logs"
          >
            <ShieldCheck size={16} /> Audit Logs
          </button>
          <button
            className={`btn btn-sm ${activeTab === 'history' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setActiveTab('history')}
            id="tab-deletion-history"
          >
            <History size={16} /> Deletion History
          </button>
        </div>
      </div>

      {/* ── TAB 1: AUDIT LOGS ──────────────────────────────────────────────── */}
      {activeTab === 'logs' && (
        <>
          {/* Controls Bar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
            {/* Filter */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <Filter size={15} style={{ color: 'var(--color-text-secondary)' }} />
              <select
                id="audit-filter"
                className="form-select"
                value={filter}
                onChange={handleFilterChange}
                style={{ minWidth: 200, fontSize: 'var(--font-size-sm)', fontWeight: 600 }}
              >
                {ACTION_TYPES.map((t) => (
                  <option key={t} value={t}>{t ? t.replace(/_/g, ' ').toUpperCase() : 'All Actions'}</option>
                ))}
              </select>

              <button
                className="btn btn-secondary btn-sm"
                onClick={() => fetchLogs(pagination.page, filter)}
                id="btn-refresh-audit"
              >
                <RefreshCw size={14} /> Refresh
              </button>
            </div>

            {/* Selection Controls */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              {!selectionMode ? (
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => setSelectionMode(true)}
                  id="btn-enable-selection"
                >
                  <CheckSquare size={15} /> Select Records
                </button>
              ) : (
                <>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={handleSelectAllOnPage}
                    id="btn-select-page"
                  >
                    Select All on This Page
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={handleSelectAllMatching}
                    id="btn-select-matching"
                  >
                    Select All Matching ({pagination.total})
                  </button>
                  <button
                    className="btn btn-primary btn-sm"
                    style={{ background: 'var(--color-red)', borderColor: 'var(--color-border)' }}
                    onClick={() => setShowConfirmModal(true)}
                    disabled={selectedCount === 0}
                    id="btn-delete-selected"
                  >
                    <Trash2 size={14} /> Delete Selected ({selectedCount})
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={handleClearSelection}
                  >
                    Cancel
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Scope notice banner if all matching selected */}
          {isAllMatchingSelected && (
            <div className="alert alert-warning" style={{ margin: 0, padding: 'var(--space-3) var(--space-4)' }}>
              <AlertTriangle size={18} />
              <span style={{ fontWeight: 700 }}>
                Scope: All {pagination.total} matching audit records across the entire database are selected for deletion.
              </span>
            </div>
          )}

          {/* Table */}
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
              <div className="spinner spinner-lg" />
            </div>
          ) : (
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    {selectionMode && <th style={{ width: 40 }}></th>}
                    <th>Time</th>
                    <th>Action</th>
                    <th>Actor</th>
                    <th>Target</th>
                    <th>Result</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.length === 0 ? (
                    <tr>
                      <td colSpan={selectionMode ? 6 : 5} style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--color-text-secondary)', fontWeight: 600 }}>
                        No matching audit records found.
                      </td>
                    </tr>
                  ) : (
                    logs.map((l) => {
                      const isSelected = selectedIds.has(l.audit_log_id) || isAllMatchingSelected;
                      return (
                        <tr
                          key={l.audit_log_id}
                          style={{ background: isSelected ? 'var(--color-blue-panel)' : undefined }}
                        >
                          {selectionMode && (
                            <td style={{ textAlign: 'center' }}>
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleSelectId(l.audit_log_id)}
                                style={{ width: 16, height: 16, cursor: 'pointer' }}
                              />
                            </td>
                          )}
                          <td style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600, color: 'var(--color-text-heading)', whiteSpace: 'nowrap' }}>
                            {fmtDT(l.occurred_at)}
                          </td>
                          <td>
                            <span className={`badge ${ACTION_COLOR[l.action_type] || 'badge-blue'}`}>
                              {l.action_type?.replace(/_/g, ' ')}
                            </span>
                          </td>
                          <td style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-text-heading)' }}>
                            {l.actor_name}
                            <span style={{ color: 'var(--color-text-secondary)', fontWeight: 500, marginLeft: 6 }}>
                              · {l.actor_role}
                            </span>
                          </td>
                          <td style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', fontWeight: 600 }}>
                            {l.target_name}
                          </td>
                          <td>
                            <span className={`badge ${l.result === 'success' ? 'badge-green' : 'badge-red'}`}>
                              {l.result}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination Controls */}
          {pagination.total > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--space-2) 0', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
              <div style={{ fontSize: 'var(--font-size-sm)', fontWeight: 700, color: 'var(--color-text-secondary)' }}>
                Showing {(pagination.page - 1) * pagination.page_size + 1}–{Math.min(pagination.page * pagination.page_size, pagination.total)} of {pagination.total} records
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => handlePageChange(pagination.page - 1)}
                  disabled={!pagination.has_prev}
                  id="btn-prev-page"
                >
                  <ChevronLeft size={16} /> Previous
                </button>

                <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
                  {Array.from({ length: Math.min(5, pagination.total_pages) }, (_, idx) => {
                    let pageNum;
                    if (pagination.total_pages <= 5) {
                      pageNum = idx + 1;
                    } else if (pagination.page <= 3) {
                      pageNum = idx + 1;
                    } else if (pagination.page >= pagination.total_pages - 2) {
                      pageNum = pagination.total_pages - 4 + idx;
                    } else {
                      pageNum = pagination.page - 2 + idx;
                    }
                    return (
                      <button
                        key={pageNum}
                        className={`btn btn-sm ${pagination.page === pageNum ? 'btn-primary' : 'btn-ghost'}`}
                        onClick={() => handlePageChange(pageNum)}
                        style={{ minWidth: 34, padding: '4px 8px' }}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                </div>

                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => handlePageChange(pagination.page + 1)}
                  disabled={!pagination.has_next}
                  id="btn-next-page"
                >
                  Next <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── TAB 2: DELETION HISTORY ────────────────────────────────────────── */}
      {activeTab === 'history' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <p style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, color: 'var(--color-text-secondary)', margin: 0 }}>
              Permanent audit records documenting administrative log deletions. This history cannot be cleared by ordinary deletion.
            </p>
            <button className="btn btn-secondary btn-sm" onClick={fetchHistory} id="btn-refresh-history">
              <RefreshCw size={14} /> Refresh
            </button>
          </div>

          {historyLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
              <div className="spinner spinner-lg" />
            </div>
          ) : (
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Administrator</th>
                    <th>Selection Mode</th>
                    <th>Filter Scope</th>
                    <th>Records Deleted</th>
                    <th>Result</th>
                  </tr>
                </thead>
                <tbody>
                  {deletionHistory.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--color-text-secondary)', fontWeight: 600 }}>
                        No deletion history records found.
                      </td>
                    </tr>
                  ) : (
                    deletionHistory.map((h) => (
                      <tr key={h.history_id}>
                        <td style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600, color: 'var(--color-text-heading)' }}>
                          {fmtDT(h.occurred_at)}
                        </td>
                        <td style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-text-heading)' }}>
                          {h.admin_name} <span style={{ color: 'var(--color-text-secondary)', fontWeight: 500 }}>· {h.admin_role}</span>
                        </td>
                        <td style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, textTransform: 'capitalize' }}>
                          {h.selection_mode?.replace(/_/g, ' ')}
                        </td>
                        <td style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', fontWeight: 600 }}>
                          {h.filter_scope}
                        </td>
                        <td style={{ fontSize: 'var(--font-size-sm)', fontWeight: 800, color: 'var(--color-red)' }}>
                          {h.deleted_count}
                        </td>
                        <td>
                          <span className="badge badge-green">Recorded</span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ── MODAL: DELETION CONFIRMATION ──────────────────────────────────── */}
      {showConfirmModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 100,
          background: 'rgba(16, 32, 74, 0.65)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-4)',
        }}>
          <div style={{
            background: 'var(--color-surface)', border: 'var(--border-base)',
            borderRadius: 'var(--radius-lg)', padding: 'var(--space-6)', maxWidth: 500, width: '100%',
            boxShadow: 'var(--shadow-lg)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <AlertTriangle size={22} style={{ color: 'var(--color-red)' }} />
                <h3 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 800, color: 'var(--color-text-heading)', margin: 0 }}>
                  Confirm Permanent Deletion
                </h3>
              </div>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => { setShowConfirmModal(false); setConfirmCheckbox(false); }}
                style={{ padding: 4 }}
              >
                <X size={18} />
              </button>
            </div>

            <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', lineHeight: 1.6, margin: 0 }}>
              You are about to permanently delete <strong>{selectedCount}</strong> audit record(s).
              {isAllMatchingSelected && (
                <span style={{ display: 'block', marginTop: 'var(--space-2)', color: 'var(--color-red)', fontWeight: 700 }}>
                  Scope: All records matching the current filter will be removed across all pages.
                </span>
              )}
            </p>

            <div style={{
              background: 'var(--color-red-light)', border: '1px solid var(--color-red)',
              borderRadius: 'var(--radius-md)', padding: 'var(--space-3) var(--space-4)',
              fontSize: 'var(--font-size-xs)', color: 'var(--color-red)', fontWeight: 600, lineHeight: 1.5,
            }}>
              WARNING: This operation is permanent and cannot be undone. An entry documenting this administrative action will be recorded in the Deletion History log.
            </div>

            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)', cursor: 'pointer', marginTop: 'var(--space-1)' }}>
              <input
                type="checkbox"
                id="chk-confirm-delete"
                checked={confirmCheckbox}
                onChange={(e) => setConfirmCheckbox(e.target.checked)}
                style={{ width: 18, height: 18, marginTop: 2, cursor: 'pointer' }}
              />
              <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-text-heading)', lineHeight: 1.4 }}>
                I confirm that I want to permanently delete these audit records.
              </span>
            </label>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)', marginTop: 'var(--space-2)' }}>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => { setShowConfirmModal(false); setConfirmCheckbox(false); }}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary btn-sm"
                style={{ background: 'var(--color-red)', borderColor: 'var(--color-border)' }}
                onClick={executeDeletion}
                disabled={!confirmCheckbox || deleting}
                id="btn-confirm-delete-action"
              >
                {deleting ? 'Deleting…' : `Permanently Delete ${selectedCount} Records`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
