// ===== TANYA BUDGGT: data lokal untuk chatbot + lembar chat; Gemini dipanggil lewat google.script.run.tanya (lihat gas-shim.js / Code.gs) =====
// Prinsip: app yang menghitung, Gemini hanya menjelaskan. Yang keluar dari HP cuma ringkasan + beberapa transaksi hasil cari.
// Dipakai dari script.js: globalData, inMonth, netral, monthTotals, budgetList, spentFor, billList, billStatus, currentMonthKey, todayStr

// kunci bulan 'YYYY-MM' digeser n bulan (n negatif = mundur)
function tanyaBulan(key, n) {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

// ringkasan: 3 bulan terakhir (total + pengeluaran per kategori), budget, tagihan. Tanpa nama toko / catatan.
function tanyaRingkas() {
  const now = currentMonthKey();
  const bulan = [0, -1, -2].map(n => {
    const key = tanyaBulan(now, n), kat = {};
    inMonth(globalData.transactions, key).filter(t => !netral(t) && t.jenis === 'Pengeluaran')
      .forEach(t => { kat[t.kategori] = (kat[t.kategori] || 0) + (Number(t.jumlah) || 0); });
    const s = monthTotals(key);
    return { bulan: key, pemasukan: s.inc, pengeluaran: s.exp, perKategori: kat };
  });
  const d = new Date(), akhir = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  return {
    hari: todayStr(), sisaHariBulanIni: akhir - d.getDate(),
    bulan,
    budget: budgetList().map(b => ({ nama: b.nama, batas: b.batas, terpakai: spentFor(b) })),
    tagihan: billList().map(b => ({ nama: b.nama, jumlah: Number(b.jumlah) || 0, tglTiapBulan: b.tanggal, status: billStatus(b).lv }))
  };
}

// cari transaksi berdasarkan kata kunci (di keterangan atau kategori), terbaru dulu, maks 20
// ponytail: cocok substring biasa; salah ketik / sinonim tidak ketemu, nanti Gemini yang memberi beberapa kata kunci
function tanyaCari(kata, dariBulan) {
  const ks = [].concat(kata).map(k => String(k).toLowerCase().trim()).filter(Boolean);
  if (!ks.length) return [];
  return (globalData.transactions || [])
    .filter(t => !netral(t) && (!dariBulan || (t.tanggal || '') >= dariBulan + '-01'))
    .filter(t => { const s = ((t.keterangan || '') + ' ' + (t.kategori || '')).toLowerCase(); return ks.some(k => s.includes(k)); })
    .sort((a, b) => (b.tanggal || '').localeCompare(a.tanggal || ''))
    .slice(0, 20)
    .map(t => ({ tgl: t.tanggal, ket: t.keterangan || '', kat: t.kategori, jenis: t.jenis, jumlah: Number(t.jumlah) || 0 }));
}

// selisih dua hasil cari (mis. harga A dulu vs B sekarang): hitungan di app, bukan di Gemini
function tanyaSelisih(a, b) {
  const x = a[0] && a[0].jumlah, y = b[0] && b[0].jumlah; // yang terbaru dari masing-masing
  if (x == null || y == null) return null;
  return { dari: x, ke: y, selisih: y - x, persen: x ? Math.round((y - x) / x * 1000) / 10 : null };
}

// "kalau aku sisihkan X per bulan, masih aman?": rata-rata 3 bulan terakhir yang ada datanya
// ponytail: rata-rata kasar, bulan berjalan tidak ikut; belum membedakan pengeluaran tetap vs variabel
function tanyaSimulasi(x) {
  const now = currentMonthKey();
  const b = [-1, -2, -3].map(n => monthTotals(tanyaBulan(now, n))).filter(s => s.count > 0);
  if (!b.length) return null;
  const avg = f => Math.round(b.reduce((s, m) => s + m[f], 0) / b.length);
  const inc = avg('inc'), exp = avg('exp');
  return { bulanDipakai: b.length, rataPemasukan: inc, rataPengeluaran: exp, sisaSebelum: inc - exp, sisaSesudah: inc - exp - x, aman: inc - exp - x >= 0 };
}

// hasil "cari" per kata kunci + selisih terlama -> terbaru, supaya perbandingan harga dihitung di app
function tanyaHasilCari(kata, dariBulan) {
  const perKata = {}, selisih = {};
  [].concat(kata).slice(0, 4).forEach(k => {
    const r = tanyaCari(k, dariBulan);
    perKata[k] = r;
    if (r.length > 1) selisih[k] = tanyaSelisih(r.slice(-1), r.slice(0, 1)); // dari yang terlama ke yang terbaru
  });
  return { perKata, selisihTerlamaKeTerbaru: selisih };
}

// ===== tampilan: lembar chat (#modalTanya di index.html, gaya .tq-* di style.css) =====
// ponytail: riwayat hanya di HP ini (30 pesan terakhir), tidak ikut backup
const TANYA_KEY = 'budggt_tanya', TANYA_NOTE = 'budggt_tanya_note';
const TANYA_CHIP = ['Kenapa bulan ini boros?', 'Sisa budget bulan ini berapa?', 'Bandingkan dengan bulan lalu', 'Kalau aku nabung Rp500.000 per bulan, aman nggak?'];
let tanyaLog = [], tanyaSibuk = false, tanyaMode = ''; // tanyaMode 'catatan' = layar Catatan Budggt
const TANYA_MAX = 1500; // panjang catatan; ikut dikirim tiap pertanyaan, jadi dijaga pendek
try { tanyaLog = JSON.parse(localStorage.getItem(TANYA_KEY) || '[]'); } catch (e) {}

const tanyaApi = p => new Promise((ok, no) => google.script.run.withSuccessHandler(ok).withFailureHandler(no).tanya(p));
const tanyaSimpan = () => { try { localStorage.setItem(TANYA_KEY, JSON.stringify(tanyaLog.slice(-30))); } catch (e) {} };

const tanyaNote = () => { try { return localStorage.getItem(TANYA_NOTE) || ''; } catch (e) { return ''; } };
function openTanya() { tanyaMode = ''; renderTanya(); toggleModal('modalTanya'); }
function tanyaCatatan(buka) { tanyaMode = buka ? 'catatan' : ''; renderTanya(); }
function tanyaSimpanCatatan() {
  const v = document.getElementById('tqNote').value.trim().slice(0, TANYA_MAX);
  try { localStorage.setItem(TANYA_NOTE, v); } catch (e) {}
  tanyaCatatan(false); showToast(t('Catatan disimpan'), 0);
}
// "ingat bahwa ..." menambah satu baris catatan tanpa memanggil Gemini (ponytail: hanya pola ini, bukan tebakan bahasa bebas)
const TANYA_INGAT = /^\s*(?:tolong\s+)?(?:ingat|ingatlah|remember)\s+(?:bahwa|that)\s+(.+)/i;
function tanyaHapus() { tanyaLog = []; tanyaSimpan(); renderTanya(); }

function renderTanya() {
  const box = document.getElementById('tanyaBox');
  if (!box) return;
  const row = document.getElementById('tqRow');
  if (row) row.style.display = tanyaMode ? 'none' : '';
  if (tanyaMode) {
    box.innerHTML = `<p class="tq-intro">${t('Catatan ini ikut dikirim ke Gemini tiap kamu bertanya, supaya jawabannya kenal kamu. Tulis seperlunya, satu fakta per baris.')}</p>
      <textarea id="tqNote" class="input-field" rows="9" maxlength="${TANYA_MAX}" placeholder="${t('Contoh: Lagi nabung DP rumah')}">${esc(tanyaNote())}</textarea>
      <div class="tq-row"><button class="btn-sec" style="flex: 1;" onclick="tanyaCatatan(false)">${t('Batal')}</button><button class="btn-primary" style="flex: 1;" onclick="tanyaSimpanCatatan()">${t('Simpan')}</button></div>`;
    return;
  }
  const bub = m => `<div class="tq-b ${m.dari}${m.err ? ' err' : ''}" translate="no">${esc(m.teks).replace(/\n/g, '<br>')}</div>`;
  box.innerHTML = (tanyaLog.length
    ? tanyaLog.map(bub).join('')
    : `<p class="tq-intro">${t('Tanya apa saja soal uangmu, atau soal keuangan secara umum.')}</p>
       <p class="tq-intro">${t('Tulis "ingat bahwa ..." untuk menyimpan catatan tentang dirimu.')}</p>
       <div class="tq-chips">${TANYA_CHIP.map(c => `<button type="button" class="tq-chip" onclick="tanyaKirim(this.innerText)">${t(c)}</button>`).join('')}</div>`)
    + (tanyaSibuk ? '<div class="tq-b a tq-wait"><i></i><i></i><i></i></div>' : '');
  box.scrollTop = box.scrollHeight;
}

async function tanyaKirim(teks) {
  const inp = document.getElementById('tqInput');
  teks = String(teks == null ? inp.value : teks).trim().slice(0, 500);
  if (!teks || tanyaSibuk) return;
  inp.value = '';
  const riwayat = tanyaLog.filter(m => !m.err).slice(-6);
  const ingat = TANYA_INGAT.exec(teks);
  if (ingat) {
    const baru = (tanyaNote() ? tanyaNote() + '\n' : '') + '- ' + ingat[1].trim();
    const ok = baru.length <= TANYA_MAX;
    if (ok) try { localStorage.setItem(TANYA_NOTE, baru); } catch (e) {}
    tanyaLog.push({ dari: 'u', teks }, ok ? { dari: 'a', teks: t('Oke, sudah saya catat.') } : { dari: 'a', err: 1, teks: t('Catatan sudah penuh, rapikan dulu lewat ikon catatan.') });
    tanyaSimpan(); renderTanya(); return;
  }
  tanyaLog.push({ dari: 'u', teks }); tanyaSibuk = true; renderTanya();
  try {
    const p = { pertanyaan: teks, riwayat, catatan: tanyaNote(), data: tanyaRingkas(), bahasa: bahasaAktif };
    let r = await tanyaApi(p);
    if (r.aksi === 'cari') r = await tanyaApi(Object.assign({}, p, { hasil: tanyaHasilCari(r.kata, r.dariBulan) }));
    else if (r.aksi === 'simulasi') r = await tanyaApi(Object.assign({}, p, { hasil: { simulasi: tanyaSimulasi(r.jumlah) } }));
    tanyaLog.push({ dari: 'a', teks: r.teks || '...' });
  } catch (e) {
    tanyaLog.push({ dari: 'a', err: 1, teks: t('Gagal') + ': ' + (e && e.message || e) });
  }
  tanyaSibuk = false; tanyaSimpan(); renderTanya();
}

// cek cepat: node tanya.js
if (typeof module !== 'undefined' && require.main === module) {
  const assert = require('assert');
  global.currentMonthKey = () => '2026-10';
  global.todayStr = () => '2026-10-23';
  global.netral = t => t.kategori === 'Transfer';
  global.inMonth = (l, k) => l.filter(t => t.tanggal.slice(0, 7) === k);
  global.monthTotals = k => { let inc = 0, exp = 0, count = 0; inMonth(globalData.transactions, k).filter(t => !netral(t)).forEach(t => { t.jenis === 'Pemasukan' ? inc += t.jumlah : exp += t.jumlah; count++; }); return { inc, exp, count }; };
  global.budgetList = () => [{ nama: 'Jajan', batas: 500000 }];
  global.spentFor = () => 120000;
  global.billList = () => [{ nama: 'Wifi', jumlah: 300000, tanggal: 5 }];
  global.billStatus = () => ({ lv: 'ok' });
  global.globalData = { transactions: [
    { tanggal: '2026-09-05', jenis: 'Pengeluaran', kategori: 'Jajan', keterangan: 'Kopi susu', jumlah: 28000 },
    { tanggal: '2026-10-22', jenis: 'Pengeluaran', kategori: 'Jajan', keterangan: 'kopi', jumlah: 32000 },
    { tanggal: '2026-09-25', jenis: 'Pemasukan', kategori: 'Gaji', keterangan: '', jumlah: 5000000 },
    { tanggal: '2026-09-10', jenis: 'Pengeluaran', kategori: 'Makan', keterangan: '', jumlah: 1000000 },
    { tanggal: '2026-09-11', jenis: 'Pengeluaran', kategori: 'Transfer', keterangan: 'kopi?', jumlah: 999 }
  ] };
  const r = tanyaRingkas();
  assert.equal(r.bulan[0].pengeluaran, 32000); assert.equal(r.bulan[1].perKategori.Jajan, 28000); assert.equal(r.sisaHariBulanIni, 8);
  const kopi = tanyaCari('kopi'); // transfer netral tidak ikut
  assert.equal(kopi.length, 2); assert.equal(kopi[0].tgl, '2026-10-22');
  assert.deepEqual(tanyaSelisih(tanyaCari('kopi', '2026-09').slice(1), kopi), { dari: 28000, ke: 32000, selisih: 4000, persen: 14.3 });
  assert.equal(tanyaCari('').length, 0);
  const s = tanyaSimulasi(1000000); // hanya September yang ada datanya
  assert.equal(s.bulanDipakai, 1); assert.equal(s.sisaSebelum, 3972000); assert.equal(s.aman, true);
  assert.equal(tanyaSimulasi(4000000).aman, false);
  // alur chat: cari -> hasil dihitung di app -> jawab
  const el = { tqInput: { value: 'harga kopi naik?' }, tanyaBox: { innerHTML: '', scrollTop: 0, scrollHeight: 0 } };
  global.document = { getElementById: id => el[id] };
  const ls = {}; global.localStorage = { getItem: k => ls[k] || null, setItem: (k, v) => { ls[k] = v; el.saved = v; } }; global.showToast = () => {};
  global.esc = x => String(x).replace(/</g, '&lt;'); global.t = x => x; global.bahasaAktif = 'id';
  const kirim = []; let n = 0;
  global.google = { script: { run: { withSuccessHandler(ok) { return { withFailureHandler(no) { return { tanya(p) { kirim.push(p); n++; Promise.resolve().then(() => n === 1 ? ok({ aksi: 'cari', kata: ['kopi'], dariBulan: '2026-09' }) : n === 2 ? ok({ aksi: 'jawab', teks: 'Naik Rp4.000' }) : no(new Error('offline'))); } }; } }; } } } };
  (async () => {
    await tanyaKirim();
    assert.equal(kirim.length, 2); assert.equal(kirim[1].hasil.selisihTerlamaKeTerbaru.kopi.selisih, 4000);
    assert.equal(tanyaLog.at(-1).teks, 'Naik Rp4.000'); assert.equal(tanyaSibuk, false); assert(el.saved.includes('Naik'));
    await tanyaKirim('tes lagi'); assert(tanyaLog.at(-1).err); assert.equal(kirim[2].riwayat.length, 2);
    await tanyaKirim('   '); assert.equal(kirim.length, 3); // kosong diabaikan
    await tanyaKirim('ingat bahwa aku lagi nabung DP rumah'); await tanyaKirim('Remember that istri suka kopi');
    assert.equal(kirim.length, 3); assert.equal(ls.budggt_tanya_note, '- aku lagi nabung DP rumah\n- istri suka kopi'); // tanpa panggilan Gemini
    await tanyaKirim('ingat nggak pengeluaran kopi?'); assert.equal(kirim.length, 4); assert.equal(kirim[3].catatan, ls.budggt_tanya_note); // bukan perintah catat
    el.tqNote = { value: '  fakta baru  ' }; tanyaSimpanCatatan(); assert.equal(ls.budggt_tanya_note, 'fakta baru');
    console.log('tanya.js ok');
  })();
}
