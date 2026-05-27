import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Layout from '../../components/Layout';
import { apiFetch } from '../../lib/api';

export default function ImportJobDetail() {
  const router = useRouter();
  const { id } = router.query;
  const [job, setJob] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const timerRef = useRef(null);

  const load = async () => {
    try {
      const data = await apiFetch(`/import/${id}`);
      setJob(data);
      setError('');
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (!id) return;
    load();
  }, [id]);

  // Poll every 2s while the job is active
  useEffect(() => {
    if (!job) return;
    const active = ['pending', 'processing'].includes(job.status);
    if (timerRef.current) clearInterval(timerRef.current);
    if (active) {
      timerRef.current = setInterval(load, 2000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [job?.status, id]);

  if (loading) return <Layout><p>Loading…</p></Layout>;
  if (error) return <Layout><div className="error">{error}</div></Layout>;
  if (!job) return <Layout><p>Job not found</p></Layout>;

  const total = job.total_rows || 0;
  const processed = job.processed_rows || 0;
  const pct = total > 0 ? Math.round((processed / total) * 100) : 0;
  const remaining = Math.max(0, total - processed);

  const startedAt = job.started_at ? new Date(job.started_at) : null;
  const completedAt = job.completed_at ? new Date(job.completed_at) : null;
  const now = new Date();
  const elapsedSec = startedAt
    ? Math.round(((completedAt || now).getTime() - startedAt.getTime()) / 1000)
    : 0;
  const rate = elapsedSec > 0 ? (processed / elapsedSec) : 0;
  const etaSec = rate > 0 && remaining > 0 ? Math.round(remaining / rate) : null;

  const statusColor = {
    pending: '#e0a800',
    processing: '#1f6feb',
    completed: '#2da44e',
    failed: '#cf222e',
    cancelled: '#6e7781',
  }[job.status] || '#6e7781';

  const errorLog = Array.isArray(job.error_log) ? job.error_log : [];

  return (
    <Layout>
      <div style={{ marginBottom: '1rem' }}>
        <Link href="/import">← Back to import jobs</Link>
      </div>

      <h1 style={{ marginBottom: '0.25rem' }}>Import Job</h1>
      <div style={{ color: '#666', fontFamily: 'monospace', fontSize: '0.85rem', marginBottom: '1.5rem' }}>{job.id}</div>

      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <h2 style={{ margin: 0 }}>Status</h2>
          <span style={{ padding: '0.25rem 0.75rem', borderRadius: '12px', background: statusColor, color: 'white', fontWeight: 600, fontSize: '0.85rem' }}>
            {job.status?.toUpperCase()}
          </span>
        </div>

        <div style={{ marginBottom: '0.75rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: '#666', marginBottom: '0.25rem' }}>
            <span>{processed.toLocaleString()} / {total.toLocaleString()} rows</span>
            <span>{pct}%</span>
          </div>
          <div style={{ height: '10px', background: '#eee', borderRadius: '5px', overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: statusColor, transition: 'width 0.4s ease' }} />
          </div>
        </div>

        {['pending', 'processing'].includes(job.status) && (
          <div style={{ fontSize: '0.85rem', color: '#666' }}>
            {rate > 0 && <>Rate: <strong>{rate.toFixed(1)} rows/sec</strong> · </>}
            {etaSec !== null && <>ETA: <strong>{formatDuration(etaSec)}</strong> · </>}
            Elapsed: <strong>{formatDuration(elapsedSec)}</strong>
            <span style={{ marginLeft: '0.5rem', color: '#999' }}>(auto-refresh every 2s)</span>
          </div>
        )}
        {job.status === 'completed' && (
          <div style={{ fontSize: '0.85rem', color: '#666' }}>
            Took <strong>{formatDuration(elapsedSec)}</strong>
            {rate > 0 && <> at {rate.toFixed(1)} rows/sec</>}
          </div>
        )}
      </div>

      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h2>Outcome counts</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
          <Stat label="New" value={job.new_count} color="#2da44e" />
          <Stat label="Merged" value={job.merged_count} color="#1f6feb" />
          <Stat label="Review" value={job.review_count} color="#e0a800" />
          <Stat label="Errors" value={job.error_count} color="#cf222e" />
        </div>
      </div>

      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h2>Metadata</h2>
        <Row label="Source type" value={job.source_type} />
        <Row label="Source tier" value={job.source_tier} />
        <Row label="Source name" value={job.source_name} />
        <Row label="File path" value={<code style={{ fontSize: '0.8rem' }}>{job.file_path}</code>} />
        <Row label="Started" value={startedAt ? startedAt.toLocaleString() : '-'} />
        <Row label="Completed" value={completedAt ? completedAt.toLocaleString() : '-'} />
        <Row label="Created" value={job.created_at ? new Date(job.created_at).toLocaleString() : '-'} />
      </div>

      {errorLog.length > 0 && (
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <h2>Errors ({errorLog.length})</h2>
          <pre style={{ background: '#fafafa', padding: '0.75rem', borderRadius: '4px', maxHeight: '300px', overflow: 'auto', fontSize: '0.8rem' }}>
            {JSON.stringify(errorLog, null, 2)}
          </pre>
        </div>
      )}
    </Layout>
  );
}

function Stat({ label, value, color }) {
  return (
    <div style={{ textAlign: 'center', padding: '0.75rem', background: '#fafafa', borderRadius: '6px' }}>
      <div style={{ fontSize: '1.75rem', fontWeight: 700, color }}>{(value ?? 0).toLocaleString()}</div>
      <div style={{ fontSize: '0.8rem', color: '#666', marginTop: '0.25rem' }}>{label}</div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: '1rem', padding: '0.4rem 0', borderBottom: '1px solid #f0f0f0' }}>
      <div style={{ color: '#666', fontSize: '0.9rem' }}>{label}</div>
      <div>{value || <span style={{ color: '#aaa' }}>—</span>}</div>
    </div>
  );
}

function formatDuration(seconds) {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}
