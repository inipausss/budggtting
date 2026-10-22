// ===== WRAP (rangkuman bulanan ala Spotify Wrapped) =====
// Layar penuh berisi slide story: ketuk kanan/kiri = maju/mundur, tahan = jeda, slide jalan sendiri tiap 6 detik.
// Semua dihitung lokal dari transaksi. Pakai dari app: netral, format, esc, prevKey, daysIn, currentMonthKey, monthLabel, budgetList, LOCALE;
// dari gaji.js: gajiTrxBudget, gajiBatas, gajiJumlah (perhitungan budget per bulan yang sama).
// Cicilan 1: slide Pembuka, Total, Terbesar, Tipe. Cicilan 2 (belum): Paling hemat, Hari-harimu, Rapor budget. Mesin hitungnya sudah lengkap.
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

  const bud = budgetList().map(b => { const sp = gajiJumlah(gajiTrxBudget(b, key)), lim = gajiBatas(b, key); return { nama: b.nama, sp, lim, ok: sp <= lim, lebih: sp - lim }; });
  const jebol = bud.filter(b => !b.ok).sort((a, b) => b.lebih - a.lebih)[0] || null;

  const rate = inc > 0 ? (inc - total) / inc : null;
  const r = { key, inc, total, prevExp, delta: prevExp ? (total - prevExp) / prevExp * 100 : null, count: tx.length, nExp: exp.length, cats, turun, biggest,
    boroshari: boroshari && { tgl: boroshari, jumlah: hari[boroshari] }, tanpaJajan, weekendShare: total ? weekend / total : 0, bud, aman: bud.filter(b => b.ok).length, jebol, rate };
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

// ----- slide: tiap fungsi mengembalikan { bg: [warna1, warna2], html } -----
// a(i): elemen masuk bertahap. data-n = angka yang dihitung naik. .w-bar i[style=--w] = batang yang tumbuh.
const wA = (i, c = '') => `class="w-a ${c}" style="--d:${i * 0.18}s"`;
const wN = (v, f = 'rp') => `<b class="w-n" data-v="${Math.round(v)}" data-f="${f}">0</b>`;

const WRAP_SLIDE = [
  r => ({ bg: ['#312e81', '#7c3aed'], html: `
    <p ${wA(0)}>Hai! Ini</p>
    <h1 ${wA(1)}>${esc(monthLabel(r.key))}</h1>
    <p ${wA(2)}>kamu, dirangkum.</p>
    <p ${wA(4, 'w-sm')}>${wN(r.count, 'int')} transaksi tercatat</p>` }),

  r => ({ bg: ['#0f766e', '#22c55e'], html: `
    <p ${wA(0)}>Bulan ini kamu mengeluarkan</p>
    <h1 ${wA(1, 'w-big')}>${wN(r.total)}</h1>
    <p ${wA(3)}>${r.delta === null ? 'Ini bulan pertama yang tercatat.'
      : r.delta <= 0 ? '↓ ' + Math.abs(Math.round(r.delta)) + '% lebih hemat dari bulan lalu 👏'
      : '↑ ' + Math.round(r.delta) + '% lebih banyak dari bulan lalu'}</p>` }),

  r => {
    const t = r.cats.slice(0, 3), b = r.biggest;
    return { bg: ['#9a3412', '#f59e0b'], html: `
    <p ${wA(0)}>Uangmu paling banyak habis di</p>
    <h1 ${wA(1)}>${t[0] ? esc(t[0].nama) : '-'}</h1>
    <div class="w-bars">${t.map((c, i) => `<div ${wA(2 + i)}><span>${esc(c.nama)}</span><em>${Math.round(c.pct)}%</em><div class="w-bar"><i style="--w:${Math.round(c.pct)}%"></i></div></div>`).join('')}</div>
    ${b ? `<p ${wA(6, 'w-sm')}>Pengeluaran tunggal terbesar: ${format(b.jumlah)}<br>${esc(b.keterangan || b.kategori)}</p>` : ''}` };
  },

  r => ({ bg: r.tipe.warna, html: `
    <p ${wA(0)}>Bulan ini kamu adalah</p>
    <div ${wA(1, 'w-emo')}>${r.tipe.e}</div>
    <h1 ${wA(2)}>${esc(r.tipe.nama)}</h1>
    <p ${wA(3)}>${esc(r.tipe.k)}</p>
    <p ${wA(5, 'w-sm')}>${esc(r.tipe.tingkat)}</p>` })
];

// ----- tampilan -----
(function () {
  const s = document.createElement('style');
  s.textContent = `
  #wrap { position: fixed; inset: 0; z-index: 9999; display: none; color: #fff; font-family: inherit; touch-action: manipulation; user-select: none; -webkit-user-select: none;
    background: linear-gradient(160deg, var(--w1), var(--w2)); background-size: 200% 200%; animation: wdrift 9s ease-in-out infinite alternate; }
  #wrap.on { display: flex; }
  @keyframes wdrift { to { background-position: 100% 100%; } }
  .w-top { position: absolute; top: max(12px, env(safe-area-inset-top)); left: 14px; right: 14px; display: flex; gap: 4px; z-index: 2; }
  .w-top div { flex: 1; height: 3px; border-radius: 3px; background: rgba(255,255,255,.3); overflow: hidden; }
  .w-top i { display: block; height: 100%; width: 0; background: #fff; }
  .w-top .done i { width: 100%; }
  .w-top .now i { animation: wprog ${WRAP_MS}ms linear forwards; }
  #wrap.pause .w-top .now i, #wrap.pause .w-a { animation-play-state: paused; }
  @keyframes wprog { to { width: 100%; } }
  .w-x { position: absolute; top: max(24px, calc(env(safe-area-inset-top) + 12px)); right: 12px; z-index: 3; width: 40px; height: 40px; border: 0; border-radius: 50%; background: rgba(0,0,0,.25); color: #fff; font-size: 1.1rem; cursor: pointer; }
  .w-body { margin: auto; width: 100%; max-width: 440px; padding: 80px 28px 60px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 14px; }
  .w-body p { font-size: 1.05rem; line-height: 1.5; opacity: .92; margin: 0; }
  .w-body h1 { font-size: 2.6rem; line-height: 1.1; font-weight: 800; margin: 0; letter-spacing: -.02em; word-break: break-word; }
  .w-body h1.w-big { font-size: 2.3rem; }
  .w-body .w-sm { font-size: .85rem; opacity: .75; }
  .w-n { font-variant-numeric: tabular-nums; }
  .w-emo { font-size: 5.5rem; line-height: 1; animation: wpop .9s cubic-bezier(.2,1.6,.4,1) both; animation-delay: var(--d); }
  @keyframes wpop { from { transform: scale(0) rotate(-25deg); opacity: 0; } to { transform: none; opacity: 1; } }
  .w-a { animation: wup .7s cubic-bezier(.2,.8,.2,1) both; animation-delay: var(--d); }
  .w-emo.w-a { animation: wpop .9s cubic-bezier(.2,1.6,.4,1) both; animation-delay: var(--d); }
  @keyframes wup { from { transform: translateY(26px); opacity: 0; } to { transform: none; opacity: 1; } }
  .w-bars { width: 100%; display: flex; flex-direction: column; gap: 14px; margin-top: 8px; }
  .w-bars > div { display: grid; grid-template-columns: 1fr auto; gap: 4px 10px; text-align: left; font-size: .95rem; }
  .w-bars em { font-style: normal; font-weight: 700; }
  .w-bar { grid-column: 1 / -1; height: 10px; border-radius: 10px; background: rgba(255,255,255,.25); overflow: hidden; }
  .w-bar i { display: block; height: 100%; width: 0; background: #fff; border-radius: 10px; transition: width 1.1s cubic-bezier(.2,.8,.2,1) .5s; }
  #wrap.go .w-bar i { width: var(--w); }
  @media (prefers-reduced-motion: reduce) { #wrap, .w-a, .w-emo, .w-top .now i { animation-duration: .01s !important; animation-delay: 0s !important; } .w-bar i { transition: none; } }`;
  document.head.appendChild(s);
})();

let wrapR = null, wrapI = 0, wrapAnim = 0;
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
  wrapEl().classList.add('on'); document.body.style.overflow = 'hidden';
  wrapGo(0);
}
function tutupWrap() { const e = document.getElementById('wrap'); if (e) e.classList.remove('on', 'go'); document.body.style.overflow = ''; cancelAnimationFrame(wrapAnim); }

function wrapGo(i) {
  if (i < 0) i = 0;
  if (i >= WRAP_SLIDE.length) return; // slide terakhir: diam sampai ditutup
  wrapI = i;
  const e = wrapEl(), sl = WRAP_SLIDE[i](wrapR), body = e.querySelector('.w-body');
  e.style.setProperty('--w1', sl.bg[0]); e.style.setProperty('--w2', sl.bg[1]);
  e.querySelector('.w-top').innerHTML = WRAP_SLIDE.map((_, k) => `<div class="${k < i ? 'done' : k === i ? 'now' : ''}"><i></i></div>`).join('');
  if (i === WRAP_SLIDE.length - 1) e.querySelector('.now i').style.animation = 'none', e.querySelector('.now').classList.add('done');
  body.innerHTML = sl.html;
  e.classList.remove('go'); void e.offsetWidth; requestAnimationFrame(() => e.classList.add('go'));
  wrapHitungNaik(body);
}

// angka naik dari 0 (ease-out), mulai setelah teks pembukanya muncul
function wrapHitungNaik(body) {
  cancelAnimationFrame(wrapAnim);
  const ns = [...body.querySelectorAll('.w-n')], t0 = performance.now() + 500, dur = 1100;
  const tick = now => {
    const p = Math.min(1, Math.max(0, (now - t0) / dur)), v = 1 - Math.pow(1 - p, 3);
    ns.forEach(el => { const x = Math.round(el.dataset.v * v); el.textContent = el.dataset.f === 'int' ? x : format(x); });
    if (p < 1) wrapAnim = requestAnimationFrame(tick);
  };
  wrapAnim = requestAnimationFrame(tick);
}
document.addEventListener('keydown', ev => { const e = document.getElementById('wrap'); if (e && e.classList.contains('on') && ev.key === 'Escape') tutupWrap(); });
