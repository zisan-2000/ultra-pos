export function generateCSV(headers: string[], rows: any[]) {
  const csvRows = [];

  // header row
  csvRows.push(headers.join(","));

  // data rows
  for (const row of rows) {
    const values = headers.map((h) => {
      const v = row[h];
      if (typeof v === "string" && v.includes(",")) {
        return `"${v}"`; // CSV safe
      }
      return v ?? "";
    });

    csvRows.push(values.join(","));
  }

  return csvRows.join("\n");
}
