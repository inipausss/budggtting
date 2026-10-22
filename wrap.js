// ===== WRAP (rangkuman bulanan ala Spotify Wrapped) =====
// Layar penuh berisi slide story: ketuk kanan/kiri = maju/mundur, tahan = jeda, slide jalan sendiri tiap 6 detik.
// Semua dihitung lokal dari transaksi. Pakai dari app: netral, format, esc, prevKey, daysIn, currentMonthKey, monthLabel, budgetList, LOCALE;
// dari gaji.js: gajiTrxBudget, gajiBatas, gajiJumlah (perhitungan budget per bulan yang sama).
// Slide: Pembuka, Total, Terbesar, Paling hemat, Hari-harimu, Rapor budget, Saran, Tipe. Slide tanpa data (mis. belum ada budget) dilewati.
// Tampilan mengikuti tema app: warna aksen = --primary, dasar = --card-dark, font mengikuti app.
// ponytail: ambang tipe (30%, 55%, 40%, dst.) tebakan awal, ubah di wrapTipe setelah dicoba dengan data nyata.
// ponytail: tanpa pemasukan tercatat, rasio tabungan tidak ada: tipe Boros Banget / Semut / Perencana / Minimalis tidak bisa terpilih, jatuh ke tipe lain.

const WRAP_MS = 6000;
const WRAP_TIPE = {
  boros:   { e: '🔥', nama: 'Boros Banget',   warna: ['#7f1d1d', '#ea580c'], k: 'Bulan ini uangmu keluar lebih banyak dari yang masuk. Rem sedikit bulan depan, ya.' },
  impuls:  { e: '💸', nama: 'Impulsif',       warna: ['#831843', '#db2777'], k: 'Satu pembelian besar menentukan bulanmu. Sekali-sekali oke, asal sadar.' },
  weekend: { e: '🛍️', nama: 'Sultan Weekend', warna: ['#581c87', '#c026d3'], k: 'Senin sampai Kamis kamu tenang, Jumat sampai Minggu dompetmu bekerja keras.' },
  semut:   { e: '🐜', nama: 'Semut Penabung', warna: ['#064e3b', '#10b981'], k: 'Pemasukanmu disisihkan dengan disiplin. Masa depanmu berterima kasih.' },
  rapi:    { e: '🧮', nama: 'Perencana Rapi', warna: ['#1e3a8a', '#0ea5e9'], k: 'Hampir semua budget terjaga. Kamu benar-benar menjalankan rencananya.' },
  minimal: { e: '🧘', nama: 'Minimalis Tenang', warna: ['#134e4a', '#2dd4bf'], k: 'Banyak hari tanpa jajan. Kamu tahu apa yang benar-benar dibutuhkan.' },
  pecinta: { e: '🍜', nama: 'Pecinta',        warna: ['#78350f', '#f59e0b'], k: 'Satu hal jadi pusat pengeluaranmu bulan ini. Setia sekali.' },
  seimbang:{ e: '⚖️', nama: 'Seimbang',       warna: ['#1e293b', '#6366f1'], k: 'Tidak ekstrem ke mana-mana. Pengeluaran dan pemasukanmu berjalan beriringan.' }
};

// ----- mesin hitung: satu objek berisi semua angka yang dipakai slide -----
const wrapBulanAda = k => (globalData.transactions || []).some(t => String(t.tanggal).slice(0, 7) === k && !netral(t));
const wrapKey = () => { const p = prevKey(currentMonthKey()); return wrapBulanAda(p) ? p : currentMonthKey(); };
const wrapTgl = t => { const [y, m, d] = String(t.tanggal).slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };

function wrapHitung(key) {
  const mine = k => (globalData.transactions || []).filter(t => String(t.tanggal).slice(0, 7) === k && !netral(t));
  const tx = mine(key), exp = tx.filter(t => t.jenis === 'Pengeluaran');
  const n = t => Number(t.jumlah) || 0, sum = l => l.reduce((s, t) => s + n(t), 0);
  const inc = sum(tx.filter(t => t.jenis === 'Pemasukan')), total = sum(exp), prevExp = sum(mine(prevKey(key)).filter(t => t.jenis === 'Pengeluaran'));
  const byCat = l => { const m = {}; l.forEach(t => { m[t.kategori] = (m[t.kategori] || 0) + n(t); }); return m; };
  const cur = byCat(exp), prev = byCat(mine(prevKey(key)).filter(t => t.jenis === 'Pengeluaran'));
  const cats = Object.keys(cur).map(c => ({ nama: c, jumlah: cur[c], pct: total ? cur[c] / total * 100 : 0 })).sort((a, b) => b.jumlah - a.jumlah);
  const turun = Object.keys(prev).map(c => ({ nama: c, selisih: prev[c] - (cur[c] || 0), dari: prev[c] })).filter(c => c.selisih > 0).sort((a, b) => b.selisih - a.selisih)[0] || null;
  const biggest = exp.slice().sort((a, b) => n(b) - n(a))[0] || null;

  const hari = {}; let weekend = 0;
  exp.forEach(t => { const d = String(t.tanggal).slice(0, 10); hari[d] = (hari[d] || 0) + n(t); if ([5, 6, 0].includes(wrapTgl(t).getDay())) weekend += n(t); });
  const boroshari = Object.keys(hari).sort((a, b) => hari[b] - hari[a])[0] || null;
  const sampai = key === currentMonthKey() ? new Date().getDate() : daysIn(key);
  const tanpaJajan = sampai - Object.keys(hari).length;

  const bud = budgetList().map(b => { const sp = gajiJumlah(gajiTrxBudget(b, key)), lim = gajiBatas(b, key); return { nama: b.nama, cats: b.cats.map(c => c.trim().toLowerCase()), sp, lim, ok: sp <= lim, lebih: sp - lim }; });
  const jebol = bud.filter(b => !b.ok).sort((a, b) => b.lebih - a.lebih)[0] || null;

  const rate = inc > 0 ? (inc - total) / inc : null;
  const r = { key, inc, total, prevExp, delta: prevExp ? (total - prevExp) / prevExp * 100 : null, count: tx.length, nExp: exp.length, cats, turun, biggest,
    boroshari: boroshari && { tgl: boroshari, jumlah: hari[boroshari] }, tanpaJajan, aktif: Object.keys(hari).length, weekendShare: total ? weekend / total : 0, bud, aman: bud.filter(b => b.ok).length, jebol, rate };
  r.tipe = wrapTipe(r);
  return r;
}

// urutan prioritas: tipe pertama yang cocok dipakai
function wrapTipe(r) {
  const rate = r.rate, top = r.cats[0], banyak = r.nExp >= 5;
  let id = 'seimbang';
  if (rate !== null && rate < 0) id = 'boros';
  else if (banyak && r.biggest && r.biggest.jumlah / r.total >= 0.3) id = 'impuls';
  else if (banyak && r.weekendShare >= 0.55 && (rate ?? 0) < 0.1) id = 'weekend';
  else if (rate !== null && rate >= 0.3) id = 'semut';
  else if (r.bud.length >= 2 && r.aman / r.bud.length >= 0.9 && rate !== null && rate >= 0.1) id = 'rapi';
  else if (r.tanpaJajan >= 10 && rate !== null && rate >= 0.1) id = 'minimal';
  else if (top && top.pct >= 40) id = 'pecinta';
  const t = Object.assign({ id }, WRAP_TIPE[id]);
  if (id === 'pecinta') t.nama = 'Pecinta ' + top.nama;
  t.tingkat = rate === null ? 'Belum ada pemasukan tercatat bulan ini'
    : 'Tabungan ' + Math.round(rate * 100) + '% dari pemasukan, ' + (rate >= 0.3 ? 'hemat banget' : rate >= 0.1 ? 'hemat' : rate >= 0 ? 'boros' : 'boros banget');
  return t;
}

// ----- saran: maksimal 3 langkah konkret dari kebiasaan bulan itu, urut dari yang paling berdampak -----
// ponytail: persentase pangkas (10% kebutuhan, 20% lainnya) dan "4 hari tanpa jajan" adalah perkiraan kasar, bukan prediksi.
function wrapSaran(r) {
  const tips = [], rp = n => format(gajiBulat(n));
  const cat = r.cats.filter(c => !(r.jebol && r.jebol.cats.includes(c.nama.trim().toLowerCase()))).slice(0, 4).map(c => ({ c, pot: c.nama in GAJI_KEBUTUHAN ? 0.1 : 0.2 })).sort((a, b) => b.c.jumlah * b.pot - a.c.jumlah * a.pot)[0];
  if (cat) tips.push({ j: 'Kurangi ' + cat.c.nama + ' ' + Math.round(cat.pot * 100) + '%', i: 'Dari ' + rp(cat.c.jumlah) + ' jadi sekitar ' + rp(cat.c.jumlah * (1 - cat.pot)) + ' per bulan.', h: cat.c.jumlah * cat.pot });
  if (r.jebol) tips.push({ j: 'Jaga "' + r.jebol.nama + '" di batasnya', i: 'Bulan ini lewat ' + rp(r.jebol.lebih) + ' dari batas ' + rp(r.jebol.lim) + '.', h: r.jebol.lebih });
  if (r.nExp >= 5 && r.weekendShare >= 0.5) tips.push({ j: 'Rem di akhir pekan', i: Math.round(r.weekendShare * 100) + '% pengeluaranmu terjadi Jumat sampai Minggu. Pasang batas harian khusus akhir pekan.', h: r.total * r.weekendShare * 0.2 });
  if (r.total > 0 && r.tanpaJajan < 5 && r.aktif) tips.push({ j: 'Tambah hari tanpa jajan', i: 'Baru ' + r.tanpaJajan + ' hari tanpa pengeluaran. Coba satu hari per minggu.', h: r.total / r.aktif * 4 });
  if (r.nExp >= 5 && r.biggest && r.biggest.jumlah / r.total >= 0.25) tips.push({ j: 'Beri jeda untuk pembelian besar', i: (r.biggest.keterangan || r.biggest.kategori) + ' (' + rp(r.biggest.jumlah) + ') memakan ' + Math.round(r.biggest.jumlah / r.total * 100) + '% bulanmu. Tunggu 3 hari sebelum membeli.', h: 0 });
  if (r.rate !== null && r.rate < 0) tips.push({ j: 'Tutup defisit dulu', i: 'Pengeluaran melebihi pemasukan ' + rp(r.total - r.inc) + '. Targetkan pengeluaran tidak melewati pemasukan.', h: r.total - r.inc });
  tips.sort((a, b) => b.h - a.h);
  const pakai = tips.slice(0, 3);
  return { tips: pakai, hemat: pakai.reduce((s, t) => s + t.h, 0) };
}

// ----- slide: tiap fungsi mengembalikan { g: [warna glow 1, glow 2], html } atau null kalau datanya tidak ada (slide dilewati) -----
// wA(i): elemen masuk bertahap. wN: angka yang dihitung naik. .w-bar i[--w]: batang tumbuh. .w-ring[--t]: cincin terisi.
const wA = (i, c = '') => `class="w-a ${c}" style="--d:${i * 0.16}s"`;
const wN = (v, f = 'rp') => `<b class="w-n" data-v="${Math.round(v)}" data-f="${f}">0</b>`;
const wTag = (n, t) => `<span ${wA(0, 'w-tag')}><i></i>${n} · ${t}</span>`;
const wTgl = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' }); };
const WG = ['#6366f1', '#06b6d4', '#f97316', '#ec4899', '#22c55e'];

const WRAP_SLIDE = [
  r => ({ g: ['var(--primary)', WG[0]], html: `
    ${wTag('00', 'WRAP')}
    <h1 ${wA(1, 'w-xl')}>${esc(monthLabel(r.key))}</h1>
    <p ${wA(2)}>kamu, dirangkum.</p>
    <div ${wA(4, 'w-card w-row')}><span>Tercatat</span><strong>${wN(r.count, 'int')} transaksi</strong></div>
    <p ${wA(6, 'w-sm')}>Ketuk untuk lanjut →</p>` }),

  r => ({ g: ['var(--primary)', WG[4]], html: `
    ${wTag('01', 'TOTAL KELUAR')}
    <p ${wA(1)}>Bulan ini kamu mengeluarkan</p>
    <h1 ${wA(2, 'w-big w-ac')}>${wN(r.total)}</h1>
    <span ${wA(4, 'w-chip')}>${r.delta === null ? 'Bulan pertama tercatat'
      : r.delta <= 0 ? '↓ ' + Math.abs(Math.round(r.delta)) + '% lebih hemat dari bulan lalu'
      : '↑ ' + Math.round(r.delta) + '% lebih banyak dari bulan lalu'}</span>` }),

  r => {
    const t = r.cats.slice(0, 3), b = r.biggest;
    return { g: ['var(--primary)', WG[2]], html: `
    ${wTag('02', 'PALING BANYAK')}
    <p ${wA(1)}>Uangmu paling banyak habis di</p>
    <h1 ${wA(2, 'w-xl w-ac')}>${t[0] ? esc(t[0].nama) : '-'}</h1>
    <div class="w-bars">${t.map((c, i) => `<div ${wA(3 + i, 'w-card')}><span>${esc(c.nama)}</span><em>${Math.round(c.pct)}%</em><div class="w-bar"><i style="--w:${Math.round(c.pct)}%"></i></div></div>`).join('')}</div>
    ${b ? `<p ${wA(7, 'w-sm')}>Satu pengeluaran terbesar: ${format(b.jumlah)} · ${esc(b.keterangan || b.kategori)}</p>` : ''}` };
  },

  r => {
    const sisa = r.bud.filter(b => b.ok && b.lim > b.sp).sort((a, b) => (b.lim - b.sp) - (a.lim - a.sp))[0];
    if (!r.turun && !sisa) return null;
    const x = r.turun ? { n: r.turun.nama, v: r.turun.selisih, k: 'Turun dari ' + format(r.turun.dari) + ' bulan lalu', a: 'Kamu paling berhasil menekan' }
      : { n: sisa.nama, v: sisa.lim - sisa.sp, k: 'Budget ini hanya terpakai ' + format(sisa.sp) + ' dari ' + format(sisa.lim), a: 'Budget paling longgar bulan ini' };
    return { g: ['var(--primary)', WG[1]], html: `
    ${wTag('03', 'PALING HEMAT')}
    <p ${wA(1)}>${x.a}</p>
    <h1 ${wA(2, 'w-xl')}>${esc(x.n)}</h1>
    <h1 ${wA(3, 'w-big w-ac')}>↓ ${wN(x.v)}</h1>
    <p ${wA(5, 'w-sm')}>${x.k}</p>` };
  },

  r => {
    if (!r.boroshari) return null;
    return { g: ['var(--primary)', WG[3]], html: `
    ${wTag('04', 'HARI-HARIMU')}
    <p ${wA(1)}>Hari paling boros</p>
    <h1 ${wA(2, 'w-xl')}>${esc(wTgl(r.boroshari.tgl))}</h1>
    <h1 ${wA(3, 'w-big w-ac')}>${wN(r.boroshari.jumlah)}</h1>
    <div ${wA(5, 'w-card w-row')}><span>Hari tanpa pengeluaran</span><strong>${wN(r.tanpaJajan, 'int')} hari</strong></div>` };
  },

  r => {
    if (!r.bud.length) return null;
    const p = Math.round(r.aman / r.bud.length * 100);
    return { g: ['var(--primary)', WG[0]], html: `
    ${wTag('05', 'RAPOR BUDGET')}
    <div ${wA(1, 'w-ringwrap')}><div class="w-ring" style="--t:${p}"></div><div class="w-rl"><strong>${r.aman}/${r.bud.length}</strong><small>budget aman</small></div></div>
    <p ${wA(3)}>${p >= 90 ? 'Hampir sempurna. Rencanamu benar-benar jalan.' : p >= 50 ? 'Sebagian besar terjaga.' : 'Banyak budget yang jebol bulan ini.'}</p>
    ${r.jebol ? `<div ${wA(4, 'w-card w-row')}><span>Paling jebol: ${esc(r.jebol.nama)}</span><strong>+${format(r.jebol.lebih)}</strong></div>` : ''}` };
  },

  r => {
    const s = wrapSaran(r);
    return { g: ['var(--primary)', WG[2]], html: `
    ${wTag('06', 'BIAR LEBIH HEMAT')}
    <h1 ${wA(1, 'w-lg')}>Kalau mau lebih hemat bulan depan</h1>
    <div class="w-tips">${s.tips.length ? s.tips.map((t, i) => `<div ${wA(2 + i, 'w-card w-tip')}><b>${i + 1}</b><div><strong>${esc(t.j)}</strong><small>${esc(t.i)}</small></div>${t.h > 0 ? `<em>${format(gajiBulat(t.h))}</em>` : ''}</div>`).join('')
      : `<div ${wA(2, 'w-card w-tip')}><b>✓</b><div><strong>Sudah rapi!</strong><small>Tidak ada yang menonjol untuk dipangkas. Pertahankan pola bulan ini.</small></div></div>`}</div>
    ${s.hemat > 0 ? `<span ${wA(6, 'w-chip')}>Potensi hemat ± ${format(gajiBulat(s.hemat))} / bulan</span>` : ''}` };
  },

  r => {
    const c = Array.from({ length: 18 }, () => `<s style="--x:${Math.random() * 100}%;--dl:${(Math.random() * 2.5).toFixed(2)}s;--c:${Math.random() < 0.5 ? 'var(--primary)' : '#fff'}"></s>`).join('');
    return { g: [r.tipe.warna[1], 'var(--primary)'], html: `
    <div class="w-conf">${c}</div>
    ${wTag('07', 'TIPE KAMU')}
    <p ${wA(1)}>Bulan ini kamu adalah</p>
    <div ${wA(2, 'w-emo')}>${r.tipe.e}</div>
    <h1 ${wA(3, 'w-xl w-ac')}>${esc(r.tipe.nama)}</h1>
    <p ${wA(4)}>${esc(r.tipe.k)}</p>
    <span ${wA(6, 'w-chip')}>${esc(r.tipe.tingkat)}</span>` };
  }
];

// ----- tampilan -----
(function () {
  const s = document.createElement('style');
  s.textContent = `
  @property --p { syntax: '<number>'; inherits: false; initial-value: 0; }
  #wrap { position: fixed; inset: 0; z-index: 9999; display: none; overflow: hidden; color: #fff; background: var(--card-dark, #121417); touch-action: manipulation; user-select: none; -webkit-user-select: none; }
  #wrap.on { display: flex; }
  #wrap::before, #wrap::after { content: ""; position: absolute; width: 90vmax; height: 90vmax; border-radius: 50%; filter: blur(70px); opacity: .32; pointer-events: none; }
  #wrap::before { background: var(--g1); top: -55vmax; left: -35vmax; animation: wf1 11s ease-in-out infinite alternate; }
  #wrap::after { background: var(--g2); bottom: -60vmax; right: -40vmax; opacity: .26; animation: wf2 13s ease-in-out infinite alternate; }
  @keyframes wf1 { to { transform: translate(18vmax, 12vmax) scale(1.15); } }
  @keyframes wf2 { to { transform: translate(-16vmax, -10vmax) scale(1.2); } }
  .w-top { position: absolute; top: max(12px, env(safe-area-inset-top)); left: 14px; right: 14px; display: flex; gap: 4px; z-index: 2; }
  .w-top div { flex: 1; height: 3px; border-radius: 3px; background: rgba(255,255,255,.18); overflow: hidden; }
  .w-top i { display: block; height: 100%; width: 0; background: var(--primary); }
  .w-top .done i { width: 100%; }
  .w-top .now i { animation: wprog ${WRAP_MS}ms linear forwards; }
  #wrap.pause .w-top .now i, #wrap.pause .w-a, #wrap.pause .w-conf s { animation-play-state: paused; }
  @keyframes wprog { to { width: 100%; } }
  .w-x { position: absolute; top: max(24px, calc(env(safe-area-inset-top) + 12px)); right: 12px; z-index: 3; width: 38px; height: 38px; border: 1px solid rgba(255,255,255,.14); border-radius: 50%; background: rgba(255,255,255,.08); color: #fff; font-size: 1rem; cursor: pointer; }
  .w-body { position: relative; margin: auto; width: 100%; max-width: 440px; padding: 84px 24px 56px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 14px; }
  .w-body p { font-size: 1.02rem; line-height: 1.5; opacity: .9; margin: 0; }
  .w-body h1 { font-size: 2rem; line-height: 1.12; font-weight: 800; margin: 0; letter-spacing: -.02em; word-break: break-word; }
  .w-body h1.w-xl { font-size: 2.9rem; letter-spacing: -.03em; }
  .w-body h1.w-big { font-size: 2.5rem; font-weight: 900; letter-spacing: -.03em; }
  .w-body h1.w-lg { font-size: 1.7rem; }
  .w-ac { color: var(--primary); }
  .w-body .w-sm { font-size: .82rem; opacity: .6; }
  .w-n { font-variant-numeric: tabular-nums; }
  .w-tag { display: inline-flex; align-items: center; gap: 8px; padding: 6px 12px; border-radius: 999px; background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.12); font-size: .7rem; font-weight: 700; letter-spacing: .12em; }
  .w-tag i { width: 7px; height: 7px; border-radius: 50%; background: var(--primary); box-shadow: 0 0 10px var(--primary); }
  .w-chip { display: inline-block; padding: 9px 16px; border-radius: 999px; background: var(--primary); color: #000; font-size: .85rem; font-weight: 700; }
  .w-card { width: 100%; padding: 14px 18px; border-radius: 22px; background: rgba(255,255,255,.07); border: 1px solid rgba(255,255,255,.1); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); }
  .w-row { display: flex; justify-content: space-between; align-items: center; gap: 12px; font-size: .9rem; text-align: left; }
  .w-row strong { color: var(--primary); font-weight: 800; white-space: nowrap; }
  .w-bars { width: 100%; display: flex; flex-direction: column; gap: 10px; margin-top: 4px; }
  .w-bars > div { display: grid; grid-template-columns: 1fr auto; gap: 8px 10px; text-align: left; font-size: .92rem; }
  .w-bars em { font-style: normal; font-weight: 800; color: var(--primary); }
  .w-bar { grid-column: 1 / -1; height: 9px; border-radius: 9px; background: rgba(255,255,255,.12); overflow: hidden; }
  .w-bar i { display: block; height: 100%; width: 0; background: var(--primary); border-radius: 9px; transition: width 1.1s cubic-bezier(.2,.8,.2,1) .5s; }
  #wrap.go .w-bar i { width: var(--w); }
  .w-ring { width: 190px; height: 190px; border-radius: 50%; display: grid; place-items: center; --p: 0; transition: --p 1.3s cubic-bezier(.2,.8,.2,1) .4s;
    background: conic-gradient(var(--primary) calc(var(--p) * 1%), rgba(255,255,255,.12) 0); -webkit-mask: radial-gradient(circle, transparent 62%, #000 63%); mask: radial-gradient(circle, transparent 62%, #000 63%); }
  #wrap.go .w-ring { --p: var(--t); }
  .w-ringwrap { position: relative; width: 190px; height: 190px; }
  .w-rl { position: absolute; inset: 0; display: grid; place-content: center; text-align: center; }
  .w-rl strong { font-size: 2.2rem; font-weight: 900; color: var(--primary); }
  .w-rl small { font-size: .78rem; opacity: .7; }
  .w-tips { width: 100%; display: flex; flex-direction: column; gap: 10px; }
  .w-tip { display: grid; grid-template-columns: 30px 1fr auto; gap: 12px; align-items: center; text-align: left; }
  .w-tip b { width: 30px; height: 30px; border-radius: 50%; background: var(--primary); color: #000; display: grid; place-items: center; font-size: .85rem; font-weight: 800; }
  .w-tip strong { display: block; font-size: .92rem; }
  .w-tip small { display: block; font-size: .76rem; opacity: .7; margin-top: 2px; line-height: 1.4; }
  .w-tip em { font-style: normal; font-weight: 800; font-size: .8rem; color: var(--primary); white-space: nowrap; }
  .w-emo { font-size: 5.5rem; line-height: 1; }
  .w-a { animation: wup .7s cubic-bezier(.2,.8,.2,1) both; animation-delay: var(--d); }
  .w-emo.w-a { animation: wpop .9s cubic-bezier(.2,1.6,.4,1) both; animation-delay: var(--d); }
  @keyframes wup { from { transform: translateY(24px); opacity: 0; } to { transform: none; opacity: 1; } }
  @keyframes wpop { from { transform: scale(0) rotate(-25deg); opacity: 0; } to { transform: none; opacity: 1; } }
  .w-conf { position: absolute; inset: 0; overflow: hidden; pointer-events: none; }
  .w-conf s { position: absolute; top: -20px; left: var(--x); width: 8px; height: 14px; background: var(--c); border-radius: 2px; opacity: .9; animation: wfall 3.2s linear var(--dl) infinite; }
  @keyframes wfall { to { transform: translateY(105vh) rotate(540deg); } }
  @media (prefers-reduced-motion: reduce) { #wrap::before, #wrap::after, .w-conf s { animation: none; } .w-a, .w-emo, .w-top .now i { animation-duration: .01s !important; animation-delay: 0s !important; } .w-bar i, .w-ring { transition: none; } }`;
  document.head.appendChild(s);
})();

let wrapR = null, wrapS = [], wrapI = 0, wrapAnim = 0;
const wrapEl = () => document.getElementById('wrap') || (() => {
  const e = document.createElement('div'); e.id = 'wrap'; e.setAttribute('translate', 'no');
  e.innerHTML = '<div class="w-top"></div><button type="button" class="w-x" aria-label="Tutup">✕</button><div class="w-body"></div>';
  let t0 = 0;
  e.addEventListener('pointerdown', ev => { if (ev.target.closest('.w-x')) return; t0 = Date.now(); e.classList.add('pause'); });
  e.addEventListener('pointerup', ev => {
    e.classList.remove('pause');
    if (ev.target.closest('.w-x')) return tutupWrap();
    if (Date.now() - t0 > 250) return; // ditahan = hanya jeda
    wrapGo(ev.clientX < innerWidth / 3 ? wrapI - 1 : wrapI + 1);
  });
  e.addEventListener('pointercancel', () => e.classList.remove('pause'));
  e.querySelector('.w-top').addEventListener('animationend', ev => { if (ev.animationName === 'wprog') wrapGo(wrapI + 1); });
  document.body.appendChild(e); return e;
})();

function openWrap(key) {
  wrapR = wrapHitung(key || wrapKey());
  if (!wrapR.count) { showToast('Belum ada transaksi untuk dirangkum', 1); return; }
  wrapS = WRAP_SLIDE.map(f => f(wrapR)).filter(Boolean);
  wrapSet('budggt_wrap', wrapR.key); wrapNag(); // sudah dilihat: titik "Baru" dan banner hilang
  wrapEl().classList.add('on'); document.body.style.overflow = 'hidden';
  wrapGo(0);
}
function tutupWrap() { const e = document.getElementById('wrap'); if (e) e.classList.remove('on', 'go'); document.body.style.overflow = ''; cancelAnimationFrame(wrapAnim); }

function wrapGo(i) {
  if (i < 0) i = 0;
  if (i >= wrapS.length) return; // slide terakhir: diam sampai ditutup
  wrapI = i;
  const e = wrapEl(), sl = wrapS[i], body = e.querySelector('.w-body'), akhir = i === wrapS.length - 1;
  e.style.setProperty('--g1', sl.g[0]); e.style.setProperty('--g2', sl.g[1]);
  e.querySelector('.w-top').innerHTML = wrapS.map((_, k) => `<div class="${k < i || (akhir && k === i) ? 'done' : k === i ? 'now' : ''}"><i></i></div>`).join('');
  body.innerHTML = sl.html;
  e.classList.remove('go'); void e.offsetWidth; requestAnimationFrame(() => e.classList.add('go'));
  wrapHitungNaik(body);
}

// angka naik dari 0 (ease-out), mulai setelah teks pembukanya muncul
function wrapHitungNaik(body) {
  cancelAnimationFrame(wrapAnim);
  const ns = [...body.querySelectorAll('.w-n')], t0 = performance.now() + 450, dur = 1100;
  const tick = now => {
    const p = Math.min(1, Math.max(0, (now - t0) / dur)), v = 1 - Math.pow(1 - p, 3);
    ns.forEach(el => { const x = Math.round(el.dataset.v * v); el.textContent = el.dataset.f === 'int' ? x : format(x); });
    if (p < 1) wrapAnim = requestAnimationFrame(tick);
  };
  wrapAnim = requestAnimationFrame(tick);
}
document.addEventListener('keydown', ev => { const e = document.getElementById('wrap'); if (e && e.classList.contains('on') && ev.key === 'Escape') tutupWrap(); });

// ----- pengingat: titik "Baru" di ikon Wrap + banner Dashboard tgl 1-10, selama Wrap bulan lalu belum dibuka -----
// ponytail: dipanggil dari renderAllLocalUI (script.js) setelah gajiNag(); hanya terlihat saat app dibuka, tanpa notifikasi push.
const wrapGet = k => { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } };
const wrapSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
const wrapBaru = () => { const p = prevKey(currentMonthKey()); return wrapBulanAda(p) && wrapGet('budggt_wrap') !== p ? p : ''; }; // bulan lalu yang belum dilihat
(function () {
  const s = document.createElement('style');
  s.textContent = '.w-dot { position: absolute; top: -2px; right: -2px; width: 12px; height: 12px; border-radius: 50%; background: var(--primary); border: 2px solid var(--card-bg, #fff); animation: wdot 1.6s ease-in-out infinite; }' +
    '@keyframes wdot { 50% { transform: scale(1.35); } } @media (prefers-reduced-motion: reduce) { .w-dot { animation: none; } }';
  document.head.appendChild(s);
})();
function wrapNag() {
  const dash = document.getElementById('dashboard');
  if (!dash) return;
  const p = wrapBaru(), icon = document.querySelector('[onclick="openWrap()"] .menu-circle');
  if (icon) { icon.style.position = 'relative'; const d = icon.querySelector('.w-dot'); if (p && !d) icon.insertAdjacentHTML('beforeend', '<span class="w-dot"></span>'); else if (!p && d) d.remove(); }
  let el = document.getElementById('wrapNag');
  if (!el) {
    el = document.createElement('div'); el.id = 'wrapNag'; el.className = 'list-card nag hidden';
    el.innerHTML = '<p id="wrapNagText"></p><div style="display:flex;align-items:center;gap:8px;flex:none;"><button type="button" class="wl-btn p" onclick="openWrap()">Lihat</button><button type="button" class="icon-btn" style="width:32px;height:32px;" title="Nanti saja" onclick="wrapTunda()"><i class="fa fa-xmark"></i></button></div>';
  }
  const g = document.getElementById('gajiNag'), b = document.getElementById('backupNag');
  if (g) g.before(el); else if (b) b.after(el); else dash.prepend(el); // Wrap tampil di atas banner Bagi Gaji
  document.getElementById('wrapNagText').textContent = p ? 'Wrap ' + monthLabel(p) + ' kamu sudah siap 🎁' : '';
  el.classList.toggle('hidden', !(p && new Date().getDate() <= 10 && wrapGet('budggt_wrap_tunda') !== p));
}
function wrapTunda() { wrapSet('budggt_wrap_tunda', prevKey(currentMonthKey())); wrapNag(); }
