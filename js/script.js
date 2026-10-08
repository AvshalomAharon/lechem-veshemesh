(function () {
  "use strict";

  /* ---------- Config ----------
   * n8n "Ordering System" workflow — Webhook trigger (production URL).
   * Flow: form submit -> POST JSON here -> n8n appends the order to Google
   * Sheets, assigns an order number, emails the business + the customer,
   * and responds with { success, orderNumber }.
   */
  var CONFIG = {
    orderEndpoint: "https://avshalom.app.n8n.cloud/webhook/57a821a2-b150-4b14-a8cc-ead3ba117db0",
    // n8n "סוכן מאפייה" workflow — public Chat Trigger (webhook mode). The agent
    // answers only from the documents vector store (Supabase).
    chatEndpoint: "https://avshalom.app.n8n.cloud/webhook/83346af6-2c60-4148-8150-b44a7687e89c/chat",
    // GET -> { prices: { "<product name>": <number> } } from the Supabase price_list table.
    // The prices written in index.html are only the fallback if this request fails.
    pricesEndpoint: "https://avshalom.app.n8n.cloud/webhook/site-prices",
    // n8n "התראה: כניסה למערכת המאפייה" — POST on a click of the footer "כניסה למערכת המאפייה" link.
    // n8n emails the owner (at most one email per 30 minutes). Nothing else triggers it.
    adminEntryEndpoint: "https://avshalom.app.n8n.cloud/webhook/admin-entry-click"
  };

  /* ---------- Back-office entry notification ----------
   * A quiet beacon on click; the link itself navigates to /admin as usual. A browser
   * reports at most once per 30 minutes, so repeated clicks do not add n8n executions.
   */
  var ADMIN_NOTIFY_KEY = "adminEntryNotifiedAt";
  var ADMIN_NOTIFY_WINDOW_MS = 30 * 60 * 1000;
  var adminLink = document.querySelector(".footer-admin");

  if (adminLink && CONFIG.adminEntryEndpoint && navigator.sendBeacon) {
    adminLink.addEventListener("click", function () {
      try {
        var last = Number(window.localStorage.getItem(ADMIN_NOTIFY_KEY)) || 0;
        if (Date.now() - last < ADMIN_NOTIFY_WINDOW_MS) return;
        window.localStorage.setItem(ADMIN_NOTIFY_KEY, String(Date.now()));
      } catch (error) {
        // Storage can be blocked; still notify (n8n limits the emails on its side).
      }
      navigator.sendBeacon(CONFIG.adminEntryEndpoint);
    });
  }

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

  /* ---------- Floating order bar (mobile) ----------
   * Shown once the hero is scrolled past, hidden while the order section is on
   * screen. Without IntersectionObserver the bar simply stays hidden.
   */
  function initOrderBar() {
    var bar = document.getElementById("orderBar");
    var heroCard = document.querySelector(".hero-card");
    var orderSection = document.getElementById("order");
    if (!bar || !heroCard || !orderSection || !("IntersectionObserver" in window)) return;

    var heroPassed = false;
    var orderOnScreen = false;

    function update() {
      var show = heroPassed && !orderOnScreen;
      bar.classList.toggle("is-visible", show);
      document.body.classList.toggle("has-order-bar", show);
    }

    new IntersectionObserver(function (entries) {
      var entry = entries[entries.length - 1];
      heroPassed = !entry.isIntersecting && entry.boundingClientRect.top < 0;
      update();
    }).observe(heroCard);

    new IntersectionObserver(function (entries) {
      orderOnScreen = entries[entries.length - 1].isIntersecting;
      update();
    }).observe(orderSection);
  }

  initOrderBar();

  /* ---------- Chat launcher: compact while scrolling ---------- */
  function initChatScrollState() {
    var root = document.getElementById("chat");
    if (!root) return;
    var timer = null;

    window.addEventListener("scroll", function () {
      root.classList.add("is-scrolling");
      clearTimeout(timer);
      timer = setTimeout(function () { root.classList.remove("is-scrolling"); }, 700);
    }, { passive: true });
  }

  initChatScrollState();

  /* ---------- Chat assistant ----------
   * Posts { action, sessionId, chatInput } to the n8n Chat Trigger and shows the
   * { output } text. A reply is shown only after a real successful response; on
   * failure the user's text goes back into the input so nothing is lost.
   */
  function initChat() {
    var root = document.getElementById("chat");
    var launcher = document.getElementById("chatLauncher");
    var panel = document.getElementById("chatPanel");
    var closeBtn = document.getElementById("chatClose");
    var log = document.getElementById("chatLog");
    var chatForm = document.getElementById("chatForm");
    var input = document.getElementById("chatInput");
    var sendBtn = document.getElementById("chatSend");
    var chatStatus = document.getElementById("chatStatus");

    if (!root || !launcher || !panel || !log || !chatForm || !input || !sendBtn || !CONFIG.chatEndpoint) return;

    var REQUEST_TIMEOUT_MS = 45000;
    var GREETING = "שלום! אפשר לשאול אותי על המוצרים, המחירים והמשלוחים של המאפייה.";
    var sessionId = "web-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
    var isSending = false;
    var greeted = false;

    root.hidden = false;

    function addMessage(text, kind) {
      var el = document.createElement("p");
      el.className = "chat-msg chat-msg-" + kind;
      el.textContent = text;
      log.appendChild(el);
      log.scrollTop = log.scrollHeight;
      return el;
    }

    function setChatStatus(message, state) {
      chatStatus.textContent = message;
      if (state) {
        chatStatus.setAttribute("data-state", state);
      } else {
        chatStatus.removeAttribute("data-state");
      }
    }

    function setSending(state) {
      isSending = state;
      sendBtn.disabled = state;
      input.readOnly = state;
      sendBtn.textContent = state ? "שולח..." : "שליחה";
    }

    function openChat() {
      root.classList.add("is-open");
      panel.hidden = false;
      launcher.setAttribute("aria-expanded", "true");
      if (!greeted) {
        addMessage(GREETING, "bot");
        greeted = true;
      }
      input.focus();
    }

    function closeChat() {
      root.classList.remove("is-open");
      panel.hidden = true;
      launcher.setAttribute("aria-expanded", "false");
      launcher.focus();
    }

    function requestReply(message) {
      var controller = new AbortController();
      var timer = setTimeout(function () { controller.abort(); }, REQUEST_TIMEOUT_MS);

      return fetch(CONFIG.chatEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sendMessage", sessionId: sessionId, chatInput: message }),
        signal: controller.signal
      })
        .then(function (response) {
          if (!response.ok) throw new Error("bad_response");
          return response.json();
        })
        .then(function (result) {
          var reply = result && typeof result.output === "string" ? result.output.trim() : "";
          if (!reply) throw new Error("empty_reply");
          return reply;
        })
        .finally(function () { clearTimeout(timer); });
    }

    launcher.addEventListener("click", openChat);
    closeBtn.addEventListener("click", closeChat);
    panel.addEventListener("keydown", function (event) {
      if (event.key === "Escape") closeChat();
    });
    panel.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", closeChat);
    });

    chatForm.addEventListener("submit", function (event) {
      event.preventDefault();
      if (isSending) return;

      var message = input.value.trim();
      if (!message) {
        setChatStatus("כתבו שאלה ואז שליחה.", "error");
        input.focus();
        return;
      }

      setChatStatus("", null);
      var userEl = addMessage(message, "user");
      var waitEl = addMessage("מחפש תשובה...", "bot");
      waitEl.classList.add("chat-msg-wait");
      input.value = "";
      setSending(true);

      requestReply(message)
        .then(function (reply) {
          waitEl.classList.remove("chat-msg-wait");
          waitEl.textContent = reply;
        })
        .catch(function () {
          userEl.remove();
          waitEl.remove();
          input.value = message;
          setChatStatus("לא הצלחנו לענות כרגע. אפשר לנסות שוב.", "error");
        })
        .finally(function () {
          setSending(false);
          input.focus();
        });
    });
  }

  initChat();

  /* ---------- Order form ---------- */
  var form = document.getElementById("orderForm");
  var submitBtn = document.getElementById("orderSubmit");
  var statusEl = document.getElementById("formStatus");

  if (!form || !submitBtn || !statusEl) return;

  var MIN_ORDER = 40;
  var isSubmitting = false;

  var orderSummaryEl = document.getElementById("orderSummary");
  var orderSummaryTotalEl = document.getElementById("orderSummaryTotal");
  var orderSummaryLabelEl = document.getElementById("orderSummaryLabel");
  var productsHintEl = document.getElementById("productsHint");
  var deliveryFeeNoteEl = document.getElementById("deliveryFeeNote");
  var orderBreakdownEl = document.getElementById("orderBreakdown");
  var breakdownProductsEl = document.getElementById("breakdownProducts");
  var breakdownFeeEl = document.getElementById("breakdownFee");
  var breakdownTotalEl = document.getElementById("breakdownTotal");

  // Delivery fee in ₪ per order (0 = no fee, nothing is shown). It starts from the value
  // written into the HTML by api/index.js and is refreshed from the prices endpoint.
  // It is added on top of the products and is NOT counted toward MIN_ORDER.
  var deliveryFee = deliveryFeeNoteEl ? (Number(deliveryFeeNoteEl.getAttribute("data-delivery-fee")) || 0) : 0;
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

  function updateDeliveryFeeNote() {
    if (!deliveryFeeNoteEl) return;
    if (deliveryFee > 0) {
      deliveryFeeNoteEl.textContent = "דמי משלוח: " + formatPrice(deliveryFee) + " ₪ (לא נכללים במינימום ההזמנה).";
      deliveryFeeNoteEl.hidden = false;
    } else {
      deliveryFeeNoteEl.textContent = "";
      deliveryFeeNoteEl.hidden = true;
    }
  }

  function updateOrderSummary() {
    var total = productsTotal(getSelectedProducts());

    if (orderSummaryTotalEl) orderSummaryTotalEl.textContent = formatPrice(total) + " ₪";
    if (orderSummaryLabelEl) orderSummaryLabelEl.textContent = deliveryFee > 0 ? "סכום ההזמנה" : "סה\"כ";

    // With a delivery fee, once the minimum is reached show order + delivery = total to pay.
    if (orderBreakdownEl) {
      var showBreakdown = deliveryFee > 0 && total >= MIN_ORDER;
      orderBreakdownEl.hidden = !showBreakdown;
      if (showBreakdown) {
        if (breakdownProductsEl) breakdownProductsEl.textContent = formatPrice(total) + " ₪";
        if (breakdownFeeEl) breakdownFeeEl.textContent = formatPrice(deliveryFee) + " ₪";
        if (breakdownTotalEl) breakdownTotalEl.textContent = formatPrice(total + deliveryFee) + " ₪";
      }
    }

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

  /* ---------- Live prices ----------
   * Prices come from the Supabase price_list table (updated whenever a new price
   * list is uploaded). The server re-checks every price on submit, so this only
   * keeps what the customer sees in sync. If the request fails the prices in the
   * HTML stay as they are.
   */
  var PRODUCT_NAMES = ["לחם כפרי מחמצת", "לחם שיפון", "חלה", "בורקס גבינה"];

  function formatPrice(value) {
    return String(Math.round(value * 100) / 100);
  }

  function parsePrices(data) {
    var prices = data && data.prices;
    if (!prices || typeof prices !== "object") return null;
    var valid = PRODUCT_NAMES.every(function (name) {
      return typeof prices[name] === "number" && isFinite(prices[name]) && prices[name] > 0;
    });
    return valid ? prices : null;
  }

  function parseDeliveryFee(data) {
    var fee = data && data.deliveryFee;
    return typeof fee === "number" && isFinite(fee) && fee >= 0 ? fee : null;
  }

  function applyPrices(prices, fee) {
    if (fee !== null) {
      deliveryFee = fee;
      updateDeliveryFeeNote();
    }
    document.querySelectorAll("[data-price-for]").forEach(function (el) {
      var price = prices[el.getAttribute("data-price-for")];
      if (typeof price !== "number") return;
      var suffix = el.getAttribute("data-price-suffix");
      el.textContent = formatPrice(price) + " ₪" + (suffix ? " " + suffix : "");
    });
    productRows.forEach(function (row) {
      var price = prices[row.getAttribute("data-product-name")];
      if (typeof price === "number") row.setAttribute("data-product-price", String(price));
    });
    updateOrderSummary();
  }

  function loadPrices(forceFresh) {
    if (!CONFIG.pricesEndpoint) return Promise.resolve();
    return fetch(CONFIG.pricesEndpoint, forceFresh ? { cache: "reload" } : undefined)
      .then(function (response) {
        if (!response.ok) throw new Error("bad_response");
        return response.json();
      })
      .then(function (data) {
        var prices = parsePrices(data);
        if (prices) applyPrices(prices, parseDeliveryFee(data));
      })
      .catch(function () { /* keep the prices already on the page */ });
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
      deliveryFee: deliveryFee,
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
        if (response.ok) return response.json().catch(function () { return {}; });
        // Keep the server's explanation (e.g. prices changed) so it can be shown to the customer.
        return response.json().catch(function () { return {}; }).then(function (body) {
          var error = new Error("bad_response");
          error.body = body;
          throw error;
        });
      })
      .then(function (result) {
        var orderNumber = result && result.orderNumber;
        form.reset();
        updateOrderSummary();
        showConfirmation(orderNumber);
      })
      .catch(function (error) {
        var body = error && error.body;
        if (body && body.code === "PRICES_CHANGED") {
          loadPrices(true);
          setStatus("המחירים התעדכנו. בדקו את הסכום החדש ושלחו שוב.", "error");
        } else if (body && body.success === false && typeof body.message === "string") {
          setStatus(body.message, "error");
        } else {
          setStatus("השליחה נכשלה. אפשר לנסות שוב, או להזמין בטלפון 04-000-0000.", "error");
        }
      })
      .finally(function () {
        setSubmitting(false);
      });
  });

  // Pick up a newly uploaded price list on pages that are already open:
  // when the tab comes back into view, and every few minutes while it is open.
  var PRICE_REFRESH_MS = 3 * 60 * 1000;
  var lastPriceLoad = Date.now();

  function refreshPrices() {
    lastPriceLoad = Date.now();
    loadPrices(true);
  }

  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible" && Date.now() - lastPriceLoad > 15000) refreshPrices();
  });
  setInterval(function () {
    if (document.visibilityState === "visible") refreshPrices();
  }, PRICE_REFRESH_MS);

  updateDeliveryFeeNote();
  updateOrderSummary();
  loadPrices();
})();
