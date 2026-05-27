import { useState, useEffect } from 'react';
import Layout from '../../components/Layout';
import { apiFetch } from '../../lib/api';

const empty = { name: '', subject: '', body: '', target_filter: '{}' };

export default function Campaigns() {
  const [campaigns, setCampaigns] = useState([]);
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  const load = () => apiFetch('/campaigns').then(d => setCampaigns(d.data || d || [])).catch(e => setError(e.message));
  useEffect(() => { load(); }, []);

  const save = async (e) => {
    e.preventDefault(); setError('');
    try {
      if (editing) {
        await apiFetch(`/campaigns/${editing}`, { method: 'PUT', body: JSON.stringify(form) });
        setMsg('Updated');
      } else {
        await apiFetch('/campaigns', { method: 'POST', body: JSON.stringify(form) });
        setMsg('Created');
      }
      setForm(empty); setEditing(null); setShowForm(false); load();
    } catch (e) { setError(e.message); }
  };

  const remove = async (id) => {
    if (!confirm('Delete campaign?')) return;
    try { await apiFetch(`/campaigns/${id}`, { method: 'DELETE' }); setMsg('Deleted'); load(); }
    catch (e) { setError(e.message); }
  };

  const send = async (id) => {
    if (!confirm('Send this campaign?')) return;
    try { await apiFetch(`/campaigns/${id}/send`, { method: 'POST' }); setMsg('Sent!'); load(); }
    catch (e) { setError(e.message); }
  };

  const startEdit = (c) => { setForm({ name: c.name, subject: c.subject, body: c.body, target_filter: JSON.stringify(c.target_filter || {}) }); setEditing(c.id); setShowForm(true); };

  return (
    <Layout>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h1 style={{ margin: 0 }}>Campaigns</h1>
        <button className="btn btn-primary" onClick={() => { setForm(empty); setEditing(null); setShowForm(!showForm); }}>+ New Campaign</button>
      </div>
      {error && <div className="error">{error}</div>}
      {msg && <div className="success">{msg}</div>}

      {showForm && (
        <div className="card" style={{ border: '2px solid #6c63ff' }}>
          <h2>{editing ? 'Edit Campaign' : 'New Campaign'}</h2>
          <form onSubmit={save}>
            <label>Name</label>
            <input value={form.name} onChange={e => setForm({...form, name: e.target.value})} required />
            <label>Subject</label>
            <input value={form.subject} onChange={e => setForm({...form, subject: e.target.value})} required />
            <label>Body</label>
            <textarea value={form.body} onChange={e => setForm({...form, body: e.target.value})} rows={5} required />
            <label>Target Filter (JSON)</label>
            <input value={form.target_filter} onChange={e => setForm({...form, target_filter: e.target.value})} placeholder='{}'/>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button type="submit" className="btn btn-success">{editing ? 'Update' : 'Create'}</button>
              <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      <div className="table-wrap">
        <table>
          <thead><tr><th>Name</th><th>Subject</th><th>Status</th><th>Created</th><th>Actions</th></tr></thead>
          <tbody>
            {campaigns.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', color: '#888', padding: '2rem' }}>No campaigns</td></tr>}
            {campaigns.map(c => (
              <tr key={c.id}>
                <td style={{ fontWeight: 600 }}>{c.name}</td>
                <td>{c.subject}</td>
                <td><span className={`badge ${c.status === 'sent' ? 'badge-green' : c.status === 'sending' ? 'badge-blue' : 'badge-yellow'}`}>{c.status || 'draft'}</span></td>
                <td>{c.created_at ? new Date(c.created_at).toLocaleDateString() : '-'}</td>
                <td style={{ display: 'flex', gap: '0.4rem' }}>
                  <button className="btn btn-primary btn-sm" onClick={() => startEdit(c)}>Edit</button>
                  <button className="btn btn-success btn-sm" onClick={() => send(c.id)}>Send</button>
                  <button className="btn btn-danger btn-sm" onClick={() => remove(c.id)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Layout>
  );
}
