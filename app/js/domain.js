(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.CrmQuoteDomain = factory();
}(typeof self !== "undefined" ? self : this, function () {
  var FIELDS = {
    deals: "Deals",
    products: "Products",
    quotes: "Quotes",
    dealName: "Deal_Name",
    account: "Account_Name",
    contact: "Contact_Name",
    subject: "Subject",
    quoteItems: "Product_Details",
    productLookup: "product",
    productName: "Product_Name",
    quantity: "quantity",
    rate: "list_price",
    unitPrice: "Unit_Price",
    productCode: "Product_Code"
  };

  function lookupId(value) { return value && typeof value === "object" ? value.id || null : null; }
  function recordId(value) { return value && (value.id || value.Id || null); }
  function money(value) { return Number.parseFloat(value || 0).toFixed(2); }

  function mapProductDetails(lineItems, fields) {
    fields = fields || FIELDS;
    return lineItems.map(function (item) {
      var line = {};
      line[fields.productLookup] = { id: item.id };
      line[fields.quantity] = Number(item.quantity);
      line[fields.rate] = Number(money(item.rate));
      return line;
    });
  }

  function buildQuotePayload(deal, lineItems, fields) {
    fields = fields || FIELDS;
    var dealLabel = deal[fields.dealName] || "Deal";
    var payload = {};
    payload[fields.subject] = dealLabel + " Quote - " + new Date().toISOString().slice(0, 10);
    payload[fields.dealName] = { id: recordId(deal) };
    payload[fields.account] = { id: lookupId(deal[fields.account]) };
    payload[fields.contact] = { id: lookupId(deal[fields.contact]) };
    payload[fields.quoteItems] = mapProductDetails(lineItems, fields);
    return payload;
  }

  function validateQuoteInput(input, fields) {
    fields = fields || FIELDS;
    var errors = [];
    if (!input || !input.dealId) errors.push("Missing Deal context. Open the widget from a Deal record.");
    if (!input.deal) errors.push("Deal details could not be loaded.");
    if (input.deal && !lookupId(input.deal[fields.account])) errors.push("The Deal must have an Account before creating a Quote.");
    if (input.deal && !lookupId(input.deal[fields.contact])) errors.push("The Deal must have a Contact before creating a Quote.");
    if (!input.lineItems || !input.lineItems.length) errors.push("Select at least one Product.");
    (input.lineItems || []).forEach(function (item) {
      if (!item.id) errors.push("Each line item must reference a CRM Product.");
      if (!Number.isFinite(Number(item.quantity)) || Number(item.quantity) <= 0) errors.push("Quantity must be greater than 0 for " + item.name + ".");
      if (!Number.isFinite(Number(item.rate)) || Number(item.rate) < 0) errors.push("Rate must be 0 or greater for " + item.name + ".");
    });
    return errors;
  }

  function createState() {
    return { kind: "idle", message: "", quoteId: "" };
  }

  function reduceState(state, action) {
    state = state || createState();
    if (!action) return state;
    if (action.type === "loading") return { kind: "loading", message: action.message || "Loading...", quoteId: "" };
    if (action.type === "success") return { kind: "success", message: action.message || "Quote created.", quoteId: action.quoteId || "" };
    if (action.type === "error") return { kind: "error", message: action.message || "Something went wrong.", quoteId: "" };
    return createState();
  }

  return {
    FIELDS: FIELDS,
    mapProductDetails: mapProductDetails,
    buildQuotePayload: buildQuotePayload,
    validateQuoteInput: validateQuoteInput,
    createState: createState,
    reduceState: reduceState,
    helpers: { lookupId: lookupId, recordId: recordId, money: money }
  };
}));
