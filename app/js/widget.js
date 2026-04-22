(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./domain"));
  else root.CrmQuoteWidget = factory(root.CrmQuoteDomain);
}(typeof self !== "undefined" ? self : this, function (domain) {
  function debugLog() {
    if (typeof console !== "undefined" && typeof console.log === "function") {
      console.log.apply(console, ["[ManufacturingWidget]"].concat(Array.prototype.slice.call(arguments)));
    }
  }

  function createZohoClient(zoho, fields) {
    fields = fields || domain.FIELDS;
    function fetchAllProducts() {
      var page = 1;
      var perPage = 200;
      var allProducts = [];

      function next() {
        debugLog("Requesting Products page", page, "from Zoho CRM");
        return zoho.CRM.API.getAllRecords({ Entity: fields.products, page: page, per_page: perPage }).then(function (response) {
          var rows = response && response.data ? response.data : [];
          debugLog("Received Products page", page, "count:", rows.length, rows);
          allProducts = allProducts.concat(rows);
          if (rows.length === perPage) {
            page += 1;
            return next();
          }
          debugLog("Completed Product sync. Total Products fetched:", allProducts.length);
          return allProducts;
        });
      }

      return next();
    }

    return {
      onPageLoad: function (handler) { zoho.embeddedApp.on("PageLoad", handler); },
      init: function () { return zoho.embeddedApp.init(); },
      resize: function (dimensions) {
        if (zoho.CRM && zoho.CRM.UI && typeof zoho.CRM.UI.Resize === "function") {
          return zoho.CRM.UI.Resize(dimensions);
        }
        return Promise.resolve();
      },
      getRecord: function (entity, recordId) {
        return zoho.CRM.API.getRecord({ Entity: entity, RecordID: recordId }).then(function (response) {
          return response.data && response.data[0];
        });
      },
      getProducts: function () {
        return fetchAllProducts();
      },
      createQuote: function (payload) {
        return zoho.CRM.API.insertRecord({ Entity: fields.quotes, APIData: payload, Trigger: [] });
      }
    };
  }

  function extractDealId(payload) {
    if (!payload) return "";
    if (Array.isArray(payload.EntityId) && payload.EntityId[0]) return String(payload.EntityId[0]);
    if (payload.EntityId) return String(payload.EntityId);
    if (payload.recordId) return String(payload.recordId);
    return "";
  }

  function parseError(error) {
    if (!error) return "Unknown CRM error.";
    if (typeof error === "string") return error;
    if (error.message) return error.message;
    if (error.data && error.data[0] && error.data[0].message) return error.data[0].message;
    return JSON.stringify(error);
  }

  async function loadInitialData(input) {
    var dealId = extractDealId(input.pageLoadData);
    debugLog("PageLoad payload received:", input.pageLoadData);
    if (!dealId) throw new Error("Missing Deal context. Launch this popup from a Deal button.");
    debugLog("Resolved Deal ID:", dealId);
    var results = await Promise.all([
      input.client.getRecord(domain.FIELDS.deals, dealId),
      input.client.getProducts()
    ]);
    debugLog("Deal loaded:", results[0]);
    return { dealId: dealId, deal: results[0], products: results[1], syncedAt: new Date() };
  }

  function extractCreatedQuoteId(response) {
    var row = response && response.data && response.data[0];
    return row && row.details && row.details.id ? row.details.id : "";
  }

  async function submitQuote(input) {
    var errors = domain.validateQuoteInput(input);
    if (errors.length) return { ok: false, message: errors.join(" ") };
    var payload = domain.buildQuotePayload(input.deal, input.lineItems);
    try {
      var response = await input.client.createQuote(payload);
      var quoteId = extractCreatedQuoteId(response);
      if (!quoteId) throw new Error("Quote created but CRM did not return an ID.");
      return { ok: true, quoteId: quoteId, payload: payload, response: response };
    } catch (error) {
      return { ok: false, message: parseError(error), payload: payload, error: error };
    }
  }

  function bootWidget(win, doc) {
    var statusEl = doc.getElementById("status");
    var debugOutputEl = doc.getElementById("debugOutput");
    var heroDealNameEl = doc.getElementById("heroDealName");
    var dealMetaEl = doc.getElementById("dealMeta");
    var productSearchEl = doc.getElementById("productSearch");
    var productSelectEl = doc.getElementById("productSelect");
    var addProductBtn = doc.getElementById("addProductBtn");
    var syncProductsBtn = doc.getElementById("syncProductsBtn");
    var productCountEl = doc.getElementById("productCount");
    var productSyncTimeEl = doc.getElementById("productSyncTime");
    var lineItemsBody = doc.getElementById("lineItemsBody");
    var quoteTotalEl = doc.getElementById("quoteTotal");
    var submitBtn = doc.getElementById("submitBtn");
    var refreshBtn = doc.getElementById("refreshBtn");
    var state = { dealId: "", deal: null, products: [], lineItems: [], lastProductSyncAt: null, status: domain.createState() };
    var client = win.ZOHO ? createZohoClient(win.ZOHO, domain.FIELDS) : null;

    function setStatus(next) {
      state.status = domain.reduceState(state.status, next);
      statusEl.hidden = state.status.kind === "idle";
      statusEl.className = "status" + (state.status.kind === "error" ? " error" : state.status.kind === "success" ? " success" : "");
      statusEl.innerHTML = state.status.quoteId ? "<strong>Quote created</strong><div class='quote-id'>" + state.status.quoteId + "</div>" : state.status.message;
    }

    function setDebug(title, data) {
      var body;
      try {
        body = typeof data === "string" ? data : JSON.stringify(data, null, 2);
      } catch (error) {
        body = String(data);
      }
      debugOutputEl.textContent = title + "\n\n" + body;
    }

    function renderDeal() {
      var deal = state.deal || {};
      var account = deal.Account_Name && deal.Account_Name.name ? deal.Account_Name.name : "Missing";
      var contact = deal.Contact_Name && deal.Contact_Name.name ? deal.Contact_Name.name : "Missing";
      heroDealNameEl.textContent = deal.Deal_Name || state.dealId || "Deal not loaded";
      if (dealMetaEl) {
        dealMetaEl.innerHTML =
          "<div><strong>Deal</strong><span>" + (deal.Deal_Name || state.dealId || "Not loaded") + "</span></div>" +
          "<div><strong>Account</strong><span>" + account + "</span></div>" +
          "<div><strong>Contact</strong><span>" + contact + "</span></div>";
      }
    }

    function renderProducts() {
      var term = (productSearchEl.value || "").toLowerCase();
      var filtered = state.products.filter(function (product) {
        return !term || [product.Product_Name, product.Product_Code].join(" ").toLowerCase().indexOf(term) >= 0;
      });
      productSelectEl.innerHTML = filtered.map(function (product) {
        return "<option value='" + product.id + "'>" + product.Product_Name + (product.Product_Code ? " (" + product.Product_Code + ")" : "") + "</option>";
      }).join("") || "<option value=''>" + (state.products.length ? "No matching Products" : "No Products synced from Zoho CRM") + "</option>";
    }

    function renderProductSync() {
      productCountEl.textContent = state.products.length + (state.products.length === 1 ? " Product" : " Products");
      productSyncTimeEl.textContent = state.lastProductSyncAt ? state.lastProductSyncAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "Not synced yet";
    }

    function lineTotal(item) { return Number(item.quantity || 0) * Number(item.rate || 0); }
    function quoteTotal() { return state.lineItems.reduce(function (sum, item) { return sum + lineTotal(item); }, 0); }
    function renderQuoteTotal() { quoteTotalEl.textContent = "$" + domain.helpers.money(quoteTotal()); }

    function updateRowTotal(index) {
      var totalCell = lineItemsBody.querySelector("[data-row-total='" + index + "']");
      if (totalCell) totalCell.textContent = "$" + domain.helpers.money(lineTotal(state.lineItems[index]));
      renderQuoteTotal();
    }

    function renderLines() {
      if (!state.lineItems.length) lineItemsBody.innerHTML = "<tr><td colspan='6' class='empty'>No Products selected yet.</td></tr>";
      else lineItemsBody.innerHTML = state.lineItems.map(function (item, index) {
        return "<tr>" +
          "<td>" + item.name + "</td>" +
          "<td>" + (item.code || "-") + "</td>" +
          "<td><input data-index='" + index + "' data-field='quantity' type='number' min='1' step='1' value='" + item.quantity + "'></td>" +
          "<td><input data-index='" + index + "' data-field='rate' type='number' min='0' step='0.01' value='" + item.rate + "'></td>" +
          "<td data-row-total='" + index + "'>$" + domain.helpers.money(lineTotal(item)) + "</td>" +
          "<td><button type='button' class='secondary' data-index='" + index + "' data-remove='1'>Remove</button></td>" +
        "</tr>";
      }).join("");
      renderQuoteTotal();
    }

    function addSelectedProduct() {
      var selectedId = productSelectEl.value;
      var product = state.products.find(function (entry) { return entry.id === selectedId; });
      if (!product) return;
      var existing = state.lineItems.find(function (entry) { return entry.id === selectedId; });
      if (existing) existing.quantity = Number(existing.quantity) + 1;
      else state.lineItems.push({ id: product.id, name: product.Product_Name, code: product.Product_Code || "", quantity: 1, rate: Number(product.Unit_Price || 0) });
      renderLines();
    }

    async function syncProducts(options) {
      options = options || {};
      try {
        syncProductsBtn.disabled = true;
        debugLog("Starting manual Product sync");
        if (!options.silent) setStatus({ type: "loading", message: "Syncing Products from Zoho CRM..." });
        state.products = await client.getProducts();
        state.lastProductSyncAt = new Date();
        debugLog("State Product list updated. Selectable Products:", state.products.length);
        renderProducts();
        renderProductSync();
        if (!options.silent) {
          setStatus({
            type: "success",
            message: state.products.length
              ? "Products synced from Zoho CRM. " + state.products.length + " selectable Product" + (state.products.length === 1 ? " is" : "s are") + " now available."
              : "Sync completed, but Zoho CRM returned no Product records."
          });
        }
      } catch (error) {
        debugLog("Product sync failed:", error);
        setStatus({ type: "error", message: "Product sync failed: " + parseError(error) });
      } finally {
        syncProductsBtn.disabled = false;
      }
    }

    async function hydrate(pageLoadData) {
      try {
        debugLog("Hydrating widget with PageLoad data");
        setStatus({ type: "loading", message: "Loading Deal context and syncing Products..." });
        var data = await loadInitialData({ client: client, pageLoadData: pageLoadData });
        state.dealId = data.dealId;
        state.deal = data.deal;
        state.products = data.products;
        state.lastProductSyncAt = data.syncedAt;
        state.lineItems = [];
        debugLog("Hydration complete. Deal:", state.dealId, "Products:", state.products.length);
        renderDeal();
        renderProducts();
        renderProductSync();
        renderLines();
        setStatus({ type: "reset" });
      } catch (error) {
        debugLog("Hydration failed:", error);
        setStatus({ type: "error", message: parseError(error) });
      }
    }

    if (!client) {
      debugLog("ZOHO SDK not available in window context");
      setStatus({ type: "error", message: "Zoho CRM SDK not found. Open this page inside a Zoho CRM widget context." });
      return;
    }

    productSearchEl.addEventListener("input", renderProducts);
    addProductBtn.addEventListener("click", addSelectedProduct);
    syncProductsBtn.addEventListener("click", function () { syncProducts({ silent: false }); });
    refreshBtn.addEventListener("click", function () { hydrate({ EntityId: state.dealId }); });
    lineItemsBody.addEventListener("input", function (event) {
      var index = Number(event.target.getAttribute("data-index"));
      var field = event.target.getAttribute("data-field");
      if (!Number.isInteger(index) || !field) return;
      state.lineItems[index][field] = event.target.value;
      updateRowTotal(index);
    });
    lineItemsBody.addEventListener("click", function (event) {
      var index = Number(event.target.getAttribute("data-index"));
      if (event.target.getAttribute("data-remove")) {
        state.lineItems.splice(index, 1);
        renderLines();
      }
    });
    submitBtn.addEventListener("click", async function () {
      submitBtn.disabled = true;
      setStatus({ type: "loading", message: "Creating Quote in Zoho CRM..." });
      setDebug("Create Quote Request", {
        dealId: state.dealId,
        dealName: state.deal && state.deal.Deal_Name,
        lineItems: state.lineItems
      });
      var result = await submitQuote({ client: client, dealId: state.dealId, deal: state.deal, lineItems: state.lineItems });
      if (result.ok) {
        setDebug("Create Quote Response", {
          quoteId: result.quoteId,
          payload: result.payload,
          response: result.response
        });
      } else {
        setDebug("Create Quote Error", {
          message: result.message,
          payload: result.payload,
          error: result.error
        });
      }
      setStatus(result.ok ? { type: "success", message: "Quote created.", quoteId: result.quoteId } : { type: "error", message: result.message });
      submitBtn.disabled = false;
    });

    client.onPageLoad(hydrate);
    debugLog("Widget booted successfully. Initializing Zoho embedded app.");
    client.init().then(function () {
      debugLog("Zoho embedded app initialized successfully.");
      return client.resize({ width: "92vw", height: "88vh" }).catch(function (error) {
        debugLog("Resize call failed or is unsupported:", error);
        return null;
      });
    }).catch(function (error) {
      debugLog("Zoho embedded app init failed:", error);
      setStatus({ type: "error", message: parseError(error) });
    });
  }

  if (typeof window !== "undefined" && window.document && domain) {
    window.addEventListener("DOMContentLoaded", function () { bootWidget(window, window.document); });
  }

  return {
    createZohoClient: createZohoClient,
    extractDealId: extractDealId,
    loadInitialData: loadInitialData,
    submitQuote: submitQuote,
    parseError: parseError,
    extractCreatedQuoteId: extractCreatedQuoteId,
    bootWidget: bootWidget
  };
}));
