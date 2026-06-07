import { useEffect, useState } from 'react';
import Link from 'next/link';
import Layout from '../../components/Layout';
import { apiFetch } from '../../lib/api';

// Dev-only diagnostic view of the merging algorithm. Surfaces:
//   - Every distinct branch value in alumni vs. pending reviews (so you can
//     spot rows the canonicalizer doesn't understand)
//   - Batch-year distribution on both sides
//   - Duplicate-alumni clusters (the rows that cause identity_ambiguous reviews)
//
// Branch rows are tagged with their canonical short code. Empty canonical =
// matcher can't categorise the value → manual work for the operator.
export default function ReviewDiagnostics() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('branches');

  useEffect(() => {
    apiFetch('/review/diagnostics')
      .then(setData)
      .catch(e => setError(e.message));
  }, []);

  if (error) return (
    <Layout><div className="error">{error}</div></Layout>
  );
  if (!data) return (
    <Layout><div className="card">Loading diagnostics…</div></Layout>
  );

  return (
    <Layout>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.5rem' }}>
        <h1 style={{ margin: 0 }}>Merging diagnostics</h1>
        <Link href="/review" style={{ fontSize: '0.85rem', color: '#1d4e89' }}>← back to Review Queue</Link>
      </div>
      <p style={{ color: '#666', fontSize: '0.85rem', marginTop: '-0.25rem', marginBottom: '1rem' }}>
        What the matcher is actually seeing. Branch rows with no canonical (✗) are the ones generating manual doubts.
      </p>

      {data.queue && (
        <div className="grid-stats">
          <div className="stat-card"><div className="stat-value">{data.queue.pending ?? 0}</div><div className="stat-label">Pending total</div></div>
          <div className="stat-card"><div className="stat-value">{data.queue.pending_fuzzy ?? 0}</div><div className="stat-label">Fuzzy</div></div>
          <div className="stat-card"><div className="stat-value">{data.queue.pending_multi_candidate ?? 0}</div><div className="stat-label">Multi-candidate</div></div>
          <div className="stat-card"><div className="stat-value">{data.queue.pending_no_branch ?? 0}</div><div className="stat-label">No branch in incoming</div></div>
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.4rem', marginTop: '1rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
        {[
          { key: 'branches',  label: 'Branches' },
          { key: 'batches',   label: 'Batch years' },
          { key: 'duplicates', label: `Duplicate alumni clusters (${data.alumni_dup_clusters?.length || 0})` },
        ].map(t => (
          <button
            key={t.key}
            className="btn btn-sm"
            onClick={() => setTab(t.key)}
            style={{
              background: tab === t.key ? '#1d4e89' : '#eef1f5',
              color: tab === t.key ? '#fff' : '#333',
              border: '1px solid ' + (tab === t.key ? 'transparent' : '#cdd3db'),
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'branches' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <BranchTable
            title="In alumni table"
            rows={data.alumni_branches}
            countKey="alumni_count"
            note="Distinct branch values in alumni. ✗ = matcher can't canonicalize this value."
          />
          <BranchTable
            title="In pending reviews (incoming side)"
            rows={data.pending_branches}
            countKey="pending_count"
            note="Branch values arriving in pending reviews. Compare to the left to see which incoming values can't merge."
          />
        </div>
      )}

      {tab === 'batches' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <BatchTable title="In alumni table"  rows={data.alumni_batches}  countKey="alumni_count"  />
          <BatchTable title="In pending reviews" rows={data.pending_batches} countKey="pending_count" />
        </div>
      )}

      {tab === 'duplicates' && (
        <div className="card" style={{ padding: '1rem' }}>
          <p style={{ color: '#666', fontSize: '0.85rem', marginTop: 0 }}>
            Alumni rows that share <code>(LOWER(name), batch_year, LOWER(branch))</code> — these clusters are why the
            matcher keeps producing <strong>identity_ambiguous</strong> reviews. Top 100 by row count.
          </p>
          {(data.alumni_dup_clusters?.length || 0) === 0 ? (
            <p style={{ color: '#1e7b34' }}>No duplicate clusters — alumni table is clean on this axis.</p>
          ) : (
            <table style={{ width: '100%', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ background: '#f3f5f8' }}>
                  <th style={{ textAlign: 'left', padding: '0.4rem' }}>Name</th>
                  <th style={{ textAlign: 'left', padding: '0.4rem' }}>Batch</th>
                  <th style={{ textAlign: 'left', padding: '0.4rem' }}>Branch</th>
                  <th style={{ textAlign: 'right', padding: '0.4rem' }}>Rows</th>
                </tr>
              </thead>
              <tbody>
                {data.alumni_dup_clusters.map((c, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #eef1f5' }}>
                    <td style={{ padding: '0.4rem' }}>{c.name}</td>
                    <td style={{ padding: '0.4rem' }}>{c.batch_year}</td>
                    <td style={{ padding: '0.4rem' }}>{c.branch}</td>
                    <td style={{ padding: '0.4rem', textAlign: 'right' }}>
                      <span className={`badge ${c.row_count > 4 ? 'badge-red' : 'badge-yellow'}`}>{c.row_count}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </Layout>
  );
}

function BranchTable({ title, rows, countKey, note }) {
  return (
    <div className="card" style={{ padding: '1rem', maxHeight: 600, overflowY: 'auto' }}>
      <h3 style={{ marginTop: 0 }}>{title} ({rows.length})</h3>
      <p style={{ color: '#666', fontSize: '0.8rem', marginTop: 0 }}>{note}</p>
      <table style={{ width: '100%', fontSize: '0.82rem' }}>
        <thead>
          <tr style={{ background: '#f3f5f8' }}>
            <th style={{ textAlign: 'left', padding: '0.3rem' }}>Branch</th>
            <th style={{ textAlign: 'left', padding: '0.3rem' }}>Canonical</th>
            <th style={{ textAlign: 'right', padding: '0.3rem' }}>{countKey === 'alumni_count' ? 'Rows' : 'Reviews'}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ borderBottom: '1px solid #eef1f5' }}>
              <td style={{ padding: '0.3rem' }}>{r.value}</td>
              <td style={{ padding: '0.3rem' }}>
                {r.canonical
                  ? <span className="badge badge-green">{r.canonical}</span>
                  : <span className="badge badge-red" title="Matcher can't canonicalize this — manual doubt will fire.">✗</span>}
              </td>
              <td style={{ padding: '0.3rem', textAlign: 'right' }}>{r[countKey]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BatchTable({ title, rows, countKey }) {
  return (
    <div className="card" style={{ padding: '1rem', maxHeight: 600, overflowY: 'auto' }}>
      <h3 style={{ marginTop: 0 }}>{title} ({rows.length})</h3>
      <table style={{ width: '100%', fontSize: '0.82rem' }}>
        <thead>
          <tr style={{ background: '#f3f5f8' }}>
            <th style={{ textAlign: 'left', padding: '0.3rem' }}>Batch year</th>
            <th style={{ textAlign: 'right', padding: '0.3rem' }}>{countKey === 'alumni_count' ? 'Rows' : 'Reviews'}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ borderBottom: '1px solid #eef1f5' }}>
              <td style={{ padding: '0.3rem' }}>{r.year}</td>
              <td style={{ padding: '0.3rem', textAlign: 'right' }}>{r[countKey]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
