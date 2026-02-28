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

  // --- Heat pump toggle ---
  var heatPumpToggle = document.getElementById("heat-pump-toggle");
  var heatPumpFields = document.getElementById("heat-pump-fields");

  heatPumpToggle.addEventListener("change", function () {
    heatPumpFields.style.display = this.checked ? "block" : "none";
  });

  // --- Postcode error helpers ---
  var postcodeInput = document.getElementById("postcode");
  var postcodeError = document.getElementById("postcode-error");
  var postcodeRegion = document.getElementById("postcode-region");

  function clearPostcodeError() {
    postcodeError.textContent = "";
    postcodeInput.style.borderColor = "";
  }

  function showPostcodeError(msg) {
    postcodeError.textContent = msg;
    postcodeInput.style.borderColor = "#c0392b";
  }

  postcodeInput.addEventListener("input", clearPostcodeError);

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
        postcodeInput.value = data.formValues.postcode || "";
        if (data.formValues.heatPumpKw > 0) {
          heatPumpToggle.checked = true;
          heatPumpToggle.dispatchEvent(new Event("change"));
          document.getElementById("heat-pump-size").value = data.formValues.heatPumpKw;
        }
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
      var heatPumpKw = heatPumpToggle.checked
        ? parseFloat(document.getElementById("heat-pump-size").value) || 0
        : 0;
      // Validate postcode before closing sidebar
      clearPostcodeError();
      postcodeRegion.textContent = "";
      var postcodeValue = postcodeInput.value.trim();
      if (!postcodeValue) {
        showPostcodeError("Please enter your postcode");
        postcodeInput.focus();
        return;
      }

      // Close sidebar, show loading overlay
      closeSidebar();
      var loadingOverlay = document.getElementById("loading-overlay");
      var loadingText = document.getElementById("loading-text");
      loadingOverlay.style.display = "flex";
      loadingText.textContent =
        "Analysing your home\u2019s energy requirements\u2026";
      loadingText.style.opacity = "1";

      // Look up postcode and load tariffs in parallel with animation
      var postcodePromise = lookupPostcode(postcodeValue);
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

      // Wait for both to finish
      var postcodeResult, result;
      try {
        var results = await Promise.all([postcodePromise, tariffPromise]);
        postcodeResult = results[0];
        result = results[1];
      } catch (err) {
        // Postcode lookup failed — hide loading, reopen sidebar, show error
        loadingOverlay.style.display = "none";
        openSidebar();
        showPostcodeError(err.message);
        postcodeInput.focus();
        return;
      }

      var location = postcodeResult.region;

      // Run engine
      var output = runEngine(
        result.bundledTariffs,
        result.importTariffs,
        result.exportTariffs,
        houseSize,
        bedrooms,
        solarKwp,
        batteryKwh,
        location,
        heatPumpKw
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
            heatPumpKw: heatPumpKw,
            postcode: postcodeValue,
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
