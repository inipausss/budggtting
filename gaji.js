// ===== BAGI GAJI (halaman penuh #gaji, 3 langkah) =====
// Langkah 1: isi gaji. Langkah 2: atur pembagian 50/30/15/5 (persen diubah dengan tombol + / -). Langkah 3: rencana lalu Terapkan.
// Belajar dari kebiasaan: isi "kebutuhan pokok" dibagi ke Makanan & Transport sesuai rata-rata 3 bulan terakhir
// (dicampur dengan pembagian terakhir yang kamu terapkan); tagihan tetap diambil dari daftar Tagihan. Persen & gaji terakhir diingat.
// Markup di index.html (#gaji), gaya di style.css (.gj-*). Memakai fungsi script.js saat berjalan.
// ponytail: kategori "kebutuhan" tetap Makanan & Transport; kategori lain ikut kelompok "bebas". Perlu daftar yang bisa diatur kalau kurang.
const GAJI_KEY = 'budggt_gaji';
const GAJI_BUCKET = [
  { id: 'need', nama: 'Kebutuhan pokok', sub: 'Tagihan, makanan, transportasi', pct: 50, warna: '#3b82f6' },
  { id: 'save', nama: 'Saving', sub: 'Tabungan & tujuan keuangan', pct: 30, warna: '#22c55e' },
  { id: 'dar', nama: 'Dana darurat', sub: 'Cadangan untuk hal tak terduga', pct: 15, warna: '#f97316' },
  { id: 'free', nama: 'Bebas dipakai', sub: 'Untuk apa saja', pct: 5, warna: '#a855f7' }
];
const GAJI_KEBUTUHAN = { Makanan: 0.6, Transport: 0.4 }; // bobot awal kalau belum ada riwayat
const GAJI_BEBAS_CATS = ['Hiburan', 'Belanja', 'Lainnya'];
let gajiPct = {}, gajiKat = [], gajiLangkah = 1, gajiInfo = '', gajiNilai = 0; // gajiKat: [{nama, jumlah}] isi kebutuhan pokok (bisa diedit)

const gajiSimpan = () => { try { return JSON.parse(localStorage.getItem(GAJI_KEY) || '{}'); } catch (e) { return {}; } };
const gajiAngka = v => Number(String(v).replace(/\D/g, '')) || 0;
const gajiBulat = n => Math.round(n / 1000) * 1000;

// rata-rata pengeluaran per kategori dari maks 3 bulan lengkap terakhir
function gajiRiwayat() {
  const now = currentMonthKey(), per = {};
  (globalData.transactions || []).forEach(t => {
    const k = String(t.tanggal).slice(0, 7);
    if (k >= now || netral(t) || t.jenis !== 'Pengeluaran') return;
    per[k] = per[k] || {};
    per[k][t.kategori] = (per[k][t.kategori] || 0) + (Number(t.jumlah) || 0);
  });
  const keys = Object.keys(per).sort().slice(-3), r = { n: keys.length, cat: {} };
  keys.forEach(k => { for (const c in per[k]) r.cat[c] = (r.cat[c] || 0) + per[k][c] / keys.length; });
  return r;
}

const gajiTotalPct = () => GAJI_BUCKET.reduce((s, b) => s + (gajiPct[b.id] || 0), 0);
const gajiAmt = () => { const a = {}; GAJI_BUCKET.forEach(b => { a[b.id] = gajiBulat(gajiNilai * (gajiPct[b.id] || 0) / 100); }); return a; };

function openGaji() {
  const s = gajiSimpan();
  GAJI_BUCKET.forEach(b => { gajiPct[b.id] = (s.pct && s.pct[b.id] != null) ? s.pct[b.id] : b.pct; });
  gajiNilai = s.gaji || 0; gajiKat = [];
  gajiLangkah = 1; gajiGambar();
  openPage('gaji');
}

function gajiKembali() { if (gajiLangkah > 1) { gajiLangkah--; gajiGambar(); window.scrollTo({ top: 0 }); } else openPage('dashboard'); }

function gajiLanjut() {
  if (gajiLangkah === 1) { if (gajiNilai <= 0) { alert('Isi gaji lebih dari 0'); return; } }
  else if (gajiLangkah === 2) { if (gajiTotalPct() !== 100) { alert('Total persen harus 100'); return; } gajiKat = []; }
  else return gajiTerapkan();
  gajiLangkah++; gajiGambar(); window.scrollTo({ top: 0 });
}

function gajiGambar() {
  document.getElementById('gajiLangkah').innerHTML = [1, 2, 3].map(n => `<i class="${n < gajiLangkah ? 'done' : n === gajiLangkah ? 'on' : ''}"></i>`).join('');
  document.getElementById('gajiLanjut').textContent = ['Lanjut', 'Lihat rencana', 'Terapkan sebagai budget'][gajiLangkah - 1];
  const body = document.getElementById('gajiBody');
  if (gajiLangkah === 1) {
    const terakhir = (globalData.transactions || []).filter(t => t.jenis === 'Pemasukan' && t.kategori === 'Gaji').sort((a, b) => String(b.tanggal).localeCompare(String(a.tanggal)))[0];
    const saran = terakhir && Number(terakhir.jumlah) !== gajiNilai ? Number(terakhir.jumlah) : 0;
    body.innerHTML = `
      <p class="gj-q">Berapa gaji yang kamu terima?</p>
      <div class="bf-amount"><span>Rp</span><input type="text" inputmode="numeric" id="gajiInput" placeholder="0" value="${gajiNilai ? formatRupiahInput(gajiNilai) : ''}" oninput="this.value = formatRupiahInput(this.value); gajiNilai = gajiAngka(this.value)"></div>
      ${saran ? `<button type="button" class="gj-chip" onclick="gajiNilai = ${saran}; gajiGambar()">Pakai gaji terakhir tercatat · ${format(saran)}</button>` : ''}
      <p class="bf-hint" style="margin-top: 22px;">Budggt. membagi gajimu ke kebutuhan pokok, saving, dana darurat, dan uang bebas dengan rumus 50/30/15/5. Persennya bisa kamu ubah di langkah berikutnya.</p>`;
    setTimeout(() => { const el = document.getElementById('gajiInput'); if (el && !gajiNilai) el.focus(); }, 50);
  } else if (gajiLangkah === 2) gajiLangkah2(body);
  else gajiLangkah3(body);
}

function gajiBar() { const tot = gajiTotalPct(); return `<div class="gj-bar">${GAJI_BUCKET.map(b => `<i style="width: ${tot ? (gajiPct[b.id] || 0) / Math.max(tot, 100) * 100 : 0}%; background: ${b.warna};"></i>`).join('')}</div>`; }

function gajiLangkah2(body) {
  body.innerHTML = `
    <p class="gj-q">Atur pembagiannya</p>
    <p class="bf-hint" style="margin-bottom: 4px;">Gaji ${format(gajiNilai)}. Ketuk tanda + atau − untuk menggeser persen.</p>
    <div id="gajiBar2">${gajiBar()}</div>
    <p id="gajiTotal" class="gj-total"></p>
    ${GAJI_BUCKET.map(b => `
      <div class="gj-bk">
        <span class="gj-dot" style="background: ${b.warna};"></span>
        <div class="gj-nm"><b>${b.nama}</b><small>${b.sub}</small></div>
        <div class="gj-side">
          <strong id="gja-${b.id}"></strong>
          <div class="gj-step"><button type="button" onclick="gajiGeser('${b.id}', -5)" aria-label="Kurangi">&minus;</button><span id="gjp-${b.id}"></span><button type="button" onclick="gajiGeser('${b.id}', 5)" aria-label="Tambah">+</button></div>
        </div>
      </div>`).join('')}`;
  gajiSegar2();
}

function gajiGeser(id, d) { gajiPct[id] = Math.min(100, Math.max(0, (gajiPct[id] || 0) + d)); gajiSegar2(); }

function gajiSegar2() {
  const a = gajiAmt(), tot = gajiTotalPct(), ok = tot === 100;
  GAJI_BUCKET.forEach(b => { document.getElementById('gja-' + b.id).textContent = format(a[b.id]); document.getElementById('gjp-' + b.id).textContent = (gajiPct[b.id] || 0) + '%'; });
  document.getElementById('gajiBar2').innerHTML = gajiBar();
  const tl = document.getElementById('gajiTotal');
  tl.textContent = ok ? 'Total 100%' : tot < 100 ? `Kurang ${100 - tot}% belum dibagi` : `Lebih ${tot - 100}% dari gaji`;
  tl.className = 'gj-total' + (ok ? ' gj-ok' : ' gj-warn');
  document.getElementById('gajiLanjut').disabled = !ok;
}

// tentukan isi kategori kebutuhan (sekali per kali masuk langkah 3)
function gajiBagiKebutuhan(pool) {
  const h = gajiRiwayat(), last = gajiSimpan().share || {}, w = {};
  Object.keys(GAJI_KEBUTUHAN).forEach(c => { w[c] = h.cat[c] || 0; });
  const sw = Object.values(w).reduce((a, b) => a + b, 0);
  Object.keys(GAJI_KEBUTUHAN).forEach(c => {
    let share = sw > 0 ? w[c] / sw : GAJI_KEBUTUHAN[c];
    if (last[c] != null) share = (share + last[c]) / 2; // belajar dari pembagian terakhir
    w[c] = share;
  });
  gajiKat = Object.keys(w).map(c => ({ nama: c, jumlah: gajiBulat(pool * w[c]) }));
  gajiInfo = sw > 0 ? `Porsi makanan dan transport mengikuti rata-rata ${h.n} bulan terakhir${Object.keys(last).length ? ' dan pembagian terakhirmu' : ''}.` : 'Belum ada riwayat pengeluaran lengkap, jadi memakai porsi standar. Makin lama dipakai, makin sesuai kebiasaanmu.';
}

function gajiLangkah3(body) {
  const a = gajiAmt(), tagihan = (globalData.bills || []).map(b => ({ nama: b.nama, jumlah: Number(b.jumlah) || 0, tgl: b.tanggal }));
  const totT = tagihan.reduce((s, b) => s + b.jumlah, 0), pool = Math.max(0, a.need - totT);
  if (!gajiKat.length) gajiBagiKebutuhan(pool);
  gajiLangkah3.pool = pool; gajiLangkah3.amt = a;
  const goals = (globalData.goals || []).map(x => ({ nama: x.nama, sisa: Math.max(0, (Number(x.target) || 0) - (Number(x.terkumpul) || 0)) })).filter(x => x.sisa > 0);
  const sumSisa = goals.reduce((s, x) => s + x.sisa, 0);
  const baris = (nama, kanan, sub) => `<div class="gj-row"><span>${nama}${sub ? `<small>${sub}</small>` : ''}</span>${kanan}</div>`;
  const kartu = (b, isi) => `<div class="gj-card"><div class="gj-ch"><span class="gj-dot" style="background: ${b.warna};"></span><b>${b.nama}</b><span class="gj-pc">${gajiPct[b.id]}%</span><strong>${format(a[b.id])}</strong></div>${isi}</div>`;
  const B = Object.fromEntries(GAJI_BUCKET.map(b => [b.id, b]));
  let need = tagihan.length ? `<details class="gj-det"><summary>${baris(`Tagihan tetap (${tagihan.length})`, `<strong>${format(totT)}</strong>`)}</summary>${tagihan.map(b => baris(esc(b.nama), `<span>${format(b.jumlah)}</span>`, 'Tiap tgl ' + b.tgl)).join('')}</details>` : `<p class="bf-hint">Belum ada tagihan. Tambahkan di menu Tagihan supaya ikut dihitung.</p>`;
  need += gajiKat.map((k, i) => baris(esc(k.nama), `<input class="gj-in" inputmode="numeric" value="${formatRupiahInput(k.jumlah)}" oninput="this.value = formatRupiahInput(this.value); gajiUbahKat(${i}, this.value)">`)).join('');
  need += `<div class="gj-row gj-sisa"><span>Belum dibagi</span><strong id="gajiSisaKat"></strong></div>`;
  if (totT > a.need) need += `<p class="bf-hint gj-warn">Total tagihan (${format(totT)}) melebihi jatah kebutuhan pokok. Kembali dan naikkan persen kebutuhan.</p>`;
  else need += `<p class="bf-hint">${gajiInfo}</p>`;
  const save = goals.length ? goals.map(x => baris(esc(x.nama), `<span>${format(gajiBulat(a.save * x.sisa / sumSisa))}</span>`, 'Sesuai sisa target')).join('') : `<p class="bf-hint">Belum ada savings goal. Buat di menu Dompet supaya saving punya tujuan.</p>`;
  body.innerHTML = `
    <p class="gj-q">Rencana bulan ini</p>
    <p class="bf-hint" style="margin-bottom: 4px;">Dari gaji ${format(gajiNilai)}, uangmu dibagi seperti ini.</p>
    ${gajiBar()}
    ${kartu(B.need, need)}
    ${kartu(B.save, save)}
    ${kartu(B.dar, `<p class="bf-hint">Umumnya dikumpulkan sampai 3 sampai 6 kali pengeluaran bulanan, lalu persennya bisa dialihkan ke saving.</p>`)}
    ${kartu(B.free, `<p class="bf-hint">Dibuat sebagai satu budget untuk ${GAJI_BEBAS_CATS.join(', ')}.</p>`)}
    <p class="bf-hint" style="margin-top: 14px;">Terapkan membuat atau memperbarui budget bulanan untuk kebutuhan pokok (per kategori) dan bebas. Tagihan, saving, dan dana darurat hanya panduan.</p>`;
  gajiSisaKat();
}

function gajiSisaKat() {
  const s = gajiLangkah3.pool - gajiKat.reduce((a, k) => a + k.jumlah, 0), el = document.getElementById('gajiSisaKat');
  if (!el) return;
  el.textContent = (s < 0 ? '-' : '') + format(Math.abs(s)); el.className = s < 0 ? 'gj-warn' : '';
}
function gajiUbahKat(i, v) { gajiKat[i].jumlah = gajiAngka(v); gajiSisaKat(); }

function gajiTerapkan() {
  const amt = gajiLangkah3.amt, list = (globalData.budgets = globalData.budgets || []), share = {};
  const kumpul = gajiKat.filter(k => k.jumlah > 0).map(k => ({ id: 'gaji_' + k.nama.toLowerCase().replace(/\W+/g, '_'), nama: 'Gaji · ' + k.nama, batas: k.jumlah, cats: [k.nama] }));
  if (amt.free > 0) kumpul.push({ id: 'gaji_bebas', nama: 'Gaji · Bebas', batas: amt.free, cats: GAJI_BEBAS_CATS.slice() });
  if (!kumpul.length) { alert('Belum ada budget untuk diterapkan'); return; }
  kumpul.forEach(b => {
    const item = Object.assign({ periode: 'bulanan', alert: 80 }, b), i = list.findIndex(x => x.id === item.id);
    if (i > -1) list[i] = item; else list.push(item);
    google.script.run.withFailureHandler(err => alert('Gagal simpan budget: ' + err.message)).setBudget(item);
  });
  const sk = gajiKat.reduce((a, k) => a + k.jumlah, 0);
  gajiKat.forEach(k => { share[k.nama] = sk ? k.jumlah / sk : 0; });
  try { localStorage.setItem(GAJI_KEY, JSON.stringify({ gaji: gajiNilai, pct: gajiPct, share })); } catch (e) {}
  localStorage.setItem('budggt_local_cache', JSON.stringify(globalData));
  renderBudgets();
  openPage('budgets');
  showToast(kumpul.length + ' budget diterapkan', 1);
}
