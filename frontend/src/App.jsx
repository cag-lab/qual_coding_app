import { useState } from 'react';
import ConnectionStep from './components/ConnectionStep';
import CodebookStep from './components/CodebookStep';
import CodingStep from './components/CodingStep';
import CompareStep from './components/CompareStep';

export default function App() {
  const [step, setStep] = useState(1);
  const [secret, setSecret] = useState('');
  const [codebook, setCodebook] = useState(null);
  const [llmCodings, setLlmCodings] = useState(null);

  return (
    <div className="container">
      <h1>Respiratory Failure — Qualitative Coding</h1>

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
        <div className={`step ${step === 3 ? 'active' : step > 3 ? 'done' : ''}`}>
          3. Code note
        </div>
        <div className={`step ${step === 4 ? 'active' : ''}`}>
          4. Compare
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
          <CodingStep
            secret={secret}
            codebook={codebook}
            onCompare={(codings) => {
              setLlmCodings(codings);
              setStep(4);
            }}
          />
          <button className="secondary" onClick={() => setStep(2)}>
            ← Edit codebook
          </button>
        </>
      )}

      {step === 4 && (
        <>
          <CompareStep llmCodings={llmCodings} codebook={codebook} />
          <button className="secondary" style={{ marginTop: 8 }} onClick={() => setStep(3)}>
            ← Back to coding
          </button>
        </>
      )}
    </div>
  );
}
