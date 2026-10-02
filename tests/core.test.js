import test from "node:test";
import assert from "node:assert/strict";
import {
  parseCSV,
  numericColumns,
  filterRows,
  aggregate,
  summarize,
  toCSV,
  demoData,
  validDate,
} from "../core.js";
test("CSV parser handles BOM, commas, escaped quotes, CRLF, embedded newlines and final blank fields", () => {
  const d = parseCSV(
    '\uFEFFname,note,value\r\n"Lee, Jo","said ""hi""\nagain",12\r\nSam,ok,',
  );
  assert.deepEqual(d.rows[0], {
    name: "Lee, Jo",
    note: 'said "hi"\nagain',
    value: "12",
  });
  assert.equal(d.rows[1].value, "");
});
test("CSV parser rejects ambiguous headers, mismatched fields and malformed quotes", () => {
  for (const csv of [
    "a,a\n1,2",
    "a,b\n1",
    'a,b\n"unclosed,3',
    'a,b\n"a"x,2',
    'a,b\nx"a,2',
  ])
    assert.throws(() => parseCSV(csv));
});
test("numeric column inference accepts negatives and missing data but not mixed text", () => {
  const d = parseCSV("label,sales,mixed\nA,-5,1\nB,,word\nC,2.5,3");
  assert.deepEqual(numericColumns(d.headers, d.rows), ["sales"]);
  assert.deepEqual(summarize(d.rows, "sales"), {
    count: 3,
    valid: 2,
    sum: -2.5,
    average: -1.25,
    min: -5,
    max: 2.5,
  });
});
test("date, category and search filters combine and include endpoints", () => {
  const d = demoData();
  const r = filterRows(d.rows, {
    categoryColumn: "Category",
    category: "Home",
    dateColumn: "Date",
    from: "2026-09-02",
    to: "2026-09-02",
    search: "SOUTH",
  });
  assert.equal(r.length, 1);
  assert.equal(r[0].Date, "2026-09-02");
  assert.equal(
    aggregate(r, "Category", "Revenue")[0].value,
    Number(r[0].Revenue),
  );
});
test("export round trips text and neutralizes spreadsheet formulas", () => {
  const csv = toCSV(
    ["name", "amount"],
    [
      { name: '=HYPERLINK("x")', amount: "-4" },
      { name: 'a,"b"\nc', amount: "2" },
    ],
  );
  const d = parseCSV(csv);
  assert.equal(d.rows[0].name, '\'=HYPERLINK("x")');
  assert.equal(d.rows[0].amount, "-4");
  assert.equal(d.rows[1].name, 'a,"b"\nc');
});
test("calendar validation rejects rolled-over dates and empty statistics stay finite", () => {
  assert.equal(validDate("2026-02-30"), false);
  assert.equal(validDate("2024-02-29"), true);
  assert.equal(summarize([], "x").average, 0);
});
