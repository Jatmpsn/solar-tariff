// =============================================================================
// GREEN TARIFF MARKETPLACE — Index Page Logic
// Sidebar form, no-battery toggle, loading overlay, form submission
// =============================================================================

document.addEventListener("DOMContentLoaded", function () {
  // --- Sidebar open/close ---
  var overlay = document.getElementById("sidebar-overlay");
  var sidebar = document.getElementById("sidebar");
  var closeBtn = document.getElementById("sidebar-close");

  function openSidebar() {
    sidebar.classList.add("open");
    overlay.classList.add("active");
    document.body.style.overflow = "hidden";
  }

  function closeSidebar() {
    sidebar.classList.remove("open");
    overlay.classList.remove("active");
    document.body.style.overflow = "";
  }

  document.querySelectorAll("[data-open-sidebar]").forEach(function (el) {
    el.addEventListener("click", function (e) {
      e.preventDefault();
      openSidebar();
    });
  });

  closeBtn.addEventListener("click", closeSidebar);
  overlay.addEventListener("click", closeSidebar);

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeSidebar();
  });

  // --- No battery checkbox ---
  var noBatteryCheckbox = document.getElementById("no-battery");
  var batteryGroup = document.getElementById("battery-group");
  var batteryInput = document.getElementById("battery-size");

  noBatteryCheckbox.addEventListener("change", function () {
    if (this.checked) {
      batteryGroup.style.opacity = "0.4";
      batteryGroup.style.pointerEvents = "none";
      batteryInput.value = "";
      batteryInput.disabled = true;
    } else {
      batteryGroup.style.opacity = "1";
      batteryGroup.style.pointerEvents = "auto";
      batteryInput.disabled = false;
    }
  });

  // --- Restore form values from sessionStorage ---
  var stored = sessionStorage.getItem("tariffResults");
  if (stored) {
    try {
      var data = JSON.parse(stored);
      if (data.formValues) {
        document.getElementById("house-size").value = data.formValues.houseSize;
        document.getElementById("bedrooms").value = data.formValues.bedrooms;
        document.getElementById("solar-size").value = data.formValues.solarKwp;
        if (data.formValues.batteryKwh === 0) {
          noBatteryCheckbox.checked = true;
          noBatteryCheckbox.dispatchEvent(new Event("change"));
        } else {
          document.getElementById("battery-size").value =
            data.formValues.batteryKwh;
        }
        document.getElementById("location").value = data.formValues.location;
      }
    } catch (e) {
      /* ignore parse errors */
    }
  }

  // --- Form submit ---
  document
    .getElementById("tariff-form")
    .addEventListener("submit", async function (e) {
      e.preventDefault();

      var houseSize =
        parseFloat(document.getElementById("house-size").value) || 90;
      var bedrooms =
        parseFloat(document.getElementById("bedrooms").value) || 3;
      var solarKwp =
        parseFloat(document.getElementById("solar-size").value) || 0;
      var batteryKwh = noBatteryCheckbox.checked
        ? 0
        : parseFloat(document.getElementById("battery-size").value) || 0;
      var location =
        document.getElementById("location").value || "midlands";

      // Close sidebar, show loading overlay
      closeSidebar();
      var loadingOverlay = document.getElementById("loading-overlay");
      var loadingText = document.getElementById("loading-text");
      loadingOverlay.style.display = "flex";
      loadingText.textContent =
        "Analysing your home\u2019s energy requirements\u2026";
      loadingText.style.opacity = "1";

      // Start loading tariffs in parallel with animation
      var tariffPromise = loadTariffs();

      // After 1.5s, change text
      await new Promise(function (r) {
        setTimeout(r, 1500);
      });
      loadingText.style.opacity = "0";
      await new Promise(function (r) {
        setTimeout(r, 300);
      });
      loadingText.textContent = "Finding the best tariff\u2026";
      loadingText.style.opacity = "1";

      // Wait for tariffs to finish loading (may already be done)
      var result = await tariffPromise;

      // Run engine
      var output = runEngine(
        result.bundledTariffs,
        result.importTariffs,
        result.exportTariffs,
        houseSize,
        bedrooms,
        solarKwp,
        batteryKwh,
        location
      );

      // Store in sessionStorage
      sessionStorage.setItem(
        "tariffResults",
        JSON.stringify({
          engineOutput: output,
          source: result.source,
          formValues: {
            houseSize: houseSize,
            bedrooms: bedrooms,
            solarKwp: solarKwp,
            batteryKwh: batteryKwh,
            location: location,
          },
        })
      );

      // Wait remaining time for second message to be visible
      await new Promise(function (r) {
        setTimeout(r, 1500);
      });

      // Navigate to results
      window.location.href = "results.html";
    });
});
