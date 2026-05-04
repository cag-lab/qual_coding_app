import { useState } from 'react';
import { api } from '../lib/api';

export default function ConnectionStep({ onConnected }) {
  const [secret, setSecret] = useState('');
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);

  async function test() {
    setBusy(true);
    setStatus(null);
    try {
      const res = await api.testConnection(secret);
      setStatus({ ok: true, msg: `Connected. Model replied: "${res.reply}"` });
    } catch (e) {
      setStatus({ ok: false, msg: e.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <h2>1. Connect to Azure</h2>
      <p style={{ color: '#666', fontSize: 14 }}>
        The Azure endpoint, deployment, and API key are configured on the backend
        (<code>backend/.env</code>). This screen just verifies the connection works.
        If your backend uses a shared secret, enter it below.
      </p>

      <div className="row">
        <label>Shared secret</label>
        <input
          type="password"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          placeholder="Leave blank if not configured"
        />
      </div>

      <button onClick={test} disabled={busy}>
        {busy ? 'Testing…' : 'Test connection'}
      </button>

      {status && (
        <div className={status.ok ? 'success' : 'error'}>{status.msg}</div>
      )}

      {status?.ok && (
        <div style={{ marginTop: 16 }}>
          <button className="secondary" onClick={() => onConnected(secret)}>
            Continue →
          </button>
        </div>
      )}
    </div>
  );
}
