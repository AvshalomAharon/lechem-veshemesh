(function () {
  "use strict";

  /* ---------- Config ----------
   * TODO(dev): once the n8n webhook is live, paste its URL here.
   * Flow: form submit -> POST JSON to this endpoint -> n8n -> email + Google Sheets.
   * While empty, the form runs full client-side validation but does not
   * attempt a network request, and tells the visitor to order by phone instead.
   */
  var CONFIG = {
    orderEndpoint: ""
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

  var isSubmitting = false;

  function setStatus(message, state) {
    statusEl.textContent = message;
    if (state) {
      statusEl.setAttribute("data-state", state);
    } else {
      statusEl.removeAttribute("data-state");
    }
  }

  function buildPayload(formData) {
    return {
      fullName: formData.get("fullName"),
      phone: formData.get("phone"),
      address: formData.get("address"),
      orderDetails: formData.get("orderDetails"),
      notes: formData.get("notes"),
      submittedAt: new Date().toISOString()
    };
  }

  function setSubmitting(state) {
    isSubmitting = state;
    submitBtn.disabled = state;
    submitBtn.querySelector(".btn-label").textContent = state ? "שולח..." : "שליחת הזמנה";
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();

    if (isSubmitting) return;

    if (!form.checkValidity()) {
      form.reportValidity();
      setStatus("צריך למלא את כל השדות המסומנים.", "error");
      return;
    }

    var payload = buildPayload(new FormData(form));

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
      .then(function () {
        setStatus("ההזמנה נשלחה בהצלחה! ניצור קשר לאישור.", "success");
        form.reset();
      })
      .catch(function () {
        setStatus("השליחה נכשלה. אפשר לנסות שוב, או להזמין בטלפון 04-000-0000.", "error");
      })
      .finally(function () {
        setSubmitting(false);
      });
  });
})();
