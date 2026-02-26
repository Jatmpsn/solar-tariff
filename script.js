// // =============================================================================
// GREEN TARIFF MARKETPLACE — Calculation Engine v3.2
// Half-hourly energy modelling with solar, battery, and tariff cost engine
// Default: bundled tariffs (Col C = "Both") | Toggle: split import & export
// Rates loaded live from Google Sheets CSV, with hardcoded fallback
// =============================================================================

const TARIFF_SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTt3OoI-ugxyV4pDC7p8uDHYSVrELZO2u32rYWNVLq1Np-X6gV0P0X9AqaPrjLYyA/pub?gid=598980415&single=true&output=csv";

const FALLBACK_BUNDLED_TARIFFS = [
  {
    name: "Octopus Flux",
    supplier: "Octopus Energy",
    type: "time-of-use",
    description: "Designed specifically for homes with solar and battery. Cheap overnight import and premium export during peak times.",
    standingCharge: 51,
    importRates: [
      { start: 0, end: 11, rate: 14.0 },
      { start: 12, end: 27, rate: 22.5 },
      { start: 28, end: 37, rate: 33.0 },
      { start: 38, end: 47, rate: 22.5 },
    ],
    exportRate: 24,
    exportRates: [
      { start: 0, end: 11, rate: 8.0 },
      { start: 12, end: 27, rate: 15.0 },
      { start: 28, end: 37, rate: 24.0 },
      { start: 38, end: 47, rate: 15.0 },
    ],
    batteryChargeWindow: { start: 0, end: 11 },
    link: "https://octopus.energy/flux/"
  },
  {
    name: "British Gas Solar Extra",
    supplier: "British Gas",
    type: "flat",
    description: "Flat rate tariff with a competitive solar export rate. Simple and predictable billing for solar owners.",
    standingCharge: 60,
    importRates: [{ start: 0, end: 47, rate: 24.0 }],
    exportRate: 20,
    exportRates: null,
    batteryChargeWindow: null,
    link: "https://www.britishgas.co.uk"
  }
];

const FALLBACK_IMPORT_TARIFFS = [
  {
    name: "Octopus Agile", supplier: "Octopus Energy", type: "time-of-use",
    description: "Variable rates by time of day — best with a battery to store cheap overnight electricity.",
    standingCharge: 61,
    importRates: [
      { start: 0, end: 13, rate: 7.5 }, { start: 14, end: 33, rate: 24.5 },
      { start: 34, end: 37, rate: 38.0 }, { start: 38, end: 47, rate: 24.5 },
    ],
    batteryChargeWindow: { start: 0, end: 13 }, link: "https://octopus.energy/agile/"
  },
  {
    name: "Octopus Go", supplier: "Octopus Energy", type: "time-of-use",
    description: "Very cheap overnight rate (midnight to 5am). Great for charging batteries overnight.",
    standingCharge: 61,
    importRates: [{ start: 0, end: 9, rate: 7.5 }, { start: 10, end: 47, rate: 24.5 }],
    batteryChargeWindow: { start: 0, end: 9 }, link: "https://octopus.energy/go/"
  },
  {
    name: "EDF Simply Fixed", supplier: "EDF Energy", type: "flat",
    description: "Simple flat rate tariff. No time-of-use complexity.",
    standingCharge: 60, importRates: [{ start: 0, end: 47, rate: 24.5 }], link: "https://www.edfenergy.com"
  },
  {
    name: "OVO 1 Year Fixed", supplier: "OVO Energy", type: "flat",
    description: "Competitive flat rate. Good all-rounder for modest solar setups.",
    standingCharge: 58, importRates: [{ start: 0, end: 47, rate: 23.5 }], link: "https://www.ovoenergy.com"
  }
];

const FALLBACK_EXPORT_TARIFFS = [
  { name: "Outgoing Octopus", supplier: "Octopus Energy", description: "Standard flat-rate export. Open to all.", exportRate: 15, exportRates: null, requiresImport: [], link: "https://octopus.energy/outgoing/" },
  { name: "British Gas Export & Earn Plus", supplier: "British Gas", description: "Competitive flat export rate.", exportRate: 20, exportRates: null, requiresImport: [], link: "https://www.britishgas.co.uk" },
  { name: "EDF Export 12m", supplier: "EDF Energy", description: "Fixed 12-month export tariff.", exportRate: 12, exportRates: null, requiresImport: [], link: "https://www.edfenergy.com" },
  { name: "OVO SEG Flex", supplier: "OVO Energy", description: "Flexible export rate. No lock-in.", exportRate: 16, exportRates: null, requiresImport: [], link: "https://www.ovoenergy.com" }
];

// ---------------------------------------------------------------------------
// CSV PARSER
// ---------------------------------------------------------------------------
function parseCSV(text) {
  // Parse CSV properly handling multi-line quoted fields
  var records = [];
  var current = "";
  var inQuotes = false;
  var fields = [];

  for (var i = 0; i < text.length; i++) {
    var ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < text.length && text[i + 1] === '"') {
          current += '"'; i++; // escaped quote
        } else {
          inQuotes = false; // end of quoted field
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        fields.push(current.trim());
        current = "";
      } else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && i + 1 < text.length && text[i + 1] === '\n') i++;
        fields.push(current.trim());
        current = "";
        if (fields.length > 1 || fields[0] !== "") records.push(fields);
        fields = [];
      } else {
        current += ch;
      }
    }
  }
  if (current || fields.length > 0) {
    fields.push(current.trim());
    if (fields.length > 1 || fields[0] !== "") records.push(fields);
  }

  if (records.length === 0) return [];
  // Normalise headers: collapse any newlines into spaces
  var headers = records[0].map(function(h) { return h.replace(/[\r\n]+/g, " ").trim(); });

  return records.slice(1).map(function(fields) {
    var row = {};
    headers.forEach(function(h, i) { row[h] = (fields[i] || "").trim(); });
    return row;
  });
}

// ---------------------------------------------------------------------------
// TIME WINDOW PARSING
// ---------------------------------------------------------------------------
function timeToSlot(timeStr) {
  const [h, m] = timeStr.trim().split(":").map(Number);
  return (h * 2) + (m >= 30 ? 1 : 0);
}

function parseWindow(windowStr) {
  if (!windowStr || !windowStr.includes("\u2013")) return null;
  const firstWindow = windowStr.split(/[\n\r]/)[0].trim();
  const parts = firstWindow.split("\u2013");
  if (parts.length !== 2) return null;
  return { start: timeToSlot(parts[0]), end: timeToSlot(parts[1]) };
}

// ---------------------------------------------------------------------------
// TARIFF BUILDERS
// ---------------------------------------------------------------------------
function parseImportRates(row) {
  const n = v => parseFloat(v) || 0;
  const type = (row["Tariff Type"] || "").toLowerCase().includes("flat") ? "flat" : "time-of-use";
  let importRates = [];

  if (type === "flat") {
    const rate = n(row["Flat Rate (p/kWh)"]);
    if (rate) importRates = [{ start: 0, end: 47, rate }];
  } else {
    const offPeakRate = n(row["Off-Peak Rate (p/kWh)"]);
    const offPeakWindow = parseWindow(row["Off-Peak Window"]);
    if (offPeakRate && offPeakWindow) importRates.push({ ...offPeakWindow, rate: offPeakRate });

    const shoulderRate = n(row["Shoulder Rate (p/kWh)"]);
    const shoulderWindow = parseWindow(row["Shoulder Window"]);
    if (shoulderRate && shoulderWindow) importRates.push({ ...shoulderWindow, rate: shoulderRate });

    const peakRate = n(row["Peak Rate (p/kWh)"]);
    const peakWindow = parseWindow(row["Peak Window"]);
    if (peakRate && peakWindow) importRates.push({ ...peakWindow, rate: peakRate });

    if (importRates.length === 0) {
      const flatRate = n(row["Flat Rate (p/kWh)"]);
      if (flatRate) importRates = [{ start: 0, end: 47, rate: flatRate }];
    }
  }

  return { importRates: importRates.length ? importRates : [{ start: 0, end: 47, rate: 24 }], type };
}

function parseExportRates(row) {
  const n = v => parseFloat(v) || 0;
  const flatExport = n(row["Export Rate (p/kWh)"]);
  const peakExport = n(row["Peak Export (p/kWh)"]);
  const peakExportWindow = parseWindow(row["Peak Export Window"]);

  let exportRates = null;
  let exportRate = flatExport;

  if (peakExport && peakExportWindow) {
    exportRates = [{ ...peakExportWindow, rate: peakExport }];
    exportRate = peakExport;
    if (flatExport) exportRates.push({ start: 0, end: 47, rate: flatExport });
  }

  return { exportRate, exportRates };
}

function buildBundledTariff(row) {
  const n = v => parseFloat(v) || 0;
  const { importRates, type } = parseImportRates(row);
  const { exportRate, exportRates } = parseExportRates(row);
  const batteryChargeWindow = parseWindow(row["Off-Peak Window"]);

  return {
    name: row["Tariff Name"] || "", supplier: row["Supplier"] || "", type,
    description: row["Notes"] || "", standingCharge: n(row["Standing Charge (p/day)"]),
    importRates, exportRate, exportRates, batteryChargeWindow,
    link: row["Tariff Page URL"] || "#",
    renewable: row["% Renewable (Ofgem FMD)"] || "",
    equipment: row["Equipment Required"] || "",
  };
}

function buildImportTariff(row) {
  const n = v => parseFloat(v) || 0;
  const { importRates, type } = parseImportRates(row);
  const batteryChargeWindow = parseWindow(row["Off-Peak Window"]);

  return {
    name: row["Tariff Name"] || "", supplier: row["Supplier"] || "", type,
    description: row["Notes"] || "", standingCharge: n(row["Standing Charge (p/day)"]),
    importRates, batteryChargeWindow,
    link: row["Tariff Page URL"] || "#",
    renewable: row["% Renewable (Ofgem FMD)"] || "",
    equipment: row["Equipment Required"] || "",
  };
}

function buildExportTariff(row) {
  const { exportRate, exportRates } = parseExportRates(row);
  const requiresRaw = (row["Requires Import Tariff(s)"] || "").trim();
  const requiresImport = requiresRaw ? requiresRaw.split(",").map(s => s.trim()).filter(Boolean) : [];

  return {
    name: row["Tariff Name"] || "", supplier: row["Supplier"] || "",
    description: row["Notes"] || "", exportRate, exportRates, requiresImport,
    link: row["Tariff Page URL"] || "#",
    renewable: row["% Renewable (Ofgem FMD)"] || "",
  };
}

// ---------------------------------------------------------------------------
// LOAD TARIFFS
// ---------------------------------------------------------------------------
async function loadTariffs() {
  try {
    const resp = await fetch(TARIFF_SHEET_CSV_URL + "&cachebust=" + Date.now());
    if (!resp.ok) throw new Error("Sheet fetch failed: " + resp.status);
    const text = await resp.text();
    const rows = parseCSV(text);

    const bundledTariffs = [], importTariffs = [], exportTariffs = [];

    for (const row of rows) {
      const name = (row["Tariff Name"] || "").trim();
      if (!name) continue;
      const direction = (row["Import / Export"] || "").trim().toLowerCase();

      if (direction === "both") {
        const t = buildBundledTariff(row);
        if (t.importRates.length > 0 && (t.exportRate > 0 || t.exportRates)) bundledTariffs.push(t);
      }
      if (direction === "import" || direction === "both") {
        const t = buildImportTariff(row);
        if (t.importRates.length > 0) importTariffs.push(t);
      }
      if (direction === "export" || direction === "both") {
        const t = buildExportTariff(row);
        if (t.exportRate > 0 || t.exportRates) exportTariffs.push(t);
      }
    }

    console.log("Loaded " + bundledTariffs.length + " bundled + " + importTariffs.length + " import + " + exportTariffs.length + " export tariffs");
    return { bundledTariffs, importTariffs, exportTariffs, source: "sheet" };
  } catch (err) {
    console.warn("Could not load tariffs from sheet, using fallback:", err.message);
    return { bundledTariffs: FALLBACK_BUNDLED_TARIFFS, importTariffs: FALLBACK_IMPORT_TARIFFS, exportTariffs: FALLBACK_EXPORT_TARIFFS, source: "fallback" };
  }
}

// ---------------------------------------------------------------------------
// CURVES
// ---------------------------------------------------------------------------
function buildSolarCurve(dailyGenerationKwh) {
  const peak = 26, sigma = 7;
  const raw = Array.from({ length: 48 }, (_, i) => Math.exp(-0.5 * Math.pow((i - peak) / sigma, 2)));
  const total = raw.reduce((a, b) => a + b, 0);
  return raw.map(v => (v / total) * dailyGenerationKwh);
}

function buildConsumptionCurve(dailyConsumptionKwh) {
  const profile = [
    0.40,0.35,0.30,0.28,0.27,0.26,0.27,0.28,0.30,0.35,0.50,0.70,
    1.10,1.40,1.50,1.40,1.20,1.00,0.90,0.85,0.80,0.80,0.80,0.85,
    1.00,1.10,1.20,1.10,1.00,0.90,0.85,0.85,0.90,1.00,1.10,1.20,
    1.60,1.80,1.90,1.80,1.60,1.40,1.20,1.00,0.80,0.70,0.55,0.45
  ];
  const total = profile.reduce((a, b) => a + b, 0);
  return profile.map(v => (v / total) * dailyConsumptionKwh);
}

// ---------------------------------------------------------------------------
// BATTERY SIMULATIONS
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
  for (const b of tariff.importRates) { if (slot >= b.start && slot <= b.end) return b.rate; }
  return 25;
}

function getExportRate(tariff, slot) {
  if (tariff.exportRates) { for (const b of tariff.exportRates) { if (slot >= b.start && slot <= b.end) return b.rate; } }
  return tariff.exportRate || 0;
}

// ---------------------------------------------------------------------------
// COST CALCULATORS
// ---------------------------------------------------------------------------
function calculateImportCost(importTariff, gridImport) {
  let importPence = 0;
  for (let i = 0; i < 48; i++) importPence += gridImport[i] * getImportRate(importTariff, i);
  const annualImport = Math.round((importPence / 100) * 365);
  const annualStanding = Math.round((importTariff.standingCharge / 100) * 365);
  return { annualImport, annualStanding, annualImportTotal: annualImport + annualStanding };
}

function calculateExportEarnings(exportTariff, gridExport) {
  let exportPence = 0;
  for (let i = 0; i < 48; i++) exportPence += gridExport[i] * getExportRate(exportTariff, i);
  return { annualExport: Math.round((exportPence / 100) * 365) };
}

function calculateBundledCost(tariff, gridImport, gridExport) {
  let importPence = 0, exportPence = 0;
  for (let i = 0; i < 48; i++) {
    importPence += gridImport[i] * getImportRate(tariff, i);
    exportPence += gridExport[i] * getExportRate(tariff, i);
  }
  const annualImport = Math.round((importPence / 100) * 365);
  const annualExport = Math.round((exportPence / 100) * 365);
  const annualStanding = Math.round((tariff.standingCharge / 100) * 365);
  return { annualImport, annualExport, annualStanding, annualNet: annualImport + annualStanding - annualExport };
}

function isCompatible(exportTariff, importTariff) {
  if (!exportTariff.requiresImport || exportTariff.requiresImport.length === 0) return true;
  return exportTariff.requiresImport.includes(importTariff.name);
}

// ---------------------------------------------------------------------------
// REGIONAL ESTIMATES
// ---------------------------------------------------------------------------
const sunHours = { "scotland": 2.7, "north-england": 2.9, "midlands": 3.2, "south-england": 3.5, "southwest": 3.7, "wales": 3.1 };

function estimateDailyConsumption(bedrooms, houseSize) {
  return Math.max(5, bedrooms * 3.5 + (houseSize - 80) * 0.02);
}
function estimateDailyGeneration(solarKwp, location) {
  return solarKwp * (sunHours[location] || 3.0);
}

// ---------------------------------------------------------------------------
// MAIN ENGINE
// ---------------------------------------------------------------------------
function runEngine(bundledTariffs, importTariffs, exportTariffs, houseSize, bedrooms, solarKwp, batteryKwh, location) {
  const dailyConsumption = estimateDailyConsumption(bedrooms, houseSize);
  const dailyGeneration = estimateDailyGeneration(solarKwp, location);
  const consumptionCurve = buildConsumptionCurve(dailyConsumption);
  const solarCurve = buildSolarCurve(dailyGeneration);

  // Bundled tariffs (default view)
  const bundledResults = bundledTariffs.map(tariff => {
    const sim = batteryKwh > 0
      ? simulateBattery(consumptionCurve, solarCurve, batteryKwh, tariff.batteryChargeWindow || null)
      : simulateNoBattery(consumptionCurve, solarCurve);
    const costs = calculateBundledCost(tariff, sim.gridImport, sim.gridExport);
    return { ...tariff, ...costs, sim };
  });
  bundledResults.sort((a, b) => a.annualNet - b.annualNet);

  // Import tariffs (split view) — filter out tariffs with no real rate data
  const importResults = importTariffs.map(tariff => {
    const sim = batteryKwh > 0
      ? simulateBattery(consumptionCurve, solarCurve, batteryKwh, tariff.batteryChargeWindow || null)
      : simulateNoBattery(consumptionCurve, solarCurve);
    const costs = calculateImportCost(tariff, sim.gridImport);
    var noData = tariff.standingCharge === 0 && costs.annualImport === 0;
    return { ...tariff, ...costs, sim, noData };
  }).filter(function(t) { return !t.noData; });
  importResults.sort((a, b) => a.annualImportTotal - b.annualImportTotal);

  // Export tariffs (split view, generic sim)
  const genericSim = batteryKwh > 0
    ? simulateBattery(consumptionCurve, solarCurve, batteryKwh, null)
    : simulateNoBattery(consumptionCurve, solarCurve);
  const exportResults = exportTariffs.map(tariff => {
    const earnings = calculateExportEarnings(tariff, genericSim.gridExport);
    return { ...tariff, ...earnings };
  });
  exportResults.sort((a, b) => b.annualExport - a.annualExport);

  return { bundledResults, importResults, exportResults, inputs: { dailyConsumption, dailyGeneration, batteryKwh }, curves: { consumptionCurve, solarCurve } };
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
    const pts = data.map((v, i) => ((i + 0.5) * xStep) + "," + toY(v)).join(" ");
    return '<polygon points="' + pts + " " + ((slots - 0.5) * xStep) + "," + H + " 0.5," + H + '" fill="' + fill + '" opacity="0.3"/>';
  };
  const line = (data, stroke) => {
    const pts = data.map((v, i) => ((i + 0.5) * xStep) + "," + toY(v)).join(" ");
    return '<polyline points="' + pts + '" fill="none" stroke="' + stroke + '" stroke-width="2"/>';
  };
  const labels = ["12am","6am","12pm","6pm","12am"].map((l, idx) =>
    '<text x="' + ((idx / 4) * W) + '" y="' + (H + 14) + '" font-size="9" fill="#aaa" text-anchor="middle">' + l + '</text>'
  ).join("");

  return '\
    <svg viewBox="0 0 ' + W + ' ' + (H + 18) + '" xmlns="http://www.w3.org/2000/svg" \
         style="width:100%;border-radius:8px;background:#f7f9f7;overflow:visible;">\
      ' + area(consumptionCurve, "#1b4332") + area(solarCurve, "#f4a261") + '\
      ' + line(consumptionCurve, "#1b4332") + line(solarCurve, "#f4a261") + '\
      ' + labels + '\
    </svg>\
    <div style="display:flex;gap:16px;font-size:0.78rem;color:#666;margin-top:6px;">\
      <span><span style="color:#1b4332;font-weight:700;">&#9632;</span> Consumption</span>\
      <span><span style="color:#f4a261;font-weight:700;">&#9632;</span> Solar generation</span>\
    </div>';
}

// ---------------------------------------------------------------------------
// RENDER — SUMMARY
// ---------------------------------------------------------------------------
function renderSummary(inputs, curves, source) {
  var sourceNote = source === "fallback"
    ? '<p style="font-size:0.78rem;background:#fff9c4;border:1px solid #f0e060;border-radius:6px;padding:8px 12px;margin-bottom:16px;">&#9888; Could not reach the rate database &mdash; showing estimated rates. Results may not reflect the latest prices.</p>'
    : "";

  return '\
    <div style="background:#f7f9f7;border-radius:12px;padding:18px;margin-bottom:24px;">\
      ' + sourceNote + '\
      <p style="font-size:0.88rem;color:#666;margin:0 0 12px;">Based on your inputs, we estimate your daily energy profile:</p>\
      <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px;">\
        <div style="flex:1;min-width:100px;text-align:center;padding:10px;background:white;border-radius:8px;">\
          <div style="font-size:1.25rem;font-weight:700;color:#1b4332;">' + inputs.dailyConsumption.toFixed(1) + ' kWh</div>\
          <div style="font-size:0.75rem;color:#999;">Daily consumption</div>\
        </div>\
        <div style="flex:1;min-width:100px;text-align:center;padding:10px;background:white;border-radius:8px;">\
          <div style="font-size:1.25rem;font-weight:700;color:#f4a261;">' + inputs.dailyGeneration.toFixed(1) + ' kWh</div>\
          <div style="font-size:0.75rem;color:#999;">Solar generation</div>\
        </div>\
        <div style="flex:1;min-width:100px;text-align:center;padding:10px;background:white;border-radius:8px;">\
          <div style="font-size:1.25rem;font-weight:700;color:#2d6a4f;">' + inputs.batteryKwh + ' kWh</div>\
          <div style="font-size:0.75rem;color:#999;">Battery capacity</div>\
        </div>\
      </div>\
      ' + renderProfileChart(curves.consumptionCurve, curves.solarCurve) + '\
    </div>';
}

// ---------------------------------------------------------------------------
// RENDER — TOGGLE + LEARN MORE
// ---------------------------------------------------------------------------
function renderToggle(isSplit) {
  return '\
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px;">\
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;user-select:none;flex-shrink:0;">\
        <span style="position:relative;display:inline-block;width:44px;height:24px;background:' + (isSplit ? "#2d6a4f" : "#ccc") + ';border-radius:12px;transition:background 0.2s;flex-shrink:0;">\
          <span style="position:absolute;top:2px;left:' + (isSplit ? "22px" : "2px") + ';width:20px;height:20px;background:white;border-radius:50%;transition:left 0.2s;box-shadow:0 1px 3px rgba(0,0,0,0.2);"></span>\
        </span>\
        <input type="checkbox" id="view-toggle" ' + (isSplit ? "checked" : "") + ' style="position:absolute;opacity:0;pointer-events:none;" />\
        <span style="font-size:0.88rem;color:#333;font-weight:500;">Show import and export tariffs separately</span>\
      </label>\
      <button id="learn-more-btn" style="background:none;border:none;color:#2d6a4f;font-size:0.82rem;cursor:pointer;text-decoration:underline;padding:0;font-weight:500;white-space:nowrap;">Learn more</button>\
    </div>\
    <div id="learn-more-callout" style="display:none;background:#f0f7f2;border:1px solid #b7d8c4;border-radius:10px;padding:16px 18px;margin-bottom:20px;font-size:0.84rem;color:#333;line-height:1.6;">\
      <div style="font-weight:700;margin-bottom:6px;color:#1b4332;">Why are there two tariffs?</div>\
      <p style="margin:0 0 8px;">With solar panels, your energy bill has two sides:</p>\
      <p style="margin:0 0 8px;"><strong style="color:#c0392b;">Import tariff</strong> &mdash; the rate you pay for electricity drawn from the grid. This covers nights, cloudy days, and any time your panels and battery can&rsquo;t keep up with demand.</p>\
      <p style="margin:0 0 8px;"><strong style="color:#2d6a4f;">Export tariff (SEG)</strong> &mdash; the rate you&rsquo;re paid for surplus solar electricity you send back to the grid. Under the Smart Export Guarantee, suppliers must offer you a rate for this energy.</p>\
      <p style="margin:0 0 8px;">You&rsquo;re free to have your import and export tariffs with <strong>different suppliers</strong>. The default view above shows tariffs that bundle both into one simple package. Switch to the split view to mix and match for potentially better savings &mdash; for example, pairing a cheap overnight import tariff with a high-paying export deal from another supplier.</p>\
      <p style="margin:0;">Some export tariffs are exclusive to a particular import tariff &mdash; we flag these with a &#128274; icon so you know.</p>\
    </div>';
}

// ---------------------------------------------------------------------------
// RENDER — BUNDLED VIEW (default)
// ---------------------------------------------------------------------------
function renderBundledView(bundledResults) {
  if (bundledResults.length === 0) {
    return '<p style="color:#999;text-align:center;padding:20px;">No bundled (import + export) tariffs found. Try the split view to compare import and export tariffs separately.</p>';
  }

  var best = bundledResults[0];

  return bundledResults.map(function(t, i) {
    var isBest = i === 0;
    var extraCost = i > 0
      ? '<div style="font-size:0.78rem;color:#c0392b;font-weight:600;margin-top:8px;">&pound;' + (t.annualNet - best.annualNet) + ' more per year than best</div>'
      : "";

    return '\
      <div class="tariff-card" style="margin-bottom:14px;' + (isBest ? "border:2px solid #2d6a4f;" : "") + '">\
        ' + (isBest ? '<div style="background:#2d6a4f;color:white;font-size:0.68rem;font-weight:700;padding:3px 10px;border-radius:20px;display:inline-block;margin-bottom:8px;">Best Match</div>' : "") + '\
        <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px;">\
          <div style="flex:1;min-width:200px;">\
            <h3 style="margin:0 0 2px;font-size:1.05rem;">' + t.name + '</h3>\
            <div style="font-size:0.78rem;color:#888;margin-bottom:8px;">' + t.supplier + ' &middot; ' + (t.type === "flat" ? "Flat Rate" : "Time of Use") + ' &middot; Import &amp; Export</div>\
          </div>\
          <div style="text-align:right;">\
            <div style="font-size:1.5rem;font-weight:800;color:#1b4332;">&pound;' + t.annualNet + '</div>\
            <div style="font-size:0.72rem;color:#999;">Net annual cost</div>\
          </div>\
        </div>\
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:10px 0;font-size:0.82rem;">\
          <div style="background:#fff4f4;border-radius:8px;padding:8px;text-align:center;">\
            <div style="font-weight:700;color:#c0392b;">&pound;' + (t.annualImport + t.annualStanding) + '</div>\
            <div style="color:#aaa;font-size:0.72rem;">Import + standing</div>\
          </div>\
          <div style="background:#f4fff9;border-radius:8px;padding:8px;text-align:center;">\
            <div style="font-weight:700;color:#2d6a4f;">&pound;' + t.annualExport + '</div>\
            <div style="color:#aaa;font-size:0.72rem;">Export earnings</div>\
          </div>\
          <div style="background:#f7f9f7;border-radius:8px;padding:8px;text-align:center;">\
            <div style="font-weight:700;color:#1b4332;">&pound;' + t.annualNet + '</div>\
            <div style="color:#aaa;font-size:0.72rem;">Net cost</div>\
          </div>\
        </div>\
        <div style="font-size:0.75rem;color:#999;">\
          Import: ' + t.importRates.map(function(r) { return r.rate + "p"; }).join(" / ") + ' &middot;\
          Export: ' + t.exportRate + 'p/kWh &middot;\
          Standing: ' + t.standingCharge + 'p/day\
        </div>\
        ' + (t.equipment ? '<div style="font-size:0.72rem;color:#b07d10;margin-top:4px;">&#9889; ' + t.equipment + '</div>' : "") + '\
        ' + extraCost + '\
        <a href="' + t.link + '" target="_blank" rel="noopener" style="font-size:0.82rem;display:inline-block;margin-top:8px;">View tariff &rarr;</a>\
      </div>';
  }).join("");
}

// ---------------------------------------------------------------------------
// RENDER — SPLIT VIEW (toggle on)
// ---------------------------------------------------------------------------
function renderSplitView(importResults, exportResults) {
  var importCardsHTML = importResults.map(function(t, i) {
    var rateDisplay = t.type === "flat"
      ? t.importRates[0].rate + "p/kWh"
      : t.importRates.map(function(r) { return r.rate + "p"; }).join(" / ");
    return '\
      <div class="tariff-card" style="margin-bottom:12px;' + (i === 0 ? "border:2px solid #2d6a4f;" : "") + '">\
        ' + (i === 0 ? '<div style="background:#2d6a4f;color:white;font-size:0.65rem;font-weight:700;padding:2px 8px;border-radius:20px;display:inline-block;margin-bottom:6px;">Cheapest</div>' : "") + '\
        <h4 style="margin:0 0 4px;font-size:0.95rem;">' + t.name + '</h4>\
        <div style="font-size:0.78rem;color:#888;margin-bottom:6px;">' + t.supplier + ' &middot; ' + (t.type === "flat" ? "Flat Rate" : "Time of Use") + '</div>\
        <div style="display:flex;gap:8px;margin-bottom:8px;font-size:0.82rem;">\
          <div style="flex:1;background:#fff4f4;border-radius:6px;padding:8px;text-align:center;">\
            <div style="font-weight:700;color:#c0392b;">&pound;' + t.annualImport + '</div>\
            <div style="color:#aaa;font-size:0.72rem;">Import</div>\
          </div>\
          <div style="flex:1;background:#f7f9f7;border-radius:6px;padding:8px;text-align:center;">\
            <div style="font-weight:700;color:#1b4332;">&pound;' + t.annualStanding + '</div>\
            <div style="color:#aaa;font-size:0.72rem;">Standing</div>\
          </div>\
          <div style="flex:1;background:#eef6f0;border-radius:6px;padding:8px;text-align:center;">\
            <div style="font-weight:700;color:#1b4332;">&pound;' + t.annualImportTotal + '</div>\
            <div style="color:#aaa;font-size:0.72rem;">Total</div>\
          </div>\
        </div>\
        <div style="font-size:0.75rem;color:#999;">Rates: ' + rateDisplay + ' &middot; Standing: ' + t.standingCharge + 'p/day</div>\
        ' + (t.equipment ? '<div style="font-size:0.72rem;color:#b07d10;margin-top:2px;">&#9889; ' + t.equipment + '</div>' : "") + '\
        <a href="' + t.link + '" target="_blank" rel="noopener" style="font-size:0.82rem;">View tariff &rarr;</a>\
      </div>';
  }).join("");

  var exportCardsHTML = exportResults.map(function(t, i) {
    var restricted = t.requiresImport && t.requiresImport.length > 0;
    var rateDisplay = t.exportRates
      ? t.exportRates.map(function(r) { return r.rate + "p"; }).join(" / ")
      : t.exportRate + "p/kWh";
    return '\
      <div class="tariff-card" style="margin-bottom:12px;' + (i === 0 ? "border:2px solid #2d6a4f;" : "") + '">\
        ' + (i === 0 ? '<div style="background:#2d6a4f;color:white;font-size:0.65rem;font-weight:700;padding:2px 8px;border-radius:20px;display:inline-block;margin-bottom:6px;">Highest earnings</div>' : "") + '\
        <h4 style="margin:0 0 4px;font-size:0.95rem;">' + t.name + '</h4>\
        <div style="font-size:0.78rem;color:#888;margin-bottom:6px;">' + t.supplier + '</div>\
        <div style="background:#f4fff9;border-radius:6px;padding:10px;text-align:center;margin-bottom:8px;">\
          <div style="font-size:1.15rem;font-weight:700;color:#2d6a4f;">&pound;' + t.annualExport + '</div>\
          <div style="color:#aaa;font-size:0.72rem;">Est. annual earnings</div>\
        </div>\
        <div style="font-size:0.75rem;color:#999;">Rate: ' + rateDisplay + '</div>\
        ' + (restricted ? '<div style="font-size:0.72rem;color:#b07d10;margin-top:4px;">&#128274; Requires: ' + t.requiresImport.join(", ") + '</div>' : "") + '\
        <a href="' + t.link + '" target="_blank" rel="noopener" style="font-size:0.82rem;">View tariff &rarr;</a>\
      </div>';
  }).join("");

  return '\
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;">\
      <div>\
        <h3 style="font-size:1rem;color:#1b4332;margin:0 0 12px;">\
          &#9889; Import Tariffs\
          <span style="font-size:0.72rem;font-weight:400;color:#999;">(' + importResults.length + ' tariffs, cheapest first)</span>\
        </h3>\
        ' + importCardsHTML + '\
      </div>\
      <div>\
        <h3 style="font-size:1rem;color:#2d6a4f;margin:0 0 12px;">\
          &#9728;&#65039; Export Tariffs\
          <span style="font-size:0.72rem;font-weight:400;color:#999;">(' + exportResults.length + ' tariffs, highest earnings first)</span>\
        </h3>\
        ' + exportCardsHTML + '\
      </div>\
    </div>';
}

// ---------------------------------------------------------------------------
// RENDER — MASTER WITH TOGGLE
// ---------------------------------------------------------------------------
var lastEngineOutput = null;
var lastSource = null;

function renderResults(engineOutput, source) {
  lastEngineOutput = engineOutput;
  lastSource = source;
  renderWithView(false);
}

function renderWithView(isSplit) {
  var data = lastEngineOutput;
  var summaryHTML = renderSummary(data.inputs, data.curves, lastSource);
  var toggleHTML = renderToggle(isSplit);
  var contentHTML = isSplit
    ? renderSplitView(data.importResults, data.exportResults)
    : renderBundledView(data.bundledResults);

  document.getElementById("results").innerHTML = '\
    <h2 style="margin-top:40px;">Your Results</h2>\
    <hr />\
    ' + summaryHTML + '\
    ' + toggleHTML + '\
    <div id="results-content">' + contentHTML + '</div>\
    <p style="font-size:0.75rem;color:#bbb;margin-top:24px;text-align:center;line-height:1.6;">\
      &#9888; Estimates use typical UK household consumption profiles and average regional solar irradiance.\
      Battery round-trip efficiency assumed at 90%. Always confirm rates directly with suppliers.\
    </p>';

  var toggle = document.getElementById("view-toggle");
  if (toggle) {
    toggle.addEventListener("change", function() {
      renderWithView(this.checked);
    });
  }

  var learnBtn = document.getElementById("learn-more-btn");
  var learnCallout = document.getElementById("learn-more-callout");
  if (learnBtn && learnCallout) {
    learnBtn.addEventListener("click", function() {
      var visible = learnCallout.style.display !== "none";
      learnCallout.style.display = visible ? "none" : "block";
      learnBtn.textContent = visible ? "Learn more" : "Hide";
    });
  }

  document.getElementById("results").scrollIntoView({ behavior: "smooth" });
}

// ---------------------------------------------------------------------------
// FORM SUBMIT HANDLER
// ---------------------------------------------------------------------------
document.getElementById("tariff-form").addEventListener("submit", async function(e) {
  e.preventDefault();

  var houseSize = parseFloat(document.getElementById("house-size").value) || 90;
  var bedrooms = parseFloat(document.getElementById("bedrooms").value) || 3;
  var solarKwp = parseFloat(document.getElementById("solar-size").value) || 0;
  var batteryKwh = parseFloat(document.getElementById("battery-size").value) || 0;
  var location = document.getElementById("location").value || "midlands";

  var btn = this.querySelector("button");
  var originalText = btn.textContent;
  btn.textContent = "Loading rates\u2026";
  btn.disabled = true;

  var result = await loadTariffs();

  btn.textContent = originalText;
  btn.disabled = false;

  var output = runEngine(result.bundledTariffs, result.importTariffs, result.exportTariffs, houseSize, bedrooms, solarKwp, batteryKwh, location);
  renderResults(output, result.source);
});