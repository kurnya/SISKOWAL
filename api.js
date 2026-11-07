// Klien untuk Web App Apps Script. Berjalan di browser dan di Node (untuk tes).
(function (root) {
  const MAX_ATTEMPTS = 3;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function createApi(options) {
    const getUrl = options.getUrl;
    const fetchImpl = options.fetchImpl;
    const delay = options.baseDelayMs === undefined ? 500 : options.baseDelayMs;

    async function request(makeRequest) {
      const url = getUrl();
      if (!url) throw new Error("API_URL belum diisi di config.js");

      let lastError;
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
          const res = await makeRequest(url);
          let payload;
          try {
            payload = await res.json();
          } catch (e) {
            throw new Error("Spreadsheet tidak bisa dijangkau (respons bukan JSON)");
          }
          if (!payload.ok) {
            // Error dari server (validasi dll.) tidak ada gunanya di-retry.
            const err = new Error(payload.error || "Terjadi kesalahan di server");
            err.noRetry = true;
            throw err;
          }
          return payload.data;
        } catch (err) {
          lastError = err;
          if (err.noRetry || attempt === MAX_ATTEMPTS) break;
          await sleep(delay * 2 ** (attempt - 1));
        }
      }
      throw lastError;
    }

    return {
      getMaster(tahun) {
        const q = tahun ? `&tahun=${encodeURIComponent(tahun)}` : "";
        return request((url) => fetchImpl(`${url}?action=master${q}`));
      },
      getLiburTahun(tahun) {
        return request((url) => fetchImpl(`${url}?action=libur_tahun&tahun=${encodeURIComponent(tahun)}`));
      },
      getDaftarBulan() {
        return request((url) => fetchImpl(`${url}?action=bulan`));
      },
      getJadwal(bulan) {
        return request((url) => fetchImpl(`${url}?action=jadwal&bulan=${encodeURIComponent(bulan)}`));
      },
      getObCatatan(dari, sampai) {
        return request((url) =>
          fetchImpl(`${url}?action=ob_catatan&dari=${encodeURIComponent(dari)}&sampai=${encodeURIComponent(sampai)}`)
        );
      },
      simpanObCatatan(bulan, catatan) {
        return request((url) =>
          fetchImpl(url, {
            method: "POST",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify({ action: "simpan_ob_catatan", bulan, catatan })
          })
        );
      },
      simpanMaster(master) {
        return request((url) =>
          fetchImpl(url, {
            method: "POST",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify({ action: "simpan_master", master })
          })
        );
      },
      simpanJadwal(bulan, rows) {
        // text/plain menghindari preflight CORS yang tidak didukung Apps Script.
        return request((url) =>
          fetchImpl(url, {
            method: "POST",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify({ action: "simpan", bulan, rows })
          })
        );
      }
    };
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { createApi };
  } else {
    root.api = createApi({
      getUrl: () => (root.SISKOWAL_CONFIG || {}).API_URL,
      fetchImpl: (...args) => root.fetch(...args)
    });
  }
})(typeof window !== "undefined" ? window : globalThis);
