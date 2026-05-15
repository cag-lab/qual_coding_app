import { useState, useMemo } from 'react';
import { downloadCsv } from '../lib/csv';
import { computeMetrics } from '../lib/agreement';

function fmt(n, decimals = 3) {
  if (n === null || n === undefined) return '—';
  return n.toFixed(decimals);
}

function kappaBenchmark(k) {
  if (k >= 0.8) return { label: 'Almost perfect', color: '#15803d' };
  if (k >= 0.6) return { label: 'Substantial', color: '#65a30d' };
  if (k >= 0.4) return { label: 'Moderate', color: '#ca8a04' };
  if (k >= 0.2) return { label: 'Fair', color: '#ea580c' };
  return { label: 'Slight / poor', color: '#b91c1c' };
}

export default function CompareStep({ llmCodings, codebook }) {
  const codebookCodes = codebook?.codes?.map((c) => c.name) ?? [];

  // Physician codings entered manually
  const [physicianCodings, setPhysicianCodings] = useState([]);

  // Draft for the add-row form
  const [draftQuote, setDraftQuote] = useState('');
  const [draftCode, setDraftCode] = useState(codebookCodes[0] ?? '');

  function addCoding() {
    const quote = draftQuote.trim();
    if (!quote || !draftCode) return;
    setPhysicianCodings((prev) => [...prev, { quote, code: draftCode }]);
    setDraftQuote('');
  }

  function removeCoding(idx) {
    setPhysicianCodings((prev) => prev.filter((_, i) => i !== idx));
  }

  const metrics = useMemo(() => {
    if (physicianCodings.length === 0) return null;
    return computeMetrics(llmCodings, physicianCodings, codebookCodes);
  }, [llmCodings, physicianCodings, codebookCodes]);

  const kappaInfo = metrics ? kappaBenchmark(metrics.kappa) : null;

  return (
    <div className="card">
      <h2>4. Compare LLM vs physician codings</h2>

      {/* ── Entry form ── */}
      <div style={{ marginBottom: 8 }}>
        <label style={{ fontWeight: 500, display: 'block', marginBottom: 6 }}>
          Add a physician coding
        </label>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <textarea
            rows={2}
            style={{ flex: 1, resize: 'vertical' }}
            placeholder="Paste the highlighted quote here…"
            value={draftQuote}
            onChange={(e) => setDraftQuote(e.target.value)}
          />
          <select
            value={draftCode}
            onChange={(e) => setDraftCode(e.target.value)}
            style={{ minWidth: 160 }}
          >
            {codebookCodes.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <button onClick={addCoding} disabled={!draftQuote.trim() || !draftCode}>
            Add
          </button>
        </div>
      </div>

      {/* ── Entered codings list ── */}
      {physicianCodings.length > 0 && (
        <table style={{ marginBottom: 24 }}>
          <thead>
            <tr>
              <th style={{ width: '70%' }}>Quote</th>
              <th>Code</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {physicianCodings.map((row, i) => (
              <tr key={i}>
                <td style={{ fontSize: 13 }}>"{row.quote}"</td>
                <td><span className="code-pill">{row.code}</span></td>
                <td>
                  <button className="secondary" onClick={() => removeCoding(i)}>×</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {physicianCodings.length === 0 && (
        <p style={{ color: '#aaa', fontSize: 13 }}>No physician codings added yet.</p>
      )}

      {/* ── Metrics (auto-update as codings are added) ── */}
      {metrics && (
        <>
          {/* Overall metrics */}
          <h3 style={{ marginTop: 28 }}>Overall agreement</h3>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 24 }}>
            <MetricBox
              label="Cohen's κ"
              value={fmt(metrics.kappa, 3)}
              sub={kappaInfo.label}
              subColor={kappaInfo.color}
              tooltip="Chance-corrected agreement across all (span × code) units. Landis & Koch benchmarks apply."
            />
            <MetricBox
              label="Krippendorff's α"
              value={fmt(metrics.alpha, 3)}
              sub={metrics.alpha >= 0.667 ? 'Acceptable (≥0.667)' : 'Below threshold'}
              subColor={metrics.alpha >= 0.667 ? '#15803d' : '#b91c1c'}
              tooltip="Generalized reliability coefficient. α ≥ 0.667 is the commonly cited minimum."
            />
            <MetricBox
              label="% Agreement"
              value={`${(metrics.percentAgreement * 100).toFixed(1)}%`}
              sub={`${metrics.counts.a} agree-pos · ${metrics.counts.d} agree-neg`}
              subColor="#555"
              tooltip="Raw proportion of (span × code) units where both raters gave the same answer."
            />
            <MetricBox
              label="Units (n)"
              value={metrics.counts.n}
              sub={`${metrics.counts.b + metrics.counts.c} disagreements`}
              subColor="#555"
              tooltip="Total (span cluster × code) pairs evaluated. Each is a binary yes/no from each rater."
            />
          </div>

          {/* 2×2 table */}
          <details style={{ marginBottom: 24 }}>
            <summary style={{ cursor: 'pointer', fontWeight: 500, fontSize: 14 }}>
              Agreement breakdown (2×2 table)
            </summary>
            <table style={{ marginTop: 12, width: 'auto' }}>
              <thead>
                <tr>
                  <th></th>
                  <th>Physician: yes</th>
                  <th>Physician: no</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><strong>LLM: yes</strong></td>
                  <td style={{ color: '#15803d' }}>{metrics.counts.a} (both coded)</td>
                  <td style={{ color: '#b91c1c' }}>{metrics.counts.b} (LLM only)</td>
                </tr>
                <tr>
                  <td><strong>LLM: no</strong></td>
                  <td style={{ color: '#b91c1c' }}>{metrics.counts.c} (physician only)</td>
                  <td>{metrics.counts.d} (neither)</td>
                </tr>
              </tbody>
            </table>
          </details>

          {/* Per-code IoU */}
          <h3>Per-code span IoU</h3>
          <p style={{ fontSize: 13, color: '#666', marginTop: -8 }}>
            IoU = matched spans / (LLM spans ∪ physician spans) for each code.
            Spans are matched by word-level Jaccard similarity ≥ 0.5.
          </p>
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th style={{ textAlign: 'right' }}>LLM</th>
                <th style={{ textAlign: 'right' }}>Physician</th>
                <th style={{ textAlign: 'right' }}>Matched</th>
                <th style={{ textAlign: 'right' }}>IoU</th>
                <th>Bar</th>
              </tr>
            </thead>
            <tbody>
              {metrics.perCode.map((row) => (
                <tr key={row.code}>
                  <td><span className="code-pill">{row.code}</span></td>
                  <td style={{ textAlign: 'right' }}>{row.llmCount}</td>
                  <td style={{ textAlign: 'right' }}>{row.physCount}</td>
                  <td style={{ textAlign: 'right' }}>{row.matched}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>
                    {row.iou === null ? '—' : fmt(row.iou, 2)}
                  </td>
                  <td style={{ minWidth: 100 }}>
                    {row.iou !== null && (
                      <div style={{ background: '#e5e7eb', borderRadius: 4, height: 10 }}>
                        <div style={{
                          background: row.iou >= 0.7 ? '#15803d' : row.iou >= 0.4 ? '#ca8a04' : '#b91c1c',
                          borderRadius: 4,
                          height: 10,
                          width: `${row.iou * 100}%`,
                        }} />
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Span comparison */}
          <h3 style={{ marginTop: 28 }}>Span-by-span comparison</h3>
          <table>
            <thead>
              <tr>
                <th style={{ width: '45%' }}>Quote</th>
                <th>LLM code(s)</th>
                <th>Physician code(s)</th>
                <th>Match?</th>
              </tr>
            </thead>
            <tbody>
              {metrics.clusters.map((cl, i) => {
                const llmCodes = cl.llmSpan ? [...(metrics.llmBySpan[cl.llmSpan] ?? [])] : [];
                const physCodes = cl.physSpan ? [...(metrics.physBySpan[cl.physSpan] ?? [])] : [];
                const llmSet = new Set(llmCodes);
                const allMatch =
                  llmCodes.length === physCodes.length && llmCodes.every((c) => new Set(physCodes).has(c));

                return (
                  <tr key={i} style={allMatch ? { background: '#f0fdf4' } : undefined}>
                    <td style={{ fontSize: 13 }}>
                      "{cl.canonical}"
                      {cl.llmSpan && cl.physSpan && cl.llmSpan !== cl.physSpan && (
                        <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>≈ fuzzy match</div>
                      )}
                      {!cl.llmSpan && <div style={{ fontSize: 11, color: '#888' }}>physician only</div>}
                      {!cl.physSpan && <div style={{ fontSize: 11, color: '#888' }}>LLM only</div>}
                    </td>
                    <td>
                      {llmCodes.length === 0
                        ? <span style={{ color: '#aaa' }}>—</span>
                        : llmCodes.map((c) => (
                          <span key={c} className="code-pill" style={{ marginRight: 4, display: 'inline-block', marginBottom: 2 }}>{c}</span>
                        ))}
                    </td>
                    <td>
                      {physCodes.length === 0
                        ? <span style={{ color: '#aaa' }}>—</span>
                        : physCodes.map((c) => (
                          <span
                            key={c}
                            className="code-pill"
                            style={{
                              marginRight: 4,
                              display: 'inline-block',
                              marginBottom: 2,
                              background: llmSet.has(c) ? '#dcfce7' : '#fee2e2',
                              color: llmSet.has(c) ? '#166534' : '#991b1b',
                            }}
                          >
                            {c}
                          </span>
                        ))}
                    </td>
                    <td style={{ fontSize: 18 }}>
                      {allMatch ? '✓' : <span style={{ color: '#b91c1c' }}>✗</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div style={{ marginTop: 16 }}>
            <button
              className="secondary"
              onClick={() => {
                const rows = metrics.clusters.map((cl) => ({
                  quote: cl.canonical,
                  llm_codes: cl.llmSpan ? [...(metrics.llmBySpan[cl.llmSpan] ?? [])].join('; ') : '',
                  physician_codes: cl.physSpan ? [...(metrics.physBySpan[cl.physSpan] ?? [])].join('; ') : '',
                  source: cl.llmSpan && cl.physSpan ? 'both' : cl.llmSpan ? 'llm_only' : 'physician_only',
                }));
                downloadCsv(rows, 'comparison.csv');
              }}
            >
              Download comparison CSV
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function MetricBox({ label, value, sub, subColor, tooltip }) {
  return (
    <div
      title={tooltip}
      style={{
        border: '1px solid #e5e7eb',
        borderRadius: 8,
        padding: '14px 20px',
        minWidth: 140,
        background: '#fafafa',
        cursor: tooltip ? 'help' : 'default',
      }}
    >
      <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: subColor, marginTop: 6 }}>{sub}</div>}
    </div>
  );
}
