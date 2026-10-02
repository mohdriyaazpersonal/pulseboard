export function parseCSV(text) {
  if (typeof text !== "string" || text.length > 5_000_000)
    throw new Error("Choose a CSV smaller than 5 MB.");
  text = text.replace(/^\uFEFF/, "");
  const rows = [];
  let row = [],
    value = "",
    quoted = false,
    closed = false;
  const field = () => {
    row.push(value);
    value = "";
    closed = false;
  };
  const line = () => {
    field();
    if (row.some((v) => v.trim() !== "")) rows.push(row);
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          value += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else value += c;
      continue;
    }
    if (closed && c !== "," && c !== "\r" && c !== "\n")
      throw new Error("Unexpected text after a closing quote.");
    if (c === '"') {
      if (value)
        throw new Error("Quotes must start at the beginning of a field.");
      quoted = true;
    } else if (c === ",") field();
    else if (c === "\r" || c === "\n") {
      line();
      if (c === "\r" && text[i + 1] === "\n") i++;
    } else value += c;
  }
  if (quoted) throw new Error("A quoted field is missing its closing quote.");
  if (value || row.length || closed) line();
  if (rows.length < 2)
    throw new Error("Include a header and at least one data row.");
  const headers = rows.shift().map((v) => v.trim());
  if (headers.some((v) => !v) || new Set(headers).size !== headers.length)
    throw new Error("Column names must be unique and nonempty.");
  if (headers.length > 40 || rows.length > 10000)
    throw new Error("Use up to 40 columns and 10,000 rows.");
  if (rows.some((r) => r.length !== headers.length))
    throw new Error(
      "Every row must have the same number of fields as the header.",
    );
  return {
    headers,
    rows: rows.map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i]]))),
  };
}
export const numericValue = (value) =>
  typeof value === "string" &&
  value.trim() !== "" &&
  Number.isFinite(Number(value))
    ? Number(value)
    : null;
export function numericColumns(headers, rows) {
  return headers.filter(
    (h) =>
      rows.some((r) => numericValue(r[h]) !== null) &&
      rows.every((r) => r[h].trim() === "" || numericValue(r[h]) !== null),
  );
}
export function validDate(value) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}
export function filterRows(
  rows,
  {
    categoryColumn,
    category = "",
    dateColumn,
    from = "",
    to = "",
    search = "",
  } = {},
) {
  return rows.filter(
    (r) =>
      (!category || r[categoryColumn] === category) &&
      (!dateColumn ||
        ((!from || r[dateColumn] >= from) && (!to || r[dateColumn] <= to))) &&
      (!search ||
        Object.values(r).some((v) =>
          v.toLowerCase().includes(search.toLowerCase()),
        )),
  );
}
export function aggregate(rows, dimension, metric) {
  const groups = new Map();
  for (const r of rows) {
    const key = r[dimension] || "(empty)";
    groups.set(key, (groups.get(key) || 0) + (numericValue(r[metric]) ?? 0));
  }
  return [...groups].map(([label, value]) => ({ label, value }));
}
export function summarize(rows, metric) {
  const numbers = rows
    .map((r) => numericValue(r[metric]))
    .filter((v) => v !== null)
    .sort((a, b) => a - b);
  const sum = numbers.reduce((a, b) => a + b, 0);
  return {
    count: rows.length,
    valid: numbers.length,
    sum,
    average: numbers.length ? sum / numbers.length : 0,
    min: numbers[0] ?? 0,
    max: numbers.at(-1) ?? 0,
  };
}
export function toCSV(headers, rows) {
  const quote = (value) => {
    let text = String(value ?? "");
    if (
      /^[=+@\t\r]/.test(text) ||
      (/^-/.test(text) && !Number.isFinite(Number(text)))
    )
      text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
  };
  return [
    headers.map(quote).join(","),
    ...rows.map((row) => headers.map((h) => quote(row[h])).join(",")),
  ].join("\r\n");
}
export function demoData() {
  const headers = [
    "Date",
    "Category",
    "Region",
    "Product",
    "Revenue",
    "Orders",
    "Cost",
  ];
  const names = {
    Apparel: ["Everyday tee", "Studio hoodie"],
    Home: ["Ceramic cup", "Linen throw"],
    Outdoor: ["Trail bottle", "Daypack"],
    Accessories: ["Canvas tote", "City cap"],
  };
  const rows = Array.from({ length: 96 }, (_, i) => {
    const category = Object.keys(names)[i % 4];
    const revenue = 320 + ((i * 137) % 950);
    return {
      Date: `2026-09-${String(1 + Math.floor(i / 4)).padStart(2, "0")}`,
      Category: category,
      Region: ["North", "South", "East"][Math.floor(i / 4) % 3],
      Product: names[category][Math.floor(i / 3) % 2],
      Revenue: String(revenue),
      Orders: String(4 + ((i * 7) % 24)),
      Cost: String(Math.round(revenue * (0.42 + (i % 4) * 0.08))),
    };
  });
  return { headers, rows };
}
