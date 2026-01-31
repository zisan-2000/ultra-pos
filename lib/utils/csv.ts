export function generateCSV(headers: string[], rows: any[]) {
  const csvRows: string[] = [];

  const escapeCsvValue = (value: unknown) => {
    if (value === null || value === undefined) return "";
    let text = String(value);

    // Mitigate CSV injection by prefixing with a single quote.
    if (/^[=+\-@]/.test(text)) {
      text = `'${text}`;
    }

    const mustQuote = /[",\r\n]/.test(text);
    if (text.includes('"')) {
      text = text.replace(/"/g, '""');
    }

    return mustQuote ? `"${text}"` : text;
  };

  // header row
  csvRows.push(headers.join(","));

  // data rows
  for (const row of rows) {
    const values = headers.map((h) => escapeCsvValue(row?.[h]));
    csvRows.push(values.join(","));
  }

  return csvRows.join("\n");
}
