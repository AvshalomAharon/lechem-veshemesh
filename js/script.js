(function () {
  "use strict";

  /* ---------- Config ----------
   * n8n "Ordering System" workflow — Webhook trigger (production URL).
   * Flow: form submit -> POST JSON here -> n8n appends the order to Google
   * Sheets, assigns an order number, emails the business + the customer,
   * and responds with { success, orderNumber }.
   */
  var CONFIG = {
    orderEndpoint: "https://avshalom.app.n8n.cloud/webhook/57a821a2-b150-4b14-a8cc-ead3ba117db0"
  };

  /* ---------- Mobile nav ---------- */
  var navToggle = document.getElementById("navToggle");
  var siteNav = document.getElementById("siteNav");

  if (navToggle && siteNav) {
    navToggle.addEventListener("click", function () {
      var isOpen = siteNav.classList.toggle("is-open");
      navToggle.setAttribute("aria-expanded", String(isOpen));
    });

    siteNav.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", function () {
        siteNav.classList.remove("is-open");
        navToggle.setAttribute("aria-expanded", "false");
      });
    });
  }

  /* ---------- Order form ---------- */
  var form = document.getElementById("orderForm");
  var submitBtn = document.getElementById("orderSubmit");
  var statusEl = document.getElementById("formStatus");

  if (!form || !submitBtn || !statusEl) return;

  var MIN_ORDER = 40;
  var isSubmitting = false;

  var orderSummaryEl = document.getElementById("orderSummary");
  var orderSummaryTotalEl = document.getElementById("orderSummaryTotal");
  var productsHintEl = document.getElementById("productsHint");
  var confirmationEl = document.getElementById("orderConfirmation");
  var confirmationOrderNumberEl = document.getElementById("confirmationOrderNumber");
  var orderAnotherBtn = document.getElementById("orderAnotherBtn");

  /* ---------- Challah ordering window ----------
   * Challah is delivered Fridays only, so it can only be ordered during the
   * window that actually leads to a Friday delivery: from Wednesday 20:00
   * (right after Thursday's own cutoff closes) through Thursday 20:00 (the
   * cutoff for Friday delivery). Computed in Israel time regardless of the
   * visitor's own timezone/clock.
   */
  function isChallahOrderable() {
    var parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Jerusalem",
      weekday: "short",
      hour: "numeric",
      hourCycle: "h23"
    }).formatToParts(new Date());

    var weekday, hour;
    parts.forEach(function (p) {
      if (p.type === "weekday") weekday = p.value;
      if (p.type === "hour") hour = Number(p.value);
    });

    if (weekday === "Wed" && hour >= 20) return true;
    if (weekday === "Thu" && hour < 20) return true;
    return false;
  }

  var challahRow = document.getElementById("challahRow");
  if (challahRow && !isChallahOrderable()) {
    challahRow.classList.add("is-unavailable");
    challahRow.querySelectorAll(".qty-btn, .qty-input").forEach(function (el) {
      el.disabled = true;
    });
  }

  /* ---------- Quantity steppers ---------- */
  var productRows = Array.prototype.slice.call(form.querySelectorAll(".product-select"));

  productRows.forEach(function (row) {
    var input = row.querySelector(".qty-input");
    var min = Number(input.min || 0);
    var max = Number(input.max || 99);

    row.querySelectorAll(".qty-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var current = Number(input.value) || 0;
        var next = btn.getAttribute("data-action") === "increase" ? current + 1 : current - 1;
        next = Math.max(min, Math.min(max, next));
        input.value = String(next);
        updateOrderSummary();
      });
    });

    input.addEventListener("input", updateOrderSummary);

    input.addEventListener("change", function () {
      var value = Math.max(min, Math.min(max, Number(input.value) || 0));
      input.value = String(value);
      updateOrderSummary();
    });
  });

  function getSelectedProducts() {
    var products = [];
    productRows.forEach(function (row) {
      var quantity = Number(row.querySelector(".qty-input").value) || 0;
      if (quantity > 0) {
        products.push({
          name: row.getAttribute("data-product-name"),
          price: Number(row.getAttribute("data-product-price")),
          quantity: quantity
        });
      }
    });
    return products;
  }

  function productsTotal(products) {
    return products.reduce(function (sum, p) { return sum + p.price * p.quantity; }, 0);
  }

  function productsSummary(products) {
    return products.map(function (p) { return p.name + " x" + p.quantity; }).join(", ");
  }

  function updateOrderSummary() {
    var total = productsTotal(getSelectedProducts());

    if (orderSummaryTotalEl) orderSummaryTotalEl.textContent = total + " ₪";

    var belowMinimum = total > 0 && total < MIN_ORDER;
    if (orderSummaryEl) orderSummaryEl.classList.toggle("is-below-minimum", belowMinimum);

    if (productsHintEl) {
      if (total === 0) {
        productsHintEl.textContent = "מינימום הזמנה " + MIN_ORDER + " ₪.";
        productsHintEl.classList.remove("is-positive");
      } else if (belowMinimum) {
        productsHintEl.textContent = "עוד " + (MIN_ORDER - total) + " ₪ להשלמת מינימום ההזמנה.";
        productsHintEl.classList.remove("is-positive");
      } else {
        productsHintEl.textContent = "מינימום ההזמנה הושלם.";
        productsHintEl.classList.add("is-positive");
      }
    }
  }

  function setStatus(message, state) {
    statusEl.textContent = message;
    if (state) {
      statusEl.setAttribute("data-state", state);
    } else {
      statusEl.removeAttribute("data-state");
    }
  }

  function buildPayload(formData, products) {
    return {
      products: products,
      productsSummary: productsSummary(products),
      fullName: formData.get("fullName"),
      phone: formData.get("phone"),
      email: formData.get("email"),
      address: formData.get("address"),
      notes: formData.get("notes"),
      submittedAt: new Date().toISOString()
    };
  }

  function setSubmitting(state) {
    isSubmitting = state;
    submitBtn.disabled = state;
    submitBtn.querySelector(".btn-label").textContent = state ? "שולח..." : "שליחת הזמנה";
  }

  function showConfirmation(orderNumber) {
    if (confirmationOrderNumberEl) {
      confirmationOrderNumberEl.textContent = orderNumber ? "#" + orderNumber : "התקבלה";
    }
    setStatus("", null);
    form.hidden = true;
    if (confirmationEl) {
      confirmationEl.hidden = false;
      confirmationEl.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  if (orderAnotherBtn) {
    orderAnotherBtn.addEventListener("click", function () {
      if (confirmationEl) confirmationEl.hidden = true;
      form.hidden = false;
      form.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();

    if (isSubmitting) return;

    if (!form.checkValidity()) {
      form.reportValidity();
      setStatus("צריך למלא את כל השדות המסומנים.", "error");
      return;
    }

    var products = getSelectedProducts();

    if (products.length === 0) {
      setStatus("צריך לבחור לפחות מוצר אחד.", "error");
      return;
    }

    var total = productsTotal(products);
    if (total < MIN_ORDER) {
      setStatus("מינימום הזמנה " + MIN_ORDER + " ₪ (הסכום הנוכחי: " + total + " ₪).", "error");
      return;
    }

    var payload = buildPayload(new FormData(form), products);

    if (!CONFIG.orderEndpoint) {
      // No live integration yet: be honest with the customer instead of
      // faking a success state, and point them to a working channel.
      setStatus("ההזמנות המקוונות ייפתחו בקרוב. בינתיים אפשר להזמין בטלפון 04-000-0000.", "info");
      return;
    }

    setSubmitting(true);
    setStatus("שולחים את ההזמנה...", "info");

    fetch(CONFIG.orderEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })
      .then(function (response) {
        if (!response.ok) throw new Error("bad_response");
        return response.json().catch(function () { return {}; });
      })
      .then(function (result) {
        var orderNumber = result && result.orderNumber;
        form.reset();
        updateOrderSummary();
        showConfirmation(orderNumber);
      })
      .catch(function () {
        setStatus("השליחה נכשלה. אפשר לנסות שוב, או להזמין בטלפון 04-000-0000.", "error");
      })
      .finally(function () {
        setSubmitting(false);
      });
  });
})();
