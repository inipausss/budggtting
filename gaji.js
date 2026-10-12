// ===== BAGI GAJI (halaman penuh #gaji) =====
// Rumus dasar: 50% kebutuhan pokok, 30% saving, 15% dana darurat, 5% bebas. Persennya bisa kamu ubah, dan pilihan terakhir diingat.
// Belajar dari kebiasaan: isi "kebutuhan pokok" dibagi ke Makanan & Transport sesuai rata-rata 3 bulan terakhir
// (dicampur dengan pembagian terakhir yang kamu terapkan); tagihan tetap diambil dari daftar Tagihan.
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
let gajiPct = {}, gajiKat = []; // gajiKat: [{nama, jumlah}] kategori kebutuhan (bisa diedit)

const gajiSimpan = () => { try { return JSON.parse(localStorage.getItem(GAJI_KEY) || '{}'); } catch (e) { return {}; } };
const gajiAngka = v => Number(String(v).replace(/\D/g, '')) || 0;
const gajiGaji = () => gajiAngka(document.getElementById('gajiInput').value);
const gajiBulat = n => Math.round(n / 1000) * 1000;

// rata-rata pengeluaran per kategori dari maks 3 bulan lengkap terakhir
function gajiRiwayat() {
  const now = currentMonthKey(), per = {};
  (globalData.transactions || []).forEach(t => {
    const k = String(t.tanggal).slice(0, 7);
    if (k >= now || netral(t) || t.jenis !== 'Pengeluaran') return;
    (per[k] = per[k] || {})[t.kategori] = ((per[k] || {})[t.kategori] || 0) + (Number(t.jumlah) || 0);
  });
  const keys = Object.keys(per).sort().slice(-3), r = { n: keys.length, cat: {} };
  keys.forEach(k => { for (const c in per[k]) r.cat[c] = (r.cat[c] || 0) + per[k][c] / keys.length; });
  return r;
}

function openGaji() {
  const s = gajiSimpan();
  GAJI_BUCKET.forEach(b => { gajiPct[b.id] = (s.pct && s.pct[b.id] != null) ? s.pct[b.id] : b.pct; });
  document.getElementById('gajiInput').value = s.gaji ? formatRupiahInput(s.gaji) : '';
  document.getElementById('gajiBuckets').innerHTML = GAJI_BUCKET.map(b => `
    <div class="gj-bk">
      <span class="gj-dot" style="background: ${b.warna};"></span>
      <div class="gj-nm"><b>${b.nama}</b><small>${b.sub}</small></div>
      <div class="gj-pct"><input type="number" inputmode="decimal" min="0" max="100" id="gjp-${b.id}" value="${gajiPct[b.id]}" oninput="gajiUbahPct('${b.id}', this.value)"><span>%</span></div>
      <span class="gj-amt" id="gja-${b.id}">Rp 0</span>
    </div>`).join('');
  openPage('gaji');
  gajiHitung(true);
}

function gajiUbahPct(id, v) { gajiPct[id] = Math.max(0, Number(v) || 0); gajiHitung(true); }

// hitung ulang bucket; resetKat = bagi ulang isi kategori kebutuhan
function gajiHitung(resetKat) {
  const g = gajiGaji(), tot = GAJI_BUCKET.reduce((s, b) => s + (gajiPct[b.id] || 0), 0);
  const amt = {}; GAJI_BUCKET.forEach(b => { amt[b.id] = gajiBulat(g * (gajiPct[b.id] || 0) / 100); document.getElementById('gja-' + b.id).textContent = format(amt[b.id]); });
  document.getElementById('gajiBar').innerHTML = GAJI_BUCKET.map(b => `<i style="width: ${tot ? (gajiPct[b.id] || 0) / Math.max(tot, 100) * 100 : 0}%; background: ${b.warna};"></i>`).join('');
  const tl = document.getElementById('gajiTotal');
  tl.textContent = tot === 100 ? 'Total 100%' : `Total ${+tot.toFixed(1)}% (harus 100%)`;
  tl.className = 'gj-total' + (tot === 100 ? '' : ' gj-warn');
  gajiRinci(g, amt, resetKat);
}

function gajiRinci(g, amt, resetKat) {
  const tagihan = (globalData.bills || []).map(b => ({ nama: b.nama, jumlah: Number(b.jumlah) || 0, tgl: b.tanggal }));
  const totT = tagihan.reduce((s, b) => s + b.jumlah, 0), pool = Math.max(0, amt.need - totT);
  if (resetKat || !gajiKat.length) {
    const h = gajiRiwayat(), last = gajiSimpan().share || {}, w = {};
    Object.keys(GAJI_KEBUTUHAN).forEach(c => { w[c] = h.cat[c] || 0; });
    const sw = Object.values(w).reduce((a, b) => a + b, 0);
    Object.keys(GAJI_KEBUTUHAN).forEach(c => {
      let share = sw > 0 ? w[c] / sw : GAJI_KEBUTUHAN[c];
      if (last[c] != null) share = (share + last[c]) / 2; // belajar dari pembagian terakhir
      w[c] = share;
    });
    gajiKat = Object.keys(w).map(c => ({ nama: c, jumlah: gajiBulat(pool * w[c]) }));
    gajiRinci.info = sw > 0 ? `Porsi makanan dan transport mengikuti rata-rata ${h.n} bulan terakhir${Object.keys(last).length ? ' dan pembagian terakhirmu' : ''}.` : 'Belum ada riwayat pengeluaran lengkap, jadi memakai porsi standar. Makin lama dipakai, makin sesuai kebiasaanmu.';
  }
  const goals = (globalData.goals || []).map(x => ({ nama: x.nama, sisa: Math.max(0, (Number(x.target) || 0) - (Number(x.terkumpul) || 0)) })).filter(x => x.sisa > 0);
  const sumSisa = goals.reduce((s, x) => s + x.sisa, 0);
  const baris = (nama, kanan, sub) => `<div class="gj-row"><span>${nama}${sub ? `<small>${sub}</small>` : ''}</span>${kanan}</div>`;
  let h = '';
  h += `<h3 class="gj-h"><span class="gj-dot" style="background: #3b82f6;"></span> Kebutuhan pokok <b>${format(amt.need)}</b></h3>`;
  h += tagihan.length ? tagihan.map(b => baris(esc(b.nama), `<strong>${format(b.jumlah)}</strong>`, 'Tiap tgl ' + b.tgl)).join('') : `<p class="bf-hint">Belum ada tagihan. Tambahkan di menu Tagihan supaya ikut dihitung.</p>`;
  h += gajiKat.map((k, i) => baris(esc(k.nama), `<input class="gj-in" inputmode="numeric" value="${formatRupiahInput(k.jumlah)}" oninput="this.value = formatRupiahInput(this.value); gajiUbahKat(${i}, this.value)">`)).join('');
  h += `<div class="gj-row gj-sisa"><span>Belum dibagi</span><strong id="gajiSisaKat">${format(0)}</strong></div>`;
  if (totT > amt.need && g > 0) h += `<p class="bf-hint gj-warn">Total tagihan (${format(totT)}) melebihi jatah kebutuhan pokok. Naikkan persen kebutuhan atau kurangi persen lainnya.</p>`;
  h += `<p class="bf-hint">${gajiRinci.info || ''}</p>`;
  h += `<h3 class="gj-h"><span class="gj-dot" style="background: #22c55e;"></span> Saving <b>${format(amt.save)}</b></h3>`;
  h += goals.length ? goals.map(x => baris(esc(x.nama), `<strong>${format(gajiBulat(amt.save * x.sisa / sumSisa))}</strong>`, 'Sesuai sisa target')).join('') : `<p class="bf-hint">Belum ada savings goal. Buat di menu Dompet supaya saving punya tujuan.</p>`;
  h += `<h3 class="gj-h"><span class="gj-dot" style="background: #f97316;"></span> Dana darurat <b>${format(amt.dar)}</b></h3>`;
  h += `<p class="bf-hint">Umumnya dikumpulkan sampai 3 sampai 6 kali pengeluaran bulanan, lalu persennya bisa dialihkan ke saving.</p>`;
  h += `<h3 class="gj-h"><span class="gj-dot" style="background: #a855f7;"></span> Bebas dipakai <b>${format(amt.free)}</b></h3>`;
  h += `<p class="bf-hint">Dibuat sebagai satu budget untuk ${GAJI_BEBAS_CATS.join(', ')}.</p>`;
  document.getElementById('gajiRinci').innerHTML = h;
  gajiSisaKat(pool);
  gajiRinci.pool = pool; gajiRinci.amt = amt;
}

function gajiSisaKat(pool) {
  const s = (pool != null ? pool : gajiRinci.pool) - gajiKat.reduce((a, k) => a + k.jumlah, 0), el = document.getElementById('gajiSisaKat');
  el.textContent = (s < 0 ? '-' : '') + format(Math.abs(s)); el.className = s < 0 ? 'gj-warn' : '';
}
function gajiUbahKat(i, v) { gajiKat[i].jumlah = gajiAngka(v); gajiSisaKat(); }

function gajiTerapkan() {
  const g = gajiGaji(), tot = GAJI_BUCKET.reduce((s, b) => s + (gajiPct[b.id] || 0), 0);
  if (g <= 0) { alert('Isi gaji lebih dari 0'); return; }
  if (tot !== 100) { alert('Total persen harus 100'); return; }
  const amt = gajiRinci.amt, list = (globalData.budgets = globalData.budgets || []), share = {};
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
  try { localStorage.setItem(GAJI_KEY, JSON.stringify({ gaji: g, pct: gajiPct, share })); } catch (e) {}
  localStorage.setItem('budggt_local_cache', JSON.stringify(globalData));
  renderBudgets();
  openPage('budgets');
  showToast(kumpul.length + ' budget diterapkan', 1);
}
