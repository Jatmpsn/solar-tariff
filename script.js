// =============================================================================
// GREEN TARIFF MARKETPLACE — ENGINE
// =============================================================================

// -----------------------------------------------------------------------------
// TARIFF DATABASE
// -----------------------------------------------------------------------------
const TARIFFS = [
  {
    id: "octopus-agile",
    supplier: "Octopus Energy",
    name: "Octopus Agile",
    type: "tou-block",
    availability: "available",
    renewable: null,
    standingCharge: 61.64,
    flatRate: null,
    blocks: [
      { from: 0,  to: 7,  rate: 12 },
      { from: 7,  to: 16, rate: 24 },
      { from: 16, to: 19, rate: 40 },
      { from: 19, to: 23, rate: 24 },
      { from: 23, to: 24, rate: 12 },
    ],
    exportRate: 15,
    exportType: "Variable (market)",
    minContract: 0,
    notes: "Rates shown are indicative 12-month averages. Will be replaced with live Octopus API data.",
    link: "https://octopus.energy/agile/",
    apiEnabled: true,
  },
  {
    id: "octopus-flux",
    supplier: "Octopus Energy",
    name: "Octopus Flux",
    type: "tou-block",
    availability: "available",
    renewable: null,
    standingCharge: 61.64,
    flatRate: null,
    blocks: [
      { from: 0,  to: 7,  rate: 21 },
      { from: 7,  to: 16, rate: 34 },
      { from: 16, to: 19, rate: 45 },
      { from: 19, to: 24, rate: 34 },
    ],
    exportRate: 24,
    exportType: "Fixed (Flux export — varies by block)",
    exportBlocks: [
      { from: 0,  to: 7,  rate: 21 },
      { from: 7,  to: 16, rate: 24 },
      { from: 16, to: 19, rate: 35 },
      { from: 19, to: 24, rate: 24 },
    ],
    minContract: 0,
    notes: "Designed specifically for solar + battery. Requires compatible battery system.",
    link: "https://octopus.energy/flux/",
    apiEnabled: false,
  },
  {
    id: "octopus-go",
    supplier: "Octopus Energy",
    name: "Octopus Go",
    type: "tou-block",
    availability: "available",
    renewable: null,
    standingCharge: 61.64,
    flatRate: null,
    blocks: [
      { from: 0,  to: 5,  rate: 9  },
      { from: 5,  to: 24, rate: 34 },
    ],
    exportRate: 15,
    exportType: "SEG / Outgoing Octopus",
    minContract: 0,
    notes: "Cheap overnight rate 00:30–05:30. Ideal for charging battery overnight.",
    link: "https://octopus.energy/go/",
    apiEnabled: false,
  },
  {
    id: "octopus-intelligent-go",
    supplier: "Octopus Energy",
    name: "Octopus Intelligent Go",
    type: "tou-block",
    availability: "available",
    renewable: null,
    standingCharge: 61.64,
    flatRate: null,
    blocks: [
      { from: 0,  to: 5,  rate: 9  },
      { from: 5,  to: 24, rate: 34 },
    ],
    exportRate: 15,
    exportType: "SEG / Outgoing Octopus",
    minContract: 0,
    notes: "Like Go but smart-charges compatible EVs automatically. Requires compatible EV/charger.",
    link: "https://octopus.energy/intelligent-go/",
    apiEnabled: false,
  },
  {
    id: "fuse-standard",
    supplier: "Fuse Energy",
    name: "Fuse Standard",
    type: "flat",
    availability: "available",
    renewable: null,
    standingCharge: 55,
    flatRate: 24.5,
    blocks: [],
    exportRate: 20,
    exportType: "Fixed (SEG)",
    minContract: 0,
    notes: "Competitive flat rate. Good all-rounder for solar owners who want simplicity.",
    link: "https://www.fuseenergy.co.uk",
    apiEnabled: false,
  },
  {
    id: "fuse-tou",
    supplier: "Fuse Energy",
    name: "Fuse Time of Use",
    type: "tou-block",
    availability: "available",
    renewable: null,
    standingCharge: 55,
    flatRate: null,
    blocks: [
      { from: 0,  to: 7,  rate: 12 },
      { from: 7,  to: 16, rate: 28 },
      { from: 16, to: 19, rate: 42 },
      { from: 19, to: 24, rate: 28 },
    ],
    exportRate: 20,
    exportType: "Fixed (SEG)",
    minContract: 0,
    notes: "Peak 4pm–7pm. Verify current block times and rates on Fuse site.",
    link: "https://www.fuseenergy.co.uk",
    apiEnabled: false,
  },
  {
    id: "british-gas-solar-extra",
    supplier: "British Gas",
    name: "Solar Extra",
    type: "flat",
    availability: "available",
    renewable: null,
    standingCharge: 61,
    flatRate: 28.5,
    blocks: [],
    exportRate: 20,
    exportType: "Fixed (SEG)",
    minContract: 12,
    notes: "Simple flat rate with competitive export. Best for solar-only (no battery). 12-month contract, £75 exit fee.",
    link: "https://www.britishgas.co.uk",
    apiEnabled: false,
  },
  {
    id: "edf-standard",
    supplier: "EDF Energy",
    name: "EDF Standard Variable",
    type: "flat",
    availability: "available",
    renewable: null,
    standingCharge: 61,
    flatRate: 28.62,
    blocks: [],
    exportRate: 12,
    exportType: "SEG",
    minContract: 0,
    notes: "No time-of-use benefit. Best for small setups where ToU maths does not stack up.",
    link: "https://www.edfenergy.com",
    apiEnabled: false,
  },
  {
    id: "ovo-smart",
    supplier: "OVO Energy",
    name: "OVO Smart",
    type: "flat",
    availability: "available",
    renewable: null,
    standingCharge: 57,
    flatRate: 26,
    blocks: [],
    exportRate: 16,
    exportType: "Fixed (SEG)",
    minContract: 0,
    notes: "Good all-rounder for modest solar setups without a battery.",
    link: "https://www.ovoenergy.com",
    apiEnabled: false,
  },
  {
    id: "ovo-drive",
    supplier: "OVO Energy",
    name: "OVO Drive Anytime",
    type: "tou-block",
    availability: "available",
    renewable: null,
    standingCharge: 57,
    flatRate: null,
    blocks: [
      { from: 0,  to: 7,  rate: 12 },
      { from: 7,  to: 24, rate: 26 },
    ],
    exportRate: 16,
    exportType: "Fixed (SEG)",
    minContract: 0,
    notes: "Cheap overnight rate for EV charging. Works well with battery. Requires EV.",
    link: "https://www.ovoenergy.com",
    apiEnabled: false,
  },
  {
    id: "eon-next-drive",
    supplier: "E.ON Next",
    name: "E.ON Next Drive",
    type: "tou-block",
    availability: "available",
    renewable: null,
    standingCharge: 60,
    flatRate: null,
    blocks: [
      { from: 0,  to: 7,  rate: 11 },
      { from: 7,  to: 24, rate: 28 },
    ],
    exportRate: 14,
    exportType: "Fixed (SEG)",
    minContract: 0,
    notes: "Cheap overnight rate 00:00-07:00. Good for battery plus EV combo.",
    link: "https://www.eonnext.com",
    apiEnabled: false,
  },
  {
    id: "eon-next-fixed",
    supplier: "E.ON Next",
    name: "E.ON Next Fixed",
    type: "flat",
    availability: "available",
    renewable: null,
    standingCharge: 60,
    flatRate: 27,
    blocks: [],
    exportRate: 14,
    exportType: "Fixed (SEG)",
    minContract: 12,
    notes: "12-month fixed rate. Price certainty. 50 pound exit fee.",
    link: "https://www.eonnext.com",
    apiEnabled: false,
  },
  {
    id: "scottish-power-smart",
    supplier: "Scottish Power",
    name: "SP Smart",
    type: "tou-block",
    availability: "available",
    renewable: null,
    standingCharge: 59,
    flatRate: null,
    blocks: [
      { from: 0,  to: 7,  rate: 14 },
      { from: 7,  to: 16, rate: 29 },
      { from: 16, to: 20, rate: 40 },
      { from: 20, to: 24, rate: 29 },
    ],
    exportRate: 13,
    exportType: "Fixed (SEG)",
    minContract: 0,
    notes: "Peak rate 4pm-8pm. Check current rates and block times on SP site.",
    link: "https://www.scottishpower.co.uk",
    apiEnabled: false,
  },
];

// -----------------------------------------------------------------------------
// SOLAR GENERATION CURVE (48 half-hourly fractions, sums to 1.0)
// -----------------------------------------------------------------------------
const SOLAR_CURVE_RAW = [
  0, 0, 0, 0, 0, 0, 0, 0,
  0.001, 0.002,
  0.005, 0.010, 0.018, 0.028,
  0.040, 0.055, 0.068, 0.078,
  0.085, 0.090, 0.093, 0.095,
  0.096, 0.097, 0.097, 0.096,
  0.094, 0.090, 0.085, 0.078,
  0.068, 0.055, 0.040, 0.028,
  0.018, 0.010, 0.005, 0.002,
  0.001, 0, 0, 0, 0, 0, 0, 0, 0, 0,
];
const SOLAR_TOTAL = SOLAR_CURVE_RAW.reduce(function(a, b) { return a + b; }, 0);
const SOLAR_CURVE = SOLAR_CURVE_RAW.map(function(v) { return v / SOLAR_TOTAL; });

// -----------------------------------------------------------------------------
// CONSUMPTION CURVE (48 half-hourly fractions, sums to 1.0)
// -----------------------------------------------------------------------------
const CONSUMPTION_CURVE_RAW = [
  0.012, 0.010, 0.009, 0.009, 0.009, 0.010, 0.011, 0.013,
  0.025, 0.038, 0.045, 0.042, 0.038, 0.032, 0.028, 0.024,
  0.022, 0.020, 0.019, 0.018, 0.018, 0.019,
  0.022, 0.025, 0.024, 0.022,
  0.019, 0.018, 0.018, 0.019,
  0.025, 0.032, 0.042, 0.052, 0.058, 0.060, 0.058, 0.054, 0.048, 0.040,
  0.032, 0.025, 0.020, 0.016,
  0.014, 0.013,
];
const CONSUMPTION_TOTAL = CONSUMPTION_CURVE_RAW.reduce(function(a, b) { return a + b; }, 0);
const CONSUMPTION_CURVE = CONSUMPTION_CURVE_RAW.map(function(v) { return v / CONSUMPTION_TOTAL; });

// -----------------------------------------------------------------------------
// REGIONAL PEAK SUN HOURS
// -----------------------------------------------------------------------------
const SUN_HOURS = {
  "scotland":      2.7,
  "north-england": 2.9,
  "midlands":      3.2,
  "south-england": 3.5,
  "southwest":     3.7,
  "wales":         3.1,
};

// -----------------------------------------------------------------------------
// ESTIMATE DAILY CONSUMPTION
// -----------------------------------------------------------------------------
function estimateDailyConsumption(bedrooms, houseSize) {
  var base = bedrooms * 3.5;
  var sizeAdj = (houseSize - 80) * 0.02;
  return Math.max(5, base + sizeAdj);
}

// -----------------------------------------------------------------------------
// BUILD HALF-HOURLY CURVES
// -----------------------------------------------------------------------------
function buildConsumptionCurve(dailyKwh) {
  return CONSUMPTION_CURVE.map(function(f) { return f * dailyKwh; });
}

function buildSolarCurve(solarKwp, location) {
  var peakHours = SUN_HOURS[location] || 3.0;
  var dailyGen = solarKwp * peakHours;
  return SOLAR_CURVE.map(function(f) { return f * dailyGen; });
}

// -----------------------------------------------------------------------------
// GET IMPORT RATE FOR A SLOT
// -----------------------------------------------------------------------------
function getImportRate(slot, tariff) {
  var hour = slot / 2;
  if (tariff.type === "flat") return tariff.flatRate;
  for (var i = 0; i < tariff.blocks.length; i++) {
    var block = tariff.blocks[i];
    if (hour >= block.from && hour < block.to) return block.rate;
  }
  return tariff.blocks[tariff.blocks.length - 1].rate;
}

// -----------------------------------------------------------------------------
// GET EXPORT RATE FOR A SLOT
// -----------------------------------------------------------------------------
function getExportRate(slot, tariff) {
  if (tariff.exportBlocks) {
    var hour = slot / 2;
    for (var i = 0; i < tariff.exportBlocks.length; i++) {
      var block = tariff.exportBlocks[i];
      if (hour >= block.from && hour < block.to) return block.rate;
    }
  }
  return tariff.exportRate;
}

// -----------------------------------------------------------------------------
// BATTERY MODEL
// -----------------------------------------------------------------------------
function runBatteryModel(consumptionCurve, solarCurve, batteryKwh, tariff) {
  var BATTERY_EFFICIENCY = 0.92;
  var CHARGE_RATE = Math.max(batteryKwh * 0.5, 0.5);
  var MIN_SOC = batteryKwh * 0.1;
  var MAX_SOC = batteryKwh * 0.95;

  var gridImport = new Array(48).fill(0);
  var gridExport = new Array(48).fill(0);
  var soc = batteryKwh * 0.5;

  // Find cheapest 8 slots for grid charging
  var slotRates = [];
  for (var i = 0; i < 48; i++) {
    slotRates.push({ slot: i, rate: getImportRate(i, tariff) });
  }
  slotRates.sort(function(a, b) { return a.rate - b.rate; });
  var cheapSlots = new Set();
  for (var j = 0; j < 8; j++) { cheapSlots.add(slotRates[j].slot); }

  for (var i = 0; i < 48; i++) {
    var consumption = consumptionCurve[i];
    var solar = solarCurve[i];
    var net = solar - consumption;

    if (net >= 0) {
      // Solar surplus: charge battery then export remainder
      var canCharge = Math.min(net, CHARGE_RATE, (MAX_SOC - soc) / BATTERY_EFFICIENCY);
      soc += canCharge * BATTERY_EFFICIENCY;
      var surplus = net - canCharge;
      gridExport[i] = surplus;
      gridImport[i] = 0;
    } else {
      // Deficit: discharge battery first
      var deficit = Math.abs(net);
      var canDischarge = Math.min(deficit, CHARGE_RATE, (soc - MIN_SOC) / BATTERY_EFFICIENCY);
      if (canDischarge < 0) canDischarge = 0;
      soc -= canDischarge / BATTERY_EFFICIENCY;
      var remaining = deficit - canDischarge;

      if (remaining > 0.001) {
        // Still need grid — opportunistically charge battery in cheap slots
        if (batteryKwh > 0 && cheapSlots.has(i) && soc < MAX_SOC * 0.8) {
          var topUp = Math.min(CHARGE_RATE, (MAX_SOC - soc) / BATTERY_EFFICIENCY);
          soc += topUp * BATTERY_EFFICIENCY;
          gridImport[i] = remaining + topUp;
        } else {
          gridImport[i] = remaining;
        }
      }
      gridExport[i] = 0;
    }

    // Clamp SoC
    if (soc > MAX_SOC) soc = MAX_SOC;
    if (soc < MIN_SOC) soc = MIN_SOC;
  }

  return { gridImport: gridImport, gridExport: gridExport };
}

// -----------------------------------------------------------------------------
// CALCULATE ANNUAL COST FOR A TARIFF
// -----------------------------------------------------------------------------
function calculateAnnualCost(consumptionCurve, solarCurve, batteryKwh, tariff) {
  var result = runBatteryModel(consumptionCurve, solarCurve, batteryKwh, tariff);
  var gridImport = result.gridImport;
  var gridExport = result.gridExport;

  var dailyImportCost = 0;
  var dailyExportEarnings = 0;

  for (var i = 0; i < 48; i++) {
    dailyImportCost += gridImport[i] * getImportRate(i, tariff);
    dailyExportEarnings += gridExport[i] * getExportRate(i, tariff);
  }

  var annualImportCost = Math.round((dailyImportCost * 365) / 100);
  var annualExportEarnings = Math.round((dailyExportEarnings * 365) / 100);
  var annualStandingCharge = Math.round((tariff.standingCharge * 365) / 100);
  var annualNetCost = annualImportCost + annualStandingCharge - annualExportEarnings;

  var dailyImportTotal = gridImport.reduce(function(a, b) { return a + b; }, 0);
  var dailyExportTotal = gridExport.reduce(function(a, b) { return a + b; }, 0);

  return {
    annualImportCost: annualImportCost,
    annualExportEarnings: annualExportEarnings,
    annualStandingCharge: annualStandingCharge,
    annualNetCost: annualNetCost,
    dailyImport: dailyImportTotal.toFixed(2),
    dailyExport: dailyExportTotal.toFixed(2),
  };
}

// -----------------------------------------------------------------------------
// RANK ALL TARIFFS
// -----------------------------------------------------------------------------
function rankTariffs(consumptionCurve, solarCurve, batteryKwh) {
  return TARIFFS
    .filter(function(t) { return t.availability === "available"; })
    .map(function(tariff) {
      return Object.assign({}, tariff, {
        costs: calculateAnnualCost(consumptionCurve, solarCurve, batteryKwh, tariff)
      });
    })
    .sort(function(a, b) { return a.costs.annualNetCost - b.costs.annualNetCost; });
}

// =============================================================================
// INDEX.HTML — form submit handler
// =============================================================================
var form = document.getElementById("tariff-form");
if (form) {
  form.addEventListener("submit", function(e) {
    e.preventDefault();

    var houseSize   = parseFloat(document.getElementById("house-size").value);
    var bedrooms    = parseFloat(document.getElementById("bedrooms").value);
    var solarSize   = parseFloat(document.getElementById("solar-size").value);
    var batterySize = parseFloat(document.getElementById("battery-size").value);
    var location    = document.getElementById("location").value;
    var errorEl     = document.getElementById("form-error");

    if (!houseSize || !bedrooms || !solarSize || isNaN(batterySize) || !location) {
      if (errorEl) errorEl.style.display = "block";
      return;
    }
    if (errorEl) errorEl.style.display = "none";

    var params = new URLSearchParams({
      houseSize: houseSize,
      bedrooms: bedrooms,
      solarSize: solarSize,
      batterySize: batterySize,
      location: location,
    });
    window.location.href = "results.html?" + params.toString();
  });
}

// =============================================================================
// RESULTS.HTML — run engine and render
// =============================================================================
var resultsContainer = document.getElementById("results-container");
if (resultsContainer) {
  var params      = new URLSearchParams(window.location.search);
  var houseSize   = parseFloat(params.get("houseSize"));
  var bedrooms    = parseFloat(params.get("bedrooms"));
  var solarSize   = parseFloat(params.get("solarSize"));
  var batterySize = parseFloat(params.get("batterySize"));
  var location    = params.get("location");

  if (!houseSize || !bedrooms || !solarSize || isNaN(batterySize) || !location) {
    resultsContainer.innerHTML = '<p class="error-msg">Missing inputs — <a href="index.html">go back and try again</a>.</p>';
  } else {
    var dailyConsumption = estimateDailyConsumption(bedrooms, houseSize);
    var peakHours        = SUN_HOURS[location] || 3.0;
    var dailyGeneration  = solarSize * peakHours;

    var consumptionCurve = buildConsumptionCurve(dailyConsumption);
    var solarCurve       = buildSolarCurve(solarSize, location);

    var ranked = rankTariffs(consumptionCurve, solarCurve, batterySize);

    // Populate summary bar
    var sumCons = document.getElementById("summary-consumption");
    var sumGen  = document.getElementById("summary-generation");
    var sumLoc  = document.getElementById("summary-location");
    if (sumCons) sumCons.textContent = dailyConsumption.toFixed(1) + " kWh/day";
    if (sumGen)  sumGen.textContent  = dailyGeneration.toFixed(1) + " kWh/day";
    if (sumLoc)  sumLoc.textContent  = location.replace(/-/g, " ").replace(/\b\w/g, function(c) { return c.toUpperCase(); });

    // Render cards
    resultsContainer.innerHTML = "";

    ranked.forEach(function(tariff, index) {
      var isTop = index === 0;
      var c = tariff.costs;

      var renewableBadge = tariff.renewable
        ? '<span class="badge badge-green">🌿 ' + tariff.renewable + '% Renewable</span>'
        : '';

      var apiNote = tariff.apiEnabled
        ? '<span class="badge badge-blue">⚡ Live API data coming soon</span>'
        : '';

      var typeLabel = { "flat": "Flat Rate", "tou-block": "Time of Use", "tou-variable": "Variable (Half-Hourly)" }[tariff.type] || tariff.type;

      var card = document.createElement("div");
      card.className = "tariff-card" + (isTop ? " tariff-card--top" : "");

      card.innerHTML =
        (isTop ? '<div class="top-label">⭐ Recommended for your setup</div>' : '') +
        '<div class="tariff-card__header">' +
          '<div>' +
            '<h3 class="tariff-card__name">' + tariff.name + '</h3>' +
            '<p class="tariff-card__supplier">' + tariff.supplier + ' &mdash; ' + typeLabel + '</p>' +
          '</div>' +
          '<div class="tariff-card__net-cost">' +
            '<span class="net-cost-value">&pound;' + c.annualNetCost.toLocaleString() + '</span>' +
            '<span class="net-cost-label">net/year</span>' +
          '</div>' +
        '</div>' +
        '<div class="tariff-card__breakdown">' +
          '<div class="breakdown-item">' +
            '<span class="breakdown-label">Import cost</span>' +
            '<span class="breakdown-value">&pound;' + c.annualImportCost.toLocaleString() + '/yr</span>' +
          '</div>' +
          '<div class="breakdown-item">' +
            '<span class="breakdown-label">Standing charge</span>' +
            '<span class="breakdown-value">&pound;' + c.annualStandingCharge.toLocaleString() + '/yr</span>' +
          '</div>' +
          '<div class="breakdown-item breakdown-item--green">' +
            '<span class="breakdown-label">Export earnings</span>' +
            '<span class="breakdown-value">&minus;&pound;' + c.annualExportEarnings.toLocaleString() + '/yr</span>' +
          '</div>' +
          '<div class="breakdown-item">' +
            '<span class="breakdown-label">Export rate</span>' +
            '<span class="breakdown-value">' + tariff.exportRate + 'p/kWh</span>' +
          '</div>' +
        '</div>' +
        '<p class="tariff-card__notes">' + tariff.notes + '</p>' +
        '<div class="tariff-card__footer">' +
          '<div class="tariff-card__badges">' + renewableBadge + apiNote + '</div>' +
          '<a href="' + tariff.link + '" target="_blank" class="tariff-card__cta">View Tariff &rarr;</a>' +
        '</div>';

      resultsContainer.appendChild(card);
    });

    var disclaimer = document.createElement("p");
    disclaimer.className = "disclaimer";
    disclaimer.textContent = "Estimates are based on typical household consumption profiles and annual average solar generation for your region. Actual costs will vary based on your usage patterns, seasonal variation, and live tariff rates. Always verify current rates directly with suppliers before switching.";
    resultsContainer.appendChild(disclaimer);
  }
}