/**
 * ExamProctor.ai — User Management Page (Admin)
 * User CRUD, active/inactive toggling, password management, and safe deletion.
 */

import { useEffect, useState, useCallback } from 'react';
import {
  Plus, Search, UserCheck, UserX, Ban, KeyRound, Trash2,
  Loader, AlertTriangle, X, Shield,
} from 'lucide-react';
import api from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';

const ROLES = ['student', 'professor', 'admin'];

function RoleBadge({ role }) {
  const m = { student: 'badge-blue', professor: 'badge-orange', admin: 'badge-red' };
  return <span className={`badge ${m[role] || 'badge-blue'}`}>{role}</span>;
}

function StatusBadge({ status }) {
  return (
    <span className={`badge ${status === 'active' ? 'badge-green' : 'badge-orange'}`}>
      {status}
    </span>
  );
}

function CreateUserModal({ onClose, onCreated }) {
  const toast = useToast();
  const [form, setForm] = useState({ full_name: '', email: '', usn: '', role: 'student', password: '' });
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { data } = await api.post('/users', form);
      onCreated(data.data);
      toast('User created successfully.', 'success');
      onClose();
    } catch (err) {
      toast(err?.response?.data?.message || err?.response?.data?.error?.message || 'Failed to create user.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="modal-create-user-title">
      <div className="modal">
        <div className="modal-header">
          <h2 id="modal-create-user-title" style={{ fontSize: 'var(--font-size-xl)', fontWeight: 700, color: 'var(--color-text-heading)' }}>
            Create User
          </h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <div className="form-group">
              <label className="form-label" htmlFor="cu-name">Full Name *</label>
              <input id="cu-name" className="form-input" value={form.full_name}
                onChange={(e) => set('full_name', e.target.value)} required />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="cu-email">Email *</label>
              <input id="cu-email" type="email" className="form-input" value={form.email}
                onChange={(e) => set('email', e.target.value)} required />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="cu-usn">USN (students)</label>
              <input id="cu-usn" className="form-input" value={form.usn}
                onChange={(e) => set('usn', e.target.value)} placeholder="e.g. 2VD23MI001" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
              <div className="form-group">
                <label className="form-label" htmlFor="cu-role">Role *</label>
                <select id="cu-role" className="form-select" value={form.role} onChange={(e) => set('role', e.target.value)}>
                  {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="cu-pwd">Temporary Password *</label>
                <input id="cu-pwd" type="password" className="form-input" value={form.password}
                  onChange={(e) => set('password', e.target.value)} required minLength={8} />
              </div>
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button id="btn-create-user-submit" type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? <><Loader size={14} className="animate-spin" /> Creating…</> : 'Create User'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ResetPasswordModal({ user, onClose, onReset }) {
  const toast = useToast();
  const [newPassword, setNewPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await api.post(`/users/${user.user_id}/reset-credentials`, {
        new_password: newPassword,
      });
      toast(`Password reset successfully for ${user.full_name}.`, 'success');
      onReset();
      onClose();
    } catch (err) {
      const msg = err?.response?.data?.message || err?.response?.data?.detail || err?.response?.data?.error?.message || 'Password reset failed.';
      setError(msg);
      toast(msg, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="modal-reset-pwd-title">
      <div className="modal">
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <KeyRound size={20} style={{ color: 'var(--color-blue)' }} />
            <h2 id="modal-reset-pwd-title" style={{ fontSize: 'var(--font-size-xl)', fontWeight: 700, color: 'var(--color-text-heading)' }}>
              Reset Password
            </h2>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <div>
              <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-2)' }}>
                Target Account: <strong style={{ color: 'var(--color-text-heading)' }}>{user.full_name}</strong> &nbsp;
                <RoleBadge role={user.role} />
              </p>
              <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
                Enter a new secure password. The user will be required to authenticate with this password immediately.
              </p>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="rp-new-pwd">New Password (minimum 8 characters) *</label>
              <input
                id="rp-new-pwd"
                type="text"
                className={`form-input ${error ? 'error' : ''}`}
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value);
                  setError('');
                }}
                placeholder="Enter new password"
                required
                minLength={8}
                autoFocus
              />
              {error && <p className="form-error">{error}</p>}
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button
              id="btn-reset-pwd-submit"
              type="submit"
              className="btn btn-primary"
              disabled={saving || newPassword.length < 8}
            >
              {saving ? <><Loader size={14} className="animate-spin" /> Saving…</> : 'Update Password'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DeleteUserModal({ user, onClose, onDeleted }) {
  const toast = useToast();
  const [typedConfirm, setTypedConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  const handleDelete = async () => {
    if (typedConfirm !== 'delete') return;
    setDeleting(true);
    setError('');
    try {
      await api.delete(`/users/${user.user_id}`);
      toast(`User "${user.full_name}" deleted successfully.`, 'success');
      onDeleted();
      onClose();
    } catch (err) {
      const msg = err?.response?.data?.message || err?.response?.data?.detail || err?.response?.data?.error?.message || 'Failed to delete user.';
      setError(msg);
      toast(msg, 'error');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="modal-delete-user-title">
      <div className="modal">
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <Trash2 size={20} style={{ color: 'var(--color-red)' }} />
            <h2 id="modal-delete-user-title" style={{ fontSize: 'var(--font-size-xl)', fontWeight: 700, color: 'var(--color-text-heading)' }}>
              Delete User Profile
            </h2>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <div>
            <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-1)' }}>
              Target: <strong style={{ color: 'var(--color-text-heading)' }}>{user.full_name}</strong> &nbsp;
              <RoleBadge role={user.role} />
            </p>
            <p style={{ fontSize: 'var(--font-size-xs)', fontFamily: 'monospace', color: 'var(--color-text-secondary)' }}>
              ID: {user.user_id} {user.email ? `• ${user.email}` : ''} {user.usn ? `• USN: ${user.usn}` : ''}
            </p>
          </div>

          <div
            style={{
              background: '#FEF2F2',
              border: '1.5px solid var(--color-red)',
              borderRadius: 'var(--radius-md)',
              padding: 'var(--space-3) var(--space-4)',
              color: 'var(--color-red)',
              fontSize: 'var(--font-size-xs)',
              lineHeight: 1.5,
              display: 'flex',
              gap: 'var(--space-2)',
            }}
          >
            <AlertTriangle size={18} style={{ flexShrink: 0 }} />
            <div>
              <strong>Warning:</strong> This permanently deletes this user account from active management.
              If this user has examination history or proctoring reports, academic records are safely preserved per retention policies.
            </div>
          </div>

          {error && <div className="alert alert-error">{error}</div>}

          <div className="form-group">
            <label className="form-label" htmlFor="du-confirm-input">
              To confirm deletion, type <strong style={{ color: 'var(--color-red)' }}>delete</strong> below:
            </label>
            <input
              id="du-confirm-input"
              type="text"
              className="form-input"
              value={typedConfirm}
              onChange={(e) => setTypedConfirm(e.target.value)}
              placeholder="type 'delete' to enable confirmation"
              autoFocus
            />
          </div>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={deleting}>
            Cancel
          </button>
          <button
            id="btn-delete-user-confirm"
            type="button"
            className="btn btn-primary"
            style={{
              background: typedConfirm === 'delete' ? 'var(--color-red)' : undefined,
              borderColor: typedConfirm === 'delete' ? 'var(--color-red)' : undefined,
            }}
            disabled={typedConfirm !== 'delete' || deleting}
            onClick={handleDelete}
          >
            {deleting ? <><Loader size={14} className="animate-spin" /> Deleting…</> : 'Permanently Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function UserManagement() {
  const { user: currentUser } = useAuth();
  const toast   = useToast();
  const [users, setUsers]     = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [search, setSearch]   = useState('');
  const [loading, setLoading] = useState(true);

  // Modals state
  const [showCreate, setShowCreate] = useState(false);
  const [resetModalUser, setResetModalUser] = useState(null);
  const [deleteModalUser, setDeleteModalUser] = useState(null);

  const fetchUsers = useCallback(() => {
    setLoading(true);
    api.get('/users')
      .then(({ data }) => {
        setUsers(data.data || []);
        setFiltered(data.data || []);
      })
      .catch((err) => {
        console.error(err);
        toast('Failed to load users.', 'error');
      })
      .finally(() => setLoading(false));
  }, [toast]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  useEffect(() => {
    const q = search.toLowerCase();
    setFiltered(
      users.filter((u) =>
        u.full_name?.toLowerCase().includes(q) ||
        u.email?.toLowerCase().includes(q) ||
        u.usn_normalized?.toLowerCase().includes(q)
      )
    );
  }, [search, users]);

  const toggleActive = async (targetUser) => {
    try {
      if (targetUser.account_status === 'active') {
        await api.post(`/users/${targetUser.user_id}/deactivate`);
        toast(`${targetUser.full_name} deactivated.`, 'warning');
      } else {
        await api.post(`/users/${targetUser.user_id}/activate`);
        toast(`${targetUser.full_name} activated.`, 'success');
      }
      fetchUsers();
    } catch (err) {
      toast(err?.response?.data?.message || err?.response?.data?.detail || 'Action failed.', 'error');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)', maxWidth: 1200, margin: '0 auto', width: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 'var(--font-size-3xl)', fontWeight: 800, color: 'var(--color-text-heading)', letterSpacing: '-0.02em' }}>
            User Management
          </h1>
          <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', fontWeight: 600 }}>
            Manage platform accounts, credentials, and access roles.
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)} id="btn-open-create-user">
          <Plus size={16} /> Create User
        </button>
      </div>

      {/* Search */}
      <div style={{ position: 'relative', maxWidth: 400 }}>
        <Search size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-secondary)' }} />
        <input
          id="user-search"
          type="search"
          className="form-input"
          placeholder="Search by name, email, or USN…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ paddingLeft: 40 }}
        />
      </div>

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
                <th>Full Name</th>
                <th>USN / Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Joined</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--color-text-secondary)', fontWeight: 500 }}>
                    No users found.
                  </td>
                </tr>
              ) : (
                filtered.map((u) => {
                  const isSelf = currentUser && u.user_id === currentUser.user_id;

                  return (
                    <tr key={u.user_id}>
                      <td style={{ fontWeight: 600 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                          <span>{u.full_name}</span>
                          {isSelf && (
                            <span className="badge badge-blue" style={{ fontSize: '10px', padding: '1px 6px' }}>
                              You
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        {u.usn_normalized ? (
                          <div style={{ fontFamily: 'monospace', fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-text-heading)' }}>
                            {u.usn_normalized}
                          </div>
                        ) : null}
                        <div style={{ fontSize: 'var(--font-size-xs)', color: u.usn_normalized ? 'var(--color-text-secondary)' : 'var(--color-text-heading)', fontWeight: 500 }}>
                          {u.email || (u.usn_normalized ? '' : 'No email provided')}
                        </div>
                      </td>
                      <td><RoleBadge role={u.role} /></td>
                      <td><StatusBadge status={u.account_status} /></td>
                      <td style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', fontWeight: 500 }}>
                        {u.created_at ? new Date(u.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : 'Not available'}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
                          {/* Activate / Deactivate */}
                          <button
                            className={`btn btn-sm btn-amber`}
                            onClick={() => toggleActive(u)}
                            disabled={isSelf}
                            id={`btn-toggle-user-${u.user_id.slice(0, 8)}`}
                            title={isSelf ? 'You cannot deactivate your own account.' : u.account_status === 'active' ? 'Deactivate user' : 'Reactivate user'}
                            aria-label={u.account_status === 'active' ? 'Deactivate user' : 'Reactivate user'}
                          >
                            {u.account_status === 'active'
                              ? <Ban size={13} />
                              : <UserCheck size={13} />}
                          </button>

                          {/* Reset Password (allowed for self and other admins) */}
                          <button
                            className="btn btn-sm btn-violet"
                            onClick={() => setResetModalUser(u)}
                            id={`btn-reset-pwd-${u.user_id.slice(0, 8)}`}
                            title={isSelf ? 'Change your own password' : 'Reset user credentials'}
                            aria-label={isSelf ? 'Change your own password' : 'Reset user credentials'}
                          >
                            <KeyRound size={13} />
                          </button>

                          {/* Delete Profile */}
                          <button
                            className="btn btn-sm btn-danger"
                            disabled={isSelf}
                            onClick={() => setDeleteModalUser(u)}
                            id={`btn-delete-user-${u.user_id.slice(0, 8)}`}
                            title={isSelf ? 'You cannot delete your own account.' : 'Delete user profile'}
                            aria-label="Delete user profile"
                          >
                            <Trash2 size={13} />
                            <span>Delete</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* MODAL: Create User */}
      {showCreate && (
        <CreateUserModal
          onClose={() => setShowCreate(false)}
          onCreated={(u) => setUsers((prev) => [u, ...prev])}
        />
      )}

      {/* MODAL: Reset Password */}
      {resetModalUser && (
        <ResetPasswordModal
          user={resetModalUser}
          onClose={() => setResetModalUser(null)}
          onReset={fetchUsers}
        />
      )}

      {/* MODAL: Delete User Profile */}
      {deleteModalUser && (
        <DeleteUserModal
          user={deleteModalUser}
          onClose={() => setDeleteModalUser(null)}
          onDeleted={fetchUsers}
        />
      )}
    </div>
  );
}
