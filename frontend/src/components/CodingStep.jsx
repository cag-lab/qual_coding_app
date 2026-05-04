import { useState } from 'react';
import { api } from '../lib/api';
import { extractText } from '../lib/fileParse';
import { downloadCsv } from '../lib/csv';

export default function CodingStep({ secret, codebook }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [results, setResults] = useState(null);
  const [noteText, setNoteText] = useState('');
  const [filterCode, setFilterCode] = useState('');

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await extractText(file);
      setNoteText(text);
    } catch (err) {
      setError(err.message);
    }
  }

  async function runCoding() {
    if (!noteText.trim()) {
      setError('Please upload or paste a clinical note first');
      return;
    }
    setBusy(true);
    setError(null);
    setResults(null);
    try {
      const { codings } = await api.codeNote(noteText, codebook, secret);
      setResults(codings.codings || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const filtered = filterCode
    ? results?.filter((r) => r.code === filterCode)
    : results;

  const codeOptions = results
    ? [...new Set(results.map((r) => r.code))]
    : [];

  return (
    <div className="card">
      <h2>3. Code a clinical note</h2>

      <div className="row">
        <label>Upload note</label>
        <input type="file" accept=".pdf,.docx,.txt,.md" onChange={handleFile} />
      </div>

      <textarea
        rows={8}
        style={{ width: '100%', marginTop: 8 }}
        placeholder="…or paste the note here"
        value={noteText}
        onChange={(e) => setNoteText(e.target.value)}
      />

      <div style={{ marginTop: 12 }}>
        <button onClick={runCoding} disabled={busy}>
          {busy ? 'Coding (this can take 10-30s)…' : 'Run coding'}
        </button>
      </div>

      {error && <div className="error">{error}</div>}

      {results && (
        <>
          <div style={{ marginTop: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3>Results ({filtered.length} {filterCode ? `of ${results.length}` : ''})</h3>
            <div style={{ display: 'flex', gap: 8 }}>
              <select value={filterCode} onChange={(e) => setFilterCode(e.target.value)}>
                <option value="">All codes</option>
                {codeOptions.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <button
                className="secondary"
                onClick={() => downloadCsv(filtered, 'codings.csv')}
              >
                Download CSV
              </button>
            </div>
          </div>

          {filtered.length === 0 ? (
            <p style={{ color: '#666' }}>No passages matched the codebook.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th style={{ width: '45%' }}>Quote</th>
                  <th>Code</th>
                  <th>Rationale</th>
                  <th>Conf.</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => (
                  <tr key={i}>
                    <td>"{r.quote}"</td>
                    <td><span className="code-pill">{r.code}</span></td>
                    <td style={{ fontSize: 13 }}>{r.rationale}</td>
                    <td>{r.confidence}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  );
}
