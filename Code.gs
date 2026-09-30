// Rahasia disimpan di Project Settings > Script Properties: TOKEN dan GEMINI_API_KEY (jangan ditulis di kode)

function doGet() { return ContentService.createTextOutput('OK'); }

function doPost(e) {
  try {
    var b = JSON.parse(e.postData.contents);
    var token = PropertiesService.getScriptProperties().getProperty('TOKEN');
    if (!token || b.token !== token) return out({ ok: false, error: 'Token salah' });
    if (b.action === 'backup') return out(backup(b.data));
    if (b.action === 'restore') return out(restore());
    if (b.action === 'scan') return out({ ok: true, data: scan(b.image) });
    return out({ ok: false, error: 'Aksi tidak dikenal' });
  } catch (err) {
    return out({ ok: false, error: String(err.message || err) });
  }
}

function out(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function writeSheet(name, head, rows) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name) || ss.insertSheet(name);
  sh.clearContents();
  if (name === 'Accounts') sh.getRange('D:D').setNumberFormat('@'); // nomor rekening tidak kehilangan angka 0
  sh.getRange(1, 1, 1, head.length).setValues([head]);
  if (rows.length) sh.getRange(2, 1, rows.length, head.length).setValues(rows);
}

function backup(d) {
  if (!d || (!d.accounts.length && !d.transactions.length)) {
    return { ok: false, error: 'Data di HP kosong, backup dibatalkan (Restore dulu kalau ini HP baru)' };
  }
  var me = Session.getEffectiveUser().getEmail() || 'me';
  writeSheet('Accounts', ['ID', 'Nama', 'Jenis', 'Nomor', 'Saldo Awal', 'User Email'],
    d.accounts.map(function (a) { return [a.id, a.nama, a.jenis, a.nomor || '', Number(a.saldoAwal) || 0, me]; }));
  writeSheet('Transactions', ['ID', 'Tanggal', 'Jenis', 'Kategori', 'Keterangan', 'Jumlah', 'Rekening ID', 'User Email'],
    d.transactions.slice().reverse().map(function (t) {
      return [t.id, t.tanggal, t.jenis, t.kategori, t.keterangan || '', Number(t.jumlah) || 0, t.rekeningId, me];
    }));
  return { ok: true };
}

function restore() {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), tz = Session.getScriptTimeZone();
  function rows(n) {
    var s = ss.getSheetByName(n);
    return s && s.getLastRow() > 1 ? s.getRange(2, 1, s.getLastRow() - 1, s.getLastColumn()).getValues() : [];
  }
  return {
    ok: true,
    data: {
      accounts: rows('Accounts').map(function (r) {
        return { id: r[0], nama: r[1], jenis: r[2], nomor: r[3] ? String(r[3]) : '', saldoAwal: Number(r[4]) || 0 };
      }),
      transactions: rows('Transactions').reverse().map(function (r) {
        return {
          id: r[0], tanggal: Utilities.formatDate(new Date(r[1]), tz, 'yyyy-MM-dd'), jenis: r[2], kategori: r[3],
          keterangan: r[4] ? String(r[4]) : '', jumlah: Number(r[5]) || 0, rekeningId: r[6]
        };
      })
    }
  };
}

function scan(base64Image) {
  var key = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  var url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=' + key;
  var prompt = 'Analisis struk belanja ini. Kembalikan HANYA JSON: {"jumlah": 0, "kategori": "Makanan/Belanja/Transport/Tagihan/Hiburan/Kesehatan/Investasi/Lainnya", "tanggal": "YYYY-MM-DD"}';
  var res = UrlFetchApp.fetch(url, {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    payload: JSON.stringify({
      contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: 'image/jpeg', data: base64Image } }] }],
      generationConfig: { temperature: 0.1, response_mime_type: 'application/json' }
    })
  });
  var j = JSON.parse(res.getContentText());
  if (j.error) throw new Error(j.error.message);
  if (!j.candidates || !j.candidates.length) throw new Error('Struk tidak terbaca');
  var p = JSON.parse(j.candidates[0].content.parts[0].text.replace(/```json/gi, '').replace(/```/g, '').trim());
  return {
    jumlah: Number(p.jumlah) || 0,
    kategori: p.kategori || 'Lainnya',
    tanggal: p.tanggal || Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd')
  };
}
