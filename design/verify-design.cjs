/* Design-package consistency validator. This is not the application implementation. */
"use strict";
const fs = require("fs");
const path = require("path");
const assert = require("assert/strict");
const root = __dirname;
const readJSON = name => JSON.parse(fs.readFileSync(path.join(root, name), "utf8"));
const spec = readJSON("contracts/openapi.json");
const seed = readJSON("contracts/categories.json");
const vectors = readJSON("contracts/ranking-cases.json");
const passed = [];
function check(name, fn) { fn(); passed.push(name); console.log("PASS " + name); }

check("24 flat broad categories", () => {
  assert.equal(seed.categories.length, 24);
  for (const key of ["id", "slug", "name"]) assert.equal(new Set(seed.categories.map(x => x[key])).size, 24);
  for (const c of seed.categories) {
    assert(!("parentId" in c) && !("children" in c));
    assert(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(c.id));
  }
  assert(seed.categories.some(x => x.name === "电脑"));
  assert(seed.categories.some(x => x.name === "耳机"));
  assert(!seed.categories.some(x => /蓝牙|笔记本|台式/.test(x.name)));
});

function resolve(pointer) {
  assert(pointer.startsWith("#/"), "Only local schema refs are expected: " + pointer);
  return pointer.slice(2).split("/").map(x => x.replace(/~1/g, "/").replace(/~0/g, "~"))
    .reduce((value, key) => { assert(value && key in value, "Broken ref " + pointer); return value[key]; }, spec);
}
function walk(value, visit) {
  if (!value || typeof value !== "object") return;
  visit(value);
  for (const child of Object.values(value)) walk(child, visit);
}
check("OpenAPI local references and required fields", () => {
  assert.equal(spec.openapi, "3.1.0");
  walk(spec, x => {
    if (x.$ref) resolve(x.$ref);
    if (x.type === "object" && x.required) for (const k of x.required) assert(k in x.properties, "Required field missing from properties: " + k);
  });
});

check("Unique operations and exact path parameters", () => {
  const ids = new Set();
  for (const [route, methods] of Object.entries(spec.paths)) for (const [method, op] of Object.entries(methods)) {
    assert(["get", "post", "put", "patch", "delete"].includes(method));
    assert(op.operationId && !ids.has(op.operationId), "Duplicate operation " + op.operationId);
    ids.add(op.operationId);
    const declared = (op.parameters || []).filter(x => x.in === "path").map(x => x.name).sort();
    const expected = [...route.matchAll(/\{([^}]+)\}/g)].map(x => x[1]).sort();
    assert.deepEqual(declared, expected, route);
    assert((op.parameters || []).filter(x => x.in === "path").every(x => x.required));
    assert(op.responses && Object.keys(op.responses).some(x => /^2/.test(x)));
  }
  assert(ids.size >= 70);
});

check("Three business inputs only, optional links", () => {
  assert.deepEqual(spec.components.schemas.MerchantCreate.required.slice().sort(), ["displayName", "logoAssetId"]);
  for (const k of ["shopUrl", "liveUrl", "phone", "summary", "city", "legalEntity", "licenseId"]) assert(!spec.components.schemas.MerchantCreate.required.includes(k));
  assert(spec.components.schemas.OrderCreate.required.includes("amountFen"));
  assert(!("parentId" in spec.components.schemas.CategoryInput.properties));
  const merchant = spec.components.schemas.MerchantCreate;
  const minimal = {displayName: "示例品牌", logoAssetId: seed.categories[0].id};
  assert(merchant.required.every(k => k in minimal));
  assert(!spec.components.schemas.OrderCreate.required.some(k => /shop|live|license|contact/i.test(k)));
});

check("Lifetime-only board and anonymous capability discovery", () => {
  assert.equal(spec.components.schemas.MerchantBoard.properties.kind.const, "LIFETIME");
  const op = spec.paths["/categories/{categoryId}/merchant-board"].get;
  assert(!(op.parameters || []).some(x => /period|month|week|child|subCategory/.test(x.name)));
  assert.deepEqual(spec.paths["/capabilities"].get.security, []);
  assert(spec.paths["/contributions/orders"].post.parameters.some(x => x.name === "Idempotency-Key" && x.required));
  assert(spec.paths["/payments/{provider}/webhook"].post.security.some(x => "ProviderSignature" in x));
});

function simulate(events) {
  const payments = new Map(), refunds = new Set(), balances = new Map(), rejected = [];
  const categories = new Set(events.map(x => x.category));
  for (const e of events) {
    if (e.status !== "SUCCEEDED" || !e.verified) continue;
    assert(Number.isSafeInteger(e.amountFen) && e.amountFen > 0);
    const key = e.merchant + "|" + e.category;
    if (e.kind === "PAYMENT") {
      if (payments.has(e.reference)) continue;
      payments.set(e.reference, {...e, refundedFen: 0});
      const b = balances.get(key) || {merchant: e.merchant, category: e.category, grossFen: 0, refundedFen: 0, netFen: 0, attainedAt: e.committedAt};
      b.grossFen += e.amountFen; b.netFen += e.amountFen; b.attainedAt = e.committedAt;
      balances.set(key, b);
    } else {
      if (refunds.has(e.reference)) continue;
      const p = payments.get(e.paymentRef);
      if (!p || p.merchant !== e.merchant || p.category !== e.category || p.refundedFen + e.amountFen > p.amountFen) {
        rejected.push(e.eventId); continue;
      }
      refunds.add(e.reference); p.refundedFen += e.amountFen;
      const b = balances.get(key); b.refundedFen += e.amountFen; b.netFen -= e.amountFen; b.attainedAt = e.committedAt;
    }
  }
  const boards = {};
  for (const category of categories) boards[category] = [...balances.values()]
    .filter(x => x.category === category && x.netFen > 0)
    .sort((a, b) => b.netFen - a.netFen || a.attainedAt.localeCompare(b.attainedAt) || a.merchant.localeCompare(b.merchant))
    .map(x => x.merchant);
  return {boards, balances, rejected};
}
for (const test of vectors.cases) check("Rank vector: " + test.id, () => {
  const actual = simulate(test.events);
  assert.deepEqual(actual.boards, test.expected.boards, test.description);
  for (const [key, expected] of Object.entries(test.expected.balances)) {
    const b = actual.balances.get(key); assert(b, key);
    for (const field of ["grossFen", "refundedFen", "netFen"]) assert.equal(b[field], expected[field], key + "." + field);
    assert.equal(b.netFen, b.grossFen - b.refundedFen);
    assert(b.netFen >= 0);
  }
  assert.deepEqual(actual.rejected, test.expected.rejected || []);
});

check("Local Markdown links resolve", () => {
  for (const file of fs.readdirSync(root).filter(x => x.endsWith(".md"))) {
    const content = fs.readFileSync(path.join(root, file), "utf8");
    for (const match of content.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
      const url = match[1].replace(/^<|>$/g, "").split("#")[0];
      if (!url || /^(https?:|mailto:)/i.test(url)) continue;
      const target = path.resolve(root, decodeURIComponent(url));
      assert(target.startsWith(root + path.sep), "Out-of-package link: " + file + " -> " + url);
      assert(fs.existsSync(target), "Broken doc link: " + file + " -> " + url);
    }
  }
});

function luminance(hex) {
  const values = hex.replace("#", "").match(/../g).map(x => parseInt(x, 16) / 255).map(x => x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4);
  return .2126 * values[0] + .7152 * values[1] + .0722 * values[2];
}
function contrast(a, b) { const x = luminance(a), y = luminance(b); return (Math.max(x,y) + .05) / (Math.min(x,y) + .05); }
check("Proposed light/dark text color contrast >= 4.5", () => {
  const pairs = [
    ["#0C0A09","#FAFAF9"],["#475569","#FAFAF9"],["#0C0A09","#FFFFFF"],["#475569","#FFFFFF"],
    ["#FFFFFF","#1C1917"],["#FFFFFF","#A16207"],["#FAFAF9","#121212"],["#CBD5E1","#121212"],
    ["#FAFAF9","#1C1917"],["#CBD5E1","#1C1917"],["#1C1917","#F4C56A"],["#B91C1C","#FFFFFF"],["#FCA5A5","#1C1917"]
  ];
  for (const [a,b] of pairs) assert(contrast(a,b) >= 4.5, a + "/" + b + ": " + contrast(a,b));
});
console.log(JSON.stringify({status: "PASS", checks: passed.length, broadCategories: seed.categories.length, apiPaths: Object.keys(spec.paths).length, apiOperations: Object.values(spec.paths).reduce((n,x) => n + Object.keys(x).length, 0), schemas: Object.keys(spec.components.schemas).length, rankingCases: vectors.cases.length, note: "Design consistency checks only; no application, real payments, store review, or cross-platform runtime tested."}, null, 2));
