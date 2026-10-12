// ===== BAGI GAJI =====
// Input gaji -> app membagi otomatis: tagihan tetap dulu, lalu kategori & tabungan sesuai kebiasaanmu.
// Belajar dari: (1) rata-rata 3 bulan terakhir yang sudah lewat, (2) pembagian terakhir yang kamu terapkan (disimpan di budggt_gaji).
// Terapkan = membuat/memperbarui budget bulanan "Gaji · <kategori>" lewat jalur yang sama dengan form Budget.
// File ini hanya memakai fungsi script.js saat berjalan (globalData, netral, format, esc, renderBudgets, showToast, toggleModal).
// ponytail: ratio = rata-rata pengeluaran kategori / rata-rata pemasukan; belum memisah bulan "tidak biasa" (outlier).
const GAJI_KEY = 'budggt_gaji';
const GAJI_DEFAULT = { Makanan: 0.25, Transport: 0.10, Belanja: 0.10, Hiburan: 0.05 }; // dipakai kalau belum ada riwayat
const GAJI_TAB_DEFAULT = 0.20;
const GAJI_MAKS_KAT = 6;
let gajiRows = [], gajiTotal = 0, gajiInfo = '';

const gajiSimpan = () => { try { return JSON.parse(localStorage.getItem(GAJI_KEY) || '{}'); } catch (e) { return {}; } };
const gajiAngka = v => Number(String(v).replace(/\D/g, '')) || 0;

// rata-rata per bulan dari bulan-bulan lengkap terakhir (maks 3) yang punya pengeluaran
function gajiRiwayat() {
  const now = currentMonthKey(), per = {};
  (globalData.transactions || []).forEach(t => {
    const k = String(t.tanggal).slice(0, 7); if (k >= now) return;
    (per[k] = per[k] || { cat: {}, masuk: 0, tab: 0, keluar: 0 });
    const j = Number(t.jumlah) || 0;
    if (t.kategori === KAT_SETOR) per[k].tab += j;
    else if (netral(t)) return;
    else if (t.jenis === 'Pemasukan') per[k].masuk += j;
    else { per[k].cat[t.kategori] = (per[k].cat[t.kategori] || 0) + j; per[k].keluar += j; }
  });
  const keys = Object.keys(per).filter(k => per[k].keluar > 0).sort().slice(-3);
  const n = keys.length, r = { n, cat: {}, masuk: 0, tab: 0, keluar: 0 };
  keys.forEach(k => { r.masuk += per[k].masuk / n; r.tab += per[k].tab / n; r.keluar += per[k].keluar / n; for (const c in per[k].cat) r.cat[c] = (r.cat[c] || 0) + per[k].cat[c] / n; });
  return r;
}

function gajiHitung(gaji) {
  const h = gajiRiwayat(), last = gajiSimpan().pct || {};
  const tagihan = (globalData.bills || []).map(b => ({ tipe: 'tagihan', nama: b.nama, kat: b.kategori, jumlah: Number(b.jumlah) || 0, tgl: b.tanggal }));
  const totTagihan = tagihan.reduce((s, b) => s + b.jumlah, 0);
  // bagian kategori yang sudah tercakup tagihan (mis. Netflix di Hiburan) tidak dihitung dua kali
  const sudah = {}; tagihan.forEach(b => { sudah[b.kat] = (sudah[b.kat] || 0) + b.jumlah; });
  let rasio = {}, tabR;
  if (h.n) {
    const dasar = h.masuk > 0 ? h.masuk : h.keluar / 0.7;
    for (const c in h.cat) { const sisa = Math.max(0, h.cat[c] - (sudah[c] || 0)); if (sisa > 0) rasio[c] = sisa / dasar; }
    tabR = h.tab > 0 ? h.tab / dasar : GAJI_TAB_DEFAULT;
  } else { rasio = Object.assign({}, GAJI_DEFAULT); tabR = GAJI_TAB_DEFAULT; }
  // belajar dari pembagian terakhir: rata-rata riwayat dan pilihanmu
  for (const c in rasio) if (last[c] != null) rasio[c] = (rasio[c] + last[c]) / 2;
  if (last.__tab != null) tabR = (tabR + last.__tab) / 2;
  // ambil kategori terbesar, sisanya digabung "Lainnya"
  let cats = Object.keys(rasio).sort((a, b) => rasio[b] - rasio[a]);
  const gabung = {}; // nama baris -> kategori yang dicakup
  cats.forEach(c => { gabung[c] = [c]; });
  if (cats.length > GAJI_MAKS_KAT) {
    const kept = cats.slice(0, GAJI_MAKS_KAT - 1), grup = cats.slice(GAJI_MAKS_KAT - 1).concat(kept.filter(c => c === 'Lainnya'));
    cats = kept.filter(c => c !== 'Lainnya').concat('Lainnya');
    rasio.Lainnya = grup.reduce((s, c) => s + rasio[c], 0);
    gabung.Lainnya = grup;
  }
  const sisaGaji = Math.max(0, gaji - totTagihan);
  let tab = Math.round(gaji * tabR / 1000) * 1000;
  tab = Math.min(tab, sisaGaji);
  const ruang = sisaGaji - tab; // untuk kategori
  let want = cats.map(c => gaji * rasio[c]), sum = want.reduce((a, b) => a + b, 0);
  const skala = sum > ruang ? ruang / sum : 1; // kalau kebutuhan melebihi gaji, kecilkan merata
  gajiRows = tagihan.map(b => Object.assign({}, b)).concat(cats.map((c, i) => ({ tipe: 'kat', nama: c, cats: gabung[c], jumlah: Math.round(want[i] * skala / 1000) * 1000 })), [{ tipe: 'tab', nama: 'Tabungan', jumlah: tab }]);
  gajiTotal = gaji;
  gajiInfo = h.n ? `Berdasarkan rata-rata ${h.n} bulan terakhir${last.__tab != null ? ' dan pembagian terakhir yang kamu terapkan' : ''}.` : 'Belum ada riwayat lengkap, jadi memakai pembagian standar. Makin lama dipakai, makin sesuai kebiasaanmu.';
  if (totTagihan > gaji) gajiInfo += ' Perhatian: total tagihan melebihi gaji.';
}

function gajiSisa() { return gajiTotal - gajiRows.reduce((s, r) => s + r.jumlah, 0); }

function openGaji() {
  if (!document.getElementById('modalGaji')) {
    const m = document.createElement('div');
    m.id = 'modalGaji'; m.className = 'modal hidden';
    m.innerHTML = `<div class="modal-content" style="max-height: 90vh; overflow-y: auto;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
        <h3 style="font-size: 1.15rem; font-weight: 600;">Bagi Gaji</h3>
        <button onclick="toggleModal('modalGaji')" style="background:none; border:none; font-size: 1.4rem; color: #94a3b8; cursor: pointer;">&times;</button>
      </div>
      <p style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 12px;">Masukkan gajimu, Budggt. membaginya sesuai kebiasaanmu</p>
      <div style="display: flex; gap: 8px;">
        <input id="gajiInput" class="input-field" inputmode="numeric" placeholder="Gaji bulan ini (Rp)" style="flex: 1;" oninput="this.value = formatRupiahInput(this.value)">
        <button type="button" class="btn-save" onclick="gajiMulai()" style="width: auto; padding: 0 18px;">Bagi</button>
      </div>
      <div id="gajiBox"></div>
    </div>`;
    document.body.appendChild(m);
  }
  const s = gajiSimpan();
  document.getElementById('gajiInput').value = s.gaji ? formatRupiahInput(s.gaji) : '';
  document.getElementById('gajiBox').innerHTML = '';
  toggleModal('modalGaji');
}

function gajiMulai() {
  const g = gajiAngka(document.getElementById('gajiInput').value);
  if (g <= 0) { alert('Isi gaji lebih dari 0'); return; }
  gajiHitung(g); gajiGambar();
}

function gajiGambar() {
  const baris = (r, i) => {
    const pct = gajiTotal ? Math.round(r.jumlah / gajiTotal * 100) : 0;
    const kiri = r.tipe === 'tagihan' ? `<i class="fa fa-file-invoice" style="color: var(--text-muted);"></i> ${esc(r.nama)}<span style="color: var(--text-muted); font-size: 0.7rem;"> · Tiap tgl ${r.tgl}</span>` : r.tipe === 'tab' ? `<i class="fa fa-piggy-bank" style="color: var(--text-muted);"></i> Tabungan` : `<i class="fa fa-tag" style="color: var(--text-muted);"></i> ${esc(r.nama)}`;
    const kanan = r.tipe === 'tagihan' ? `<strong style="font-size: 0.85rem;">${format(r.jumlah)}</strong>` : `<input class="input-field" inputmode="numeric" value="${formatRupiahInput(r.jumlah)}" style="width: 120px; padding: 6px 10px; text-align: right;" oninput="this.value = formatRupiahInput(this.value); gajiUbah(${i}, this.value)">`;
    return `<div style="display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 10px 0; border-bottom: 1px solid var(--border-color); font-size: 0.85rem;"><span>${kiri}</span><span style="display: flex; align-items: center; gap: 8px;">${kanan}<span id="gajiPct${i}" style="color: var(--text-muted); font-size: 0.7rem; width: 30px; text-align: right;">${pct}%</span></span></div>`;
  };
  const urut = ['tagihan', 'kat', 'tab'], lbl = { tagihan: 'Tagihan tetap', kat: 'Budget per kategori', tab: 'Tabungan' };
  let h = `<p style="font-size: 0.75rem; color: var(--text-muted); margin: 14px 0 4px;">${gajiInfo}</p>`;
  urut.forEach(tp => {
    const items = gajiRows.map((r, i) => [r, i]).filter(([r]) => r.tipe === tp);
    if (!items.length) return;
    h += `<p style="font-size: 0.7rem; font-weight: 600; color: var(--text-muted); margin: 14px 0 0;">${lbl[tp]}</p>` + items.map(([r, i]) => baris(r, i)).join('');
  });
  h += `<div style="display: flex; justify-content: space-between; margin: 14px 0; font-size: 0.85rem; font-weight: 600;"><span id="gajiSisaLbl">${gajiSisa() >= 0 ? 'Sisa belum dibagi' : 'Kelebihan'}</span><span id="gajiSisa">${format(Math.abs(gajiSisa()))}</span></div>
    <button type="button" class="btn-save" onclick="gajiTerapkan()">Terapkan sebagai budget</button>
    <p style="font-size: 0.7rem; color: var(--text-muted); margin-top: 8px;">Budget bulanan per kategori dibuat atau diperbarui. Tagihan dan tabungan hanya panduan, tidak dibuat otomatis.</p>`;
  document.getElementById('gajiBox').innerHTML = h;
}

function gajiUbah(i, v) {
  gajiRows[i].jumlah = gajiAngka(v);
  const p = document.getElementById('gajiPct' + i); if (p) p.textContent = (gajiTotal ? Math.round(gajiRows[i].jumlah / gajiTotal * 100) : 0) + '%';
  const s = gajiSisa();
  document.getElementById('gajiSisa').textContent = format(Math.abs(s));
  document.getElementById('gajiSisaLbl').textContent = s >= 0 ? 'Sisa belum dibagi' : 'Kelebihan';
}

function gajiTerapkan() {
  const kat = gajiRows.filter(r => r.tipe === 'kat' && r.jumlah > 0);
  if (!kat.length) { alert('Belum ada budget kategori untuk diterapkan'); return; }
  const list = (globalData.budgets = globalData.budgets || []), pct = {};
  kat.forEach(r => {
    const item = { id: 'gaji_' + r.nama.toLowerCase().replace(/\W+/g, '_'), nama: 'Gaji · ' + r.nama, batas: r.jumlah, periode: 'bulanan', cats: r.cats || [r.nama], alert: 80 };
    const i = list.findIndex(x => x.id === item.id);
    if (i > -1) list[i] = item; else list.push(item);
    google.script.run.withFailureHandler(err => alert('Gagal simpan budget: ' + err.message)).setBudget(item);
    pct[r.nama] = r.jumlah / gajiTotal;
  });
  const tab = gajiRows.find(r => r.tipe === 'tab'); if (tab) pct.__tab = tab.jumlah / gajiTotal;
  try { localStorage.setItem(GAJI_KEY, JSON.stringify({ gaji: gajiTotal, pct })); } catch (e) {}
  localStorage.setItem('budggt_local_cache', JSON.stringify(globalData));
  renderBudgets();
  toggleModal('modalGaji');
  showToast(kat.length + ' budget diterapkan', 1);
}
