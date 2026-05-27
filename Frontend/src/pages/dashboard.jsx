import { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import { apiFetch } from '../lib/api';

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch('/dashboard').then(setStats).catch(e => setError(e.message));
  }, []);

  return (
    <Layout>
      <h1>Dashboard</h1>
      {error && <div className="error">{error}</div>}

      {stats && (
        <>
          <div className="grid-stats">
            <div className="stat-card"><div className="stat-value">{stats.alumni?.total ?? 0}</div><div className="stat-label">Total Alumni</div></div>
            <div className="stat-card"><div className="stat-value">{stats.alumni?.verified ?? 0}</div><div className="stat-label">Verified</div></div>
            <div className="stat-card"><div className="stat-value">{stats.imports?.pending ?? 0}</div><div className="stat-label">Pending Imports</div></div>
            <div className="stat-card"><div className="stat-value">{stats.reviews?.pending ?? 0}</div><div className="stat-label">Pending Reviews</div></div>
            <div className="stat-card"><div className="stat-value">{stats.campaigns?.active ?? 0}</div><div className="stat-label">Active Campaigns</div></div>
            <div className="stat-card"><div className="stat-value">{stats.users?.total ?? 0}</div><div className="stat-label">Users</div></div>
          </div>

          <div className="card">
            <h2>Raw Response</h2>
            <pre style={{ fontSize: '0.78rem', overflowX: 'auto', whiteSpace: 'pre-wrap' }}>{JSON.stringify(stats, null, 2)}</pre>
          </div>
        </>
      )}

      {!stats && !error && <div className="card" style={{ color: '#888' }}>Loading...</div>}
    </Layout>
  );
}
