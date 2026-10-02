import { $, escapeHTML as e, download, toast } from "./lib.js";
import {
  parseCSV,
  numericColumns,
  validDate,
  filterRows,
  aggregate,
  summarize,
  toCSV,
  demoData,
} from "./core.js";
let dataset = demoData(),
  filtered = [],
  chartType = "bar",
  page = 0;
const fmt = (n) =>
  new Intl.NumberFormat("en", {
    maximumFractionDigits: 2,
    notation: Math.abs(n) >= 1e7 ? "compact" : "standard",
  }).format(n);
function options(values, current) {
  return values
    .map(
      (v) =>
        `<option value="${e(v)}"${v === current ? " selected" : ""}>${e(v || "All categories")}</option>`,
    )
    .join("");
}
function setup(name = "September retail snapshot", demo = true) {
  const numeric = numericColumns(dataset.headers, dataset.rows);
  const dates = dataset.headers.filter(
    (h) =>
      dataset.rows.every((r) => !r[h] || validDate(r[h])) &&
      dataset.rows.some((r) => validDate(r[h])),
  );
  $("#dimension").innerHTML = options(
    dataset.headers,
    dataset.headers.includes("Category")
      ? "Category"
      : dataset.headers.find((h) => !numeric.includes(h)) || dataset.headers[0],
  );
  $("#metric").innerHTML = numeric.length
    ? options(numeric, numeric.includes("Revenue") ? "Revenue" : numeric[0])
    : '<option value="">No numeric columns</option>';
  $("#category-column").innerHTML = options(
    dataset.headers,
    $("#dimension").value,
  );
  $("#date-column").innerHTML =
    '<option value="">No date filter</option>' + options(dates, dates[0]);
  $("#dataset-name").textContent = name;
  $("#dataset-meta").textContent =
    `${fmt(dataset.rows.length)} rows · ${dataset.headers.length} columns · ${demo ? "Synthetic demo data" : "Processed in this browser"}`;
  $("#dataset-badge").textContent = demo ? "Demo dataset" : "Your CSV";
  $("#from").value = "";
  $("#to").value = "";
  $("#search").value = "";
  categoryOptions();
  render();
}
function categoryOptions() {
  $("#category").innerHTML = options(
    ["", ...new Set(dataset.rows.map((r) => r[$("#category-column").value]))],
    "",
  );
}
function render() {
  const dimension = $("#dimension").value,
    metric = $("#metric").value,
    dateColumn = $("#date-column").value;
  $("#from").disabled = $("#to").disabled = !dateColumn;
  $("#filter-message").textContent =
    $("#from").value && $("#to").value && $("#from").value > $("#to").value
      ? "The start date is after the end date. Adjust the range to see results."
      : !metric
        ? "This dataset has no numeric columns. You can still explore and export its rows."
        : "";
  filtered = filterRows(dataset.rows, {
    categoryColumn: $("#category-column").value,
    category: $("#category").value,
    dateColumn,
    from: $("#from").value,
    to: $("#to").value,
    search: $("#search").value.trim(),
  });
  const s = summarize(filtered, metric);
  $("#stats").innerHTML = [
    ["Total " + (metric || "measure"), s.sum, `${s.valid} measured rows`, "↗"],
    ["Average per row", s.average, "Across nonempty numeric values", "≈"],
    [
      "Rows in view",
      s.count,
      `${dataset.rows.length ? Math.round((s.count / dataset.rows.length) * 100) : 0}% of your dataset`,
      "▦",
    ],
    [
      "Highest value",
      s.max,
      s.valid ? `Lowest: ${fmt(s.min)}` : "No numeric values in view",
      "⌁",
    ],
  ]
    .map(
      ([label, value, hint, icon]) =>
        `<article class="stat"><div class="stat-label">${e(label)}<span class="stat-symbol">${icon}</span></div><strong>${fmt(value)}</strong><small>${e(hint)}</small></article>`,
    )
    .join("");
  const allGroups = metric ? aggregate(filtered, dimension, metric) : [];
  const groups =
    chartType === "bar"
      ? [...allGroups].sort((a, b) => b.value - a.value).slice(0, 12)
      : [...allGroups]
          .sort((a, b) =>
            a.label.localeCompare(b.label, undefined, { numeric: true }),
          )
          .slice(0, 30);
  $("#chart-title").textContent =
    `${metric || "Measure"} by ${dimension.toLowerCase()}`;
  $("#chart-subtitle").textContent =
    `Sum per group · ${chartType === "bar" ? "highest 12 groups" : "first 30 groups, sorted by label"}`;
  drawChart(groups);
  $("#chart-summary").textContent = groups.length
    ? `${groups.length} of ${allGroups.length} groups shown. ${groups.map((g) => `${g.label}: ${fmt(g.value)}`).join(" · ")}`
    : "No values to chart. Adjust your filters or choose a numeric measure.";
  const top = [...allGroups].sort((a, b) => b.value - a.value).slice(0, 5);
  const absoluteMax = Math.max(1, ...top.map((g) => Math.abs(g.value)));
  $("#breakdown").innerHTML = top.length
    ? top
        .map(
          (g) =>
            `<div class="rank"><div class="rank-label"><span>${e(g.label)}</span><strong>${fmt(g.value)}</strong></div><div class="track"><span style="width:${(Math.abs(g.value) / absoluteMax) * 100}%"></span></div></div>`,
        )
        .join("")
    : '<div class="empty">Your next insight is one filter away.</div>';
  $("#insight").innerHTML = top.length
    ? `<b>${e(top[0].label)}</b> has the largest total ${e(metric.toLowerCase())} in this view, at <b>${fmt(top[0].value)}</b>.`
    : "Try resetting your filters to see the full picture.";
  page = Math.min(page, Math.max(0, Math.ceil(filtered.length / 10) - 1));
  renderTable();
}
function drawChart(groups) {
  if (!groups.length) {
    $("#chart").innerHTML =
      '<div class="empty">◫<br>No chart data in this view.</div>';
    return;
  }
  const W = 660,
    H = 250,
    left = 60,
    right = 16,
    top = 10,
    bottom = 52;
  const max = Math.max(0, ...groups.map((g) => g.value)),
    min = Math.min(0, ...groups.map((g) => g.value)),
    range = max - min || 1;
  const y = (v) => top + ((max - v) / range) * (H - top - bottom),
    step = (W - left - right) / groups.length;
  const grid = Array.from({ length: 5 }, (_, i) => {
    const v = min + (range * i) / 4,
      yy = y(v);
    return `<line x1="${left}" x2="${W - right}" y1="${yy}" y2="${yy}" stroke="#edf0f6"/><text x="${left - 10}" y="${yy + 3}" text-anchor="end" fill="#94a0b1" font-size="9">${e(fmt(v))}</text>`;
  }).join("");
  const points = groups
    .map((g, i) => `${left + step * (i + 0.5)},${y(g.value)}`)
    .join(" ");
  const shapes =
    chartType === "bar"
      ? groups
          .map(
            (g, i) =>
              `<rect x="${left + step * (i + 0.2)}" y="${Math.min(y(g.value), y(0))}" width="${step * 0.6}" height="${Math.max(1, Math.abs(y(g.value) - y(0)))}" rx="4" fill="${i === 0 ? "#4e6bdc" : "#acbaf0"}"><title>${e(g.label)}: ${fmt(g.value)}</title></rect>`,
          )
          .join("")
      : `<polyline points="${points}" fill="none" stroke="#5875db" stroke-width="3"/>` +
        groups
          .map(
            (g, i) =>
              `<circle cx="${left + step * (i + 0.5)}" cy="${y(g.value)}" r="4" fill="#5875db"><title>${e(g.label)}: ${fmt(g.value)}</title></circle>`,
          )
          .join("");
  const labels = groups
    .map(
      (g, i) =>
        `<text x="${left + step * (i + 0.5)}" y="${H - 29}" text-anchor="middle" fill="#7d889a" font-size="${groups.length > 10 ? 8 : 10}"${groups.length > 10 ? ` transform="rotate(-30 ${left + step * (i + 0.5)} ${H - 29})"` : ""}>${e(g.label.length > 13 ? g.label.slice(0, 11) + "…" : g.label)}</text>`,
    )
    .join("");
  $("#chart").innerHTML =
    `<svg viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="chart-title chart-summary">${grid}<line x1="${left}" x2="${W - right}" y1="${y(0)}" y2="${y(0)}" stroke="#d2dbeb"/>${shapes}${labels}</svg>`;
}
function renderTable() {
  const start = page * 10,
    rows = filtered.slice(start, start + 10);
  $("#table-count").textContent =
    `${fmt(filtered.length)} matching rows · original values, ready to explore`;
  $("#table").innerHTML = rows.length
    ? `<table><thead><tr>${dataset.headers.map((h) => `<th scope="col">${e(h)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${dataset.headers.map((h) => `<td>${e(r[h]) || '<span class="muted">—</span>'}</td>`).join("")}</tr>`).join("")}</tbody></table>`
    : '<div class="empty">No rows match these filters. Reset them to start fresh.</div>';
  $("#page-label").textContent = rows.length
    ? `Showing ${start + 1}–${start + rows.length} of ${filtered.length}`
    : "0 rows";
  $("#previous").disabled = page === 0;
  $("#next").disabled = start + 10 >= filtered.length;
  $("#export-button").disabled = !filtered.length;
}
for (const id of [
  "dimension",
  "metric",
  "category",
  "date-column",
  "from",
  "to",
])
  $("#" + id).addEventListener("change", () => {
    page = 0;
    render();
  });
$("#category-column").addEventListener("change", () => {
  categoryOptions();
  page = 0;
  render();
});
$("#search").addEventListener("input", () => {
  page = 0;
  render();
});
$("#clear-filters").addEventListener("click", () => {
  $("#category").value = "";
  $("#from").value = $("#to").value = $("#search").value = "";
  page = 0;
  render();
});
for (const type of ["bar", "line"])
  $("#" + type + "-button").addEventListener("click", () => {
    chartType = type;
    $("#bar-button").setAttribute("aria-pressed", type === "bar");
    $("#line-button").setAttribute("aria-pressed", type === "line");
    render();
  });
$("#previous").addEventListener("click", () => {
  page--;
  renderTable();
});
$("#next").addEventListener("click", () => {
  page++;
  renderTable();
});
$("#export-button").addEventListener("click", () =>
  download(
    "pulseboard-filtered.csv",
    toCSV(dataset.headers, filtered),
    "text/csv;charset=utf-8",
  ),
);
$("#demo-button").addEventListener("click", () => {
  dataset = demoData();
  page = 0;
  setup();
  toast("Synthetic retail demo loaded.");
});
$("#csv-file").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    if (file.size > 5_000_000)
      throw new Error("Choose a CSV smaller than 5 MB.");
    const next = parseCSV(await file.text());
    dataset = next;
    page = 0;
    setup(file.name, false);
    toast("Your dataset is ready to explore.");
  } catch (error) {
    toast(error.message);
  } finally {
    event.target.value = "";
  }
});
setup();
