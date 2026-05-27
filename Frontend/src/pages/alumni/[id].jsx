import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Layout from '../../components/Layout';
import { apiFetch } from '../../lib/api';

export default function AlumniDetail() {
  const router = useRouter();
  const { id } = router.query;
  const [alumni, setAlumni] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revealMsg, setRevealMsg] = useState('');

  useEffect(() => {
    if (!id) return;
    apiFetch(`/alumni/${id}`)
      .then(setAlumni)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  const reveal = async (field) => {
    setRevealMsg('');
    try {
      const res = await apiFetch(`/alumni/${id}/reveal`, {
        method: 'POST',
        body: JSON.stringify({ field }),
      });
      setRevealMsg(res.message || `Reveal request submitted for ${field}`);
    } catch (e) { setError(e.message); }
  };

  if (loading) return <Layout><p>Loading…</p></Layout>;
  if (error) return <Layout><div className="error">{error}</div></Layout>;
  if (!alumni) return <Layout><p>Not found</p></Layout>;

  const fieldSources = alumni.field_sources || {};

  return (
    <Layout>
      <div style={{ marginBottom: '1rem' }}>
        <Link href="/alumni">← Back to list</Link>
      </div>

      <h1 style={{ marginBottom: '0.25rem' }}>{alumni.full_name || 'Unnamed'}</h1>
      <div style={{ color: '#666', marginBottom: '1.5rem' }}>
        {alumni.degree && `${alumni.degree} `}
        {alumni.branch && `· ${alumni.branch} `}
        {alumni.batch_year && `· Batch ${alumni.batch_year}`}
      </div>

      {revealMsg && <div className="success">{revealMsg}</div>}

      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h2>Identity</h2>
        <Field label="Full name" value={alumni.full_name} src={fieldSources.full_name} />
        <Field label="Enrollment no." value={alumni.enrollment_no} src={fieldSources.enrollment_no} />
        <Field label="Date of birth" value={alumni.dob} src={fieldSources.dob} />
        <Field label="Branch" value={alumni.branch} src={fieldSources.branch} />
        <Field label="Degree" value={alumni.degree} src={fieldSources.degree} />
        <Field label="Batch year" value={alumni.batch_year} src={fieldSources.batch_year} />
      </div>

      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h2>Contact</h2>
        {(alumni.emails || []).length === 0 && (alumni.phones || []).length === 0 && !alumni.linkedin_url && (
          <p style={{ color: '#888' }}>No contact info on record.</p>
        )}
        {(alumni.emails || []).map((e, i) => (
          <Field key={`em${i}`} label={i === 0 ? 'Email' : ''}
                 value={<span>{e.value} <small style={{ color: '#999' }}>· {e.type} · conf {e.confidence}{e.smtp_status ? ` · ${e.smtp_status}` : ''}</small></span>} />
        ))}
        {(alumni.phones || []).map((p, i) => (
          <Field key={`ph${i}`} label={i === 0 ? 'Phone' : ''}
                 value={<span>{p.value} <small style={{ color: '#999' }}>· {p.type} · conf {p.confidence}</small></span>} />
        ))}
        <Field label="LinkedIn"
               value={alumni.linkedin_url ? <a href={alumni.linkedin_url} target="_blank" rel="noreferrer">{alumni.linkedin_url}</a> : null}
               src={fieldSources.linkedin_url} />
      </div>

      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h2>Current Employment</h2>
        <Field label="Company" value={alumni.current_company} src={fieldSources.current_company} />
        <Field label="Title" value={alumni.current_title} src={fieldSources.current_title} />
        <Field label="Industry" value={alumni.industry} src={fieldSources.industry} />
        <Field label="City" value={alumni.current_city} src={fieldSources.current_city} />
        <Field label="Country" value={alumni.current_country} src={fieldSources.current_country} />
      </div>

      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h2>Company History ({alumni.companies?.length || 0})</h2>
        {(!alumni.companies || alumni.companies.length === 0) ? (
          <p style={{ color: '#888' }}>No company records yet.</p>
        ) : (
          <table>
            <thead>
              <tr><th>Company</th><th>Title</th><th>Status</th><th>Source</th><th>Confidence</th></tr>
            </thead>
            <tbody>
              {alumni.companies.map((c, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 600 }}>{c.company}</td>
                  <td>{c.title || '-'}</td>
                  <td>
                    <span className={`badge ${c.is_current ? 'badge-green' : 'badge-gray'}`}>
                      {c.is_current ? 'Current' : 'Past'}
                    </span>
                  </td>
                  <td>{c.source || '-'}</td>
                  <td>{c.confidence ? `${Math.round(c.confidence)}%` : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h2>Tags & Notes</h2>
        <Field label="Tags" value={(alumni.tags || []).join(', ') || '-'} />
        <Field label="Notes" value={alumni.notes} />
      </div>

      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h2>System</h2>
        <Field label="Overall confidence"
               value={alumni.overall_confidence ? `${Math.round(alumni.overall_confidence)}%` : '-'} />
        <Field label="Verified" value={alumni.is_verified ? 'Yes' : 'No'} />
        <Field label="Last verified" value={alumni.last_verified_at} />
        <Field label="Missing in Apollo" value={alumni.missing_in_apollo ? 'Yes' : 'No'} />
        <Field label="Apollo last checked" value={alumni.apollo_checked_at} />
        <Field label="Created" value={alumni.created_at} />
        <Field label="Updated" value={alumni.updated_at} />
      </div>
    </Layout>
  );
}

function Field({ label, value, src, masked, onReveal }) {
  const display = value === null || value === undefined || value === '' ? <span style={{ color: '#aaa' }}>—</span> : value;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr auto', gap: '1rem', padding: '0.4rem 0', borderBottom: '1px solid #f0f0f0' }}>
      <div style={{ color: '#666', fontSize: '0.9rem' }}>{label}</div>
      <div>{display} {src && <small style={{ color: '#999' }}>· {src}</small>}</div>
      <div>{masked && onReveal && <button className="btn btn-sm" onClick={onReveal}>Reveal</button>}</div>
    </div>
  );
}
