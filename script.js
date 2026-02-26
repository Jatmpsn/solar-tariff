// =============================================================================
// GREEN TARIFF MARKETPLACE — Calculation Engine v2
// Half-hourly energy modelling with solar, battery, and tariff cost engine
// Rates loaded live from Google Sheets CSV, with hardcoded fallback
// =============================================================================

const TARIFF_SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vR_FtUp6LzKp_atFvdPA2Y00jImuw0lTv9ViWMjspotv-H1SWFq0VL8sOnVkd_b5sUef877d5ZS-Cch/pub?gid=245561990&single=true&output=csv";

// ---------------------------------------------------------------------------
// FALLBACK TARIFF DATABASE
// Used if the Google Sheet cannot be fetched (offline, sheet unavailable etc.)
// Keep this in sync with the spreadsheet manually as a backup.
// ---------------------------------------------------------------------------
const FALLBACK_TARIFFS = [
  {
    name: "Octopus Agile",
    supplier: "Octopus Energy",
    type: "time-of-use",
    description: "Variable rates by time of day — best if you can shift usage to off-peak hours and have a battery to store cheap overnight electricity.",
    standingCharge: 61,
    exportRate: 15,
    importRates: [
      { start: 0,  end: 13, rate: 7.5  },
      { start: 14, end: 33, rate: 24.5 },
      { start: 34, end: 37, rate: 38.0 },
      { start: 38, end: 47, rate: 24.5 },
    ],
    batteryChargeWindow: { start: 0, end: 13 },
    link: "https://octopus.energy/agile/"
  },
  {
    name: "Octopus Flux",
    supplier: "Octopus Energy",
    type: "time-of-use",
    description: "Designed specifically for homes with solar and battery. Cheap overnight import and premium export during peak times.",
    standingCharge: 51,
    exportRate: 24,
    importRates: [
      { start: 0,  end: 11, rate: 14.0 },
      { start: 12, end: 27, rate: 22.5 },
      { start: 28, end: 37, rate: 33.0 },
      { start: 38, end: 47, rate: 22.5 },
    ],
    exportRates: [
      { start: 0,  end: 11, rate: 8.0  },
      { start: 12, end: 27, rate: 15.0 },
      { start: 28, end: 37, rate: 24.0 },
      { start: 38, end: 47, rate: 15.0 },
    ],
    batteryChargeWindow: { start: 0, end: 11 },
    link: "https://octopus.energy/flux/"
  },
  {
    name: "Octopus Go",
    supplier: "Octopus Energy",
    type: "time-of-use",
    description: "Very cheap overnight rate (midnight to 5am). Great for charging batteries overnight when solar generation is low.",
    standingCharge: 61,
    exportRate: 15,
    importRates: [
      { start: 0,  end: 9,  rate: 7.5  },
      { start: 10, end: 47, rate: 24.5 },
    ],
    batteryChargeWindow: { start: 0, end: 9 },
    link: "https://octopus.energy/go/"
  },
  {
    name: "British Gas Solar Extra",
    supplier: "British Gas",
    type: "flat",
    description: "Flat rate tariff with a competitive solar export rate. Simple and predictable billing for solar owners.",
    standingCharge: 60,
    exportRate: 20,
    importRates: [{ start: 0, end: 47, rate: 24.0 }],
    link: "https://www.britishgas.co.uk"
  },
  {
    name: "EDF Standard Variable",
    supplier: "EDF Energy",
    type: "flat",
    description: "Simple flat rate tariff. No time-of-use complexity. Best for smaller setups.",
    standingCharge: 60,
    exportRate: 12,
    importRates: [{ start: 0, end: 47, rate: 24.5 }],
    link: "https://www.edfenergy.com"
  },
  {
    name: "OVO Smart",
    supplier: "OVO Energy",
    type: "flat",
    description: "Competitive flat rate with a decent export tariff. Good all-rounder for modest solar setups without a battery.",
    standingCharge: 58,
    exportRate: 16,
    importRates: [{ start: 0, end: 47, rate: 23.5 }],
    link: "https://www.ovoenergy.com"
  }
];

// ---------------------------------------------------------------------------
// CSV PARSER
// Converts a raw CSV string into an array of row objects keyed by header name
// ---------------------------------------------------------------------------
function parseCSV(text) {
  const lines = text.trim().split("\n");
  const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""));
  return lines.slice(1).map(line => {
    const values = [];
    let current = "";
    let inQuotes = false;
    for (const char of line) {
      if (char === '"') { inQuotes = !inQuotes; }
      else if (char === "," && !inQuotes) { values.push(current.trim()); current = ""; }
      else { current += char; }
    }
    values.push(current.trim());
    const row = {};
    headers.forEach((h, i) => { row[h] = (values[i] || "").trim(); });
    return row;
  });
}

// ---------------------------------------------------------------------------
// PARSE TIME WINDOW STRING
// Converts "00:00–05:30" into { start: slot, end: slot }
// ---------------------------------------------------------------------------
function timeToSlot(timeStr) {
  const [h, m] = timeStr.trim().split(":").map(Number);
  return (h * 2) + (m >= 30 ? 1 : 0);
}

function parseWindow(windowStr) {
  if (!windowStr || !windowStr.includes("–")) return null;
  const firstWindow = windowStr.split(/[\n\r]/)[0].trim();
  const parts = firstWindow.split("–");
  if (parts.length !== 2) return null;
  return { start: timeToSlot(parts[0]), end: timeToSlot(parts[1]) };
}

// ---------------------------------------------------------------------------
// BUILD TARIFF OBJECT FROM A CSV ROW
// ---------------------------------------------------------------------------
function buildTariffFromRow(row) {
  const n = v => parseFloat(v) || 0;
  const type = (row["Type"] || "").toLowerCase().includes("flat") ? "flat" : "time-of-use";

  let importRates = [];

  if (type === "flat") {
    const rate = n(row["Flat Import\nRate (p/kWh)"]);
    if (rate) importRates = [{ start: 0, end: 47, rate }];
  } else {
    const offPeakRate   = n(row["Off-Peak Import\n(p/kWh)"]);
    const offPeakWindow = parseWindow(row["Off-Peak Window\n(e.g. 00:00\u201305:30)"]);
    if (offPeakRate && offPeakWindow) importRates.push({ ...offPeakWindow, rate: offPeakRate });

    const shoulderRate   = n(row["Shoulder Import\n(p/kWh)"]);
    const shoulderWindow = parseWindow(row["Shoulder Window"]);
    if (shoulderRate && shoulderWindow) importRates.push({ ...shoulderWindow, rate: shoulderRate });

    const peakRate   = n(row["Peak Import\n(p/kWh)"]);
    const peakWindow = parseWindow(row["Peak Window"]);
    if (peakRate && peakWindow) importRates.push({ ...peakWindow, rate: peakRate });

    if (importRates.length === 0) {
      const flatRate = n(row["Flat Import\nRate (p/kWh)"]);
      if (flatRate) importRates = [{ start: 0, end: 47, rate: flatRate }];
    }
  }

  const flatExport       = n(row["Flat Export\nRate (p/kWh)"]);
  const peakExport       = n(row["Peak Export\n(p/kWh)"]);
  const peakExportWindow = parseWindow(row["Peak Export\nWindow"]);
  const exportRates      = (peakExport && peakExportWindow) ? [{ ...peakExportWindow, rate: peakExport }] : null;
  const batteryChargeWindow = parseWindow(row["Off-Peak Window\n(e.g. 00:00\u201305:30)"]);

  return {
    name:                row["Tariff Name"] || "",
    supplier:            row["Supplier"] || "",
    type,
    description:         row["Notes"] || "",
    standingCharge:      n(row["Standing Charge\n(p/day)"]),
    exportRate:          peakExport || flatExport,
    importRates:         importRates.length ? importRates : [{ start: 0, end: 47, rate: 24 }],
    exportRates,
    batteryChargeWindow,
    link:                row["Tariff Page URL"] || "#",
  };
}

// ---------------------------------------------------------------------------
// LOAD TARIFFS — fetch sheet, fall back to hardcoded on any error
// ---------------------------------------------------------------------------
async function loadTariffs() {
  try {
    const resp = await fetch(TARIFF_SHEET_CSV_URL);
    if (!resp.ok) throw new Error(`Sheet fetch failed: ${resp.status}`);
    const text = await resp.text();
    const rows = parseCSV(text);
    const tariffs = rows
      .filter(r => r["Tariff Name"] && r["Tariff Name"].trim())
      .map(buildTariffFromRow)
      .filter(t => t.importRates.length > 0);
    if (tariffs.length === 0) throw new Error("No tariffs parsed from sheet");
    console.log(`Loaded ${tariffs.length} tariffs from Google Sheet`);
    return { tariffs, source: "sheet" };
  } catch (err) {
    console.warn("Could not load tariffs from sheet, using fallback:", err.message);
    return { tariffs: FALLBACK_TARIFFS, source: "fallback" };
  }
}

// ---------------------------------------------------------------------------
// SOLAR CURVE
// ---------------------------------------------------------------------------
function buildSolarCurve(dailyGenerationKwh) {
  const peak = 26, sigma = 7;
  const raw = Array.from({ length: 48 }, (_, i) =>
    Math.exp(-0.5 * Math.pow((i - peak) / sigma, 2))
  );
  const total = raw.reduce((a, b) => a + b, 0);
  return raw.map(v => (v / total) * dailyGenerationKwh);
}

// ---------------------------------------------------------------------------
// CONSUMPTION CURVE
// ---------------------------------------------------------------------------
function buildConsumptionCurve(dailyConsumptionKwh) {
  const profile = [
    0.40, 0.35, 0.30, 0.28, 0.27, 0.26,
    0.27, 0.28, 0.30, 0.35, 0.50, 0.70,
    1.10, 1.40, 1.50, 1.40, 1.20, 1.00,
    0.90, 0.85, 0.80, 0.80, 0.80, 0.85,
    1.00, 1.10, 1.20, 1.10, 1.00, 0.90,
    0.85, 0.85, 0.90, 1.00, 1.10, 1.20,
    1.60, 1.80, 1.90, 1.80, 1.60, 1.40,
    1.20, 1.00, 0.80, 0.70, 0.55, 0.45
  ];
  const total = profile.reduce((a, b) => a + b, 0);
  return profile.map(v => (v / total) * dailyConsumptionKwh);
}

// ---------------------------------------------------------------------------
// BATTERY SIMULATION
// ---------------------------------------------------------------------------
function simulateBattery(consumption, solar, batteryKwh, chargeWindow) {
  const efficiency = 0.90;
  const maxSlotCharge = (batteryKwh / 2) * 0.5;
  let soc = batteryKwh * 0.2;
  const gridImport = new Array(48).fill(0);
  const gridExport = new Array(48).fill(0);
  const batteryState = new Array(48).fill(0);

  for (let i = 0; i < 48; i++) {
    const inChargeWindow = chargeWindow && i >= chargeWindow.start && i <= chargeWindow.end;
    let net = consumption[i] - solar[i];

    if (net <= 0) {
      const excess = -net;
      const canCharge = Math.min(excess, (batteryKwh - soc) / efficiency, maxSlotCharge);
      soc = Math.min(batteryKwh, soc + canCharge * efficiency);
      gridExport[i] = Math.max(0, excess - canCharge);
    } else {
      const discharge = Math.min(net, soc * efficiency, maxSlotCharge);
      soc = Math.max(0, soc - discharge / efficiency);
      gridImport[i] = Math.max(0, net - discharge);
    }

    if (inChargeWindow && soc < batteryKwh * 0.95) {
      const topUp = Math.min((batteryKwh - soc) / efficiency, maxSlotCharge);
      gridImport[i] += topUp;
      soc = Math.min(batteryKwh, soc + topUp * efficiency);
    }

    batteryState[i] = soc;
  }
  return { gridImport, gridExport, batteryState };
}

// ---------------------------------------------------------------------------
// NO-BATTERY SIMULATION
// ---------------------------------------------------------------------------
function simulateNoBattery(consumption, solar) {
  const gridImport = new Array(48).fill(0);
  const gridExport = new Array(48).fill(0);
  for (let i = 0; i < 48; i++) {
    const net = consumption[i] - solar[i];
    if (net > 0) gridImport[i] = net; else gridExport[i] = -net;
  }
  return { gridImport, gridExport, batteryState: new Array(48).fill(0) };
}

// ---------------------------------------------------------------------------
// RATE LOOKUPS
// ---------------------------------------------------------------------------
function getImportRate(tariff, slot) {
  for (const b of tariff.importRates) {
    if (slot >= b.start && slot <= b.end) return b.rate;
  }
  return 25;
}

function getExportRate(tariff, slot) {
  if (tariff.exportRates) {
    for (const b of tariff.exportRates) {
      if (slot >= b.start && slot <= b.end) return b.rate;
    }
  }
  return tariff.exportRate;
}

// ---------------------------------------------------------------------------
// ANNUAL COST CALCULATOR
// ---------------------------------------------------------------------------
function calculateAnnualCost(tariff, gridImport, gridExport) {
  let importPence = 0, exportPence = 0;
  for (let i = 0; i < 48; i++) {
    importPence += gridImport[i] * getImportRate(tariff, i);
    exportPence += gridExport[i] * getExportRate(tariff, i);
  }
  const annualImport   = Math.round((importPence / 100) * 365);
  const annualExport   = Math.round((exportPence / 100) * 365);
  const annualStanding = Math.round((tariff.standingCharge / 100) * 365);
  return { annualImport, annualExport, annualStanding, annualNet: annualImport + annualStanding - annualExport };
}

// ---------------------------------------------------------------------------
// REGIONAL SOLAR + CONSUMPTION ESTIMATES
// ---------------------------------------------------------------------------
const sunHours = {
  "scotland": 2.7, "north-england": 2.9, "midlands": 3.2,
  "south-england": 3.5, "southwest": 3.7, "wales": 3.1
};

function estimateDailyConsumption(bedrooms, houseSize) {
  return Math.max(5, bedrooms * 3.5 + (houseSize - 80) * 0.02);
}

function estimateDailyGeneration(solarKwp, location) {
  return solarKwp * (sunHours[location] || 3.0);
}

// ---------------------------------------------------------------------------
// MAIN ENGINE
// ---------------------------------------------------------------------------
function runEngine(tariffs, houseSize, bedrooms, solarKwp, batteryKwh, location) {
  const dailyConsumption = estimateDailyConsumption(bedrooms, houseSize);
  const dailyGeneration  = estimateDailyGeneration(solarKwp, location);
  const consumptionCurve = buildConsumptionCurve(dailyConsumption);
  const solarCurve       = buildSolarCurve(dailyGeneration);

  const results = tariffs.map(tariff => {
    const sim = batteryKwh > 0
      ? simulateBattery(consumptionCurve, solarCurve, batteryKwh, tariff.batteryChargeWindow || null)
      : simulateNoBattery(consumptionCurve, solarCurve);
    const costs = calculateAnnualCost(tariff, sim.gridImport, sim.gridExport);
    return { ...tariff, ...costs, sim };
  });

  results.sort((a, b) => a.annualNet - b.annualNet);
  return { results, inputs: { dailyConsumption, dailyGeneration, batteryKwh }, curves: { consumptionCurve, solarCurve } };
}

// ---------------------------------------------------------------------------
// SVG PROFILE CHART
// ---------------------------------------------------------------------------
function renderProfileChart(consumptionCurve, solarCurve) {
  const W = 460, H = 100, slots = 48;
  const maxVal = Math.max(...consumptionCurve, ...solarCurve) * 1.15;
  const xStep = W / slots;
  const toY = v => H - (v / maxVal) * H;

  const area = (data, fill) => {
    const pts = data.map((v, i) => `${(i + 0.5) * xStep},${toY(v)}`).join(" ");
    return `<polygon points="${pts} ${(slots - 0.5) * xStep},${H} 0.5,${H}" fill="${fill}" opacity="0.3"/>`;
  };
  const line = (data, stroke) => {
    const pts = data.map((v, i) => `${(i + 0.5) * xStep},${toY(v)}`).join(" ");
    return `<polyline points="${pts}" fill="none" stroke="${stroke}" stroke-width="2"/>`;
  };
  const labels = ["12am","6am","12pm","6pm","12am"].map((l, idx) =>
    `<text x="${(idx / 4) * W}" y="${H + 14}" font-size="9" fill="#aaa" text-anchor="middle">${l}</text>`
  ).join("");

  return `
    <svg viewBox="0 0 ${W} ${H + 18}" xmlns="http://www.w3.org/2000/svg"
         style="width:100%;border-radius:8px;background:#f7f9f7;overflow:visible;">
      ${area(consumptionCurve, "#1b4332")}${area(solarCurve, "#f4a261")}
      ${line(consumptionCurve, "#1b4332")}${line(solarCurve, "#f4a261")}
      ${labels}
    </svg>
    <div style="display:flex;gap:16px;font-size:0.78rem;color:#666;margin-top:6px;">
      <span><span style="color:#1b4332;font-weight:700;">&#9632;</span> Consumption</span>
      <span><span style="color:#f4a261;font-weight:700;">&#9632;</span> Solar generation</span>
    </div>`;
}

// ---------------------------------------------------------------------------
// RENDER RESULTS
// ---------------------------------------------------------------------------
function renderResults(engineOutput, source) {
  const { results, inputs, curves } = engineOutput;
  const best = results[0];

  const sourceNote = source === "fallback"
    ? `<p style="font-size:0.78rem;background:#fff9c4;border:1px solid #f0e060;border-radius:6px;padding:8px 12px;margin-bottom:16px;">
        &#9888; Could not reach the rate database &mdash; showing estimated rates. Results may not reflect the latest prices.
       </p>`
    : "";

  const summaryHTML = `
    <div style="background:#f7f9f7;border-radius:12px;padding:18px;margin-bottom:24px;">
      ${sourceNote}
      <p style="font-size:0.88rem;color:#666;margin:0 0 12px;">Based on your inputs, we estimate your daily energy profile:</p>
      <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px;">
        <div style="flex:1;min-width:100px;text-align:center;padding:10px;background:white;border-radius:8px;">
          <div style="font-size:1.25rem;font-weight:700;color:#1b4332;">${inputs.dailyConsumption.toFixed(1)} kWh</div>
          <div style="font-size:0.75rem;color:#999;">Daily consumption</div>
        </div>
        <div style="flex:1;min-width:100px;text-align:center;padding:10px;background:white;border-radius:8px;">
          <div style="font-size:1.25rem;font-weight:700;color:#f4a261;">${inputs.dailyGeneration.toFixed(1)} kWh</div>
          <div style="font-size:0.75rem;color:#999;">Solar generation</div>
        </div>
        <div style="flex:1;min-width:100px;text-align:center;padding:10px;background:white;border-radius:8px;">
          <div style="font-size:1.25rem;font-weight:700;color:#2d6a4f;">${inputs.batteryKwh} kWh</div>
          <div style="font-size:0.75rem;color:#999;">Battery capacity</div>
        </div>
      </div>
      ${renderProfileChart(curves.consumptionCurve, curves.solarCurve)}
    </div>`;

  const tariffCards = results.map((t, i) => {
    const isBest = i === 0;
    const badge = isBest
      ? `<span style="background:#2d6a4f;color:white;font-size:0.68rem;font-weight:700;padding:2px 8px;border-radius:20px;margin-left:8px;vertical-align:middle;">Best Match</span>`
      : "";
    const extraCost = i > 0
      ? `<p style="font-size:0.82rem;color:#c0392b;margin:8px 0 0;font-weight:600;">&pound;${t.annualNet - best.annualNet} more per year than best match</p>`
      : "";
    return `
      <div class="tariff-card" style="${isBest ? "border:2px solid #2d6a4f;" : ""}">
        <h3>${t.name}${badge}</h3>
        <div class="supplier">${t.supplier} &middot; ${t.type === "flat" ? "Flat Rate" : "Time of Use"}</div>
        <p>${t.description}</p>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:12px 0;font-size:0.82rem;">
          <div style="background:#fff4f4;border-radius:8px;padding:8px;text-align:center;">
            <div style="font-size:1.05rem;font-weight:700;color:#c0392b;">&pound;${t.annualImport}</div>
            <div style="color:#999;margin-top:2px;">Import cost</div>
          </div>
          <div style="background:#f4fff9;border-radius:8px;padding:8px;text-align:center;">
            <div style="font-size:1.05rem;font-weight:700;color:#2d6a4f;">&pound;${t.annualExport}</div>
            <div style="color:#999;margin-top:2px;">Export earnings</div>
          </div>
          <div style="background:#f7f9f7;border-radius:8px;padding:8px;text-align:center;">
            <div style="font-size:1.05rem;font-weight:700;color:#1b4332;">&pound;${t.annualNet}</div>
            <div style="color:#999;margin-top:2px;">Net annual cost</div>
          </div>
        </div>
        <div class="export">Export: ${t.exportRate}p/kWh &middot; Standing charge: ${t.standingCharge}p/day</div>
        ${extraCost}
        <a href="${t.link}" target="_blank" rel="noopener">View tariff &rarr;</a>
      </div>`;
  }).join("");

  document.getElementById("results").innerHTML = `
    <h2 style="margin-top:40px;">Your Results</h2>
    <hr />
    ${summaryHTML}
    ${tariffCards}
    <p style="font-size:0.75rem;color:#bbb;margin-top:24px;text-align:center;line-height:1.6;">
      &#9888; Estimates use typical UK household consumption profiles and average regional solar irradiance.
      Battery round-trip efficiency assumed at 90%. Always confirm rates directly with suppliers.
    </p>`;

  document.getElementById("results").scrollIntoView({ behavior: "smooth" });
}

// ---------------------------------------------------------------------------
// FORM SUBMIT HANDLER
// ---------------------------------------------------------------------------
document.getElementById("tariff-form").addEventListener("submit", async function(e) {
  e.preventDefault();

  const houseSize  = parseFloat(document.getElementById("house-size").value)   || 90;
  const bedrooms   = parseFloat(document.getElementById("bedrooms").value)     || 3;
  const solarKwp   = parseFloat(document.getElementById("solar-size").value)   || 0;
  const batteryKwh = parseFloat(document.getElementById("battery-size").value) || 0;
  const location   = document.getElementById("location").value                 || "midlands";

  const btn = this.querySelector("button");
  const originalText = btn.textContent;
  btn.textContent = "Loading rates\u2026";
  btn.disabled = true;

  const { tariffs, source } = await loadTariffs();

  btn.textContent = originalText;
  btn.disabled = false;

  const output = runEngine(tariffs, houseSize, bedrooms, solarKwp, batteryKwh, location);
  renderResults(output, source);
});