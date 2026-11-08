// Tiruan Google Sheets/Apps Script untuk menjalankan Code.gs + Logic.gs apa adanya di Node.
// Dipakai tes (tests/code.test.js) dan uji browser dengan server tiruan.
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

class FakeSheet {
  constructor(name) {
    this.name = name;
    this.grid = [];
    this.teks = new Set(); // kolom berformat teks ('@')
  }
  getName() { return this.name; }
  setName(n) { this.name = n; return this; }
  getMaxRows() { return 1000; }
  getLastRow() {
    for (let i = this.grid.length - 1; i >= 0; i--) {
      if ((this.grid[i] || []).some((v) => v !== "" && v !== undefined && v !== null)) return i + 1;
    }
    return 0;
  }
  getDataRange() {
    const n = this.getLastRow();
    const baris = this.grid.slice(0, n).map((r) => r || []);
    const lebar = Math.max(1, ...baris.map((r) => r.length));
    return { getValues: () => baris.map((r) => Array.from({ length: lebar }, (_, i) => (r[i] === undefined ? "" : r[i]))) };
  }
  clear() { this.grid = []; this.teks = new Set(); return this; }
  getRange(r, c, nr, nc) {
    const sh = this;
    return {
      setValues(vals) {
        for (let i = 0; i < vals.length; i++) {
          sh.grid[r - 1 + i] = sh.grid[r - 1 + i] || [];
          for (let j = 0; j < vals[i].length; j++) {
            let v = vals[i][j];
            // Perilaku Sheets: teks "YYYY-MM-DD" di kolom non-teks otomatis menjadi tanggal.
            if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !sh.teks.has(c + j)) {
              const [y, m, d] = v.split("-").map(Number);
              v = new Date(y, m - 1, d);
            }
            sh.grid[r - 1 + i][c - 1 + j] = v;
          }
        }
        return this;
      },
      setNumberFormat(f) { if (f === "@") for (let j = 0; j < nc; j++) sh.teks.add(c + j); return this; },
      setFontWeight() { return this; }
    };
  }
  setFrozenRows() {}
  setFrozenColumns() {}
  autoResizeColumns() {}
}

function buatLingkungan() {
  const sheets = [new FakeSheet("Sheet1")];
  const props = {};
  const cacheData = {};
  const fetchCalls = [];
  const fetchRespons = { kode: 200, teks: JSON.stringify({ ok: true }) };
  const ss = {
    getSheets: () => sheets,
    getSheetByName: (n) => sheets.find((s) => s.name === n) || null,
    insertSheet: (n) => { const s = new FakeSheet(n); sheets.push(s); return s; }
  };
  const ctx = vm.createContext({
    SpreadsheetApp: { getActive: () => ss },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    ContentService: {
      MimeType: { JSON: "json" },
      createTextOutput: (t) => ({ isi: t, setMimeType() { return this; } })
    },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (props[k] === undefined ? null : props[k]) }) },
    CacheService: {
      getScriptCache: () => ({
        get: (k) => (cacheData[k] === undefined ? null : cacheData[k]),
        put: (k, v) => { cacheData[k] = String(v); },
        remove: (k) => { delete cacheData[k]; }
      })
    },
    console
  });
  const dir = path.join(__dirname, "..", "apps-script");
  vm.runInContext(fs.readFileSync(path.join(dir, "Logic.gs"), "utf8"), ctx);
  vm.runInContext(fs.readFileSync(path.join(dir, "WhatsApp.gs"), "utf8"), ctx);
  vm.runInContext(fs.readFileSync(path.join(dir, "Code.gs"), "utf8"), ctx);
  const get = (parameter) => JSON.parse(ctx.doGet({ parameter }).isi);
  const post = (body) => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(body) } }).isi);
  // UrlFetchApp sengaja tidak dipasang default: Code.gs mengecek ketersediaannya untuk sinkron hari libur.
  const pasangUrlFetch = () => {
    ctx.Utilities = {
      computeHmacSha256Signature: (nilai, kunci) =>
        Array.from(require("node:crypto").createHmac("sha256", kunci).update(nilai, "utf8").digest()).map((b) => (b > 127 ? b - 256 : b))
    };
    ctx.UrlFetchApp = {
      fetch: (url, opsi) => {
        fetchCalls.push({ url, opsi });
        return { getResponseCode: () => fetchRespons.kode, getContentText: () => fetchRespons.teks };
      }
    };
  };
  return { ctx, ss, sheets, get, post, props, cacheData, fetchCalls, fetchRespons, pasangUrlFetch };
}

function baru() {
  const env = buatLingkungan();
  env.ctx.setup();
  return env;
}


module.exports = { FakeSheet, buatLingkungan, baru };
