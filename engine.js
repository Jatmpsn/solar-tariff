// =============================================================================
// GREEN TARIFF MARKETPLACE — Calculation Engine v4.0
// Half-hourly energy modelling with solar, battery, and tariff cost engine
// Default: bundled tariffs (Col C = "Both") | Toggle: split import & export
// Rates loaded live from Google Sheets CSV, with hardcoded fallback
//
// v4.0 — Seasonal modelling (12-month), battery strategy optimisation (4
//         strategies), heat pump support
// v3.3 — Battery effectiveness blending for realistic annual estimates
// =============================================================================

const TARIFF_SHEET_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vTt3OoI-ugxyV4pDC7p8uDHYSVrELZO2u32rYWNVLq1Np-X6gV0P0X9AqaPrjLYyA/pub?gid=598980415&single=true&output=csv";

const FALLBACK_BUNDLED_TARIFFS = [
  {
    name: "Octopus Flux", supplier: "Octopus Energy", type: "time-of-use",
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
    name: "British Gas Solar Extra", supplier: "British Gas", type: "flat",
    description: "Flat rate tariff with a competitive solar export rate. Simple and predictable billing for solar owners.",
    standingCharge: 60,
    importRates: [{ start: 0, end: 47, rate: 24.0 }],
    exportRate: 20, exportRates: null, batteryChargeWindow: null,
    link: "https://www.britishgas.co.uk"
  }
];

const FALLBACK_IMPORT_TARIFFS = [
  {
    name: "Octopus Agile", supplier: "Octopus Energy", type: "time-of-use",
    description: "Variable rates by time of day — best with a battery to store cheap overnight electricity.",
    standingCharge: 61,
    importRates: [
      { start: 0, end: 13, rate: 7.5 },
      { start: 14, end: 33, rate: 24.5 },
      { start: 34, end: 37, rate: 38.0 },
      { start: 38, end: 47, rate: 24.5 },
    ],
    batteryChargeWindow: { start: 0, end: 13 },
    link: "https://octopus.energy/agile/"
  },
  {
    name: "Octopus Go", supplier: "Octopus Energy", type: "time-of-use",
    description: "Very cheap overnight rate (midnight to 5am). Great for charging batteries overnight.",
    standingCharge: 61,
    importRates: [{ start: 0, end: 9, rate: 7.5 }, { start: 10, end: 47, rate: 24.5 }],
    batteryChargeWindow: { start: 0, end: 9 },
    link: "https://octopus.energy/go/"
  },
  {
    name: "EDF Simply Fixed", supplier: "EDF Energy", type: "flat",
    description: "Simple flat rate tariff. No time-of-use complexity.",
    standingCharge: 60,
    importRates: [{ start: 0, end: 47, rate: 24.5 }],
    link: "https://www.edfenergy.com"
  },
  {
    name: "OVO 1 Year Fixed", supplier: "OVO Energy", type: "flat",
    description: "Competitive flat rate. Good all-rounder for modest solar setups.",
    standingCharge: 58,
    importRates: [{ start: 0, end: 47, rate: 23.5 }],
    link: "https://www.ovoenergy.com"
  }
];

const FALLBACK_EXPORT_TARIFFS = [
  {
    name: "Outgoing Octopus", supplier: "Octopus Energy",
    description: "Standard flat-rate export. Open to all.",
    exportRate: 15, exportRates: null, requiresImport: [],
    link: "https://octopus.energy/outgoing/"
  },
  {
    name: "British Gas Export & Earn Plus", supplier: "British Gas",
    description: "Competitive flat export rate.",
    exportRate: 20, exportRates: null, requiresImport: [],
    link: "https://www.britishgas.co.uk"
  },
  {
    name: "EDF Export 12m", supplier: "EDF Energy",
    description: "Fixed 12-month export tariff.",
    exportRate: 12, exportRates: null, requiresImport: [],
    link: "https://www.edfenergy.com"
  },
  {
    name: "OVO SEG Flex", supplier: "OVO Energy",
    description: "Flexible export rate. No lock-in.",
    exportRate: 16, exportRates: null, requiresImport: [],
    link: "https://www.ovoenergy.com"
  }
];

// ---------------------------------------------------------------------------
// BATTERY ANNUAL EFFECTIVENESS
// ---------------------------------------------------------------------------
// The single-day simulation overstates battery performance because it models
// a perfect day. In reality, cloudy days and other losses mean a home battery
// achieves roughly 70% of its theoretical benefit over a year. With seasonal
// modelling (v4.0) the model is more realistic, but we keep a modest blending
// factor to account for day-to-day weather variation within each month.
const BATTERY_EFFECTIVENESS = 0.70;

// ---------------------------------------------------------------------------
// SEASONAL DATA (v4.0)
// ---------------------------------------------------------------------------
// Monthly peak sun hours per region (kWh/m²/day on horizontal plane).
// Source: PVGIS v5.3 (EU Joint Research Centre), 2005-2020 multi-year average.
// Representative cities: Edinburgh, Manchester, Birmingham, London, Exeter, Cardiff.
// Wales reduced ~5% from Cardiff PVGIS to represent whole-of-Wales including
// cloudier upland areas. Index: 0 = Jan, 11 = Dec.
const MONTHLY_SUN_HOURS = {
  "scotland":      [0.5, 1.1, 2.1, 3.7, 4.5, 4.6, 4.5, 3.7, 2.7, 1.5, 0.7, 0.4],
  "north-england": [0.6, 1.2, 2.3, 3.7, 4.3, 4.6, 4.4, 3.7, 2.7, 1.6, 0.8, 0.5],
  "midlands":      [0.7, 1.3, 2.5, 3.9, 4.5, 4.9, 4.8, 4.0, 3.0, 1.7, 0.9, 0.6],
  "south-england": [0.8, 1.4, 2.6, 4.0, 4.6, 5.2, 5.1, 4.2, 3.2, 1.8, 1.1, 0.7],
  "southwest":     [0.9, 1.6, 2.7, 4.3, 5.0, 5.2, 5.1, 4.2, 3.3, 1.9, 1.1, 0.7],
  "wales":         [0.7, 1.4, 2.6, 3.9, 4.8, 5.1, 4.9, 4.0, 3.0, 1.7, 1.0, 0.7]
};

// Seasonal consumption multiplier — winter months use more electricity (lighting,
// appliances) than summer. Validated against Ofgem TDCV, ELEXON Profile Class 1,
// and DESNZ seasonal demand data. Averages to 1.0 across the year.
const MONTHLY_CONSUMPTION_WEIGHT = [
  1.15, 1.10, 1.05, 0.95, 0.90, 0.85,  // Jan–Jun
  0.85, 0.88, 0.95, 1.05, 1.10, 1.17   // Jul–Dec
];

const DAYS_PER_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

// ---------------------------------------------------------------------------
// BATTERY STRATEGIES (v4.0)
// ---------------------------------------------------------------------------
const STRATEGIES = {
  "self-consumption": {
    key: "self-consumption",
    label: "Self-Consumption",
    description: "Maximise use of your own solar. No force exporting.",
    shortDesc: "use solar first, top up battery overnight if needed",
    gridChargeEnabled: true,
    forceExportEnabled: false,
    offPeakHomeSource: "battery",
    chargeFromGrid: "shortfall-only",
    forceExportReserve: 1.0
  },
  "arbitrage": {
    key: "arbitrage",
    label: "Buy Cheap, Sell Dear",
    description: "Charge battery from grid overnight at cheap rates, sell during peak.",
    shortDesc: "charge overnight, export during peak hours",
    gridChargeEnabled: true,
    forceExportEnabled: true,
    offPeakHomeSource: "grid",
    chargeFromGrid: "full",
    forceExportReserve: 0.10
  },
  "hybrid": {
    key: "hybrid",
    label: "Solar + Peak Export",
    description: "Charge from solar, top up from grid if needed, export during peak.",
    shortDesc: "solar charges battery, export surplus at peak",
    gridChargeEnabled: true,
    forceExportEnabled: true,
    offPeakHomeSource: "grid",
    chargeFromGrid: "shortfall-only",
    forceExportReserve: 0.20
  },
  "solar-only": {
    key: "solar-only",
    label: "Solar Only",
    description: "Battery charges only from solar. Maximum self-sufficiency.",
    shortDesc: "no grid charging, battery from solar only",
    gridChargeEnabled: false,
    forceExportEnabled: false,
    offPeakHomeSource: "battery",
    chargeFromGrid: "none",
    forceExportReserve: 1.0
  }
};

const STRATEGY_LIST = Object.values(STRATEGIES);

// ---------------------------------------------------------------------------
// HEAT PUMP DATA (v4.0)
// ---------------------------------------------------------------------------
// kWh consumed per kW of heat pump capacity, per day, by month.
// Calibrated against PVGIS heating degree days (base 15.5°C), Energy Stats UK
// real-world monitoring (5kW Vaillant Arotherm, Sheffield, 2022-2026), and
// BEIS Electrification of Heat trial data (428 ASHPs, SPF 2.81).
// DHW baseline of ~0.4 kWh/kW/day in summer. Annual total: ~800 kWh/kW.
// Assumes seasonal performance factor (SPF) of ~2.8 (DESNZ standard).
const HEAT_PUMP_MONTHLY_KWH_PER_KW = [
  4.3, 4.2, 3.4, 2.8, 0.9, 0.4,   // Jan–Jun
  0.4, 0.4, 0.7, 2.1, 3.2, 3.8    // Jul–Dec
];

// ---------------------------------------------------------------------------
// CSV PARSER
// ---------------------------------------------------------------------------
function parseCSV(text) {
  var records = [];
  var current = "";
  var inQuotes = false;
  var fields = [];
  for (var i = 0; i < text.length; i++) {
    var ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < text.length && text[i + 1] === '"') {
          current += '"'; i++;
        } else { inQuotes = false; }
      } else { current += ch; }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ',') { fields.push(current.trim()); current = ""; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && i + 1 < text.length && text[i + 1] === '\n') i++;
        fields.push(current.trim()); current = "";
        if (fields.length > 1 || fields[0] !== "") records.push(fields);
        fields = [];
      } else { current += ch; }
    }
  }
  if (current || fields.length > 0) {
    fields.push(current.trim());
    if (fields.length > 1 || fields[0] !== "") records.push(fields);
  }
  if (records.length === 0) return [];
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

// Check if a slot falls within a time window (handles overnight wrap-around)
function isInWindow(slot, window) {
  if (!window) return false;
  if (window.start <= window.end) {
    return slot >= window.start && slot <= window.end;
  }
  // Overnight window (e.g. 23:00–05:00 = slots 46–10)
  return slot >= window.start || slot <= window.end;
}

// Find the peak export window (highest export rate) from a tariff
function findPeakExportWindow(tariff) {
  if (!tariff.exportRates || tariff.exportRates.length < 2) return null;
  let best = null;
  for (const r of tariff.exportRates) {
    if (r.start === 0 && r.end === 47) continue; // skip full-day fallback rate
    if (!best || r.rate > best.rate) best = { start: r.start, end: r.end };
  }
  return best;
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
  return {
    importRates: importRates.length ? importRates : [{ start: 0, end: 47, rate: 24 }],
    type
  };
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
    description: row["Notes"] || "",
    standingCharge: n(row["Standing Charge (p/day)"]),
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
    description: row["Notes"] || "",
    standingCharge: n(row["Standing Charge (p/day)"]),
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
    description: row["Notes"] || "",
    exportRate, exportRates, requiresImport,
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
    return {
      bundledTariffs: FALLBACK_BUNDLED_TARIFFS,
      importTariffs: FALLBACK_IMPORT_TARIFFS,
      exportTariffs: FALLBACK_EXPORT_TARIFFS,
      source: "fallback"
    };
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

// Heat pump demand curve: morning peak (06:00-09:00), daytime maintenance,
// evening peak (17:00-21:00), low overnight setback.
function buildHeatPumpCurve(dailyKwh) {
  const profile = [
    // 00:00-05:30 (slots 0-11): overnight setback
    0.020,0.020,0.020,0.020,0.020,0.020,0.020,0.020,0.020,0.020,0.020,0.020,
    // 06:00-08:30 (slots 12-17): morning warm-up
    0.040,0.040,0.040,0.040,0.040,0.040,
    // 09:00-16:30 (slots 18-33): daytime maintenance
    0.020,0.020,0.020,0.020,0.020,0.020,0.020,0.020,0.020,0.020,0.020,0.020,0.020,0.020,0.020,0.020,
    // 17:00-20:30 (slots 34-41): evening peak
    0.035,0.035,0.035,0.035,0.035,0.035,0.035,0.035,
    // 21:00-23:30 (slots 42-47): wind-down
    0.015,0.015,0.015,0.015,0.015,0.015
  ];
  const total = profile.reduce((a, b) => a + b, 0);
  return profile.map(v => (v / total) * dailyKwh);
}

function addCurves(a, b) {
  return a.map((v, i) => v + (b[i] || 0));
}

// ---------------------------------------------------------------------------
// BATTERY SIMULATIONS
// ---------------------------------------------------------------------------
// Strategy-aware battery simulation. The strategy object controls:
// - Whether to charge from grid (and how much)
// - Whether to force-export during peak export windows
// - Whether battery or grid powers the home during off-peak
function simulateBattery(consumption, solar, batteryKwh, strategy, chargeWindow, peakExportWindow) {
  const efficiency = 0.90;
  const maxSlotCharge = (batteryKwh / 2) * 0.5;
  let soc = batteryKwh * 0.2;
  const gridImport = new Array(48).fill(0);
  const gridExport = new Array(48).fill(0);
  const batteryState = new Array(48).fill(0);

  // For shortfall-only charging, estimate how much energy the battery needs
  let expectedShortfall = 0;
  if (strategy.chargeFromGrid === "shortfall-only") {
    for (let i = 0; i < 48; i++) {
      const deficit = consumption[i] - solar[i];
      if (deficit > 0) expectedShortfall += deficit;
    }
    expectedShortfall = Math.min(expectedShortfall, batteryKwh);
  }

  for (let i = 0; i < 48; i++) {
    const inCharge = isInWindow(i, chargeWindow);
    const inPeakExport = isInWindow(i, peakExportWindow);
    const net = consumption[i] - solar[i];
    let slotDischargeUsed = 0;
    let slotChargeUsed = 0;

    // --- PEAK EXPORT PERIOD ---
    if (inPeakExport && strategy.forceExportEnabled) {
      if (net <= 0) {
        gridExport[i] = -net;
      } else {
        const discharge = Math.min(net, soc * efficiency, maxSlotCharge);
        soc = Math.max(0, soc - discharge / efficiency);
        slotDischargeUsed = discharge;
        gridImport[i] = net - discharge;
      }
      // Force-discharge remaining battery to grid (down to reserve)
      const reserveSoc = batteryKwh * strategy.forceExportReserve;
      const availableDischarge = maxSlotCharge - slotDischargeUsed;
      if (soc > reserveSoc && availableDischarge > 0) {
        const forceAmount = Math.min(
          (soc - reserveSoc) * efficiency,
          availableDischarge
        );
        soc = Math.max(reserveSoc, soc - forceAmount / efficiency);
        gridExport[i] += forceAmount;
      }
    }

    // --- CHARGE WINDOW (OFF-PEAK) ---
    else if (inCharge) {
      if (net <= 0) {
        const excess = -net;
        const canCharge = Math.min(excess, (batteryKwh - soc) / efficiency, maxSlotCharge);
        soc = Math.min(batteryKwh, soc + canCharge * efficiency);
        slotChargeUsed = canCharge;
        gridExport[i] = Math.max(0, excess - canCharge);
      } else {
        if (strategy.offPeakHomeSource === "battery") {
          const discharge = Math.min(net, soc * efficiency, maxSlotCharge);
          soc = Math.max(0, soc - discharge / efficiency);
          slotDischargeUsed = discharge;
          gridImport[i] = net - discharge;
        } else {
          gridImport[i] = net;
        }
      }
      // Grid top-up during charge window
      if (strategy.gridChargeEnabled && strategy.chargeFromGrid !== "none") {
        let targetSoc;
        if (strategy.chargeFromGrid === "full") {
          targetSoc = batteryKwh * 0.95;
        } else {
          targetSoc = Math.min(batteryKwh * 0.95, soc + expectedShortfall / efficiency);
        }
        if (soc < targetSoc) {
          const availableCharge = maxSlotCharge - slotChargeUsed;
          const topUp = Math.min((targetSoc - soc) / efficiency, availableCharge);
          if (topUp > 0) {
            gridImport[i] += topUp;
            soc = Math.min(batteryKwh, soc + topUp * efficiency);
          }
        }
      }
    }

    // --- NORMAL OPERATION ---
    else {
      if (net <= 0) {
        const excess = -net;
        const canCharge = Math.min(excess, (batteryKwh - soc) / efficiency, maxSlotCharge);
        soc = Math.min(batteryKwh, soc + canCharge * efficiency);
        gridExport[i] = Math.max(0, excess - canCharge);
      } else {
        const discharge = Math.min(net, soc * efficiency, maxSlotCharge);
        soc = Math.max(0, soc - discharge / efficiency);
        gridImport[i] = net - discharge;
      }
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
    if (net > 0) gridImport[i] = net;
    else gridExport[i] = -net;
  }
  return { gridImport, gridExport, batteryState: new Array(48).fill(0) };
}

// ---------------------------------------------------------------------------
// BATTERY EFFECTIVENESS BLENDING
// ---------------------------------------------------------------------------
function applyBatteryEffectiveness(noBatSim, batSim) {
  const gridImport = noBatSim.gridImport.map((v, i) =>
    v - (v - batSim.gridImport[i]) * BATTERY_EFFECTIVENESS
  );
  const gridExport = noBatSim.gridExport.map((v, i) =>
    v - (v - batSim.gridExport[i]) * BATTERY_EFFECTIVENESS
  );
  return { gridImport, gridExport, batteryState: batSim.batteryState };
}

// ---------------------------------------------------------------------------
// RATE LOOKUPS
// ---------------------------------------------------------------------------
function getImportRate(tariff, slot) {
  for (const b of tariff.importRates) {
    if (isInWindow(slot, b)) return b.rate;
  }
  return 25;
}

function getExportRate(tariff, slot) {
  if (tariff.exportRates) {
    for (const b of tariff.exportRates) {
      if (isInWindow(slot, b)) return b.rate;
    }
  }
  return tariff.exportRate || 0;
}

// ---------------------------------------------------------------------------
// DISPLAY HELPERS
// ---------------------------------------------------------------------------
function slotToTime(slot) {
  var h = Math.floor(slot / 2);
  var m = (slot % 2) * 30;
  return (h < 10 ? "0" : "") + h + ":" + (m < 10 ? "0" : "") + m;
}

function formatRateBands(importRates) {
  if (importRates.length === 1 && importRates[0].start === 0 && importRates[0].end === 47) {
    return '<div class="rate-headline-single">' + importRates[0].rate.toFixed(2) + '<span class="rate-unit">p/kWh</span></div>';
  }
  var rows = importRates.map(function(r) {
    var startTime = slotToTime(r.start);
    var endTime = slotToTime(r.end + 1 > 47 ? 0 : r.end + 1);
    return '<div class="rate-band-row">' +
      '<span class="rate-band-window">' + startTime + '\u2013' + endTime + '</span>' +
      '<span class="rate-band-value">' + r.rate.toFixed(2) + '<span class="rate-unit">p/kWh</span></span>' +
      '</div>';
  });
  return '<div class="rate-headline-tou">' + rows.join("") + '</div>';
}

function buildCostTooltip(annualImport, annualStanding, standingChargePday, annualTotal) {
  return '<span class="cost-info-wrap">' +
    '<span class="cost-info-icon" tabindex="0" role="button" aria-label="Cost breakdown">&#9432;</span>' +
    '<span class="cost-tooltip">' +
      '<strong>Annual cost breakdown</strong>' +
      '<span class="tooltip-row"><span>Import costs:</span><span>&pound;' + annualImport + '</span></span>' +
      '<span class="tooltip-row"><span>Standing charge:</span><span>&pound;' + annualStanding + ' <small>(' + standingChargePday.toFixed(1) + 'p/day &times; 365)</small></span></span>' +
      '<span class="tooltip-divider"></span>' +
      '<span class="tooltip-row tooltip-total"><span>Total:</span><span>&pound;' + annualTotal + '</span></span>' +
      '<span class="tooltip-note">Import costs are based on your estimated usage. The standing charge is a fixed daily fee for being connected to the grid.</span>' +
    '</span>' +
  '</span>';
}

// ---------------------------------------------------------------------------
// COST CALCULATORS
// ---------------------------------------------------------------------------
// Daily cost in pence for one simulated day (used in monthly loop)
function calculateDailyCostPence(tariff, gridImport, gridExport) {
  let importPence = 0, exportPence = 0;
  for (let i = 0; i < 48; i++) {
    importPence += gridImport[i] * getImportRate(tariff, i);
    exportPence += gridExport[i] * getExportRate(tariff, i);
  }
  return { importPence, exportPence };
}

function isCompatible(exportTariff, importTariff) {
  if (!exportTariff.requiresImport || exportTariff.requiresImport.length === 0) return true;
  return exportTariff.requiresImport.includes(importTariff.name);
}

// ---------------------------------------------------------------------------
// POSTCODE LOOKUP (postcodes.io — free, no API key)
// ---------------------------------------------------------------------------
const POSTCODE_REGION_MAP = {
  "North East": "north-england",
  "North West": "north-england",
  "Yorkshire and The Humber": "north-england",
  "East Midlands": "midlands",
  "West Midlands": "midlands",
  "East of England": "midlands",
  "London": "south-england",
  "South East": "south-england",
  "South West": "southwest"
};

const REGION_LABELS = {
  "scotland": "Scotland", "north-england": "North England",
  "midlands": "Midlands", "south-england": "South England",
  "southwest": "South West", "wales": "Wales"
};

async function lookupPostcode(postcode) {
  var clean = postcode.replace(/\s+/g, "").toUpperCase();
  if (!clean) throw new Error("Please enter your postcode");
  var resp = await fetch("https://api.postcodes.io/postcodes/" + encodeURIComponent(clean));
  if (!resp.ok) throw new Error("We couldn't recognise that postcode \u2014 please check and try again");
  var data = await resp.json();
  if (data.status !== 200 || !data.result) throw new Error("We couldn't recognise that postcode \u2014 please check and try again");
  var result = data.result;
  var country = result.country;
  if (country === "Scotland") return { region: "scotland", label: "Scotland" };
  if (country === "Wales") return { region: "wales", label: "Wales" };
  if (country === "Northern Ireland") return { region: "north-england", label: "Northern Ireland" };
  var engRegion = result.region || "";
  var mapped = POSTCODE_REGION_MAP[engRegion];
  if (mapped) return { region: mapped, label: REGION_LABELS[mapped] || engRegion };
  return { region: "midlands", label: engRegion || "Unknown" };
}

// ---------------------------------------------------------------------------
// REGIONAL ESTIMATES
// ---------------------------------------------------------------------------
function estimateDailyConsumption(bedrooms, houseSize) {
  return Math.max(5, bedrooms * 3.5 + (houseSize - 80) * 0.02);
}

// ---------------------------------------------------------------------------
// MAIN ENGINE (v4.0 — seasonal × strategy × heat pump)
// ---------------------------------------------------------------------------
function runEngine(bundledTariffs, importTariffs, exportTariffs, houseSize, bedrooms, solarKwp, batteryKwh, location, heatPumpKw) {
  const baseDailyConsumption = estimateDailyConsumption(bedrooms, houseSize);
  const regionSunHours = MONTHLY_SUN_HOURS[location] || MONTHLY_SUN_HOURS["midlands"];
  heatPumpKw = heatPumpKw || 0;

  // Calculate annual average daily generation for display
  let totalGenDays = 0;
  for (let m = 0; m < 12; m++) totalGenDays += regionSunHours[m] * DAYS_PER_MONTH[m];
  const avgDailyGeneration = solarKwp * (totalGenDays / 365);

  // Representative mid-year curves for the summary chart (June)
  const chartSolarCurve = buildSolarCurve(solarKwp * regionSunHours[5]);
  let chartConsumptionCurve = buildConsumptionCurve(baseDailyConsumption * MONTHLY_CONSUMPTION_WEIGHT[5]);
  if (heatPumpKw > 0) {
    const hpJune = buildHeatPumpCurve(heatPumpKw * HEAT_PUMP_MONTHLY_KWH_PER_KW[5]);
    chartConsumptionCurve = addCurves(chartConsumptionCurve, hpJune);
  }

  // ------------------------------------------------------------------
  // Helper: simulate one month for a tariff + strategy, return daily cost
  // ------------------------------------------------------------------
  function simulateMonth(month, tariff, strategy) {
    const dailySolarKwh = solarKwp * regionSunHours[month];
    const solarCurve = buildSolarCurve(dailySolarKwh);
    let consumptionCurve = buildConsumptionCurve(baseDailyConsumption * MONTHLY_CONSUMPTION_WEIGHT[month]);

    // Add heat pump demand if present
    if (heatPumpKw > 0) {
      const hpDailyKwh = heatPumpKw * HEAT_PUMP_MONTHLY_KWH_PER_KW[month];
      consumptionCurve = addCurves(consumptionCurve, buildHeatPumpCurve(hpDailyKwh));
    }

    const noBatSim = simulateNoBattery(consumptionCurve, solarCurve);

    let sim;
    if (batteryKwh > 0) {
      const chargeWindow = tariff.batteryChargeWindow || null;
      const peakExportWindow = findPeakExportWindow(tariff);
      const rawSim = simulateBattery(consumptionCurve, solarCurve, batteryKwh, strategy, chargeWindow, peakExportWindow);
      sim = applyBatteryEffectiveness(noBatSim, rawSim);
    } else {
      sim = noBatSim;
    }

    return calculateDailyCostPence(tariff, sim.gridImport, sim.gridExport);
  }

  // ------------------------------------------------------------------
  // Helper: run a full year (12 months) for a tariff + strategy
  // ------------------------------------------------------------------
  function simulateYear(tariff, strategy) {
    let annualImportPence = 0, annualExportPence = 0;
    for (let m = 0; m < 12; m++) {
      const daily = simulateMonth(m, tariff, strategy);
      annualImportPence += daily.importPence * DAYS_PER_MONTH[m];
      annualExportPence += daily.exportPence * DAYS_PER_MONTH[m];
    }
    return { annualImportPence, annualExportPence };
  }

  // Default strategy for tariffs without battery or for generic sims
  const defaultStrategy = STRATEGIES["self-consumption"];

  // ==================================================================
  // BUNDLED TARIFFS (default view) — strategy optimisation
  // ==================================================================
  const bundledResults = bundledTariffs.map(tariff => {
    let bestNet = Infinity;
    let bestResult = null;
    let bestStrategy = defaultStrategy;

    const strategiesToTest = batteryKwh > 0 ? STRATEGY_LIST : [defaultStrategy];

    for (const strategy of strategiesToTest) {
      const { annualImportPence, annualExportPence } = simulateYear(tariff, strategy);
      const annualImport = Math.round(annualImportPence / 100);
      const annualExport = Math.round(annualExportPence / 100);
      const annualStanding = Math.round((tariff.standingCharge / 100) * 365);
      const annualNet = annualImport + annualStanding - annualExport;

      if (annualNet < bestNet) {
        bestNet = annualNet;
        bestResult = { annualImport, annualExport, annualStanding, annualNet };
        bestStrategy = strategy;
      }
    }

    return { ...tariff, ...bestResult, bestStrategy: batteryKwh > 0 ? bestStrategy : null };
  });
  bundledResults.sort((a, b) => a.annualNet - b.annualNet);

  // ==================================================================
  // IMPORT TARIFFS (split view) — strategy optimisation
  // ==================================================================
  const importResults = importTariffs.map(tariff => {
    let bestTotal = Infinity;
    let bestResult = null;
    let bestStrategy = defaultStrategy;

    const strategiesToTest = batteryKwh > 0 ? STRATEGY_LIST : [defaultStrategy];

    for (const strategy of strategiesToTest) {
      const { annualImportPence } = simulateYear(tariff, strategy);
      const annualImport = Math.round(annualImportPence / 100);
      const annualStanding = Math.round((tariff.standingCharge / 100) * 365);
      const annualImportTotal = annualImport + annualStanding;

      if (annualImportTotal < bestTotal) {
        bestTotal = annualImportTotal;
        bestResult = { annualImport, annualStanding, annualImportTotal };
        bestStrategy = strategy;
      }
    }

    const noData = tariff.standingCharge === 0 && bestResult.annualImport === 0;
    return { ...tariff, ...bestResult, bestStrategy: batteryKwh > 0 ? bestStrategy : null, noData };
  }).filter(function(t) { return !t.noData; });
  importResults.sort((a, b) => a.annualImportTotal - b.annualImportTotal);

  // ==================================================================
  // EXPORT TARIFFS (split view) — generic sim, no strategy optimisation
  // ==================================================================
  const exportResults = exportTariffs.map(tariff => {
    let annualExportPence = 0;
    for (let m = 0; m < 12; m++) {
      const dailySolarKwh = solarKwp * regionSunHours[m];
      const solarCurve = buildSolarCurve(dailySolarKwh);
      let consumptionCurve = buildConsumptionCurve(baseDailyConsumption * MONTHLY_CONSUMPTION_WEIGHT[m]);
      if (heatPumpKw > 0) {
        consumptionCurve = addCurves(consumptionCurve, buildHeatPumpCurve(heatPumpKw * HEAT_PUMP_MONTHLY_KWH_PER_KW[m]));
      }

      const noBatSim = simulateNoBattery(consumptionCurve, solarCurve);
      let sim;
      if (batteryKwh > 0) {
        const rawSim = simulateBattery(consumptionCurve, solarCurve, batteryKwh, defaultStrategy, null, null);
        sim = applyBatteryEffectiveness(noBatSim, rawSim);
      } else {
        sim = noBatSim;
      }

      let dailyExportPence = 0;
      for (let i = 0; i < 48; i++) {
        dailyExportPence += sim.gridExport[i] * getExportRate(tariff, i);
      }
      annualExportPence += dailyExportPence * DAYS_PER_MONTH[m];
    }

    const annualExport = Math.round(annualExportPence / 100);
    return { ...tariff, annualExport };
  });
  exportResults.sort((a, b) => b.annualExport - a.annualExport);

  return {
    bundledResults, importResults, exportResults,
    inputs: {
      dailyConsumption: baseDailyConsumption,
      dailyGeneration: avgDailyGeneration,
      batteryKwh,
      heatPumpKw
    },
    curves: { consumptionCurve: chartConsumptionCurve, solarCurve: chartSolarCurve }
  };
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
style="width:100%;border-radius:8px;background:#f7f9fa;overflow:visible;">\
' + area(consumptionCurve, "#1a3a4a") + area(solarCurve, "#f4a261") + '\
' + line(consumptionCurve, "#1a3a4a") + line(solarCurve, "#f4a261") + '\
' + labels + '\
</svg>\
<div style="display:flex;gap:16px;font-size:0.78rem;color:#666;margin-top:6px;">\
<span><span style="color:#1a3a4a;font-weight:700;">&#9632;</span> Consumption</span>\
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
  var hpNote = inputs.heatPumpKw > 0
    ? '<div style="flex:1;min-width:100px;text-align:center;padding:10px;background:white;border-radius:8px;">\
<div style="font-size:1.25rem;font-weight:700;color:#e07020;">' + inputs.heatPumpKw + ' kW</div>\
<div style="font-size:0.75rem;color:#999;">Heat pump</div>\
</div>'
    : "";
  return '\
<div style="background:#f7f9fa;border-radius:12px;padding:18px;margin-bottom:24px;">\
' + sourceNote + '\
<p style="font-size:0.88rem;color:#666;margin:0 0 12px;">Based on your inputs, we estimate your daily energy profile:</p>\
<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px;">\
<div style="flex:1;min-width:100px;text-align:center;padding:10px;background:white;border-radius:8px;">\
<div style="font-size:1.25rem;font-weight:700;color:#1a3a4a;">' + inputs.dailyConsumption.toFixed(1) + ' kWh</div>\
<div style="font-size:0.75rem;color:#999;">Avg daily consumption</div>\
</div>\
<div style="flex:1;min-width:100px;text-align:center;padding:10px;background:white;border-radius:8px;">\
<div style="font-size:1.25rem;font-weight:700;color:#f4a261;">' + inputs.dailyGeneration.toFixed(1) + ' kWh</div>\
<div style="font-size:0.75rem;color:#999;">Avg solar generation</div>\
</div>\
<div style="flex:1;min-width:100px;text-align:center;padding:10px;background:white;border-radius:8px;">\
<div style="font-size:1.25rem;font-weight:700;color:#2a7a6a;">' + inputs.batteryKwh + ' kWh</div>\
<div style="font-size:0.75rem;color:#999;">Battery capacity</div>\
</div>\
' + hpNote + '\
</div>\
' + renderProfileChart(curves.consumptionCurve, curves.solarCurve) + '\
<p style="font-size:0.72rem;color:#bbb;margin:8px 0 0;text-align:center;">Profile shown for a typical June day. Annual costs use 12 monthly simulations.</p>\
</div>';
}

// ---------------------------------------------------------------------------
// RENDER — TOGGLE + LEARN MORE
// ---------------------------------------------------------------------------
function renderToggle(isSplit) {
  return '\
<div style="display:flex;align-items:center;gap:12px;margin-bottom:8px;">\
<label style="display:flex;align-items:center;gap:8px;cursor:pointer;user-select:none;flex-shrink:0;">\
<span style="position:relative;display:inline-block;width:44px;height:24px;background:' + (isSplit ? "#2a7a6a" : "#ccc") + ';border-radius:12px;transition:background 0.2s;flex-shrink:0;">\
<span style="position:absolute;top:2px;left:' + (isSplit ? "22px" : "2px") + ';width:20px;height:20px;background:white;border-radius:50%;transition:left 0.2s;box-shadow:0 1px 3px rgba(0,0,0,0.2);"></span>\
</span>\
<input type="checkbox" id="view-toggle" ' + (isSplit ? "checked" : "") + ' style="position:absolute;opacity:0;pointer-events:none;" />\
<span style="font-size:0.88rem;color:#333;font-weight:500;">Show import and export tariffs separately</span>\
</label>\
<button id="learn-more-btn" style="background:none;border:none;color:#2a7a6a;font-size:0.82rem;cursor:pointer;text-decoration:underline;padding:0;font-weight:500;white-space:nowrap;">Learn more</button>\
</div>\
<div id="learn-more-callout" style="display:none;background:#f0f5f7;border:1px solid #b7d5dd;border-radius:10px;padding:16px 18px;margin-bottom:20px;font-size:0.84rem;color:#333;line-height:1.6;">\
<div style="font-weight:700;margin-bottom:6px;color:#1a3a4a;">Why are there two tariffs?</div>\
<p style="margin:0 0 8px;">With solar panels, your energy bill has two sides:</p>\
<p style="margin:0 0 8px;"><strong style="color:#c0392b;">Import tariff</strong> &mdash; the rate you pay for electricity drawn from the grid. This covers nights, cloudy days, and any time your panels and battery can&rsquo;t keep up with demand.</p>\
<p style="margin:0 0 8px;"><strong style="color:#2a7a6a;">Export tariff (SEG)</strong> &mdash; the rate you&rsquo;re paid for surplus solar electricity you send back to the grid. Under the Smart Export Guarantee, suppliers must offer you a rate for this energy.</p>\
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
    var extraCost = i > 0 ? '<div class="tariff-extra-cost">&pound;' + (t.annualNet - best.annualNet) + ' more per year than best</div>' : "";
    var tooltip = buildCostTooltip(t.annualImport, t.annualStanding, t.standingCharge, t.annualImport + t.annualStanding);
    var strategyLine = t.bestStrategy
      ? '<div style="font-size:0.75rem;color:#2a7a6a;margin-top:6px;font-style:italic;">&#9889; Best with: <strong>' + t.bestStrategy.label + '</strong> &mdash; ' + t.bestStrategy.shortDesc + '</div>'
      : "";
    return '\
<div class="tariff-card' + (isBest ? " tariff-card--best" : "") + '">\
' + (isBest ? '<div class="tariff-badge">Best Match</div>' : "") + '\
<h3>' + t.name + '</h3>\
<div class="supplier">' + t.supplier + ' &middot; ' + (t.type === "flat" ? "Flat Rate" : "Time of Use") + ' &middot; Import &amp; Export</div>\
<div class="tariff-card-body">\
<div class="tariff-card-main">\
<div class="tariff-rates-headline">' + formatRateBands(t.importRates) + '</div>\
<div class="tariff-export-line">Export: ' + t.exportRate + 'p/kWh</div>\
</div>\
<div class="tariff-card-cost">\
<div class="annual-cost-figure">&pound;' + t.annualNet + ' ' + tooltip + '</div>\
<div class="annual-cost-label">Net annual cost (import &minus; export)</div>\
</div>\
</div>\
' + (t.equipment ? '<div class="tariff-equipment">&#9889; ' + t.equipment + '</div>' : "") + '\
' + strategyLine + '\
' + extraCost + '\
<a href="' + t.link + '" target="_blank" rel="noopener">View tariff &rarr;</a>\
</div>';
  }).join("");
}

// ---------------------------------------------------------------------------
// RENDER — SPLIT VIEW (toggle on)
// ---------------------------------------------------------------------------
function renderSplitView(importResults, exportResults) {
  var importCardsHTML = importResults.map(function(t, i) {
    var tooltip = buildCostTooltip(t.annualImport, t.annualStanding, t.standingCharge, t.annualImportTotal);
    var strategyLine = t.bestStrategy
      ? '<div style="font-size:0.72rem;color:#2a7a6a;margin-top:4px;font-style:italic;">&#9889; ' + t.bestStrategy.label + '</div>'
      : "";
    return '\
<div class="tariff-card' + (i === 0 ? " tariff-card--best" : "") + '">\
' + (i === 0 ? '<div class="tariff-badge">Cheapest</div>' : "") + '\
<h4>' + t.name + '</h4>\
<div class="supplier">' + t.supplier + ' &middot; ' + (t.type === "flat" ? "Flat Rate" : "Time of Use") + '</div>\
<div class="tariff-card-body">\
<div class="tariff-card-main">\
<div class="tariff-rates-headline">' + formatRateBands(t.importRates) + '</div>\
</div>\
<div class="tariff-card-cost">\
<div class="annual-cost-figure">&pound;' + t.annualImportTotal + ' ' + tooltip + '</div>\
<div class="annual-cost-label">Est. annual cost</div>\
</div>\
</div>\
' + (t.equipment ? '<div class="tariff-equipment">&#9889; ' + t.equipment + '</div>' : "") + '\
' + strategyLine + '\
<a href="' + t.link + '" target="_blank" rel="noopener">View tariff &rarr;</a>\
</div>';
  }).join("");

  var exportCardsHTML = exportResults.map(function(t, i) {
    var restricted = t.requiresImport && t.requiresImport.length > 0;
    var exportRatesArray = t.exportRates || [{ start: 0, end: 47, rate: t.exportRate }];
    return '\
<div class="tariff-card' + (i === 0 ? " tariff-card--best" : "") + '">\
' + (i === 0 ? '<div class="tariff-badge">Highest earnings</div>' : "") + '\
<h4>' + t.name + '</h4>\
<div class="supplier">' + t.supplier + '</div>\
<div class="tariff-card-body">\
<div class="tariff-card-main">\
<div class="tariff-rates-headline tariff-rates-headline--export">' + formatRateBands(exportRatesArray) + '</div>\
</div>\
<div class="tariff-card-cost">\
<div class="annual-cost-figure annual-cost-figure--export">&pound;' + t.annualExport + '</div>\
<div class="annual-cost-label">Est. annual earnings</div>\
</div>\
</div>\
' + (restricted ? '<div class="tariff-equipment">&#128274; Requires: ' + t.requiresImport.join(", ") + '</div>' : "") + '\
<a href="' + t.link + '" target="_blank" rel="noopener">View tariff &rarr;</a>\
</div>';
  }).join("");

  return '\
<div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;">\
<div>\
<h3 style="font-size:1rem;color:#1a3a4a;margin:0 0 12px;">\
&#9889; Import Tariffs\
<span style="font-size:0.72rem;font-weight:400;color:#999;">(' + importResults.length + ' tariffs, cheapest first)</span>\
</h3>\
' + importCardsHTML + '\
</div>\
<div>\
<h3 style="font-size:1rem;color:#2a7a6a;margin:0 0 12px;">\
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
&#9888; Estimates use 12 monthly simulations with PVGIS-validated regional solar data and seasonal consumption profiles.\
Battery round-trip efficiency assumed at 90%. Always confirm rates directly with suppliers.\
</p>';
  var toggle = document.getElementById("view-toggle");
  if (toggle) {
    toggle.addEventListener("change", function() { renderWithView(this.checked); });
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
}
