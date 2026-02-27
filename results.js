// =============================================================================
// GREEN TARIFF MARKETPLACE — Results Page Logic
// Reads engine output from sessionStorage and renders results
// =============================================================================

document.addEventListener("DOMContentLoaded", function () {
  var stored = sessionStorage.getItem("tariffResults");
  if (!stored) {
    window.location.href = "index.html";
    return;
  }

  try {
    var data = JSON.parse(stored);
    renderResults(data.engineOutput, data.source);
  } catch (e) {
    window.location.href = "index.html";
  }
});
