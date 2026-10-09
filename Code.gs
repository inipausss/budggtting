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

function writeSheet(name, head, rows, textCols) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name) || ss.insertSheet(name);
  sh.clearContents();
  // kolom teks: nomor rekening tidak kehilangan angka 0, bulan lunas ("2026-10") tidak diubah jadi tanggal
  (textCols || []).forEach(function (c) { sh.getRange(c + ':' + c).setNumberFormat('@'); });
  sh.getRange(1, 1, 1, head.length).setValues([head]);
  if (rows.length) sh.getRange(2, 1, rows.length, head.length).setValues(rows);
}

function backup(d) {
  d = d || {};
  var accounts = d.accounts || [], transactions = d.transactions || [];
  if (!accounts.length && !transactions.length) {
    return { ok: false, error: 'Data di HP kosong, backup dibatalkan (Restore dulu kalau ini HP baru)' };
  }
  var me = Session.getEffectiveUser().getEmail() || 'me';
  writeSheet('Accounts', ['ID', 'Nama', 'Jenis', 'Nomor', 'Saldo Awal', 'User Email'],
    accounts.map(function (a) { return [a.id, a.nama, a.jenis, a.nomor || '', Number(a.saldoAwal) || 0, me]; }), ['D']);
  writeSheet('Transactions', ['ID', 'Tanggal', 'Jenis', 'Kategori', 'Keterangan', 'Jumlah', 'Rekening ID', 'User Email'],
    transactions.slice().reverse().map(function (t) {
      return [t.id, t.tanggal, t.jenis, t.kategori, t.keterangan || '', Number(t.jumlah) || 0, t.rekeningId, me];
    }));
  writeSheet('Goals', ['ID', 'Nama', 'Target', 'Terkumpul', 'Kunci', 'User Email'],
    (d.goals || []).map(function (g) {
      return [g.id, g.nama, Number(g.target) || 0, Number(g.terkumpul) || 0, g.kunci ? 1 : 0, me];
    }));
  writeSheet('Budgets', ['Kategori', 'Batas', 'User Email'],
    (d.budgets || []).map(function (b) { return [b.kategori, Number(b.batas) || 0, me]; }));
  writeSheet('Bills', ['ID', 'Nama', 'Jumlah', 'Kategori', 'Rekening ID', 'Tanggal', 'Lunas', 'User Email'],
    (d.bills || []).map(function (b) {
      return [b.id, b.nama, Number(b.jumlah) || 0, b.kategori, b.rekeningId || '', Number(b.tanggal) || 1, b.lunas || '', me];
    }), ['G']);
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
      }),
      goals: rows('Goals').map(function (r) {
        return { id: r[0], nama: String(r[1]), target: Number(r[2]) || 0, terkumpul: Number(r[3]) || 0, kunci: r[4] === true || Number(r[4]) === 1 };
      }),
      budgets: rows('Budgets').map(function (r) { return { kategori: String(r[0]), batas: Number(r[1]) || 0 }; }),
      bills: rows('Bills').map(function (r) {
        return {
          id: r[0], nama: String(r[1]), jumlah: Number(r[2]) || 0, kategori: String(r[3]), rekeningId: r[4] ? String(r[4]) : '',
          tanggal: Number(r[5]) || 1, lunas: r[6] ? String(r[6]) : ''
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
