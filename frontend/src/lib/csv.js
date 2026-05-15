import Papa from 'papaparse';

export function downloadCsv(rows, filename = 'codings.csv') {
  const csv = Papa.unparse(rows);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function parseCsv(file) {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete(results) {
        const rows = results.data;
        // Normalise column names to lowercase for robustness
        const normalised = rows.map((r) => {
          const entry = {};
          for (const [k, v] of Object.entries(r)) entry[k.toLowerCase().trim()] = v;
          return entry;
        });
        if (!normalised[0]?.quote || !normalised[0]?.code) {
          return reject(new Error('CSV must have "quote" and "code" columns.'));
        }
        resolve(normalised.map((r) => ({ quote: r.quote, code: r.code })));
      },
      error(err) { reject(new Error(err.message)); },
    });
  });
}
