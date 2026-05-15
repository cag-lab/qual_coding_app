// Inter-rater agreement metrics for span-based qualitative coding.
// Units are (span_cluster × code) pairs; each rater records 0/1 per unit.

function tokenize(text) {
  return text.toLowerCase().replace(/\s+/g, ' ').trim().split(/\s+/).filter(Boolean);
}

function jaccardSim(a, b) {
  const sa = new Set(tokenize(a));
  const sb = new Set(tokenize(b));
  const inter = [...sa].filter((t) => sb.has(t)).length;
  const union = new Set([...sa, ...sb]).size;
  return union === 0 ? 1 : inter / union;
}

// Greedily cluster spans from two raters: each LLM span is matched to the
// best-matching physician span (Jaccard ≥ threshold). Unmatched spans each
// form their own single-source cluster.
function clusterSpans(llmCodings, physCodings, threshold = 0.5) {
  const llmSpans = [...new Set(llmCodings.map((c) => c.quote))];
  const physSpans = [...new Set(physCodings.map((c) => c.quote))];
  const physUsed = new Set();
  const clusters = [];

  for (const ls of llmSpans) {
    let bestSim = threshold;
    let bestIdx = -1;
    physSpans.forEach((ps, i) => {
      if (physUsed.has(i)) return;
      const sim = jaccardSim(ls, ps);
      if (sim > bestSim) { bestSim = sim; bestIdx = i; }
    });
    if (bestIdx >= 0) {
      physUsed.add(bestIdx);
      clusters.push({ canonical: ls, llmSpan: ls, physSpan: physSpans[bestIdx] });
    } else {
      clusters.push({ canonical: ls, llmSpan: ls, physSpan: null });
    }
  }
  physSpans.forEach((ps, i) => {
    if (!physUsed.has(i)) clusters.push({ canonical: ps, llmSpan: null, physSpan: ps });
  });

  return clusters;
}

// Per-code span IoU: what fraction of spans did both raters identify for each code?
function perCodeIoU(llmCodings, physCodings, codes) {
  return codes.map((code) => {
    const ls = [...new Set(llmCodings.filter((c) => c.code === code).map((c) => c.quote))];
    const ps = [...new Set(physCodings.filter((c) => c.code === code).map((c) => c.quote))];
    const physUsed = new Set();
    let matched = 0;
    for (const l of ls) {
      let bestSim = 0.5;
      let bestIdx = -1;
      ps.forEach((p, i) => {
        if (physUsed.has(i)) return;
        const sim = jaccardSim(l, p);
        if (sim > bestSim) { bestSim = sim; bestIdx = i; }
      });
      if (bestIdx >= 0) { matched++; physUsed.add(bestIdx); }
    }
    const unionSize = ls.length + ps.length - matched;
    return {
      code,
      llmCount: ls.length,
      physCount: ps.length,
      matched,
      iou: unionSize > 0 ? matched / unionSize : null,
    };
  });
}

export function computeMetrics(llmCodings, physCodings, codebookCodes) {
  // Use union of codebook codes + any codes either rater actually used
  const codes = [...new Set([
    ...codebookCodes,
    ...llmCodings.map((c) => c.code),
    ...physCodings.map((c) => c.code),
  ])];

  const clusters = clusterSpans(llmCodings, physCodings);

  // Build lookup: span text → set of codes
  const llmBySpan = {};
  for (const c of llmCodings) {
    (llmBySpan[c.quote] ??= new Set()).add(c.code);
  }
  const physBySpan = {};
  for (const c of physCodings) {
    (physBySpan[c.quote] ??= new Set()).add(c.code);
  }

  // Build binary unit matrix: one entry per (cluster, code)
  let a = 0, b = 0, c = 0, d = 0;
  for (const cl of clusters) {
    for (const code of codes) {
      const r1 = cl.llmSpan  ? (llmBySpan[cl.llmSpan]?.has(code)  ? 1 : 0) : 0;
      const r2 = cl.physSpan ? (physBySpan[cl.physSpan]?.has(code) ? 1 : 0) : 0;
      if      (r1 === 1 && r2 === 1) a++;
      else if (r1 === 1 && r2 === 0) b++;
      else if (r1 === 0 && r2 === 1) c++;
      else                           d++;
    }
  }

  const n = a + b + c + d;

  // Cohen's Kappa
  const Po = (a + d) / n;
  const Pe = ((a + b) / n) * ((a + c) / n) + ((c + d) / n) * ((b + d) / n);
  const kappa = Pe < 1 ? (Po - Pe) / (1 - Pe) : 1;

  // Krippendorff's Alpha (2 raters, nominal)
  // D_o = disagreements / (2n); D_e = 2*n0*n1 / (N*(N-1)) where N = 2n
  const N = 2 * n;
  const n1 = 2 * a + b + c;
  const n0 = N - n1;
  const Do = (b + c) / (2 * n);
  const De = (2 * n0 * n1) / (N * (N - 1));
  const alpha = De > 0 ? 1 - Do / De : 1;

  return {
    perCode: perCodeIoU(llmCodings, physCodings, codes),
    kappa,
    alpha,
    percentAgreement: Po,
    clusters,
    llmBySpan,
    physBySpan,
    codes,
    counts: { a, b, c, d, n },
  };
}
