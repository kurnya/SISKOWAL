// SISKOWAL - relay pengiriman PDF ke grup WhatsApp lewat BotSC.
// Rahasia (BOT_URL, BOT_TOKEN, WA_PIN) hanya disimpan di Script Properties, tidak pernah ke repo atau browser.
// Dependensi: Code.gs (jsonOut_) di project yang sama.

var WA_MAKS_BASE64 = 11000000;   // ± 8 MB PDF
var WA_MAKS_SALAH = 5;           // percobaan PIN salah berturut-turut sebelum dikunci
var WA_KUNCI_DETIK = 600;        // lama kunci setelah terlalu banyak PIN salah
var WA_MAKS_KIRIM = 20;          // maksimal kiriman per jendela
var WA_JENDELA_DETIK = 3600;

// Hitung percobaan di cache. Mengembalikan jumlah setelah ditambah 1.
function waHitung_(cache, kunci, ttl) {
  var n = Number(cache.get(kunci) || 0) + 1;
  cache.put(kunci, String(n), ttl);
  return n;
}

// HMAC-SHA256 (hex) atas ts, fileName, caption, pdfBase64. Harus sama dengan sign() di BotSC/src/server.js.
function waTandaTangan_(token, ts, fileName, caption, pdfBase64) {
  var bytes = Utilities.computeHmacSha256Signature([ts, fileName, caption, pdfBase64].join('\n'), token);
  return bytes.map(function (b) {
    var h = (b < 0 ? b + 256 : b).toString(16);
    return h.length === 1 ? '0' + h : h;
  }).join('');
}

function kirimWa_(body) {
  var props = PropertiesService.getScriptProperties();
  var botUrl = String(props.getProperty('BOT_URL') || '').replace(/\/+$/, '');
  var botToken = props.getProperty('BOT_TOKEN');
  var pinBenar = props.getProperty('WA_PIN');
  if (!botUrl || !botToken || !pinBenar) throw new Error('Pengiriman WhatsApp belum dikonfigurasi di Apps Script.');
  if (!/^https?:\/\//.test(botUrl)) throw new Error('BOT_URL harus diawali http:// atau https://');

  var cache = CacheService.getScriptCache();
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    if (Number(cache.get('wa_salah') || 0) >= WA_MAKS_SALAH) {
      return { ok: false, error: 'Terlalu banyak PIN salah. Coba lagi beberapa menit lagi.', kode: 'KUNCI' };
    }
    if (String(body.pin || '') !== String(pinBenar)) {
      waHitung_(cache, 'wa_salah', WA_KUNCI_DETIK);
      return { ok: false, error: 'PIN salah.', kode: 'PIN' };
    }
    cache.remove('wa_salah');
    if (Number(cache.get('wa_kirim') || 0) >= WA_MAKS_KIRIM) {
      return { ok: false, error: 'Batas pengiriman per jam tercapai. Coba lagi nanti.', kode: 'BATAS' };
    }
    waHitung_(cache, 'wa_kirim', WA_JENDELA_DETIK);
  } finally {
    lock.releaseLock();
  }

  var pdf = String(body.pdfBase64 || '');
  if (!pdf || pdf.indexOf('JVBERi') !== 0) throw new Error('File bukan PDF yang valid.'); // "%PDF" dalam base64
  if (pdf.length > WA_MAKS_BASE64) throw new Error('Ukuran PDF melebihi 8 MB.');

  var fileName = String(body.fileName || 'dokumen.pdf');
  var caption = String(body.caption || '');
  var ts = Date.now();
  var res = UrlFetchApp.fetch(botUrl + '/send-document', {
    method: 'post',
    contentType: 'text/plain;charset=utf-8',
    // BOT_TOKEN tidak ikut dikirim: hanya tanda tangannya, jadi aman walau BOT_URL memakai http.
    payload: JSON.stringify({
      ts: ts,
      sig: waTandaTangan_(botToken, ts, fileName, caption, pdf),
      fileName: fileName,
      caption: caption,
      pdfBase64: pdf
    }),
    muteHttpExceptions: true
  });
  var hasil;
  try {
    hasil = JSON.parse(res.getContentText());
  } catch (e) {
    throw new Error('Bot tidak merespons dengan benar (kode ' + res.getResponseCode() + ').');
  }
  if (!hasil.ok) throw new Error(hasil.error || 'Gagal mengirim ke WhatsApp.');
  return { ok: true, data: true };
}
