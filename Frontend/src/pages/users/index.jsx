import { useState, useEffect } from 'react';
import Layout from '../../components/Layout';
import { apiFetch } from '../../lib/api';

export default function Users() {
  const [users, setUsers] = useState([]);
  const [invite, setInvite] = useState({ email: '', name: '', role: 'team_member', password: 'Welcome@123' });
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  const load = () => apiFetch('/users').then(d => setUsers(d.data || d || [])).catch(e => setError(e.message));
  useEffect(() => { load(); }, []);

  const create = async (e) => {
    e.preventDefault(); setError('');
    try {
      await apiFetch('/auth/register', { method: 'POST', body: JSON.stringify(invite) });
      setMsg(`User ${invite.email} created`); setShowForm(false); setInvite({ email: '', name: '', role: 'team_member', password: 'Welcome@123' }); load();
    } catch (e) { setError(e.message); }
  };

  const changeRole = async (id, role) => {
    try { await apiFetch(`/admin/users/${id}/role`, { method: 'PATCH', body: JSON.stringify({ role }) }); setMsg('Role updated'); load(); }
    catch (e) { setError(e.message); }
  };

  const remove = async (id, email) => {
    if (!confirm(`Delete ${email}?`)) return;
    try { await apiFetch(`/users/${id}`, { method: 'DELETE' }); setMsg('Deleted'); load(); }
    catch (e) { setError(e.message); }
  };

  return (
    <Layout>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h1 style={{ margin: 0 }}>Users</h1>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>+ Invite User</button>
      </div>
      {error && <div className="error">{error}</div>}
      {msg && <div className="success">{msg}</div>}

      {showForm && (
        <div className="card" style={{ border: '2px solid #6c63ff' }}>
          <h2>Invite User</h2>
          <form onSubmit={create}>
            <label>Name</label>
            <input value={invite.name} onChange={e => setInvite({...invite, name: e.target.value})} required />
            <label>Email</label>
            <input type="email" value={invite.email} onChange={e => setInvite({...invite, email: e.target.value})} required />
            <label>Role</label>
            <select value={invite.role} onChange={e => setInvite({...invite, role: e.target.value})}>
              <option value="team_member">Team Member</option>
              <option value="team_lead">Team Lead</option>
              <option value="admin">Admin</option>
            </select>
            <label>Temporary Password</label>
            <input value={invite.password} onChange={e => setInvite({...invite, password: e.target.value})} required />
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button type="submit" className="btn btn-success">Create</button>
              <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      <div className="table-wrap">
        <table>
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Active</th><th>Created</th><th>Actions</th></tr></thead>
          <tbody>
            {users.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: '#888', padding: '2rem' }}>No users</td></tr>}
            {users.map(u => (
              <tr key={u.id}>
                <td style={{ fontWeight: 600 }}>{u.name}</td>
                <td>{u.email}</td>
                <td>
                  <select value={u.role} onChange={e => changeRole(u.id, e.target.value)} style={{ marginBottom: 0, width: 'auto', padding: '0.25rem 0.5rem' }}>
                    <option value="team_member">team_member</option>
                    <option value="team_lead">team_lead</option>
                    <option value="admin">admin</option>
                    <option value="super_admin">super_admin</option>
                  </select>
                </td>
                <td><span className={`badge ${u.is_active ? 'badge-green' : 'badge-red'}`}>{u.is_active ? 'Active' : 'Inactive'}</span></td>
                <td>{u.created_at ? new Date(u.created_at).toLocaleDateString() : '-'}</td>
                <td><button className="btn btn-danger btn-sm" onClick={() => remove(u.id, u.email)}>Delete</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Layout>
  );
}
