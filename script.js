// Tariff database
const tariffs = [
  {
    name: "Octopus Agile",
    supplier: "Octopus Energy",
    type: "Time of Use",
    description: "Variable rates by time of day — best if you can shift usage to off-peak hours and have a battery to store cheap overnight electricity.",
    bestFor: "large-battery",
    exportRate: 15,
    link: "https://octopus.energy/agile/"
  },
  {
    name: "Octopus Flux",
    supplier: "Octopus Energy",
    type: "Solar & Battery",
    description: "Designed specifically for homes with solar and battery. Cheap overnight import rate and good export rate during peak times.",
    bestFor: "solar-and-battery",
    exportRate: 24,
    link: "https://octopus.energy/flux/"
  },
  {
    name: "Octopus Go",
    supplier: "Octopus Energy",
    type: "Time of Use",
    description: "Very cheap overnight rate (midnight to 5am). Great for charging batteries overnight when solar generation is low.",
    bestFor: "battery-no-solar",
    exportRate: 15,
    link: "https://octopus.energy/go/"
  },
  {
    name: "British Gas Solar Extra",
    supplier: "British Gas",
    type: "Solar Export",
    description: "Flat rate tariff with a competitive solar export rate. Simple and predictable — good for solar owners who want straightforward billing.",
    bestFor: "solar-no-battery",
    exportRate: 20,
    link: "https://www.britishgas.co.uk"
  },
  {
    name: "EDF Standard Variable",
    supplier: "EDF Energy",
    type: "Flat Rate",
    description: "Simple flat rate tariff. No time of use complexity. Best for smaller setups where the maths on time of use tariffs doesn't add up.",
    bestFor: "small-setup",
    exportRate: 12,
    link: "https://www.edfenergy.com"
  },
  {
    name: "OVO Smart",
    supplier: "OVO Energy",
    type: "Flat Rate",
    description: "Competitive flat rate with a decent export tariff. Good all rounder for modest solar setups without a battery.",
    bestFor: "solar-no-battery",
    exportRate: 16,
    link: "https://www.ovoenergy.com"
  }
];

// Peak sun hours by region (average annual daily figure)
const sunHours = {
  "scotland": 2.7,
  "north-england": 2.9,
  "midlands": 3.2,
  "south-england": 3.5,
  "southwest": 3.7,
  "wales": 3.1
};

// Estimate daily consumption based on bedrooms and house size
function estimateConsumption(bedrooms, houseSize) {
  const base = bedrooms * 3.5;
  const sizeAdjustment = (houseSize - 80) * 0.02;
  return Math.max(5, base + sizeAdjustment);
}

// Estimate daily solar generation
function estimateGeneration(solarSize, location) {
  const hours = sunHours[location] || 3.0;
  return solarSize * hours;
}

// Work out the best tariff profile for this household
function recommendTariffs(consumption, generation, batterySize) {
  const surplus = generation - consumption;
  const batteryCoversNight = batterySize >= consumption * 0.4;
  const significantSolar = generation >= consumption * 0.5;

  let scores = tariffs.map(tariff => {
    let score = 0;

    if (tariff.bestFor === "solar-and-battery" && significantSolar && batterySize > 5) score += 3;
    if (tariff.bestFor === "large-battery" && batteryCoversNight) score += 2;
    if (tariff.bestFor === "battery-no-solar" && batterySize > 0 && generation < 2) score += 2;
    if (tariff.bestFor === "solar-no-battery" && significantSolar && batterySize === 0) score += 3;
    if (tariff.bestFor === "small-setup" && !significantSolar && batterySize < 5) score += 2;

    // Bonus for high export rate if user has surplus generation
    if (surplus > 2) score += tariff.exportRate * 0.05;

    return { ...tariff, score };
  });

  // Sort by score descending
  return scores.sort((a, b) => b.score - a.score);
}

// Listen for form submission
document.getElementById('tariff-form').addEventListener('submit', function(e) {
  e.preventDefault();

  const houseSize = parseFloat(document.getElementById('house-size').value);
  const bedrooms = parseFloat(document.getElementById('bedrooms').value);
  const solarSize = parseFloat(document.getElementById('solar-size').value);
  const batterySize = parseFloat(document.getElementById('battery-size').value);
  const location = document.getElementById('location').value;

  if (!houseSize || !bedrooms || !solarSize || !batterySize || !location) {
    document.getElementById('results').innerHTML = '<p style="color:red;">Please fill in all fields.</p>';
    return;
  }

  const consumption = estimateConsumption(bedrooms, houseSize);
  const generation = estimateGeneration(solarSize, location);
  const ranked = recommendTariffs(consumption, generation, batterySize);

  // Build results HTML
  let html = `
    <h2>Your Estimated Profile</h2>
    <p>Daily consumption: <strong>${consumption.toFixed(1)} kWh</strong></p>
    <p>Daily solar generation: <strong>${generation.toFixed(1)} kWh</strong></p>
    <hr style="margin: 20px 0;" />
    <h2>Recommended Tariffs</h2>
  `;

  ranked.forEach((tariff, index) => {
    const medal = index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : "";
    html += `
      <div class="tariff-card">
        <h3>${medal} ${tariff.name}</h3>
        <p class="supplier">${tariff.supplier} — ${tariff.type}</p>
        <p>${tariff.description}</p>
        <p class="export">Export rate: ${tariff.exportRate}p/kWh</p>
        <a href="${tariff.link}" target="_blank">View Tariff →</a>
      </div>
    `;
  });

  document.getElementById('results').innerHTML = html;
});