import { useState, useEffect } from 'react';
import Layout from '../../components/Layout';
import { apiFetch } from '../../lib/api';

export default function Admin() {
  const [settings, setSettings] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [users, setUsers] = useState([]);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    apiFetch('/admin/settings').then(d => setSettings(d.settings || d)).catch(() => {});
    apiFetch('/admin/sessions').then(d => setSessions(d.data || d || [])).catch(() => {});
    apiFetch('/admin/users').then(d => setUsers(d.data || d || [])).catch(() => {});
  }, []);

  const forceLogout = async (id) => {
    try { await apiFetch(`/admin/sessions/${id}`, { method: 'DELETE' }); setMsg('Session terminated'); setSessions(s => s.filter(x => x.id !== id)); }
    catch (e) { setError(e.message); }
  };

  return (
    <Layout>
      <h1>Admin</h1>
      {error && <div className="error">{error}</div>}
      {msg && <div className="success">{msg}</div>}

      <div className="card">
        <h2>System Settings</h2>
        {settings ? (
          <pre style={{ fontSize: '0.8rem', overflowX: 'auto', whiteSpace: 'pre-wrap', background: '#f9f9f9', padding: '1rem', borderRadius: 5 }}>
            {JSON.stringify(settings, null, 2)}
          </pre>
        ) : <p style={{ color: '#888' }}>No settings configured</p>}
      </div>

      <div className="card">
        <h2>All Users ({users.length})</h2>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Active</th><th>Locked</th></tr></thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id}>
                  <td>{u.name}</td>
                  <td>{u.email}</td>
                  <td><span className="badge badge-blue">{u.role}</span></td>
                  <td><span className={`badge ${u.is_active ? 'badge-green' : 'badge-red'}`}>{u.is_active ? 'Yes' : 'No'}</span></td>
                  <td><span className={`badge ${u.is_locked ? 'badge-red' : 'badge-green'}`}>{u.is_locked ? 'Locked' : 'OK'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h2>Active Sessions ({sessions.length})</h2>
        <div className="table-wrap">
          <table>
            <thead><tr><th>User</th><th>IP</th><th>User Agent</th><th>Created</th><th>Actions</th></tr></thead>
            <tbody>
              {sessions.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', color: '#888', padding: '1rem' }}>No active sessions</td></tr>}
              {sessions.map(s => (
                <tr key={s.id}>
                  <td>{s.user_email || s.user_id?.substring(0,8)}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>{s.ip_address}</td>
                  <td style={{ fontSize: '0.75rem', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.user_agent}</td>
                  <td>{s.created_at ? new Date(s.created_at).toLocaleString() : '-'}</td>
                  <td><button className="btn btn-danger btn-sm" onClick={() => forceLogout(s.id)}>Force Logout</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
}
