import { useState } from 'react';
import { api } from '../lib/api';
import { extractText } from '../lib/fileParse';

function saveJson(obj, filename) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function CodebookStep({ secret, onCodebookReady }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [codebook, setCodebook] = useState(null);

  async function handlePaper(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const paperText = await extractText(file);
      const { codebook } = await api.extractCodebook(paperText, secret);
      setCodebook(codebook);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleJson(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!parsed.codes || !Array.isArray(parsed.codes)) {
        throw new Error('Invalid codebook file — expected a "codes" array.');
      }
      setCodebook(parsed);
    } catch (err) {
      setError(err.message);
    }
  }

  function updateCode(idx, field, value) {
    const next = { ...codebook };
    next.codes = [...next.codes];
    next.codes[idx] = { ...next.codes[idx], [field]: value };
    setCodebook(next);
  }

  function deleteCode(idx) {
    const next = { ...codebook, codes: codebook.codes.filter((_, i) => i !== idx) };
    setCodebook(next);
  }

  function addCode() {
    setCodebook({
      ...codebook,
      codes: [
        ...codebook.codes,
        { name: '', definition: '', inclusion_criteria: '', exclusion_criteria: '', examples: [] },
      ],
    });
  }

  return (
    <div className="card">
      <h2>2. Build the codebook</h2>

      <div style={{ display: 'flex', gap: 32, marginBottom: 16 }}>
        <div style={{ flex: 1 }}>
          <p style={{ color: '#666', marginTop: 0 }}>
            <strong>Extract from paper</strong><br />
            Upload a PDF, DOCX, or TXT and the model will identify the qualitative codes the authors used.
          </p>
          <input type="file" accept=".pdf,.docx,.txt,.md" onChange={handlePaper} disabled={busy} />
          {busy && <div style={{ marginTop: 8 }}>Reading paper and extracting codes…</div>}
        </div>

        <div style={{ borderLeft: '1px solid #ddd' }} />

        <div style={{ flex: 1 }}>
          <p style={{ color: '#666', marginTop: 0 }}>
            <strong>Load saved codebook</strong><br />
            Upload a previously saved <code>.json</code> codebook to skip paper extraction.
          </p>
          <input type="file" accept=".json" onChange={handleJson} />
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      {codebook && (
        <>
          <h3 style={{ marginTop: 24 }}>
            Framework: {codebook.framework_name || '(not specified)'}
          </h3>
          <table style={{ tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: '14%' }} />
              <col style={{ width: '42%' }} />
              <col style={{ width: '38%' }} />
              <col style={{ width: '6%' }} />
            </colgroup>
            <thead>
              <tr>
                <th>Code</th>
                <th>Definition</th>
                <th>Include / exclude</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {codebook.codes.map((c, i) => (
                <tr key={i}>
                  <td>
                    <input
                      type="text"
                      value={c.name}
                      onChange={(e) => updateCode(i, 'name', e.target.value)}
                    />
                  </td>
                  <td>
                    <textarea
                      rows={5}
                      style={{ width: '100%', resize: 'vertical' }}
                      value={c.definition}
                      onChange={(e) => updateCode(i, 'definition', e.target.value)}
                    />
                  </td>
                  <td>
                    <div><strong>Include:</strong> {c.inclusion_criteria}</div>
                    <div style={{ marginTop: 6 }}><strong>Exclude:</strong> {c.exclusion_criteria}</div>
                  </td>
                  <td>
                    <button className="secondary" onClick={() => deleteCode(i)}>×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
            <button className="secondary" onClick={addCode}>+ Add code</button>
            <button
              className="secondary"
              onClick={() => saveJson(codebook, `${codebook.framework_name || 'codebook'}.json`)}
            >
              Save codebook
            </button>
            <button onClick={() => onCodebookReady(codebook)}>
              Approve codebook →
            </button>
          </div>
        </>
      )}
    </div>
  );
}
