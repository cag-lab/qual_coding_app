import { useState } from 'react';
import { api } from '../lib/api';
import { extractText } from '../lib/fileParse';
import { downloadCsv } from '../lib/csv';

export default function CodingStep({ secret, codebook, onCompare }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [results, setResults] = useState(null);
  const [noteText, setNoteText] = useState('');
  const [filterCode, setFilterCode] = useState('');

  // corrections: { [rowIndex]: { correctedCode, reason } }
  const [corrections, setCorrections] = useState({});
  // which row's correction form is open
  const [editing, setEditing] = useState(null);
  const [editDraft, setEditDraft] = useState({ correctedCode: '', reason: '' });

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

  async function runCoding(correctionsList) {
    if (!noteText.trim()) {
      setError('Please upload or paste a clinical note first');
      return;
    }
    setBusy(true);
    setError(null);
    setResults(null);
    setCorrections({});
    setEditing(null);
    try {
      const { codings } = await api.codeNote(noteText, codebook, secret, correctionsList);
      setResults(codings.codings || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function openEdit(idx) {
    const existing = corrections[idx];
    setEditDraft({
      correctedCode: existing?.correctedCode ?? results[idx].code,
      reason: existing?.reason ?? '',
    });
    setEditing(idx);
  }

  function saveEdit(idx) {
    if (!editDraft.correctedCode || !editDraft.reason.trim()) return;
    setCorrections((prev) => ({ ...prev, [idx]: { ...editDraft } }));
    setEditing(null);
  }

  function removeCorrection(idx) {
    setCorrections((prev) => {
      const next = { ...prev };
      delete next[idx];
      return next;
    });
    if (editing === idx) setEditing(null);
  }

  function buildCorrectionsList() {
    return Object.entries(corrections).map(([idx, c]) => ({
      quote: results[Number(idx)].quote,
      original_code: results[Number(idx)].code,
      corrected_code: c.correctedCode,
      reason: c.reason,
    }));
  }

  const correctionCount = Object.keys(corrections).length;

  const filtered = filterCode
    ? results?.filter((r) => r.code === filterCode)
    : results;

  const codeOptions = results
    ? [...new Set(results.map((r) => r.code))]
    : [];

  const codebookCodes = codebook?.codes?.map((c) => c.name) ?? [];

  return (
    <div className="card">
      <h2>3. Code a clinical note (respiratory failure focus)</h2>

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

      <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
        <button onClick={() => runCoding()} disabled={busy}>
          {busy ? 'Coding (this can take 10-30s)…' : 'Run coding'}
        </button>

        {correctionCount > 0 && (
          <button onClick={() => runCoding(buildCorrectionsList())} disabled={busy}>
            Re-run with {correctionCount} correction{correctionCount > 1 ? 's' : ''}
          </button>
        )}
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
              {onCompare && results.length > 0 && (
                <button onClick={() => onCompare(results)}>
                  Compare with physician →
                </button>
              )}
            </div>
          </div>

          {filtered.length === 0 ? (
            <p style={{ color: '#666' }}>No passages matched the codebook.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th style={{ width: '40%' }}>Quote</th>
                  <th>Code</th>
                  <th>Rationale</th>
                  <th>Conf.</th>
                  <th style={{ width: '5%' }}></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => {
                  const realIdx = results.indexOf(r);
                  const correction = corrections[realIdx];
                  const isEditing = editing === realIdx;

                  return (
                    <>
                      <tr key={i} style={correction ? { background: '#fff8e1' } : undefined}>
                        <td>"{r.quote}"</td>
                        <td>
                          <span className="code-pill">{r.code}</span>
                          {correction && (
                            <div style={{ marginTop: 4 }}>
                              <span className="code-pill" style={{ background: '#2e7d32', color: '#fff' }}>
                                → {correction.correctedCode}
                              </span>
                            </div>
                          )}
                        </td>
                        <td style={{ fontSize: 13 }}>{r.rationale}</td>
                        <td>{r.confidence}</td>
                        <td>
                          <button
                            className="secondary"
                            title="Flag for correction"
                            onClick={() => isEditing ? setEditing(null) : openEdit(realIdx)}
                          >
                            {correction ? '✎' : '⚑'}
                          </button>
                        </td>
                      </tr>

                      {isEditing && (
                        <tr key={`edit-${i}`} style={{ background: '#f5f5f5' }}>
                          <td colSpan={5} style={{ padding: '12px 16px' }}>
                            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                              <div>
                                <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Correct code</label>
                                <select
                                  value={editDraft.correctedCode}
                                  onChange={(e) => setEditDraft((d) => ({ ...d, correctedCode: e.target.value }))}
                                >
                                  {codebookCodes.map((c) => (
                                    <option key={c} value={c}>{c}</option>
                                  ))}
                                </select>
                              </div>
                              <div style={{ flex: 1, minWidth: 220 }}>
                                <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>
                                  Reason (used to guide re-run)
                                </label>
                                <input
                                  type="text"
                                  style={{ width: '100%' }}
                                  placeholder="e.g. initial reason for intubation = the act, not underlying cause"
                                  value={editDraft.reason}
                                  onChange={(e) => setEditDraft((d) => ({ ...d, reason: e.target.value }))}
                                />
                              </div>
                              <div style={{ display: 'flex', gap: 6, paddingTop: 20 }}>
                                <button onClick={() => saveEdit(realIdx)} disabled={!editDraft.reason.trim()}>
                                  Save
                                </button>
                                {correction && (
                                  <button className="secondary" onClick={() => removeCorrection(realIdx)}>
                                    Remove
                                  </button>
                                )}
                                <button className="secondary" onClick={() => setEditing(null)}>
                                  Cancel
                                </button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  );
}
