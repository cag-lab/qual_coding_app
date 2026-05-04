import { useState } from 'react';
import ConnectionStep from './components/ConnectionStep';
import CodebookStep from './components/CodebookStep';
import CodingStep from './components/CodingStep';

export default function App() {
  const [step, setStep] = useState(1);
  const [secret, setSecret] = useState('');
  const [codebook, setCodebook] = useState(null);

  return (
    <div className="container">
      <h1>Qualitative Coding</h1>

      <div className="banner">
        <strong>PHI reminder:</strong> Only paste clinical notes if your Azure
        deployment is in a HIPAA-eligible subscription with a BAA in place. The
        backend should have request/response logging disabled.
      </div>

      <div className="steps">
        <div className={`step ${step === 1 ? 'active' : step > 1 ? 'done' : ''}`}>
          1. Connect
        </div>
        <div className={`step ${step === 2 ? 'active' : step > 2 ? 'done' : ''}`}>
          2. Codebook
        </div>
        <div className={`step ${step === 3 ? 'active' : ''}`}>
          3. Code note
        </div>
      </div>

      {step === 1 && (
        <ConnectionStep
          onConnected={(s) => {
            setSecret(s);
            setStep(2);
          }}
        />
      )}

      {step === 2 && (
        <CodebookStep
          secret={secret}
          onCodebookReady={(cb) => {
            setCodebook(cb);
            setStep(3);
          }}
        />
      )}

      {step === 3 && (
        <>
          <CodingStep secret={secret} codebook={codebook} />
          <button className="secondary" onClick={() => setStep(2)}>
            ← Edit codebook
          </button>
        </>
      )}
    </div>
  );
}
