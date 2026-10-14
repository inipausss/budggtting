// ===== BAGI GAJI (halaman penuh #gaji, 5 langkah) =====
// 1 Gaji -> 2 Pertanyaan singkat (boleh dilewati) -> 3 Review bulan lalu + saran alokasi -> 4 Atur persen -> 5 Rencana & Terapkan.
// Saran dihitung lokal dari transaksi & budget (tanpa AI, tanpa internet): jebol berulang dibedakan dari kejadian sekali,
// kebutuhan pokok dihitung dari kebiasaan nyata, dan kekurangannya ditutup dari Bebas / Dana darurat dulu (Saving dijaga).
// Jawaban pertanyaan yang dipakai terakhir (target saving, gaya) diingat sebagai default bulan depan.
// Markup di index.html (#gaji), gaya dasar di style.css (.gj-*), gaya tambahan langkah baru disuntik dari file ini.
// ponytail: kategori "kebutuhan" tetap Makanan & Transport; kategori lain ikut kelompok "bebas". Perlu daftar yang bisa diatur kalau kurang.
// ponytail: batas budget lama dianggap berlaku di 3 bulan terakhir (riwayat perubahan budget tidak disimpan).
const GAJI_KEY = 'budggt_gaji';
const GAJI_BUCKET = [
  { id: 'need', nama: 'Kebutuhan pokok', sub: 'Tagihan, makanan, transportasi', pct: 50, warna: '#3b82f6' },
  { id: 'save', nama: 'Saving', sub: 'Tabungan & tujuan keuangan', pct: 30, warna: '#22c55e' },
  { id: 'dar', nama: 'Dana darurat', sub: 'Cadangan untuk hal tak terduga', pct: 15, warna: '#f97316' },
  { id: 'free', nama: 'Bebas dipakai', sub: 'Untuk apa saja', pct: 5, warna: '#a855f7' }
];
const GAJI_KEBUTUHAN = { Makanan: 0.6, Transport: 0.4 }; // bobot awal kalau belum ada riwayat
const GAJI_BEBAS_CATS = ['Hiburan', 'Belanja', 'Lainnya'];
const GAJI_MODE = { santai: { nama: 'Santai', f: 1.05 }, normal: { nama: 'Normal', f: 1 }, ketat: { nama: 'Ketat', f: 0.93 } }; // f = pengali kebiasaan nyata
const GAJI_TOMBOL = ['Lanjut', 'Lanjut', 'Pakai saran', 'Lihat rencana', 'Terapkan sebagai budget'];
let gajiPct = {}, gajiDasar = {}, gajiKat = [], gajiLangkah = 1, gajiInfo = '', gajiNilai = 0; // gajiKat: [{nama, jumlah}] isi kebutuhan pokok (bisa diedit)
let gajiLain = 0, gajiTabung = 0, gajiBesar = 0, gajiMode = 'normal'; // jawaban langkah 2

const gajiSimpan = () => { try { return JSON.parse(localStorage.getItem(GAJI_KEY) || '{}'); } catch (e) { return {}; } };
const gajiAngka = v => Number(String(v).replace(/\D/g, '')) || 0;
const gajiBulat = n => Math.round(n / 1000) * 1000;
const gajiBulat10 = n => Math.round(n / 10000) * 10000;
// terjemah teks berpola {0},{1} yang disusun di kode (hasilnya masuk DOM sudah jadi, jadi tidak lewat penerjemah DOM)
const gT = (k, ...a) => t(k).replace(/\{(\d)\}/g, (_, i) => a[i]);
const gajiTotal = () => gajiNilai + gajiLain;

// gaya tambahan untuk langkah baru (pertanyaan, review, saran)
(function () {
  const s = document.createElement('style');
  s.textContent = `
    .gj-mode { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; padding: 4px; background: var(--circle-bg); border-radius: 16px; }
    .gj-mode button { padding: 11px 0; border: none; background: none; border-radius: 12px; font-size: 0.85rem; font-weight: 500; color: var(--text-muted); cursor: pointer; }
    .gj-mode button.on { background: color-mix(in srgb, var(--primary) 18%, var(--card-bg)); color: var(--text-main); font-weight: 600; box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--primary) 50%, transparent); }
    .gj-skip { display: block; width: 100%; margin-top: 22px; padding: 12px; background: none; border: none; color: var(--text-muted); font-size: 0.85rem; text-decoration: underline; cursor: pointer; }
    .gj-tiles { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin: 16px 0 6px; }
    .gj-tiles div { background: var(--card-bg); border: 1px solid var(--border-color); border-radius: 16px; padding: 12px 10px; min-width: 0; }
    .gj-tiles small { display: block; font-size: 0.7rem; color: var(--text-muted); margin-bottom: 4px; }
    .gj-tiles b { display: block; font-size: 0.85rem; font-weight: 600; white-space: nowrap; font-variant-numeric: tabular-nums; }
    .gj-sec { font-size: 0.8rem; font-weight: 600; color: var(--text-muted); margin: 22px 0 8px; }
    .gj-rv { padding: 14px 16px; margin-bottom: 10px; background: var(--card-bg); border: 1px solid var(--border-color); border-radius: 18px; }
    .gj-rh { display: flex; justify-content: space-between; align-items: center; gap: 10px; font-size: 0.9rem; }
    .gj-rh span { font-size: 0.75rem; font-weight: 600; white-space: nowrap; }
    .gj-rb { font-size: 0.78rem; color: var(--text-muted); margin-top: 4px; font-variant-numeric: tabular-nums; }
    .gj-rv .bf-hint { margin-top: 8px; line-height: 1.45; }
    .gj-why { margin: 12px 0 0; padding: 0; list-style: none; }
    .gj-why li { position: relative; padding: 0 0 8px 16px; font-size: 0.8rem; line-height: 1.45; color: var(--text-muted); }
    .gj-why li::before { content: ""; position: absolute; left: 2px; top: 7px; width: 6px; height: 6px; border-radius: 50%; background: var(--primary); }
    .gj-why li.w::before { background: var(--neg); }
    .gj-lbl { display: block; font-size: 0.85rem; color: var(--text-muted); margin: 20px 0 8px; }
    .gj-lbl small { display: block; font-size: 0.72rem; margin-top: 2px; opacity: 0.85; }
    #gajiBody .input-field { margin-bottom: 0; }
  `;
  document.head.appendChild(s);
})();

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

// ----- review bulan lalu: tiap budget dibandingkan dengan realisasinya di (maks) 3 bulan terakhir -----
const gajiBulanAda = key => (globalData.transactions || []).some(t => String(t.tanggal).slice(0, 7) === key && !netral(t));
function gajiKeys() { // bulan lalu mundur, hanya bulan yang ada catatannya, berurutan tanpa celah
  const out = []; let k = prevKey(currentMonthKey());
  while (out.length < 3 && gajiBulanAda(k)) { out.push(k); k = prevKey(k); }
  return out;
}
function gajiTrxBudget(b, key) {
  const cats = new Set(b.cats.map(c => c.trim().toLowerCase()));
  return (globalData.transactions || []).filter(t => !netral(t) && t.jenis === 'Pengeluaran' &&
    String(t.tanggal).slice(0, 7) === key && cats.has((t.kategori || '').trim().toLowerCase()));
}
const gajiJumlah = list => list.reduce((s, t) => s + (Number(t.jumlah) || 0), 0);
const gajiBatas = (b, key) => b.periode === 'mingguan' ? b.batas * daysIn(key) / 7 : b.batas;

function gajiReview() {
  const keys = gajiKeys();
  if (!keys.length) return null;
  const f = GAJI_MODE[gajiMode].f;
  const items = budgetList().map(b => {
    const sp = keys.map(k => gajiJumlah(gajiTrxBudget(b, k)));
    const lim = keys.map(k => gajiBatas(b, k));
    let streak = 0;
    while (streak < keys.length && sp[streak] > lim[streak]) streak++;
    const over = sp[0] - lim[0];
    const besar = over > 0 ? Math.max(0, ...gajiTrxBudget(b, keys[0]).map(t => Number(t.jumlah) || 0)) : 0;
    const avg = sp.reduce((a, c) => a + c, 0) / sp.length;
    const status = streak >= 2 ? 'pola' : over > 0 ? 'sekali' : 'ok';
    return {
      b, status, streak, over, besar, avg, sp: sp[0], lim: lim[0],
      sebab: status === 'sekali' && sp[0] - besar <= lim[0], // tanpa satu transaksi terbesar, sebenarnya masih aman
      saran: status === 'pola' ? Math.max(10000, gajiBulat10(avg * f)) : 0
    };
  });
  const urut = { pola: 0, sekali: 1, ok: 2 };
  items.sort((a, c) => urut[a.status] - urut[c.status] || c.over - a.over);

  const covered = new Set();
  budgetList().forEach(b => b.cats.forEach(c => covered.add(c.trim().toLowerCase())));
  const lepas = catData(keys[0], 'Pengeluaran').list.find(c => !covered.has(c.nama.trim().toLowerCase()) && c.pct >= 15) || null;
  return { keys, lm: keys[0], tot: monthTotals(keys[0]), items, lepas };
}

// ----- saran alokasi: mulai dari pembagian dasar, lalu disesuaikan jawaban + kebiasaan nyata -----
function gajiSaran() {
  const total = gajiTotal(), b0 = gajiDasar, alasan = [], warn = [], mode = GAJI_MODE[gajiMode];
  let save = b0.save, dar = b0.dar, free = b0.free, need = b0.need;

  // target saving dari jawaban: sisa persen dibagi ulang mengikuti perbandingan dasar
  const tabungSet = gajiTabung > 0 && total > 0;
  if (tabungSet) {
    save = Math.min(70, Math.max(0, Math.round(gajiTabung / total * 100)));
    const rest = 100 - save, sb = (b0.need + b0.dar + b0.free) || 1;
    dar = Math.round(b0.dar / sb * rest); free = Math.round(b0.free / sb * rest); need = rest - dar - free;
    alasan.push('Saving ' + save + '% (' + format(gajiTabung) + ') sesuai target yang kamu isi.');
  }

  // kebutuhan pokok sesuai kebiasaan: tagihan + pengeluaran besar + makanan/transport biasanya
  const h = gajiRiwayat();
  const tagihan = billList().reduce((s, b) => s + (Number(b.jumlah) || 0), 0);
  const hist = Object.keys(GAJI_KEBUTUHAN).reduce((s, c) => s + (h.cat[c] || 0), 0);
  const butuh = tagihan + gajiBesar + (h.n > 0 ? hist * mode.f : 0);
  const need0 = need;
  if (total > 0 && butuh > 0) {
    const pct = Math.min(80, Math.ceil(butuh / total * 100 / 5) * 5);
    if (pct > need) {
      let kurang = pct - need;
      const awal = { free, dar, save }, sumber = [];
      const ambil = (nilai, min) => { const a = Math.min(kurang, Math.max(0, nilai - min)); kurang -= a; return nilai - a; };
      free = ambil(free, 5); dar = ambil(dar, 5);
      if (!tabungSet) save = ambil(save, 10); // saving yang kamu tentukan sendiri tidak dipotong
      need += (pct - need) - kurang;
      if (awal.free > free) sumber.push(gT('Bebas -{0}%', awal.free - free));
      if (awal.dar > dar) sumber.push(gT('Dana darurat -{0}%', awal.dar - dar));
      if (awal.save > save) sumber.push(gT('Saving -{0}%', awal.save - save));
      const rincian = [tagihan > 0 ? gT('tagihan {0}', format(tagihan)) : '', gajiBesar > 0 ? gT('pengeluaran besar {0}', format(gajiBesar)) : '',
        h.n > 0 && hist > 0 ? gT('makanan & transport biasanya {0}', format(Math.round(hist * mode.f))) : ''].filter(Boolean).join(' + ');
      alasan.push(gT('Kebutuhan pokok naik {0}% ke {1}% karena {2} per bulan', need0, need, rincian) + (mode.f !== 1 ? ' (' + gT('gaya {0}', t(mode.nama)) + ')' : '') + '.' +
        (sumber.length ? ' ' + gT('Ditutup dari {0}.', sumber.join(', ')) : ''));
      if (kurang > 0) warn.push('Masih kurang ' + kurang + '% dari yang dibutuhkan: pengeluaran rutinmu hampir sebesar gajimu. Pertimbangkan menambah pemasukan atau menunda pengeluaran besar.');
    }
  }

  // kelompok Bebas yang jebol berulang: jatahnya sengaja tidak dinaikkan
  const rv = gajiReview();
  if (rv) {
    const bebas = rv.items.filter(i => i.status === 'pola' && i.b.cats.some(c => GAJI_BEBAS_CATS.includes(c)) && !i.b.cats.some(c => c in GAJI_KEBUTUHAN));
    if (bebas.length) alasan.push(bebas.map(i => i.b.nama).join(', ') + ' jebol berulang, jadi jatah Bebas tidak dinaikkan. Coba ditahan bulan ini.');
    if (rv.tot.net < 0) alasan.push('Bulan lalu pengeluaranmu melebihi pemasukan sebesar ' + format(Math.abs(rv.tot.net)) + ', jadi Saving sebaiknya jangan dipangkas.');
  }
  if (!alasan.length) alasan.push('Pembagian ' + b0.need + '/' + b0.save + '/' + b0.dar + '/' + b0.free + ' masih cukup untuk kebutuhanmu.');
  return { pct: { need, save, dar, free }, alasan, warn };
}

const gajiTotalPct = () => GAJI_BUCKET.reduce((s, b) => s + (gajiPct[b.id] || 0), 0);
const gajiAmt = (p = gajiPct) => { const a = {}; GAJI_BUCKET.forEach(b => { a[b.id] = gajiBulat(gajiTotal() * (p[b.id] || 0) / 100); }); return a; };

function openGaji() {
  const s = gajiSimpan();
  GAJI_BUCKET.forEach(b => { gajiPct[b.id] = (s.pct && s.pct[b.id] != null) ? s.pct[b.id] : b.pct; });
  gajiDasar = Object.assign({}, gajiPct);
  gajiNilai = s.gaji || 0; gajiKat = [];
  gajiLain = 0; gajiBesar = 0; // sekali pakai; target saving & gaya diingat dari bulan lalu
  gajiTabung = s.tabung || 0; gajiMode = GAJI_MODE[s.mode] ? s.mode : 'normal';
  gajiLangkah = 1; gajiGambar();
  openPage('gaji');
}

function gajiKembali() { if (gajiLangkah > 1) { gajiLangkah--; gajiGambar(); window.scrollTo({ top: 0 }); } else openPage('dashboard'); }

function gajiLanjut() {
  if (gajiLangkah === 1) { if (gajiNilai <= 0) { alert('Isi gaji lebih dari 0'); return; } }
  else if (gajiLangkah === 3) gajiPct = Object.assign({}, gajiSaran().pct);
  else if (gajiLangkah === 4) { if (gajiTotalPct() !== 100) { alert('Total persen harus 100'); return; } gajiKat = []; }
  else if (gajiLangkah === 5) return gajiTerapkan();
  gajiLangkah++; gajiGambar(); window.scrollTo({ top: 0 });
}

// lewati pertanyaan: pakai jawaban terakhir (target saving & gaya), tanpa pemasukan lain / pengeluaran besar
function gajiLewati() {
  const s = gajiSimpan();
  gajiLain = 0; gajiBesar = 0; gajiTabung = s.tabung || 0; gajiMode = GAJI_MODE[s.mode] ? s.mode : 'normal';
  gajiLangkah = 3; gajiGambar(); window.scrollTo({ top: 0 });
}
function gajiSetMode(m) { gajiMode = m; gajiGambar(); }

function gajiGambar() {
  document.getElementById('gajiLangkah').innerHTML = [1, 2, 3, 4, 5].map(n => `<i class="${n < gajiLangkah ? 'done' : n === gajiLangkah ? 'on' : ''}"></i>`).join('');
  const btn = document.getElementById('gajiLanjut');
  btn.textContent = GAJI_TOMBOL[gajiLangkah - 1]; btn.disabled = false;
  const body = document.getElementById('gajiBody');
  if (gajiLangkah === 1) {
    const terakhir = (globalData.transactions || []).filter(t => t.jenis === 'Pemasukan' && t.kategori === 'Gaji').sort((a, b) => String(b.tanggal).localeCompare(String(a.tanggal)))[0];
    const saran = terakhir && Number(terakhir.jumlah) !== gajiNilai ? Number(terakhir.jumlah) : 0;
    body.innerHTML = `
      <p class="gj-q">Berapa gaji yang kamu terima?</p>
      <div class="bf-amount"><span>Rp</span><input type="text" inputmode="numeric" id="gajiInput" placeholder="0" value="${gajiNilai ? formatRupiahInput(gajiNilai) : ''}" oninput="this.value = formatRupiahInput(this.value); gajiNilai = gajiAngka(this.value)"></div>
      ${saran ? `<button type="button" class="gj-chip" onclick="gajiNilai = ${saran}; gajiGambar()">Pakai gaji terakhir tercatat · ${format(saran)}</button>` : ''}
      <p class="bf-hint" style="margin-top: 22px;">Budggt. membagi gajimu ke kebutuhan pokok, saving, dana darurat, dan uang bebas, lalu menyesuaikannya dengan kebiasaan dan bulan lalumu.</p>`;
    setTimeout(() => { const el = document.getElementById('gajiInput'); if (el && !gajiNilai) el.focus(); }, 50);
  } else if (gajiLangkah === 2) gajiTanya(body);
  else if (gajiLangkah === 3) gajiReviewView(body);
  else if (gajiLangkah === 4) gajiAtur(body);
  else gajiRencana(body);
}

// ----- langkah 2: pertanyaan singkat (semua opsional) -----
function gajiModeHtml() {
  return `<div class="gj-mode">${Object.keys(GAJI_MODE).map(k => `<button type="button" class="${gajiMode === k ? 'on' : ''}" onclick="gajiSetMode('${k}')">${GAJI_MODE[k].nama}</button>`).join('')}</div>`;
}

function gajiTanya(body) {
  const f = (id, val, set) => `<input type="text" inputmode="numeric" id="${id}" class="input-field" placeholder="Rp 0" value="${val ? formatRupiahInput(val) : ''}" oninput="this.value = formatRupiahInput(this.value); ${set} = gajiAngka(this.value)">`;
  body.innerHTML = `
    <p class="gj-q">Beberapa pertanyaan singkat</p>
    <p class="bf-hint">Semua boleh dikosongkan. Makin lengkap, makin pas sarannya.</p>
    <label class="gj-lbl">Ada pemasukan lain bulan ini?<small>Lembur, freelance, bonus, dll. Ditambahkan ke gaji.</small></label>
    ${f('gajiLainIn', gajiLain, 'gajiLain')}
    <label class="gj-lbl">Mau menabung berapa bulan ini?<small>Kosongkan kalau mau ikut pembagian standar.</small></label>
    ${f('gajiTabungIn', gajiTabung, 'gajiTabung')}
    <label class="gj-lbl">Ada pengeluaran besar yang sudah kamu tahu?<small>Servis motor, hajatan, bayar semester, dll.</small></label>
    ${f('gajiBesarIn', gajiBesar, 'gajiBesar')}
    <label class="gj-lbl">Mau gaya yang mana bulan ini?<small>Ketat = target pengeluaran sedikit di bawah kebiasaanmu. Santai = sedikit longgar.</small></label>
    ${gajiModeHtml()}
    <button type="button" class="gj-skip" onclick="gajiLewati()">Lewati, pakai jawaban bulan lalu</button>`;
}

// ----- langkah 3: review bulan lalu + saran -----
function gajiBarOf(p) { return `<div class="gj-bar">${GAJI_BUCKET.map(b => `<i style="width: ${p[b.id] || 0}%; background: ${b.warna};"></i>`).join('')}</div>`; }

function gajiReviewView(body) {
  const rv = gajiReview(), sr = gajiSaran(), a = gajiAmt(sr.pct);
  let review;
  if (!rv) {
    review = `<p class="bf-hint" style="margin-top: 14px;">Belum ada catatan bulan lalu, jadi belum ada yang bisa direview. Saran di bawah memakai pembagian standar dan jawabanmu.</p>`;
  } else {
    const warna = n => n >= 0 ? 'var(--pos)' : 'var(--neg)';
    const row = it => {
      const cls = it.status === 'pola' ? 'var(--neg)' : 'var(--warn)';
      const label = it.status === 'pola' ? 'Jebol ' + it.streak + ' bulan berturut' : 'Jebol bulan lalu';
      const ket = it.status === 'pola'
        ? `Rata-rata ${format(Math.round(it.avg))} per bulan, budget ${format(Math.round(it.lim))}. Budget ini sepertinya tidak realistis. Saran: ${format(it.saran)}.`
        : it.sebab ? `Jebol karena satu pengeluaran besar (${format(it.besar)}), bukan kebiasaan. Budget tidak perlu diubah.`
        : `Lebih ${format(Math.round(it.over))}, baru sekali. Dipantau dulu, belum dianggap pola.`;
      return `<div class="gj-rv"><div class="gj-rh"><b>${esc(it.b.nama)}</b><span style="color: ${cls};">${label}</span></div>
        <div class="gj-rb">${format(Math.round(it.sp))} / ${format(Math.round(it.lim))}</div><p class="bf-hint">${ket}</p></div>`;
    };
    const jebol = rv.items.filter(i => i.status !== 'ok'), aman = rv.items.length - jebol.length;
    review = `
      <div class="gj-tiles">
        <div><small>Masuk</small><b style="color: var(--pos);">${format(rv.tot.inc)}</b></div>
        <div><small>Keluar</small><b style="color: var(--neg);">${format(rv.tot.exp)}</b></div>
        <div><small>${rv.tot.net >= 0 ? 'Hemat' : 'Defisit'}</small><b style="color: ${warna(rv.tot.net)};">${format(Math.abs(rv.tot.net))}</b></div>
      </div>
      ${jebol.map(row).join('')}
      ${rv.items.length === 0 ? `<p class="bf-hint">Kamu belum punya budget, jadi bulan lalu belum bisa dinilai jebol atau tidak. Setelah rencana ini diterapkan, bulan depan reviewnya jauh lebih lengkap.</p>`
        : jebol.length === 0 ? `<p class="bf-hint" style="margin-top: 12px;">Semua budget aman bulan lalu 🎉</p>`
        : aman > 0 ? `<p class="bf-hint">${aman} budget lainnya aman bulan lalu.</p>` : ''}
      ${rv.lepas ? `<p class="bf-hint" style="margin-top: 8px;">${esc(rv.lepas.nama)} memakan ${Math.round(rv.lepas.pct)}% pengeluaranmu bulan lalu tapi belum punya budget.</p>` : ''}`;
  }
  body.innerHTML = `
    <p class="gj-q">Review bulan lalu</p>
    <p class="bf-hint">${rv ? monthLabel(rv.lm) + '. ' : ''}Gaji dan pemasukan ${format(gajiTotal())}.</p>
    ${review}
    <p class="gj-sec">Gaya bulan ini</p>
    ${gajiModeHtml()}
    <p class="gj-sec">Saran alokasi</p>
    ${gajiBarOf(sr.pct)}
    ${GAJI_BUCKET.map(b => `
      <div class="gj-row"><span style="display: flex; align-items: center; gap: 10px;"><span class="gj-dot" style="background: ${b.warna};"></span>${b.nama}</span>
        <span><b>${sr.pct[b.id]}%</b> &nbsp; ${format(a[b.id])}</span></div>`).join('')}
    <ul class="gj-why">${sr.alasan.map(t => `<li>${esc(t)}</li>`).join('')}${sr.warn.map(t => `<li class="w">${esc(t)}</li>`).join('')}</ul>
    <p class="bf-hint" style="margin-top: 8px;">Persen masih bisa kamu ubah di langkah berikutnya.</p>`;
}

// ----- langkah 4: atur persen -----
function gajiBar() { const tot = gajiTotalPct(); return `<div class="gj-bar">${GAJI_BUCKET.map(b => `<i style="width: ${tot ? (gajiPct[b.id] || 0) / Math.max(tot, 100) * 100 : 0}%; background: ${b.warna};"></i>`).join('')}</div>`; }

function gajiAtur(body) {
  body.innerHTML = `
    <p class="gj-q">Atur pembagiannya</p>
    <p class="bf-hint" style="margin-bottom: 4px;">Gaji ${format(gajiTotal())}. Ketuk tanda + atau − untuk menggeser persen.</p>
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

// ----- langkah 5: rencana -----
// tentukan isi kategori kebutuhan (sekali per kali masuk langkah 5)
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

function gajiRencana(body) {
  const a = gajiAmt(), tagihan = (globalData.bills || []).map(b => ({ nama: b.nama, jumlah: Number(b.jumlah) || 0, tgl: b.tanggal }));
  const totT = tagihan.reduce((s, b) => s + b.jumlah, 0), pool = Math.max(0, a.need - totT - gajiBesar);
  if (!gajiKat.length) gajiBagiKebutuhan(pool);
  gajiRencana.pool = pool; gajiRencana.amt = a;
  const goals = (globalData.goals || []).map(x => ({ nama: x.nama, sisa: Math.max(0, (Number(x.target) || 0) - (Number(x.terkumpul) || 0)) })).filter(x => x.sisa > 0);
  const sumSisa = goals.reduce((s, x) => s + x.sisa, 0);
  const baris = (nama, kanan, sub) => `<div class="gj-row"><span>${nama}${sub ? `<small>${sub}</small>` : ''}</span>${kanan}</div>`;
  const kartu = (b, isi) => `<div class="gj-card"><div class="gj-ch"><span class="gj-dot" style="background: ${b.warna};"></span><b>${b.nama}</b><span class="gj-pc">${gajiPct[b.id]}%</span><strong>${format(a[b.id])}</strong></div>${isi}</div>`;
  const B = Object.fromEntries(GAJI_BUCKET.map(b => [b.id, b]));
  let need = tagihan.length ? `<details class="gj-det"><summary>${baris(`Tagihan tetap (${tagihan.length})`, `<strong>${format(totT)}</strong>`)}</summary>${tagihan.map(b => baris(esc(b.nama), `<span>${format(b.jumlah)}</span>`, 'Tiap tgl ' + b.tgl)).join('')}</details>` : `<p class="bf-hint">Belum ada tagihan. Tambahkan di menu Tagihan supaya ikut dihitung.</p>`;
  if (gajiBesar > 0) need += baris('Pengeluaran besar', `<span>${format(gajiBesar)}</span>`, 'Dicadangkan, bukan budget');
  need += gajiKat.map((k, i) => baris(esc(k.nama), `<input class="gj-in" inputmode="numeric" value="${formatRupiahInput(k.jumlah)}" oninput="this.value = formatRupiahInput(this.value); gajiUbahKat(${i}, this.value)">`)).join('');
  need += `<div class="gj-row gj-sisa"><span>Belum dibagi</span><strong id="gajiSisaKat"></strong></div>`;
  if (totT + gajiBesar > a.need) need += `<p class="bf-hint gj-warn">Tagihan${gajiBesar > 0 ? ' dan pengeluaran besar' : ''} (${format(totT + gajiBesar)}) melebihi jatah kebutuhan pokok. Kembali dan naikkan persen kebutuhan.</p>`;
  else need += `<p class="bf-hint">${gajiInfo}</p>`;
  const save = goals.length ? goals.map(x => baris(esc(x.nama), `<span>${format(gajiBulat(a.save * x.sisa / sumSisa))}</span>`, 'Sesuai sisa target')).join('') : `<p class="bf-hint">Belum ada savings goal. Buat di menu Dompet supaya saving punya tujuan.</p>`;
  body.innerHTML = `
    <p class="gj-q">Rencana bulan ini</p>
    <p class="bf-hint" style="margin-bottom: 4px;">Dari gaji ${format(gajiTotal())}${gajiLain > 0 ? ` (gaji ${format(gajiNilai)} + pemasukan lain ${format(gajiLain)})` : ''}, uangmu dibagi seperti ini.</p>
    ${gajiBar()}
    ${kartu(B.need, need)}
    ${kartu(B.save, save)}
    ${kartu(B.dar, `<p class="bf-hint">Umumnya dikumpulkan sampai 3 sampai 6 kali pengeluaran bulanan, lalu persennya bisa dialihkan ke saving.</p>`)}
    ${kartu(B.free, `<p class="bf-hint">Dibuat sebagai satu budget untuk ${GAJI_BEBAS_CATS.join(', ')}.</p>`)}
    <p class="bf-hint" style="margin-top: 14px;">Terapkan membuat atau memperbarui budget bulanan untuk kebutuhan pokok (per kategori) dan bebas. Tagihan, saving, dan dana darurat hanya panduan.</p>`;
  gajiSisaKat();
}

function gajiSisaKat() {
  const s = gajiRencana.pool - gajiKat.reduce((a, k) => a + k.jumlah, 0), el = document.getElementById('gajiSisaKat');
  if (!el) return;
  el.textContent = (s < 0 ? '-' : '') + format(Math.abs(s)); el.className = s < 0 ? 'gj-warn' : '';
}
function gajiUbahKat(i, v) { gajiKat[i].jumlah = gajiAngka(v); gajiSisaKat(); }

function gajiTerapkan() {
  const amt = gajiRencana.amt, list = (globalData.budgets = globalData.budgets || []), share = {};
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
  try { localStorage.setItem(GAJI_KEY, JSON.stringify({ bulan: currentMonthKey(), gaji: gajiNilai, pct: gajiPct, share, tabung: gajiTabung, mode: gajiMode })); } catch (e) {}
  localStorage.setItem('budggt_local_cache', JSON.stringify(globalData));
  renderBudgets();
  openPage('budgets');
  showToast(kumpul.length + ' budget diterapkan', 1);
}

// ----- pengingat awal bulan di Dashboard: muncul tgl 1-10 kalau bulan ini belum bagi gaji; "x" menunda sampai bulan depan -----
// ponytail: dipanggil dari renderAllLocalUI (script.js); tanpa notifikasi push, hanya terlihat saat app dibuka.
function gajiNag() {
  const dash = document.getElementById('dashboard');
  if (!dash) return;
  let el = document.getElementById('gajiNag');
  if (!el) {
    el = document.createElement('div');
    el.id = 'gajiNag'; el.className = 'list-card nag hidden';
    el.innerHTML = '<p>Awal bulan! Yuk bagi gaji bulan ini, ada saran dari bulan lalu.</p><div style="display:flex;align-items:center;gap:8px;flex:none;"><button type="button" class="wl-btn p" onclick="openGaji()">Bagi</button><button type="button" class="icon-btn" style="width:32px;height:32px;" title="Nanti saja" onclick="gajiTunda()"><i class="fa fa-xmark"></i></button></div>';
    const nag = document.getElementById('backupNag');
    nag ? nag.after(el) : dash.prepend(el);
  }
  const bln = currentMonthKey();
  let tunda = ''; try { tunda = localStorage.getItem('budggt_gaji_tunda') || ''; } catch (e) {}
  const awal = new Date().getDate() <= 10;
  el.classList.toggle('hidden', !(awal && gajiSimpan().bulan !== bln && tunda !== bln && (globalData.transactions || []).length > 0));
}
function gajiTunda() { try { localStorage.setItem('budggt_gaji_tunda', currentMonthKey()); } catch (e) {} gajiNag(); }
