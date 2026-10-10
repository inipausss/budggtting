// Cache data lokal agar saat aplikasi dibuka langsung muncul seketika tanpa loading putih
let globalData = JSON.parse(localStorage.getItem('budggt_local_cache')) || { accounts: [], accountSummary: [], transactions: [] };
let flowChart;
let isBalanceHidden = false;
let rawSummary = { saldo: 0, income: 0, expense: 0 };

const BULAN = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];

function currentMonthKey() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

function inMonth(list, key) {
  return (list || []).filter(t => (t.tanggal || '').slice(0, 7) === key);
}

function monthLabel(key) {
  const [y, m] = key.split('-');
  return BULAN[Number(m) - 1] + ' ' + y;
}

// ===== LAPORAN (Ringkasan + Transaksi, satu state bulan bersama) =====
let recapMonth = currentMonthKey();
let reportTab = 'ringkasan'; // 'ringkasan' | 'transaksi'
let recapJenis = 'Pengeluaran'; // 'Pengeluaran' | 'Pemasukan': jenis yang dirinci di Ringkasan
let recapTopMode = 'kategori'; // 'kategori' | 'transaksi'

function setRecapJenis(j) {
  recapJenis = j === 'Pemasukan' ? 'Pemasukan' : 'Pengeluaran';
  ['Pemasukan', 'Pengeluaran'].forEach(k => { const b = document.getElementById('rj-' + k); if (b) b.classList.toggle('active', k === recapJenis); });
  renderRecap();
}
function setRecapTop(m) { recapTopMode = m; renderRecapDetails(); }

function shiftRecap(delta) {
  const [y, m] = recapMonth.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  if (key > currentMonthKey()) return;
  recapMonth = key;
  renderRecap();
}

function selectRecap(key) {
  recapMonth = key;
  renderRecap();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function setReportTab(tab) {
  reportTab = tab === 'transaksi' ? 'transaksi' : 'ringkasan';
  const isRingkasan = reportTab === 'ringkasan';
  const rv = document.getElementById('recapView');
  const tv = document.getElementById('trxView');
  if (rv) rv.classList.toggle('hidden', !isRingkasan);
  if (tv) tv.classList.toggle('hidden', isRingkasan);
  const sr = document.getElementById('seg-ringkasan');
  const st = document.getElementById('seg-transaksi');
  if (sr) sr.classList.toggle('active', isRingkasan);
  if (st) st.classList.toggle('active', !isRingkasan);
  renderRecap(); // grafik digambar ulang setelah wadahnya tampil
}

function monthTotals(key) {
  let inc = 0, exp = 0, count = 0;
  inMonth(globalData.transactions, key).filter(t => !netral(t)).forEach(t => {
    const n = Number(t.jumlah) || 0;
    if (t.jenis === 'Pemasukan') inc += n; else exp += n;
    count++;
  });
  return { inc, exp, count, net: inc - exp };
}

function renderRecap() {
  const label = document.getElementById('recapMonthLabel');
  if (label) label.innerText = monthLabel(recapMonth);
  const nextBtn = document.getElementById('recapNextBtn');
  if (nextBtn) nextBtn.style.opacity = recapMonth >= currentMonthKey() ? 0.3 : 1;

  const s = monthTotals(recapMonth);
  const cap = 'font-size: 0.72rem; font-weight: 500; color: var(--text-muted); margin-bottom: 6px;';
  const val = 'font-size: 1.05rem; font-weight: 700; letter-spacing: -0.3px;';
  const netColor = s.net >= 0 ? 'var(--pos)' : 'var(--neg)';
  const netText = (s.net >= 0 ? '+ ' : '- ') + format(Math.abs(s.net));

  const sum = document.getElementById('recapSummary');
  if (sum) sum.innerHTML = `
    <div class="list-card" style="margin: 0; padding: 14px;">
      <p style="${cap}">Pemasukan</p>
      <h3 style="${val} color: var(--pos);">${format(s.inc)}</h3>
    </div>
    <div class="list-card" style="margin: 0; padding: 14px;">
      <p style="${cap}">Pengeluaran</p>
      <h3 style="${val} color: var(--neg);">${format(s.exp)}</h3>
    </div>
    <div class="list-card" style="margin: 0; padding: 14px;">
      <p style="${cap}">${s.net >= 0 ? 'Hemat' : 'Defisit'}</p>
      <h3 style="${val} color: ${netColor};">${netText}</h3>
    </div>
    <div class="list-card" style="margin: 0; padding: 14px;">
      <p style="${cap}">Transaksi</p>
      <h3 style="${val}">${s.count}</h3>
    </div>`;

  renderFlowChart();
  renderRecapDetails();
  renderTrend();
  renderRecapHistory();
  renderFullTransactions();
}

// ===== DETAIL RINGKASAN: perbandingan bulan, tren saldo, rata-rata, peta aktivitas, top =====
let cmpChart, netChart;
const daysIn = key => { const [y, m] = key.split('-').map(Number); return new Date(y, m, 0).getDate(); };
const prevKey = key => { const [y, m] = key.split('-').map(Number); const d = new Date(y, m - 2, 1); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); };
const cssVar = n => getComputedStyle(document.body).getPropertyValue(n).trim();

// jumlah per hari (indeks 0 = tanggal 1); pilih: fungsi yang memberi nilai (+/-) tiap transaksi
function perHari(key, nilai) {
  const a = Array(daysIn(key)).fill(0);
  inMonth(globalData.transactions, key).filter(t => !netral(t)).forEach(t => {
    const d = Number((t.tanggal || '').slice(8, 10));
    if (d >= 1 && d <= a.length) a[d - 1] += nilai(t);
  });
  return a;
}
const kumulatif = a => { let s = 0; return a.map(v => (s += v)); };

function lineChart(old, canvasId, series, fill) {
  const el = document.getElementById(canvasId);
  if (old) old.destroy();
  if (!el) return null;
  const muted = cssVar('--text-muted'), grid = cssVar('--border-color');
  return new Chart(el.getContext('2d'), {
    type: 'line',
    data: { labels: series[0].data.map((_, i) => i + 1), datasets: series.map((s, i) => ({
      data: s.data, borderColor: s.color, borderWidth: i ? 1.5 : 2.5, borderDash: i ? [5, 4] : [], pointRadius: 0, tension: 0.3,
      fill: !i && fill, backgroundColor: !i && fill ? `color-mix(in srgb, ${s.color} 14%, transparent)` : 'transparent', spanGaps: false
    })) },
    options: {
      responsive: true, maintainAspectRatio: false, animation: false,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { display: false }, tooltip: { callbacks: { title: it => 'Tgl ' + it[0].label, label: c => ' ' + format(c.parsed.y) } } },
      scales: {
        x: { grid: { display: false }, ticks: { color: muted, font: { size: 10 }, maxRotation: 0, callback: (v, i) => (i === 0 || (i + 1) % 10 === 1) ? i + 1 : '' } },
        y: { grid: { color: grid }, border: { display: false }, ticks: { color: muted, font: { size: 10 }, maxTicksLimit: 4, callback: v => (v < 0 ? '-' : '') + formatShort(Math.abs(v)) } }
      }
    }
  });
}

function renderRecapDetails() {
  if (typeof Chart === 'undefined') return;
  const exp = recapJenis === 'Pengeluaran';
  const warna = cssVar(exp ? '--neg' : '--pos'), muted = cssVar('--text-muted');
  const isNow = recapMonth === currentMonthKey();
  const nDays = daysIn(recapMonth), today = new Date().getDate();
  const upto = isNow ? today : nDays; // hari yang sudah berjalan
  const nilai = t => t.jenis === recapJenis ? (Number(t.jumlah) || 0) : 0;

  // 1) perbandingan kumulatif dengan bulan lalu
  const cur = kumulatif(perHari(recapMonth, nilai)), prev = kumulatif(perHari(prevKey(recapMonth), nilai));
  const curS = cur.map((v, i) => i < upto ? v : null), prevS = Array.from({ length: nDays }, (_, i) => prev[Math.min(i, prev.length - 1)] ?? 0);
  const a = cur[upto - 1] || 0, b = prevS[upto - 1] || 0;
  const bd = document.getElementById('cmpBadge'), sub = document.getElementById('cmpSub');
  if (b <= 0 && a <= 0) { bd.innerHTML = ''; sub.innerText = 'Belum ada data untuk dibandingkan.'; }
  else if (b <= 0) { bd.innerHTML = ''; sub.innerText = 'Bulan lalu belum ada ' + recapJenis.toLowerCase() + '.'; }
  else {
    const pct = (a - b) / b * 100, naik = pct >= 0, baik = exp ? !naik : naik;
    bd.innerHTML = `<i class="fa fa-arrow-${naik ? 'trend-up' : 'trend-down'}"></i> ${Math.abs(pct).toFixed(0)}%`;
    bd.style.color = baik ? 'var(--pos)' : 'var(--neg)'; bd.style.background = baik ? 'var(--pos-bg)' : 'var(--neg-bg)';
    sub.innerText = recapJenis + (naik ? ' lebih tinggi' : ' lebih rendah') + ' dari bulan lalu pada tanggal yang sama.';
  }
  document.getElementById('cmpDotA').style.background = warna;
  cmpChart = lineChart(cmpChart, 'chartCmp', [{ data: curS, color: warna }, { data: prevS, color: muted }], false);

  // 2) tren saldo bersih (pemasukan - pengeluaran)
  const net = t => t.jenis === 'Pemasukan' ? (Number(t.jumlah) || 0) : -(Number(t.jumlah) || 0);
  const nc = kumulatif(perHari(recapMonth, net)), np = kumulatif(perHari(prevKey(recapMonth), net));
  const ncS = nc.map((v, i) => i < upto ? v : null), npS = Array.from({ length: nDays }, (_, i) => np[Math.min(i, np.length - 1)] ?? 0);
  const nb = document.getElementById('netBadge'), last = nc[upto - 1] || 0;
  nb.innerText = (last < 0 ? '- ' : '') + format(Math.abs(last)); nb.style.color = last >= 0 ? 'var(--pos)' : 'var(--neg)'; nb.style.background = last >= 0 ? 'var(--pos-bg)' : 'var(--neg-bg)';
  netChart = lineChart(netChart, 'chartNet', [{ data: ncS, color: cssVar('--primary') }, { data: npS, color: muted }], true);

  // 3) rata-rata harian + proyeksi
  const total = cur[nDays - 1] || 0, avg = total / Math.max(upto, 1);
  document.getElementById('recapAvg').innerHTML = `
    <div style="display: flex; justify-content: space-between; gap: 12px;">
      <div><p class="rd-sub">Rata-rata Harian</p><b class="rd-big">${format(Math.round(avg))}</b></div>
      <div style="text-align: right;"><p class="rd-sub">${isNow ? 'Proyeksi Total' : 'Total Bulan Ini'}</p><b class="rd-big">${format(Math.round(isNow ? avg * nDays : total))}</b></div>
    </div>
    ${isNow ? `<p class="rd-note"><i class="fa fa-circle-info"></i> Berdasarkan kebiasaanmu sejauh bulan ini.</p>` : ''}`;

  // 4) peta aktivitas
  const harian = perHari(recapMonth, nilai), maks = Math.max(...harian, 0);
  const [y, m] = recapMonth.split('-').map(Number), geser = (new Date(y, m - 1, 1).getDay() + 6) % 7;
  const lv = v => v <= 0 ? 0 : Math.min(4, Math.ceil(v / maks * 4));
  const warnaLv = l => l ? `color-mix(in srgb, ${warna} ${[0, 22, 40, 62, 90][l]}%, transparent)` : 'var(--circle-bg)';
  let cells = '<i></i>'.repeat(geser);
  harian.forEach((v, i) => { const l = lv(v); cells += `<div class="heat-c" style="background: ${warnaLv(l)}; color: ${l >= 3 ? '#fff' : 'var(--text-main)'};"><span>${i + 1}</span>${v > 0 ? `<em>${formatShort(v)}</em>` : ''}</div>`; });
  document.getElementById('recapHeat').innerHTML = `
    <h3 class="rd-title">Peta Aktivitas</h3>
    <div class="heat-h">${['S', 'S', 'R', 'K', 'J', 'S', 'M'].map(d => `<span>${d}</span>`).join('')}</div>
    <div class="heat">${cells}</div>
    <div class="heat-leg">Sedikit ${[1, 2, 3, 4].map(l => `<i style="background: ${warnaLv(l)};"></i>`).join('')} Banyak</div>`;

  // 5) top 5
  let rows;
  if (recapTopMode === 'transaksi') {
    rows = inMonth(globalData.transactions, recapMonth).filter(t => !netral(t) && t.jenis === recapJenis)
      .sort((x, z) => (Number(z.jumlah) || 0) - (Number(x.jumlah) || 0)).slice(0, 5)
      .map(t => ({ nama: (t.keterangan || '').trim() || t.kategori || '-', sub: t.kategori + ' · ' + t.tanggal.slice(8, 10) + '/' + t.tanggal.slice(5, 7), jumlah: Number(t.jumlah) || 0 }));
  } else {
    rows = catData(recapMonth).list.slice(0, 5).map(c => ({ nama: c.nama, sub: c.n + ' transaksi', jumlah: c.jumlah }));
  }
  const tb = (k, t) => `<button type="button" class="${recapTopMode === k ? 'on' : ''}" onclick="setRecapTop('${k}')">${t}</button>`;
  document.getElementById('recapTop').innerHTML = `
    <div class="rd-head"><h3 class="rd-title">Top ${exp ? 'Pengeluaran' : 'Pemasukan'}</h3><div class="rd-tog">${tb('kategori', 'Kategori')}${tb('transaksi', 'Transaksi')}</div></div>
    ${rows.length ? rows.map((r, i) => `<div class="top-r"><span class="top-n">${i + 1}</span><div style="flex: 1; min-width: 0;"><strong>${esc(r.nama)}</strong><p class="rd-sub">${esc(r.sub)}</p></div><b>${format(r.jumlah)}</b></div>`).join('') : `<p class="rd-sub" style="text-align: center; padding: 16px 0;">Belum ada data.</p>`}`;
}

function renderRecapHistory() {
  const box = document.getElementById('recapHistory');
  if (!box) return;

  const keys = [...new Set((globalData.transactions || [])
    .map(t => (t.tanggal || '').slice(0, 7))
    .filter(k => /^\d{4}-\d{2}$/.test(k)))].sort().reverse();

  if (keys.length === 0) {
    box.innerHTML = `<p style="text-align: center; color: var(--text-muted); padding: 15px 0; font-size: 0.85rem;">Belum ada riwayat</p>`;
    return;
  }

  box.innerHTML = keys.map(k => {
    const s = monthTotals(k);
    const active = k === recapMonth ? 'border-color: var(--primary);' : '';
    return `
      <div class="list-card" onclick="selectRecap('${k}')" style="cursor: pointer; padding: 14px 16px; ${active}">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
          <strong style="font-size: 0.95rem;">${monthLabel(k)}</strong>
          <span style="font-size: 0.8rem; font-weight: 600; color: ${s.net >= 0 ? 'var(--pos)' : 'var(--neg)'};">${s.net >= 0 ? '+' : '-'} ${format(Math.abs(s.net))}</span>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 0.75rem; color: var(--text-muted); font-weight: 500;">
          <span>Masuk ${format(s.inc)}</span>
          <span>Keluar ${format(s.exp)}</span>
        </div>
      </div>`;
  }).join('');
}

function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

window.onload = () => { 
  const elTgl = document.getElementById("tanggal");
  if (elTgl) elTgl.value = todayStr();

  // 1. Tampilkan data dari cache lokal secara instan (0 detik)
  renderAllLocalUI();

  // 2. Tarik sinkronisasi data terbaru dari Google Sheets di latar belakang
  loadData();
  
  initFormListeners();
};

// ===== TEMA =====
// Warna tiap tema ada di style.css (body[data-theme]); di sini hanya daftar, pemilih, dan penerapannya.
const THEMES = [
  { id: 'terang', nama: 'Terang',     ic: 'fa-sun',    dark: false, sw: ['#ffffff', '#f1f5f9', '#ccff00'] },
  { id: 'langit', nama: 'Langit',     ic: 'fa-cloud',  dark: false, sw: ['#f0f9ff', '#e0f2fe', '#38bdf8'] },
  { id: 'sakura', nama: 'Sakura',     ic: 'fa-heart',  dark: false, sw: ['#fff5f9', '#fce7f3', '#f9a8d4'] },
  { id: 'emas',   nama: 'Emas',       ic: 'fa-crown',  dark: true,  sw: ['#0a0a0b', '#141416', '#d4af6a'] },
  { id: 'gelap',  nama: 'Gelap',      ic: 'fa-moon',   dark: true,  sw: ['#0f1115', '#181b20', '#ccff00'] },
  { id: 'malam',  nama: 'Malam',      ic: 'fa-star',   dark: true,  sw: ['#0b1020', '#141b34', '#22d3ee'] },
  { id: 'kopi',   nama: 'Kopi',       ic: 'fa-mug-hot', dark: true, sw: ['#17110d', '#241a14', '#fbbf24'] },
  { id: 'oled',   nama: 'Hitam OLED', ic: 'fa-circle', dark: true,  sw: ['#000000', '#0d0d0d', '#4ade80'] }
];
const THEME_KEY = 'budggt_theme';
let themePref = 'emas'; // id tema, atau 'auto' = ikuti sistem
try { themePref = localStorage.getItem(THEME_KEY) || (localStorage.getItem('theme') === 'dark' ? 'gelap' : 'emas'); } catch (e) {}

// ----- tema kustom: pilih mode + warna aksen + warna latar, sisanya diturunkan otomatis -----
const CUSTOM_KEY = 'budggt_theme_custom';
let themeCustom = { dark: true, accent: '#a78bfa', bg: null };
try { Object.assign(themeCustom, JSON.parse(localStorage.getItem(CUSTOM_KEY) || '{}')); } catch (e) {}
const CUSTOM_VARS = ['--pos', '--neg', '--warn', '--primary', '--primary-hover', '--bg-main', '--app-bg', '--card-bg', '--border-color', '--circle-bg', '--circle-icon', '--text-main', '--text-muted', '--hero'];
const CUSTOM_AKSEN = ['#ccff00', '#fbbf24', '#fb923c', '#f87171', '#f472b6', '#c084fc', '#a78bfa', '#60a5fa', '#22d3ee', '#4ade80'];
const CUSTOM_BG = {
  true:  ['#0f1115', '#000000', '#0b1020', '#17110d', '#0d1a14', '#1a0f1a'],
  false: ['#ffffff', '#f0f9ff', '#fff5f9', '#f7fee7', '#fffbeb', '#f5f3ff']
};
function lum(h) {
  const n = parseInt(h.slice(1), 16), f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(n >> 16 & 255) + 0.7152 * f(n >> 8 & 255) + 0.0722 * f(n & 255);
}
// teks di atas warna aksen selalu hitam, jadi aksen yang terlalu gelap dicerahkan sedikit
function aksenAman(h) {
  for (let i = 0; i < 12 && lum(h) < 0.28; i++) {
    const n = parseInt(h.slice(1), 16);
    h = '#' + [n >> 16 & 255, n >> 8 & 255, n & 255].map(c => Math.round(c + (255 - c) * 0.12).toString(16).padStart(2, '0')).join('');
  }
  return h;
}
function customVars() {
  const d = themeCustom.dark, a = aksenAman(themeCustom.accent), bg = themeCustom.bg || CUSTOM_BG[d][0];
  const mix = (c, p, w) => `color-mix(in srgb, ${c} ${p}%, ${w})`;
  return {
    '--primary': a, '--primary-hover': mix(a, 85, '#000'), '--app-bg': bg,
    '--bg-main': d ? mix(bg, 55, '#000') : mix(bg, 97, '#000'),
    // permukaan netral (tanpa rona), lebih terang dari latar supaya kartu jelas terpisah; aksen hanya untuk hal penting
    '--card-bg': d ? mix(bg, 89, '#fff') : mix(bg, 40, '#fff'),
    '--border-color': d ? mix(bg, 80, '#fff') : mix(bg, 88, '#000'),
    '--circle-bg': d ? mix(bg, 84, '#fff') : mix(bg, 96, '#000'),
    '--pos': d ? mix(a, 25, '#6ee7a0') : mix(a, 25, '#15803d'),
    '--neg': d ? mix('#fb7185', 85, a) : '#e11d48',
    '--warn': d ? mix('#facc15', 85, a) : '#a16207',
    '--circle-icon': d ? '#e5e7eb' : '#334155',
    '--text-main': d ? '#f3f4f6' : '#0f172a', '--text-muted': d ? '#9ca3af' : '#64748b',
    '--hero': `linear-gradient(135deg, ${mix(a, 30, '#000')} 0%, ${mix(a, 62, '#000')} 55%, ${a} 100%)`
  };
}
function setCustom(k, v, render = true) {
  if (k === 'dark' && v !== themeCustom.dark) themeCustom.bg = null;
  themeCustom[k] = v; themePref = 'kustom';
  try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(themeCustom)); localStorage.setItem(THEME_KEY, 'kustom'); } catch (e) {}
  applyTheme('kustom');
  if (render) renderThemePicker();
}

// warna aksen tema aktif, untuk grafik (canvas tidak bisa membaca var() CSS)
function accent() { return getComputedStyle(document.body).getPropertyValue('--primary').trim() || '#ccff00'; }

function applyTheme(pref) {
  const sysDark = !!(window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
  const id = pref === 'auto' ? (sysDark ? 'gelap' : 'terang') : pref;
  const th = id === 'kustom' ? { id: themeCustom.dark ? 'gelap' : 'terang', nama: 'Kustom', dark: themeCustom.dark } : (THEMES.find(t => t.id === id) || THEMES[0]);
  document.body.dataset.theme = th.id;
  document.body.classList.toggle('dark-mode', th.dark);
  const cv = id === 'kustom' ? customVars() : {};
  CUSTOM_VARS.forEach(v => cv[v] ? document.body.style.setProperty(v, cv[v]) : document.body.style.removeProperty(v));
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = getComputedStyle(document.body).getPropertyValue('--app-bg').trim() || meta.content;
  const nm = document.getElementById('themeName');
  if (nm) nm.innerText = pref === 'auto' ? 'Ikuti sistem' : th.nama;
  const an = document.getElementById('analytics');
  if (an && !an.classList.contains('hidden')) renderRecap(); // warna grafik ikut aksen baru
}

function pickTheme(id) {
  themePref = id;
  try { localStorage.setItem(THEME_KEY, id); } catch (e) {}
  applyTheme(id);
  renderThemePicker();
}

function openTheme() {
  renderThemePicker();
  toggleModal('modalTheme');
}

function renderThemePicker() {
  const box = document.getElementById('themeList');
  if (!box) return;
  const row = (id, nama, ic, sw) => {
    const on = themePref === id;
    return `
      <div onclick="pickTheme('${id}')" style="display: flex; align-items: center; gap: 14px; padding: 12px 14px; margin-bottom: 10px; border-radius: 16px; cursor: pointer; background: var(--circle-bg); border: 2px solid ${on ? 'var(--primary)' : 'var(--border-color)'};">
        <div style="width: 40px; height: 40px; border-radius: 12px; background: var(--card-bg); display: flex; align-items: center; justify-content: center; color: var(--text-main);"><i class="fa ${ic}"></i></div>
        <strong style="flex: 1; font-size: 0.95rem;">${nama}</strong>
        ${sw ? `<span style="display: flex;">${sw.map((c, i) => `<span style="width: 22px; height: 22px; border-radius: 50%; background: ${c}; border: 1px solid rgba(128,128,128,0.45); margin-left: ${i ? -6 : 0}px;"></span>`).join('')}</span>` : ''}
        ${on ? '<i class="fa fa-circle-check" style="color: var(--pos); font-size: 1.2rem;"></i>' : ''}
      </div>`;
  };
  const lbl = t => `<p style="font-size: 0.7rem; font-weight: 600; color: var(--text-muted); margin: 14px 0 8px;">${t}</p>`;
  const grup = dark => THEMES.filter(t => t.dark === dark).map(t => row(t.id, t.nama, t.ic, t.sw)).join('');
  const c = themeCustom, sw = (col, on, fn) => `<span onclick="${fn}" style="width: 32px; height: 32px; border-radius: 50%; background: ${col}; cursor: pointer; flex-shrink: 0; border: 2px solid ${on ? 'var(--text-main)' : 'rgba(128,128,128,0.4)'}; box-shadow: ${on ? '0 0 0 2px var(--card-bg) inset' : 'none'};"></span>`;
  const bgNow = c.bg || CUSTOM_BG[c.dark][0];
  const seg = (on, t, fn) => `<button onclick="${fn}" style="flex: 1; padding: 9px; border-radius: 12px; border: 1px solid var(--border-color); cursor: pointer; font-weight: 600; font-size: 0.82rem; background: ${on ? 'var(--primary)' : 'var(--circle-bg)'}; color: ${on ? '#000' : 'var(--text-main)'};">${t}</button>`;
  const picker = (val, key) => `<label style="width: 32px; height: 32px; border-radius: 50%; flex-shrink: 0; cursor: pointer; overflow: hidden; position: relative; background: conic-gradient(red, yellow, lime, aqua, blue, magenta, red); border: 2px solid rgba(128,128,128,0.4);"><input type="color" value="${val}" oninput="setCustom('${key}', this.value, false)" onchange="setCustom('${key}', this.value)" style="position: absolute; inset: -8px; opacity: 0; width: 60px; height: 60px; cursor: pointer;"></label>`;
  const editor = `
    <div style="padding: 14px; border-radius: 16px; background: var(--circle-bg); border: 2px solid ${themePref === 'kustom' ? 'var(--primary)' : 'var(--border-color)'};">
      <strong style="font-size: 0.95rem;"><i class="fa fa-palette"></i> Buat sendiri ${themePref === 'kustom' ? '<i class="fa fa-circle-check" style="color: var(--pos); margin-left: 4px;"></i>' : ''}</strong>
      <div style="display: flex; gap: 8px; margin: 12px 0;">${seg(!c.dark, 'Terang', "setCustom('dark', false)")}${seg(c.dark, 'Gelap', "setCustom('dark', true)")}</div>
      <p style="font-size: 0.7rem; font-weight: 600; color: var(--text-muted); margin-bottom: 8px;">Warna aksen</p>
      <div style="display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 14px;">${CUSTOM_AKSEN.map(a => sw(a, themePref === 'kustom' && c.accent.toLowerCase() === a, `setCustom('accent', '${a}')`)).join('')}${picker(c.accent, 'accent')}</div>
      <p style="font-size: 0.7rem; font-weight: 600; color: var(--text-muted); margin-bottom: 8px;">Warna latar</p>
      <div style="display: flex; flex-wrap: wrap; gap: 10px;">${CUSTOM_BG[c.dark].map(b => sw(b, themePref === 'kustom' && bgNow.toLowerCase() === b, `setCustom('bg', '${b}')`)).join('')}${picker(bgNow, 'bg')}</div>
    </div>`;
  box.innerHTML = row('auto', 'Ikuti sistem', 'fa-mobile-screen') + lbl('Tema terang') + grup(false) + lbl('Tema gelap') + grup(true) + lbl('Warna sendiri') + editor;
}

applyTheme(themePref); // sedini mungkin supaya tidak berkedip
if (window.matchMedia) {
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (themePref === 'auto') applyTheme('auto'); });
}

// TOGGLE LOCK / HIDE BALANCE
function toggleBalanceVisibility() {
  isBalanceHidden = !isBalanceHidden;
  renderBalanceDisplay();
}

// saldo "menghitung naik" saat pertama tampil / berubah; tanpa animasi kalau perangkat minta gerak dikurangi
let shownSaldo = null;
function countUp(el, to) {
  const from = shownSaldo === null ? 0 : shownSaldo;
  shownSaldo = to;
  cancelAnimationFrame(el._raf);
  if (from === to || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches)) { el.innerText = format(to); return; }
  const t0 = performance.now();
  const step = t => {
    const k = Math.min(1, (t - t0) / 700);
    el.innerText = format(Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3))));
    if (k < 1) el._raf = requestAnimationFrame(step);
  };
  el._raf = requestAnimationFrame(step);
}

function renderBalanceDisplay() {
  const elSaldo = document.getElementById("sumSaldo");
  const elIncome = document.getElementById("sumIncome");
  const elExpense = document.getElementById("sumExpense");
  const lockIcon = document.getElementById("lockIcon");

  if (!elSaldo) return;

  if (isBalanceHidden) {
    cancelAnimationFrame(elSaldo._raf);
    elSaldo.innerText = "Rp •••••••";
    if (elIncome) elIncome.innerText = "Rp •••••••";
    if (elExpense) elExpense.innerText = "Rp •••••••";
    if (lockIcon) {
      lockIcon.className = "fa fa-lock";
      lockIcon.style.color = "#ffffff";
    }
  } else {
    countUp(elSaldo, rawSummary.saldo);
    if (elIncome) elIncome.innerText = format(rawSummary.income);
    if (elExpense) elExpense.innerText = format(rawSummary.expense);
    if (lockIcon) {
      lockIcon.className = "fa fa-lock-open";
      lockIcon.style.color = "rgba(255,255,255,0.75)";
    }
  }
}

// NAVIGASI HALAMAN
function openPage(id) {
  document.querySelectorAll(".page").forEach(p => p.classList.add("hidden"));
  document.querySelectorAll(".nav-tab").forEach(b => b.classList.remove("active"));
  
  const targetPage = document.getElementById(id);
  if (targetPage) targetPage.classList.remove("hidden");
  
  const activeBtn = document.getElementById('btn-' + id);
  if (activeBtn) activeBtn.classList.add("active");
  
  // halaman Budget tampil penuh: tanpa top bar dan nav bawah
  const fokus = id === 'budgets' || id === 'budgetForm';
  document.body.classList.toggle('focus-page', fokus);
  if (fokus) window.scrollTo({ top: 0 });

  // Laporan selalu terbuka di Ringkasan, bulan berjalan
  if (id === 'analytics') { recapMonth = currentMonthKey(); setReportTab('ringkasan'); }
}

// RENDER SELURUH UI DARI DATA LOKAL
function renderAllLocalUI() {
  const defaultName = (globalData.user || "Pengguna").split('@')[0];
  const savedName = localStorage.getItem('user_display_name') || defaultName;
  updateGreeting(savedName);

  const prefNameInput = document.getElementById("prefDisplayName");
  const prefEmailInput = document.getElementById("prefEmail");
  if (prefNameInput) prefNameInput.value = savedName;
  if (prefEmailInput) prefEmailInput.value = globalData.user || "-";

  renderAccounts(globalData.accountSummary || []);
  renderTransactions(globalData.transactions || []);
  renderCalendar(globalData.transactions || []);
  updateDashboard(globalData);
  populateDropdown(globalData.accounts || []);
  renderBudgets();
  renderTagihan();
  renderLevel();
  renderDebts();
  renderBackupNag();

  // Laporan (ringkasan + daftar transaksi) ikut segar kalau sedang dibuka
  const an = document.getElementById('analytics');
  if (an && !an.classList.contains('hidden')) renderRecap();

  const dm = document.getElementById('modalDay');
  if (dm && !dm.classList.contains('hidden')) renderDay();
}

// AMBIL DATA DARI SPREADSHEET (BACKGROUND SYNC)
function loadData() {
  google.script.run
    .withSuccessHandler(res => {
      if (!res) return;
      globalData = res;
      localStorage.setItem('budggt_local_cache', JSON.stringify(res));
      renderAllLocalUI();
    })
    .withFailureHandler(err => {
      console.warn("Gagal sinkron data: " + err.message);
    })
    .getFullData();
}

function updateGreeting(name) {
  const userEl = document.getElementById("userDisplay");
  if (userEl) userEl.innerHTML = `Halo, ${name} 🌙`;
}

function populateDropdown(accounts) {
  let el = document.getElementById("rekening");
  if (el && accounts) {
    el.innerHTML = accounts.map(a => `<option value="${a.id}">${a.nama}</option>`).join("");
  }
}

// ===== PILIH REKENING UNTUK KARTU SALDO =====
let saldoSel = null; // null = semua rekening
try {
  const s = JSON.parse(localStorage.getItem('budggt_saldo_sel'));
  if (Array.isArray(s)) saldoSel = s;
} catch (e) {}

function saveSaldoSel() {
  try { localStorage.setItem('budggt_saldo_sel', JSON.stringify(saldoSel)); } catch (e) {}
}

// rekening yang dihitung; rekening terhapus diabaikan, kalau kosong kembali ke semua
function saldoAccounts() {
  const all = globalData.accountSummary || [];
  if (!saldoSel) return all;
  const pick = all.filter(a => saldoSel.includes(a.id));
  return pick.length ? pick : all;
}

function renderSaldoLabel() {
  const el = document.getElementById('saldoFilterLabel');
  if (!el) return;
  const all = globalData.accountSummary || [];
  const picked = saldoAccounts();
  if (all.length === 0 || picked.length === all.length) el.innerText = 'Semua rekening';
  else if (picked.length === 1) el.innerText = picked[0].nama;
  else el.innerText = picked.length + ' dari ' + all.length + ' rekening';
}

function openSaldoPicker() {
  renderSaldoPicker();
  toggleModal('modalSaldo');
}

function renderSaldoPicker() {
  const box = document.getElementById('saldoPickerList');
  if (!box) return;
  const all = globalData.accountSummary || [];
  if (all.length === 0) {
    box.innerHTML = `<p style="text-align: center; color: var(--text-muted); padding: 20px 0; font-size: 0.9rem;">Belum ada rekening</p>`;
    return;
  }
  const picked = new Set(saldoAccounts().map(a => a.id));
  const allOn = picked.size === all.length;
  const row = 'display: flex; align-items: center; gap: 12px; padding: 12px 0; border-top: 1px solid var(--border-color); cursor: pointer;';
  const box_ = on => `<i class="${on ? 'fa-solid fa-square-check' : 'fa-regular fa-square'}" style="font-size: 1.2rem; color: ${on ? 'var(--pos)' : 'var(--text-muted)'};"></i>`;
  const total = all.reduce((s, a) => s + (Number(a.saldoAkhir) || 0), 0);

  box.innerHTML = `
    <div onclick="selectAllSaldo()" style="${row} border-top: none;">
      ${box_(allOn)}
      <div style="flex: 1;"><strong style="font-size: 0.95rem;">Semua rekening</strong></div>
      <span style="font-weight: 600; font-size: 0.9rem;">${format(total)}</span>
    </div>` +
    all.map(a => `
    <div onclick="toggleSaldoAcc('${a.id}')" style="${row}">
      ${box_(picked.has(a.id))}
      <div style="flex: 1;">
        <strong style="font-size: 0.95rem;">${a.nama}</strong>
        <p style="font-size: 0.72rem; color: var(--text-muted); font-weight: 500; ">${a.jenis}</p>
      </div>
      <span style="font-weight: 600; font-size: 0.85rem;">${format(a.saldoAkhir)}</span>
      <button type="button" onclick="event.stopPropagation(); onlySaldoAcc('${a.id}')" style="background: var(--circle-bg); color: var(--text-muted); border: 1px solid var(--border-color); padding: 4px 10px; border-radius: 20px; font-size: 0.72rem; font-weight: 500; cursor: pointer;">Hanya ini</button>
    </div>`).join('');
}

function applySaldoSel() {
  saveSaldoSel();
  renderSaldoPicker();
  updateDashboard(globalData);
}

function selectAllSaldo() {
  saldoSel = null;
  applySaldoSel();
}

function onlySaldoAcc(id) {
  const all = globalData.accountSummary || [];
  saldoSel = all.length <= 1 ? null : [id];
  applySaldoSel();
}

function toggleSaldoAcc(id) {
  const all = (globalData.accountSummary || []).map(a => a.id);
  let cur = saldoSel ? saldoSel.filter(x => all.includes(x)) : all.slice();
  if (cur.includes(id)) cur = cur.filter(x => x !== id); else cur.push(id);
  if (cur.length === 0) { renderSaldoPicker(); return; } // minimal satu rekening
  saldoSel = cur.length === all.length ? null : cur; // semua dicentang = otomatis termasuk rekening baru
  applySaldoSel();
}

// UPDATE DASHBOARD RINGKASAN
function updateDashboard(res) {
  let sal = 0, fInc = 0, fExp = 0;
  const picked = saldoAccounts();
  const ids = new Set(picked.map(a => a.id));

  inMonth(res.transactions, currentMonthKey()).filter(t => !netral(t)).forEach(t => {
    const amt = Number(t.jumlah) || 0;
    const masuk = t.jenis === "Pemasukan";
    if (ids.has(t.rekeningId)) { if (masuk) fInc += amt; else fExp += amt; }
  });
  picked.forEach(a => { sal += Number(a.saldoAkhir) || 0; });

  // kartu atas mengikuti rekening yang dipilih
  rawSummary = { saldo: sal, income: fInc, expense: fExp };
  renderBalanceDisplay();
  renderSaldoLabel();

}

function getAccountName(rekeningId) {
  if (!globalData || !globalData.accounts) return 'Dompet Utama';
  let acc = globalData.accounts.find(a => a.id === rekeningId);
  return acc ? acc.nama : 'Dompet Utama';
}

// ===== DOMPET: kartu ringkasan, daftar per tipe, dan Savings Goals =====
const KAT_SETOR = 'Setoran Tabungan'; // setor ke goal: uang pindah dari dompet (bukan pengeluaran biasa)
const KAT_TARIK = 'Tarik Tabungan';   // tarik dari goal: uang balik ke dompet (bukan pemasukan biasa)
const GOAL_WARNA = '#f59e0b';

const TIPE_DOMPET = [
  { jenis: 'Dompet Tunai',   judul: 'Tunai',         sub: 'CASH',     ic: 'fa-money-bill-wave',      warna: '#22c55e', kosong: 'dompet tunai' },
  { jenis: 'Bank',           judul: 'Rekening Bank', sub: 'BANK',     ic: 'fa-building-columns',     warna: '#3b82f6', kosong: 'rekening bank' },
  { jenis: 'Dompet Digital', judul: 'E-Wallet',      sub: 'E-WALLET', ic: 'fa-mobile-screen-button', warna: '#a855f7', kosong: 'e-wallet' }
];

// aman dipakai di dalam onclick="fn('...')" (nama dengan tanda petik tidak merusak tombol)
const jsq = s => esc(String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'"));

function goalList() { return globalData.goals || []; }
function tipeDompet(a) { return TIPE_DOMPET.find(t => t.jenis === a.jenis) || TIPE_DOMPET[1]; }

function walletStats() {
  const acc = globalData.accountSummary || [];
  let saldo = 0, utang = 0;
  acc.forEach(a => { const s = Number(a.saldoAkhir) || 0; saldo += s; if (s < 0) utang += -s; });
  const tabungan = goalList().reduce((s, g) => s + (Number(g.terkumpul) || 0), 0);
  const tagihan = billList().filter(b => billStatus(b).lv !== 'lunas').reduce((s, b) => s + (Number(b.jumlah) || 0), 0);

  // perubahan 30 hari terakhir = pemasukan - pengeluaran (Transfer, Koreksi, dan setor/tarik tabungan tidak dihitung)
  const hari = dayIdx(todayStr());
  let delta = 0;
  (globalData.transactions || [])
    .filter(t => !netral(t) && /^\d{4}-\d{2}-\d{2}$/.test(t.tanggal || ''))
    .forEach(t => {
      const d = dayIdx(t.tanggal);
      if (d > hari - 30 && d <= hari) delta += (t.jenis === 'Pemasukan' ? 1 : -1) * (Number(t.jumlah) || 0);
    });
  const ds = debtStats();
  const kekayaan = saldo + tabungan + ds.piutang - ds.utang; // piutang = uang kita di orang lain
  const dulu = kekayaan - delta;
  return { saldo, utang: utang + ds.utang, tabungan, tagihan, delta, kekayaan, pct: dulu > 0 ? delta / dulu * 100 : 0 };
}

function walletHeroHtml() {
  const s = walletStats();
  const naik = s.delta >= 0;
  const tile = (lbl, val, go) => `<div class="wh-tile${go ? ' go' : ''}"${go ? ` onclick="${go}"` : ''}><p>${lbl}</p><b>${format(val)}</b></div>`;
  return `
    <div class="wallet-hero">
      <p class="wh-label">Saldo Tersedia (IDR)</p>
      <h2 class="wh-total">${format(s.saldo)}</h2>
      <div class="wh-delta">
        <span class="wh-pill"><i class="fa ${naik ? 'fa-arrow-up' : 'fa-arrow-down'}"></i> ${naik ? '+' : '-'}${Math.abs(s.pct).toFixed(1)}%</span>
        <span class="wh-sub">(${naik ? '+' : '-'}${format(Math.abs(s.delta))}) 30 hari terakhir</span>
      </div>
      <div class="wh-grid">
        ${tile('Kekayaan Bersih', s.kekayaan)}
        ${tile('Utang / Minus', s.utang, "openPage('debts')")}
        ${tile('Tabungan Aktif', s.tabungan)}
        ${tile('Tagihan Mendatang', s.tagihan, "openPage('bills')")}
      </div>
    </div>`;
}

function walletHeadHtml(judul, total, aksi, tip) {
  return `
    <div class="section-title-row wl-head">
      <h3 class="section-title">${judul}</h3>
      <div style="display: flex; align-items: center; gap: 10px;">
        <span class="wl-total">${format(total)}</span>
        <button type="button" class="icon-btn" title="${tip}" onclick="${aksi}"><i class="fa fa-plus"></i></button>
      </div>
    </div>`;
}

function accountCardHtml(a, t) {
  const labelNomor = a.jenis === 'Bank' ? 'NOMOR REKENING' : (a.jenis === 'Dompet Digital' ? 'NOMOR HP' : 'KETERANGAN');
  const nomor = (a.nomor && a.nomor !== '-' && a.nomor !== 'undefined') ? a.nomor : '';
  const saldo = Number(a.saldoAkhir) || 0;
  return `
    <div class="acc-card" id="acc-card-${a.id}">
      <div class="acc-header" onclick="toggleAccDropdown('${a.id}')">
        <div style="display: flex; align-items: center; gap: 12px; min-width: 0;">
          <div class="wl-ic" style="background: ${t.warna}26; color: ${t.warna};"><i class="fa ${t.ic}"></i></div>
          <div style="min-width: 0;">
            <h4 class="wl-name">${esc(a.nama)}</h4>
            <p class="wl-sub">${t.sub} • IDR</p>
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 12px;">
          <div style="text-align: right;">
            <p class="wl-cap">Saldo</p>
            <h3 class="wl-bal" style="${saldo < 0 ? 'color: var(--neg);' : ''}">${format(saldo)}</h3>
          </div>
          <i class="fa fa-chevron-down" style="font-size: 0.8rem; color: var(--text-muted);"></i>
        </div>
      </div>

      <div class="acc-details">
        ${nomor ? `
          <div style="background: var(--circle-bg); padding: 12px; border-radius: var(--radius-sm); margin-bottom: 12px; border: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center; gap: 10px;">
            <div style="min-width: 0;">
              <p style="font-size: 0.72rem; font-weight: 500; color: var(--text-muted); margin-bottom: 2px;">${labelNomor}</p>
              <p style="font-size: 0.95rem; font-weight: 500; letter-spacing: 1px; word-break: break-all;">${esc(nomor)}</p>
            </div>
            <button type="button" class="wl-btn" onclick="copyToClipboard('${jsq(nomor)}', this)"><i class="fa fa-copy"></i> Salin</button>
          </div>` : '<p style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 12px;">Tidak ada nomor tercatat</p>'}
        <div class="wl-actions">
          <button type="button" class="wl-btn" onclick="openEditAcc('${a.id}')"><i class="fa fa-pen"></i> Ubah</button>
          <button type="button" class="wl-btn d" onclick="confirmDeleteAcc('${a.id}', '${jsq(a.nama)}')"><i class="fa fa-trash"></i> Hapus Dompet</button>
        </div>
      </div>
    </div>`;
}

function goalCardHtml(g) {
  const got = Number(g.terkumpul) || 0, target = Number(g.target) || 0;
  const pct = target > 0 ? Math.min(100, got / target * 100) : 0;
  const done = target > 0 && got >= target;
  const terkunci = !!g.kunci && !done;
  const warna = done ? 'var(--pos)' : GOAL_WARNA;
  return `
    <div class="acc-card" id="acc-card-g_${g.id}">
      <div class="acc-header" onclick="toggleAccDropdown('g_${g.id}')">
        <div style="display: flex; align-items: center; gap: 12px; min-width: 0;">
          <div class="wl-ic" style="background: ${GOAL_WARNA}26; color: ${GOAL_WARNA};"><i class="fa fa-piggy-bank"></i></div>
          <div style="min-width: 0;">
            <h4 class="wl-name">${esc(g.nama)}${g.kunci ? ` <i class="fa ${terkunci ? 'fa-lock' : 'fa-lock-open'} wl-lock"></i>` : ''}</h4>
            <p class="wl-sub">TABUNGAN</p>
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 12px;">
          <div style="text-align: right;">
            <p class="wl-cap">Terkumpul</p>
            <h3 class="wl-bal">${format(got)}</h3>
            <p class="wl-cap">Target ${format(target)}</p>
          </div>
          <i class="fa fa-chevron-down" style="font-size: 0.8rem; color: var(--text-muted);"></i>
        </div>
      </div>

      <div class="budget-track" style="margin-top: 12px;"><div class="budget-fill" style="width: ${pct}%; background: ${warna};"></div></div>
      <div class="wl-cap" style="display: flex; justify-content: space-between; margin-top: 6px;">
        <span>${Math.floor(pct)}%${done ? ' · Target tercapai 🎉' : ''}</span>
        <span>${done ? '' : 'Kurang ' + format(target - got)}</span>
      </div>

      <div class="acc-details">
        <div class="wl-actions" style="justify-content: flex-start; flex-wrap: wrap;">
          <button type="button" class="wl-btn p" onclick="openGoalMove('${g.id}', 'setor')"><i class="fa fa-arrow-down"></i> Setor</button>
          <button type="button" class="wl-btn" onclick="openGoalMove('${g.id}', 'tarik')"><i class="fa fa-arrow-up"></i> Tarik</button>
          <button type="button" class="wl-btn" onclick="openGoal('${g.id}')"><i class="fa fa-pen"></i> Ubah</button>
          <button type="button" class="wl-btn d" onclick="removeGoal('${g.id}')"><i class="fa fa-trash"></i> Hapus</button>
        </div>
      </div>
    </div>`;
}

// RENDER HALAMAN DOMPET (dipanggil renderAllLocalUI)
function renderAccounts(list) {
  const grid = document.getElementById('accountGrid');
  if (!grid) return;
  list = list || [];

  const sections = TIPE_DOMPET.map(t => {
    const items = list.filter(a => tipeDompet(a) === t);
    const total = items.reduce((s, a) => s + (Number(a.saldoAkhir) || 0), 0);
    return `<div class="wl-section">` +
      walletHeadHtml(t.judul, total, `openAddAcc('${t.jenis}')`, 'Tambah ' + t.kosong) +
      (items.length
        ? items.map(a => accountCardHtml(a, t)).join('')
        : `<div class="wl-empty"><i class="fa ${t.ic}"></i><p>Belum ada ${t.kosong}</p><small>Tap + di kanan atas untuk menambah</small></div>`) +
      `</div>`;
  }).join('');

  const goals = goalList();
  const goalTotal = goals.reduce((s, g) => s + (Number(g.terkumpul) || 0), 0);
  const goalSection = `<div class="wl-section">` +
    walletHeadHtml('Savings Goals', goalTotal, 'openGoal()', 'Tambah target tabungan') +
    (goals.length
      ? goals.map(goalCardHtml).join('')
      : `<div class="wl-empty"><i class="fa fa-piggy-bank"></i><p>Belum ada savings goal</p><small>Tap + untuk bikin target tabungan (liburan, gadget, dana darurat)</small></div>`) +
    `</div>`;

  grid.innerHTML = walletHeroHtml() + sections + goalSection;
}

// tombol + di tiap grup: buka form rekening dengan tipe yang sudah terpilih
function openAddAcc(jenis) {
  const el = document.getElementById('accJenis');
  if (el && jenis) { el.value = jenis; updateAccountLabel(jenis); }
  toggleModal('modalAccount');
}

// ===== SAVINGS GOALS =====
function openGoal(id) {
  const g = id ? goalList().find(x => x.id === id) : null;
  if (id && !g) return;
  document.getElementById('goalTitle').innerText = g ? 'Ubah Savings Goal' : 'Tambah Savings Goal';
  document.getElementById('goalId').value = g ? g.id : '';
  document.getElementById('goalNama').value = g ? g.nama : '';
  document.getElementById('goalTarget').value = g ? formatRupiahInput(g.target) : '';
  document.getElementById('goalKunci').checked = g ? !!g.kunci : false;
  toggleModal('modalGoal');
}

function submitGoal() {
  const id = document.getElementById('goalId').value;
  const nama = document.getElementById('goalNama').value.trim();
  const target = Number(document.getElementById('goalTarget').value.replace(/\./g, '')) || 0;
  const kunci = document.getElementById('goalKunci').checked;

  if (!nama) { alert('Isi nama tujuan tabungan (cth: Liburan)'); return; }
  if (target <= 0) { alert('Isi target dana lebih dari 0'); return; }

  let g;
  if (id) {
    g = goalList().find(x => x.id === id);
    if (!g) return;
    Object.assign(g, { nama, target, kunci });
  } else {
    g = { id: 'goal_' + Date.now(), nama, target, terkumpul: 0, kunci };
    (globalData.goals = globalData.goals || []).push(g);
  }

  localStorage.setItem('budggt_local_cache', JSON.stringify(globalData));
  toggleModal('modalGoal');
  renderAllLocalUI();

  google.script.run
    .withFailureHandler(err => alert('Gagal simpan savings goal: ' + err.message))
    .setGoal(g);
}

function removeGoal(id) {
  const g = goalList().find(x => x.id === id);
  if (!g) return;
  if ((Number(g.terkumpul) || 0) > 0) {
    alert('Saldo "' + g.nama + '" masih ' + format(g.terkumpul) + '. Tarik dulu ke dompet, baru goal ini bisa dihapus.');
    return;
  }
  if (!confirm('Hapus savings goal "' + g.nama + '"?')) return;
  globalData.goals = globalData.goals.filter(x => x.id !== id);
  localStorage.setItem('budggt_local_cache', JSON.stringify(globalData));
  renderAllLocalUI();
  google.script.run
    .withFailureHandler(err => alert('Gagal hapus savings goal: ' + err.message))
    .deleteGoal(id);
}

function openGoalMove(id, mode) {
  const g = goalList().find(x => x.id === id);
  if (!g) return;
  const setor = mode !== 'tarik';
  const got = Number(g.terkumpul) || 0, target = Number(g.target) || 0;

  if ((globalData.accountSummary || []).length === 0) { alert('Tambah dompet dulu supaya ada sumber / tujuan dananya'); return; }
  if (!setor) {
    if (got <= 0) { alert('Belum ada saldo di "' + g.nama + '"'); return; }
    if (g.kunci && got < target) { alert('"' + g.nama + '" terkunci sampai target tercapai (kurang ' + format(target - got) + ')'); return; }
  }

  document.getElementById('goalMoveId').value = g.id;
  document.getElementById('goalMoveMode').value = setor ? 'setor' : 'tarik';
  document.getElementById('goalMoveTitle').innerText = (setor ? 'Setor ke ' : 'Tarik dari ') + g.nama;
  document.getElementById('goalMoveInfo').innerText = 'Terkumpul ' + format(got) + ' dari target ' + format(target);
  document.getElementById('goalMoveLbl').innerText = setor ? 'Ambil dari dompet' : 'Masukkan ke dompet';
  document.getElementById('goalMoveRekening').innerHTML = (globalData.accountSummary || [])
    .map(a => `<option value="${a.id}">${esc(a.nama)} · ${format(a.saldoAkhir)}</option>`).join('');
  document.getElementById('goalMoveJumlah').value = '';
  toggleModal('modalGoalMove');
}

function submitGoalMove() {
  const g = goalList().find(x => x.id === document.getElementById('goalMoveId').value);
  if (!g) return;
  const setor = document.getElementById('goalMoveMode').value !== 'tarik';
  const jumlah = Number(document.getElementById('goalMoveJumlah').value.replace(/\./g, '')) || 0;
  const rekeningId = document.getElementById('goalMoveRekening').value;
  const acc = (globalData.accountSummary || []).find(a => a.id === rekeningId);
  const before = Number(g.terkumpul) || 0;

  if (jumlah <= 0) { alert('Isi jumlahnya dulu'); return; }
  if (!acc) { alert('Pilih dompet'); return; }
  if (setor && jumlah > (Number(acc.saldoAkhir) || 0)) { alert('Saldo ' + acc.nama + ' tidak cukup (' + format(acc.saldoAkhir) + ')'); return; }
  if (!setor && jumlah > before) { alert('Saldo tabungan hanya ' + format(before)); return; }

  const trx = {
    tanggal: todayStr(),
    jenis: setor ? 'Pengeluaran' : 'Pemasukan',
    kategori: setor ? KAT_SETOR : KAT_TARIK,
    keterangan: (setor ? 'Ke tabungan ' : 'Dari tabungan ') + g.nama,
    jumlah, rekeningId
  };

  // update instan
  (globalData.transactions = globalData.transactions || []).unshift(Object.assign({ id: 'temp_' + Date.now() }, trx));
  acc.saldoAkhir = (Number(acc.saldoAkhir) || 0) + (setor ? -jumlah : jumlah);
  g.terkumpul = before + (setor ? jumlah : -jumlah);
  const baruTercapai = setor && g.target > 0 && before < g.target && g.terkumpul >= g.target;

  localStorage.setItem('budggt_local_cache', JSON.stringify(globalData));
  toggleModal('modalGoalMove');
  renderAllLocalUI();
  if (baruTercapai) showToast('🎉 Target "' + g.nama + '" tercapai!', 1);

  google.script.run
    .withFailureHandler(err => alert('Gagal simpan savings goal: ' + err.message))
    .setGoal(g);
  google.script.run
    .withSuccessHandler(() => loadData())
    .withFailureHandler(err => alert('Gagal mencatat transaksi tabungan: ' + err.message))
    .addTransaction(Object.assign({}, trx, { jumlah: String(jumlah) }));
}

// ===== UTANG & PIUTANG =====
// ponytail: tiap catatan = satu orang/pihak dengan total + terbayar (cicilan boleh); uang ke/dari dompet dicatat sebagai transaksi netral (bukan pemasukan/pengeluaran)
const KAT_UTANG = 'Utang';     // pinjaman masuk / cicilan utang keluar
const KAT_PIUTANG = 'Piutang'; // uang dipinjamkan keluar / pembayaran diterima

function debtList() { return globalData.debts || []; }
function debtSisa(d) { return Math.max(0, (Number(d.jumlah) || 0) - (Number(d.terbayar) || 0)); }
function debtStats() {
  const s = { utang: 0, piutang: 0 };
  debtList().forEach(d => { s[d.tipe === 'piutang' ? 'piutang' : 'utang'] += debtSisa(d); });
  return s;
}

function debtStatus(d) {
  if (debtSisa(d) <= 0) return { label: 'Lunas', warna: 'var(--pos)' };
  if (!d.jatuh) return { label: 'Tanpa jatuh tempo', warna: 'var(--text-muted)' };
  const diff = dayIdx(d.jatuh) - dayIdx(todayStr());
  if (diff < 0) return { label: 'Terlambat ' + (-diff) + ' hari', warna: 'var(--neg)' };
  if (diff === 0) return { label: 'Jatuh tempo hari ini', warna: 'var(--warn)' };
  if (diff <= TAGIHAN_SOON) return { label: diff + ' hari lagi', warna: 'var(--warn)' };
  return { label: diff <= 30 ? diff + ' hari lagi' : 'Jatuh tempo ' + new Date(d.jatuh + 'T00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }), warna: 'var(--text-muted)' };
}

function debtCardHtml(d) {
  const utang = d.tipe !== 'piutang';
  const sisa = debtSisa(d), total = Number(d.jumlah) || 0;
  const pct = total > 0 ? Math.min(100, (total - sisa) / total * 100) : 0;
  const warna = utang ? '#ef4444' : '#22c55e';
  const st = debtStatus(d);
  return `
    <div class="acc-card" style="${sisa <= 0 ? 'opacity: 0.6;' : ''}">
      <div style="display: flex; justify-content: space-between; align-items: center; gap: 12px;">
        <div style="display: flex; align-items: center; gap: 12px; min-width: 0;">
          <div class="wl-ic" style="background: ${warna}26; color: ${warna};"><i class="fa ${utang ? 'fa-money-bill-transfer' : 'fa-hand-holding-dollar'}"></i></div>
          <div style="min-width: 0;">
            <h4 class="wl-name">${esc(d.nama)}</h4>
            <p class="wl-sub" style="color: ${st.warna};">${st.label}</p>
          </div>
        </div>
        <div style="text-align: right;">
          <p class="wl-cap">Sisa</p>
          <h3 class="wl-bal">${format(sisa)}</h3>
          <p class="wl-cap">dari ${format(total)}</p>
        </div>
      </div>
      <div class="budget-track" style="margin-top: 12px;"><div class="budget-fill" style="width: ${pct}%; background: ${warna};"></div></div>
      ${d.catatan ? `<p class="wl-cap" style="margin-top: 8px;">${esc(d.catatan)}</p>` : ''}
      <div class="wl-actions" style="justify-content: flex-start; flex-wrap: wrap; margin-top: 14px;">
        ${sisa > 0 ? `<button type="button" class="wl-btn p" onclick="openDebtPay('${d.id}')"><i class="fa ${utang ? 'fa-arrow-up' : 'fa-arrow-down'}"></i> ${utang ? 'Bayar' : 'Terima'}</button>` : ''}
        <button type="button" class="wl-btn" onclick="openDebt('${d.id}')"><i class="fa fa-pen"></i> Ubah</button>
        <button type="button" class="wl-btn d" onclick="removeDebt('${d.id}')"><i class="fa fa-trash"></i> Hapus</button>
      </div>
    </div>`;
}

function renderDebts() {
  const box = document.getElementById('debtBox');
  if (!box) return;
  const s = debtStats();
  const net = s.piutang - s.utang;
  const sect = (tipe, judul, kosong) => {
    const items = debtList().filter(d => (d.tipe === 'piutang' ? 'piutang' : 'utang') === tipe)
      .sort((a, b) => (debtSisa(a) <= 0) - (debtSisa(b) <= 0) || (a.jatuh || '9').localeCompare(b.jatuh || '9'));
    return `<div class="wl-section">` + walletHeadHtml(judul, s[tipe], `openDebt(null, '${tipe}')`, 'Tambah') +
      (items.length ? items.map(debtCardHtml).join('')
        : `<div class="wl-empty"><i class="fa fa-handshake"></i><p>${kosong}</p></div>`) + `</div>`;
  };
  box.innerHTML = `
    <div class="wallet-hero">
      <p class="wh-label">Posisi Bersih</p>
      <h2 class="wh-total">${net < 0 ? '-' : ''}${format(Math.abs(net))}</h2>
      <div class="wh-grid">
        <div class="wh-tile"><p>Utang Saya</p><b>${format(s.utang)}</b></div>
        <div class="wh-tile"><p>Piutang</p><b>${format(s.piutang)}</b></div>
      </div>
    </div>` +
    sect('utang', 'Utang Saya', 'Tidak ada utang 🎉') +
    sect('piutang', 'Piutang', 'Belum ada yang berutang padamu');
}

const walletOpts = () => '<option value="">Tidak dicatat ke dompet</option>' +
  (globalData.accountSummary || []).map(a => `<option value="${a.id}">${esc(a.nama)} · ${format(a.saldoAkhir)}</option>`).join('');

// transaksi netral ke dompet (kosong = tidak dicatat); dipanggil SETELAH setDebt supaya loadData() membaca data terbaru
function catatDebtTrx(rekeningId, jenis, kategori, keterangan, jumlah) {
  const acc = (globalData.accountSummary || []).find(a => a.id === rekeningId);
  if (!acc) return;
  const trx = { tanggal: todayStr(), jenis, kategori, keterangan, jumlah, rekeningId };
  (globalData.transactions = globalData.transactions || []).unshift(Object.assign({ id: 'temp_' + Date.now() }, trx));
  acc.saldoAkhir = (Number(acc.saldoAkhir) || 0) + (jenis === 'Pemasukan' ? jumlah : -jumlah);
  google.script.run
    .withSuccessHandler(() => loadData())
    .withFailureHandler(err => alert('Gagal mencatat transaksi ke dompet: ' + err.message))
    .addTransaction(Object.assign({}, trx, { jumlah: String(jumlah) }));
}

function setDebtTipe(t) {
  document.getElementById('debtTipe').value = t;
  document.getElementById('dt-utang').classList.toggle('active', t === 'utang');
  document.getElementById('dt-piutang').classList.toggle('active', t === 'piutang');
  document.getElementById('debtWalletLbl').innerText = t === 'utang' ? 'Uang pinjaman masuk ke dompet' : 'Uang yang dipinjamkan keluar dari dompet';
}

function openDebt(id, tipe) {
  const d = id ? debtList().find(x => x.id === id) : null;
  if (id && !d) return;
  document.getElementById('debtTitle').innerText = d ? 'Ubah Catatan' : 'Tambah Utang / Piutang';
  document.getElementById('debtId').value = d ? d.id : '';
  document.getElementById('debtNama').value = d ? d.nama : '';
  document.getElementById('debtJumlah').value = d ? formatRupiahInput(d.jumlah) : '';
  document.getElementById('debtJatuh').value = d ? d.jatuh || '' : '';
  document.getElementById('debtCatatan').value = d ? d.catatan || '' : '';
  document.getElementById('debtRekening').innerHTML = walletOpts();
  document.getElementById('debtWalletBox').classList.toggle('hidden', !!d); // ubah catatan tidak menyentuh dompet
  setDebtTipe(d ? d.tipe : (tipe || 'utang'));
  toggleModal('modalDebt');
}

function submitDebt() {
  const id = document.getElementById('debtId').value;
  const tipe = document.getElementById('debtTipe').value;
  const nama = document.getElementById('debtNama').value.trim();
  const jumlah = Number(document.getElementById('debtJumlah').value.replace(/\./g, '')) || 0;
  const jatuh = document.getElementById('debtJatuh').value;
  const catatan = document.getElementById('debtCatatan').value.trim();
  const rekeningId = document.getElementById('debtRekening').value;

  if (!nama) { alert('Isi nama (orang atau pihak yang bersangkutan)'); return; }
  if (jumlah <= 0) { alert('Isi jumlahnya dulu'); return; }

  let d;
  if (id) {
    d = debtList().find(x => x.id === id);
    if (!d) return;
    if (jumlah < (Number(d.terbayar) || 0)) { alert('Jumlah tidak boleh di bawah yang sudah dibayar (' + format(d.terbayar) + ')'); return; }
    Object.assign(d, { nama, tipe, jumlah, jatuh, catatan });
  } else {
    d = { id: 'debt_' + Date.now(), nama, tipe, jumlah, terbayar: 0, jatuh, catatan };
    (globalData.debts = globalData.debts || []).push(d);
  }

  google.script.run
    .withFailureHandler(err => alert('Gagal simpan: ' + err.message))
    .setDebt(d);
  if (!id && rekeningId) {
    // utang baru = uang masuk; piutang baru = uang keluar
    catatDebtTrx(rekeningId, tipe === 'utang' ? 'Pemasukan' : 'Pengeluaran', tipe === 'utang' ? KAT_UTANG : KAT_PIUTANG, (tipe === 'utang' ? 'Pinjam dari ' : 'Pinjamkan ke ') + nama, jumlah);
  }
  localStorage.setItem('budggt_local_cache', JSON.stringify(globalData));
  toggleModal('modalDebt');
  renderAllLocalUI();
}

function removeDebt(id) {
  const d = debtList().find(x => x.id === id);
  if (!d || !confirm('Hapus catatan "' + d.nama + '"? Transaksi di dompet yang sudah tercatat tidak ikut terhapus.')) return;
  globalData.debts = globalData.debts.filter(x => x.id !== id);
  localStorage.setItem('budggt_local_cache', JSON.stringify(globalData));
  renderAllLocalUI();
  google.script.run
    .withFailureHandler(err => alert('Gagal hapus: ' + err.message))
    .deleteDebt(id);
}

function openDebtPay(id) {
  const d = debtList().find(x => x.id === id);
  if (!d) return;
  const utang = d.tipe !== 'piutang';
  document.getElementById('debtPayId').value = d.id;
  document.getElementById('debtPayTitle').innerText = (utang ? 'Bayar utang ke ' : 'Terima dari ') + d.nama;
  document.getElementById('debtPayInfo').innerText = 'Sisa ' + format(debtSisa(d)) + ' dari ' + format(d.jumlah);
  document.getElementById('debtPayJumlah').value = formatRupiahInput(debtSisa(d));
  document.getElementById('debtPayLbl').innerText = utang ? 'Dibayar dari dompet' : 'Masuk ke dompet';
  const sel = document.getElementById('debtPayRekening');
  sel.innerHTML = walletOpts();
  if (sel.options.length > 1) sel.selectedIndex = 1; // bawaan: catat ke dompet pertama
  toggleModal('modalDebtPay');
}

function submitDebtPay() {
  const d = debtList().find(x => x.id === document.getElementById('debtPayId').value);
  if (!d) return;
  const utang = d.tipe !== 'piutang';
  const jumlah = Number(document.getElementById('debtPayJumlah').value.replace(/\./g, '')) || 0;
  const rekeningId = document.getElementById('debtPayRekening').value;
  if (jumlah <= 0) { alert('Isi jumlahnya dulu'); return; }
  if (jumlah > debtSisa(d)) { alert('Maksimal sebesar sisa: ' + format(debtSisa(d))); return; }

  d.terbayar = (Number(d.terbayar) || 0) + jumlah;
  google.script.run
    .withFailureHandler(err => alert('Gagal simpan: ' + err.message))
    .setDebt(d);
  if (rekeningId) catatDebtTrx(rekeningId, utang ? 'Pengeluaran' : 'Pemasukan', utang ? KAT_UTANG : KAT_PIUTANG, (utang ? 'Bayar utang ke ' : 'Terima dari ') + d.nama, jumlah);
  localStorage.setItem('budggt_local_cache', JSON.stringify(globalData));
  toggleModal('modalDebtPay');
  renderAllLocalUI();
  if (debtSisa(d) <= 0) showToast('🎉 ' + d.nama + ' lunas!', 0);
}

// ===== PENGINGAT BACKUP: semua data hanya ada di HP ini =====
const NAG_HARI = 7, NAG_TUNDA = 24 * 3600 * 1000;
function renderBackupNag() {
  const el = document.getElementById('backupNag');
  if (!el) return;
  let c = {}, tunda = 0;
  try { c = JSON.parse(localStorage.getItem('budggt_cfg')) || {}; tunda = Number(localStorage.getItem('budggt_nag')) || 0; } catch (e) {}
  const ada = (globalData.transactions || []).length > 0 || (globalData.accounts || []).length > 0;
  const siap = !!(c.url && c.token);
  const umur = c.lastTs ? (Date.now() - c.lastTs) / 86400000 : (c.last ? 0 : Infinity); // backup lama (tanpa lastTs) tidak dinilai sampai backup berikutnya
  const perlu = ada && umur >= NAG_HARI && Date.now() - tunda > NAG_TUNDA;
  el.classList.toggle('hidden', !perlu);
  if (!perlu) return;
  document.getElementById('nagText').innerText = !siap ? 'Atur backup supaya datamu aman kalau HP hilang atau rusak.'
    : umur === Infinity ? 'Datamu belum pernah dibackup.' : 'Backup terakhir ' + Math.floor(umur) + ' hari lalu.';
  const b = document.getElementById('nagBtn');
  b.innerText = siap ? 'Backup' : 'Atur';
  b.onclick = siap ? () => backupNow() : () => toggleModal('modalSettings');
}
function tundaNag() {
  try { localStorage.setItem('budggt_nag', String(Date.now())); } catch (e) {}
  renderBackupNag();
}

function toggleAccDropdown(index) {
  const card = document.getElementById(`acc-card-${index}`);
  if (card) card.classList.toggle('open');
}

function copyToClipboard(text, btn) {
  navigator.clipboard.writeText(text).then(() => {
    const originalHTML = btn.innerHTML;
    btn.innerHTML = `<i class="fa fa-check" style="color: var(--success);"></i> Tersalin!`;
    setTimeout(() => { btn.innerHTML = originalHTML; }, 2000);
  }).catch(() => {
    alert("Gagal menyalin");
  });
}

// RENDER TRANSAKSI (5 TERBARU DI DASHBOARD)
function renderTransactions(data) {
  let container = document.getElementById("trxTable");
  if (!container) return;
  const list = inMonth(data, currentMonthKey());
  if (list.length === 0) {
    container.innerHTML = `<p style="text-align: center; color: var(--text-muted); padding: 20px 0; font-size: 0.9rem;">Belum ada aktivitas bulan ini</p>`;
    return;
  }
  container.innerHTML = list.slice(0, 5).map((t, index) => renderTrxHtml(t, index, 'dash')).join("");
}

// RENDER DAFTAR TRANSAKSI LENGKAP (sub-tab Transaksi di Laporan, bulan = recapMonth)
function renderFullTransactions() {
  const container = document.getElementById("fullTrxContainer");
  if (!container) return;

  const all = globalData.transactions || [];
  const $ = id => document.getElementById(id);

  // isi pilihan chip Dompet & Kategori dari data, pilihan yang sedang aktif dipertahankan
  const fill = (id, first, items) => {
    const el = $(id); if (!el) return;
    const cur = el.value;
    el.innerHTML = '';
    el.add(new Option(first, ''));
    items.forEach(([v, l]) => el.add(new Option(l, v)));
    el.value = items.some(i => i[0] === cur) ? cur : '';
  };
  const kats = new Map();
  all.forEach(t => { const k = (t.kategori || '').trim(); if (k && !kats.has(k.toLowerCase())) kats.set(k.toLowerCase(), k); });
  fill('fDompet', 'Semua dompet', (globalData.accounts || []).map(a => [a.id, a.nama]));
  fill('fKategori', 'Semua kategori', [...kats.values()].sort((a, b) => a.localeCompare(b)).map(k => [k, k]));
  if ($('fWaktu')) $('fWaktu').options[0].text = monthLabel(recapMonth); // chip waktu mengikuti pemilih bulan di atas
  document.querySelectorAll('.chip').forEach(el => el.classList.toggle('on', el.selectedIndex > 0));

  const q = (($('trxSearch') || {}).value || "").trim().toLowerCase();
  const semua = ($('fWaktu') || {}).value === 'semua';
  const dompet = ($('fDompet') || {}).value || '';
  const kat = (($('fKategori') || {}).value || '').toLowerCase();
  const jenis = ($('fJenis') || {}).value || '';
  const aktif = q || semua || dompet || kat || jenis;

  const list = (semua ? all : inMonth(all, recapMonth)).filter(t =>
    (!dompet || t.rekeningId === dompet) &&
    (!kat || (t.kategori || '').trim().toLowerCase() === kat) &&
    (!jenis || t.jenis === jenis) &&
    (!q || [t.keterangan, t.kategori, getAccountName(t.rekeningId), t.tanggal, t.jumlah].join(' ').toLowerCase().includes(q)));

  let inc = 0, exp = 0;
  list.filter(t => !netral(t)).forEach(t => { (t.jenis === "Pemasukan") ? inc += Number(t.jumlah) || 0 : exp += Number(t.jumlah) || 0; });
  const sum = $("trxMonthSummary");
  if (sum) sum.innerHTML = `<span style="color: var(--text-muted);">${list.length} transaksi${semua ? ', semua waktu' : ''}</span><br>` +
    `<span style="color: var(--pos);">+ ${format(inc)}</span> &nbsp;|&nbsp; <span style="color: var(--neg);">- ${format(exp)}</span>`;

  if (list.length === 0) {
    container.innerHTML = `<p style="text-align: center; color: var(--text-muted); padding: 20px 0; font-size: 0.9rem;">${aktif ? 'Tidak ada transaksi yang cocok' : 'Tidak ada transaksi di bulan ini'}</p>`;
    return;
  }
  // dikelompokkan per tanggal (terbaru dulu); total harian tidak menghitung transaksi netral
  const hari = k => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(k || '')) return k || '-';
    const sel = dayIdx(todayStr()) - dayIdx(k);
    return sel === 0 ? 'Hari ini' : sel === 1 ? 'Kemarin' : new Date(k + 'T00:00').toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' });
  };
  const net = {};
  list.filter(t => !netral(t)).forEach(t => { net[t.tanggal] = (net[t.tanggal] || 0) + (t.jenis === 'Pemasukan' ? 1 : -1) * (Number(t.jumlah) || 0); });
  let cur = null;
  container.innerHTML = list.slice().sort((a, b) => (b.tanggal || '').localeCompare(a.tanggal || '')).map((t, i) => {
    let head = '';
    if (t.tanggal !== cur) {
      cur = t.tanggal;
      const n = net[cur] || 0;
      head = `<div class="day-head"><span>${hari(cur)}</span>${n ? `<span style="color: ${n > 0 ? 'var(--pos)' : 'var(--neg)'};">${n > 0 ? '+' : '-'} ${format(Math.abs(n))}</span>` : ''}</div>`;
    }
    return head + renderTrxHtml(t, i, 'full');
  }).join("");
}

function renderTrxHtml(t, index, prefix) {
  let jumlahNum = Number(t.jumlah) || 0;
  let mainTitle = t.keterangan ? t.keterangan : t.kategori;
  let subTitle = t.keterangan ? t.kategori : '';

  return `
    <div class="trx-card-item" id="${prefix}-trx-${index}">
      <div class="trx-card-main" onclick="document.getElementById('${prefix}-trx-${index}').classList.toggle('open')">
        <div style="display: flex; align-items: center; gap: 12px;">
          <div style="width: 40px; height: 40px; border-radius: 12px; background: var(--circle-bg); border: 1px solid var(--border-color); display: flex; align-items: center; justify-content: center; color: var(--circle-icon);">
            <i class="fa ${netral(t) ? 'fa-right-left' : (t.jenis === 'Pemasukan' ? 'fa-arrow-down' : 'fa-basket-shopping')}"></i>
          </div>
          <div>
            <h4 style="font-size: 0.95rem; font-weight: 600; color: var(--text-main);">${mainTitle}</h4>
            ${subTitle ? `<p style="font-size: 0.75rem; color: var(--text-muted); font-weight: 500; margin-top: 1px;">${subTitle}</p>` : ''}
            <p style="font-size: 0.72rem; color: var(--text-muted); margin-top: 1px;">${t.tanggal}</p>
          </div>
        </div>

        <div style="display: flex; align-items: center; gap: 10px;">
          <div style="font-weight: 600; font-size: 0.95rem; color: ${t.jenis === 'Pemasukan' ? 'var(--pos)' : 'var(--neg)'};">
            ${t.jenis === 'Pemasukan' ? '+' : '-'} ${format(jumlahNum)}
          </div>
          <i class="fa fa-chevron-down" style="font-size: 0.75rem; color: var(--text-muted);"></i>
        </div>
      </div>

      <div class="trx-details-dropdown">
        <div style="display: flex; justify-content: space-between; font-size: 0.8rem; margin-bottom: 6px;">
          <span style="color: var(--text-muted); font-weight: 500;">DARI / DOMPET</span>
          <span style="font-weight: 500; color: var(--text-main);">${getAccountName(t.rekeningId)}</span>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 0.8rem; margin-bottom: 6px;">
          <span style="color: var(--text-muted); font-weight: 500;">KATEGORI</span>
          <span style="font-weight: 500; color: var(--text-main);">${t.kategori}</span>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 0.8rem; margin-bottom: 12px;">
          <span style="color: var(--text-muted); font-weight: 500;">TANGGAL</span>
          <span style="font-weight: 500; color: var(--text-main);">${t.tanggal}</span>
        </div>

        <div style="display: flex; justify-content: flex-end; gap: 8px; border-top: 1px solid var(--border-color); padding-top: 10px;">
          <button type="button" onclick="openEditTrx('${t.id}')" style="background: var(--circle-bg); color: var(--text-main); border: 1px solid var(--border-color); padding: 6px 16px; border-radius: 20px; font-size: 0.75rem; font-weight: 500; cursor: pointer; display: flex; align-items: center; gap: 6px;">
            <i class="fa fa-pen"></i> Ubah
          </button>
          <button type="button" onclick="confirmDeleteTrx('${t.id}', '${mainTitle}')" style="background: var(--neg-bg); color: var(--neg); border: none; padding: 6px 14px; border-radius: 20px; font-size: 0.75rem; font-weight: 500; cursor: pointer; display: flex; align-items: center; gap: 6px;">
            <i class="fa fa-trash"></i> Hapus
          </button>
        </div>
      </div>
    </div>
  `;
}

// FORM LISTENERS INSTAN (OPTIMISTIC UI - ANTI FREEZE)
function initFormListeners() {
  const trxForm = document.getElementById("trxForm");
  if (trxForm) {
    trxForm.onsubmit = (e) => {
      e.preventDefault();
  if (document.getElementById("jenis").value === "Transfer") { submitTransfer(); return; }
      
      const rawJumlah = Number(document.getElementById("jumlah").value.replace(/\./g, '')) || 0;
      if (rawJumlah <= 0) { showToast("Isi jumlahnya dulu", 2); return; }
      if (!document.getElementById("kategori").value.trim()) { showToast("Pilih kategori dulu", 2); return; }
      const ketVal = document.getElementById("keterangan").value.trim();
      const newTrx = {
        id: "temp_" + Date.now(),
        tanggal: document.getElementById("tanggal").value,
        jenis: document.getElementById("jenis").value,
        kategori: document.getElementById("kategori").value.trim(),
        keterangan: ketVal,
        jumlah: rawJumlah,
        rekeningId: document.getElementById("rekening").value
      };

      // 1. Update UI Detik ini juga (Instant)
      if (!globalData.transactions) globalData.transactions = [];
      const bdg = newTrx.jenis === 'Pengeluaran' ? findBudget(newTrx.kategori) : null;
      const lvBefore = bdg ? budgetLevel(bdg) : 0;
      globalData.transactions.unshift(newTrx);
      
      let targetAcc = (globalData.accountSummary || []).find(a => a.id === newTrx.rekeningId);
      if (targetAcc) {
        if (newTrx.jenis === "Pemasukan") targetAcc.saldoAkhir += newTrx.jumlah;
        else targetAcc.saldoAkhir -= newTrx.jumlah;
      }
      
      localStorage.setItem('budggt_local_cache', JSON.stringify(globalData));
      renderAllLocalUI();
      if (bdg) warnBudget(newTrx.kategori, lvBefore);
      
      toggleModal('modalTrx');
      e.target.reset();
      document.getElementById("tanggal").value = todayStr();
      onJenisChange();

      // 2. Eksekusi simpan ke Google Sheets di background
      google.script.run
        .withSuccessHandler(() => { loadData(); })
        .withFailureHandler(err => { alert("Gagal sinkron transaksi: " + err.message); })
        .addTransaction({
          tanggal: newTrx.tanggal,
          jenis: newTrx.jenis,
          kategori: newTrx.kategori,
          keterangan: newTrx.keterangan,
          jumlah: String(newTrx.jumlah),
          rekeningId: newTrx.rekeningId
        });
    };
  }

  const editTrxForm = document.getElementById("editTrxForm");
  if (editTrxForm) {
    editTrxForm.onsubmit = (e) => {
      e.preventDefault();
      
      const rawJumlah = Number(document.getElementById("editJumlah").value.replace(/\./g, '')) || 0;
      const updatedTrx = {
        id: document.getElementById("editId").value,
        tanggal: document.getElementById("editTanggal").value,
        jenis: document.getElementById("editJenis").value,
        kategori: document.getElementById("editKategori").value,
        keterangan: document.getElementById("editKeterangan").value,
        jumlah: rawJumlah,
        rekeningId: document.getElementById("editRekening").value
      };

      // Instant Update
      let idx = (globalData.transactions || []).findIndex(x => x.id === updatedTrx.id);
      if (idx !== -1) globalData.transactions[idx] = updatedTrx;
      
      localStorage.setItem('budggt_local_cache', JSON.stringify(globalData));
      renderAllLocalUI();
      toggleModal('modalEditTrx');

      // Sync background
      google.script.run
        .withSuccessHandler(() => { loadData(); })
        .withFailureHandler(err => { alert("Gagal update: " + err.message); })
        .updateTransaction({
          id: updatedTrx.id,
          tanggal: updatedTrx.tanggal,
          jenis: updatedTrx.jenis,
          kategori: updatedTrx.kategori,
          keterangan: updatedTrx.keterangan,
          jumlah: String(updatedTrx.jumlah),
          rekeningId: updatedTrx.rekeningId
        });
    };
  }
}

function openEditTrx(id) {
  let t = (globalData.transactions || []).find(trx => trx.id === id);
  if (!t) return;

  document.getElementById("editId").value = t.id;
  document.getElementById("editJenis").value = t.jenis;
  document.getElementById("editTanggal").value = t.tanggal;
  document.getElementById("editKategori").value = t.kategori;
  document.getElementById("editKeterangan").value = t.keterangan || "";
  document.getElementById("editJumlah").value = formatRupiahInput(t.jumlah);

  let el = document.getElementById("editRekening");
  if (el && globalData.accounts) {
    el.innerHTML = globalData.accounts.map(a => `<option value="${a.id}" ${a.id === t.rekeningId ? 'selected' : ''}>${a.nama}</option>`).join("");
  }

  toggleModal('modalEditTrx');
}

// FORM TAMBAH REKENING BEBAS FREEZE
function submitAccount() {
  const elNama = document.getElementById("accNama");
  const elJenis = document.getElementById("accJenis");
  const elNomor = document.getElementById("accNomor");
  const elSaldo = document.getElementById("accSaldo");

  const nama = elNama ? elNama.value.trim() : "";
  const jenis = elJenis ? elJenis.value : "Bank";
  const nomor = elNomor ? elNomor.value.trim() : "";
  const rawSaldo = elSaldo ? Number(elSaldo.value.replace(/\./g, '')) || 0 : 0;

  if (!nama) {
    alert("Nama bank atau e-wallet harus diisi!");
    return;
  }

  const newAcc = {
    id: "acc_" + Date.now(),
    nama: nama,
    jenis: jenis,
    nomor: nomor,
    saldoAwal: rawSaldo
  };

  // 1. Update data lokal langsung
  if (!globalData.accounts) globalData.accounts = [];
  if (!globalData.accountSummary) globalData.accountSummary = [];
  
  globalData.accounts.push(newAcc);
  globalData.accountSummary.push({
    id: newAcc.id,
    nama: newAcc.nama,
    jenis: newAcc.jenis,
    nomor: newAcc.nomor,
    saldoAkhir: newAcc.saldoAwal
  });
  
  localStorage.setItem('budggt_local_cache', JSON.stringify(globalData));
  
  // 2. TUTUP MODAL SECARA PAKSA & BERSIHKAN FORM
  toggleModal('modalAccount');
  if (elNama) elNama.value = "";
  if (elNomor) elNomor.value = "";
  if (elSaldo) elSaldo.value = "";

  // 3. Render ulang UI
  renderAllLocalUI();

  // 4. Sinkronisasi ke server Google Sheets di latar belakang
  google.script.run
    .withSuccessHandler(() => {
      loadData();
    })
    .withFailureHandler(err => {
      console.warn("Gagal simpan ke server: " + err.message);
    })
    .addAccount({
      nama: nama,
      jenis: jenis,
      nomor: nomor,
      saldoAwal: String(rawSaldo)
    });
}

function updateAccountLabel(jenis) {
  const inputNomor = document.getElementById("accNomor");
  if (!inputNomor) return;
  if (jenis === 'Bank') {
    inputNomor.placeholder = "Nomor Rekening (cth: 1234567890)";
  } else if (jenis === 'Dompet Digital') {
    inputNomor.placeholder = "Nomor HP (cth: 08123456789)";
  } else {
    inputNomor.placeholder = "Keterangan Tambahan / Opsional";
  }
}


// EDIT REKENING / DOMPET
function accountNet(id) {
  let net = 0;
  (globalData.transactions || []).forEach(t => {
    if (t.rekeningId === id) net += (t.jenis === 'Pemasukan' ? 1 : -1) * (Number(t.jumlah) || 0);
  });
  return net;
}

function openEditAcc(id) {
  const a = (globalData.accounts || []).find(x => x.id === id);
  if (!a) return;
  const now = Math.max(0, (Number(a.saldoAwal) || 0) + accountNet(id));
  document.getElementById('editAccId').value = a.id;
  document.getElementById('editAccNama').value = a.nama;
  document.getElementById('editAccJenis').value = a.jenis;
  document.getElementById('editAccNomor').value = a.nomor || '';
  const s = document.getElementById('editAccSaldo');
  s.value = formatRupiahInput(now);
  s.dataset.awal = now; // untuk mendeteksi apakah saldo benar-benar diubah
  toggleModal('modalEditAccount');
}

function submitEditAccount() {
  const id = document.getElementById('editAccId').value;
  const nama = document.getElementById('editAccNama').value.trim();
  const jenis = document.getElementById('editAccJenis').value;
  const nomor = document.getElementById('editAccNomor').value.trim();
  const elSaldo = document.getElementById('editAccSaldo');
  const saldoBaru = Number(elSaldo.value.replace(/\./g, '')) || 0;

  if (!nama) { alert('Nama bank atau e-wallet harus diisi!'); return; }
  const a = (globalData.accounts || []).find(x => x.id === id);
  if (!a) return;

  // Saldo awal TIDAK diubah. Selisihnya dicatat sebagai transaksi "Koreksi Saldo".
  const berubah = saldoBaru !== Number(elSaldo.dataset.awal);
  const selisih = berubah ? saldoBaru - ((Number(a.saldoAwal) || 0) + accountNet(id)) : 0;

  a.nama = nama; a.jenis = jenis; a.nomor = nomor;
  const sm = (globalData.accountSummary || []).find(x => x.id === id);
  if (sm) { sm.nama = nama; sm.jenis = jenis; sm.nomor = nomor; }

  let koreksi = null;
  if (selisih !== 0) {
    const d = new Date();
    koreksi = {
      tanggal: d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'),
      jenis: selisih > 0 ? 'Pemasukan' : 'Pengeluaran',
      kategori: 'Koreksi Saldo',
      keterangan: '',
      jumlah: Math.abs(selisih),
      rekeningId: id
    };
    (globalData.transactions = globalData.transactions || []).unshift(Object.assign({ id: 'temp_' + Date.now() }, koreksi));
    if (sm) sm.saldoAkhir += selisih;
  }

  localStorage.setItem('budggt_local_cache', JSON.stringify(globalData));
  toggleModal('modalEditAccount');
  renderAllLocalUI();

  google.script.run
    .withSuccessHandler(() => {
      if (!koreksi) { loadData(); return; }
      google.script.run
        .withSuccessHandler(() => loadData())
        .withFailureHandler(err => alert('Gagal mencatat koreksi: ' + err.message))
        .addTransaction(Object.assign({}, koreksi, { jumlah: String(koreksi.jumlah) }));
    })
    .withFailureHandler(err => console.warn('Gagal update rekening: ' + err.message))
    .updateAccount({ id: id, nama: nama, jenis: jenis, nomor: nomor, saldoAwal: String(a.saldoAwal) });
}

// ===== PINDAH SALDO (transfer antar rekening) =====
const KATEGORI_NETRAL = ['Transfer', 'Koreksi Saldo', KAT_SETOR, KAT_TARIK, KAT_UTANG, KAT_PIUTANG]; // tidak dihitung sebagai pemasukan/pengeluaran
function netral(t) { return KATEGORI_NETRAL.includes(t.kategori); }

// ===== DROPDOWN: menu inline di bawah kolom, menggantikan popup bawaan HP untuk semua <select> =====
// ponytail: <select> aslinya tetap ada (nilai, onchange, required tetap jalan) tapi tidak bisa disentuh; tombol transparan di atasnya membuka menu kita
let ddMenu = null;
function tutupDropdown() {
  if (!ddMenu) return;
  ddMenu.remove(); ddMenu = null;
  document.removeEventListener('pointerdown', ddLuar, true);
  window.removeEventListener('scroll', tutupDropdown, true);
}
function ddLuar(e) { if (ddMenu && !ddMenu.contains(e.target) && !e.target.classList.contains('dd-hit')) tutupDropdown(); }

function bukaDropdown(sel) {
  const sudahTerbuka = ddMenu && ddMenu._sel === sel;
  tutupDropdown();
  if (sudahTerbuka) return;
  const m = document.createElement('div');
  m.className = 'dd-menu'; m._sel = sel;
  [...sel.options].forEach((o, i) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'dd-opt' + (i === sel.selectedIndex ? ' on' : ''); b.textContent = o.text;
    b.onclick = () => { sel.selectedIndex = i; sel.dispatchEvent(new Event('change', { bubbles: true })); tutupDropdown(); };
    m.appendChild(b);
  });
  document.body.appendChild(m);
  const r = sel.getBoundingClientRect();
  m.style.minWidth = r.width + 'px';
  m.style.left = Math.max(12, Math.min(r.left, innerWidth - m.offsetWidth - 12)) + 'px';
  const h = m.offsetHeight, bawah = innerHeight - r.bottom - 12;
  m.style.top = (bawah >= h || bawah >= r.top ? r.bottom + 6 : Math.max(12, r.top - h - 6)) + 'px'; // muat di bawah, kalau tidak di atas
  if (bawah < h && bawah < r.top) m.style.maxHeight = Math.max(160, r.top - 24) + 'px';
  else if (bawah < h) m.style.maxHeight = Math.max(160, bawah) + 'px';
  ddMenu = m;
  const on = m.querySelector('.on'); if (on) on.scrollIntoView({ block: 'nearest' });
  document.addEventListener('pointerdown', ddLuar, true);
  window.addEventListener('scroll', tutupDropdown, true);
}

function pakaiDropdown(sel) {
  if (sel.dataset.dd || sel.classList.contains('hidden')) return;
  sel.dataset.dd = '1';
  const wrap = document.createElement('span');
  wrap.className = 'dd';
  sel.parentNode.insertBefore(wrap, sel);
  wrap.appendChild(sel);
  const hit = document.createElement('button');
  hit.type = 'button'; hit.className = 'dd-hit'; hit.setAttribute('aria-label', 'Pilih');
  hit.onclick = () => bukaDropdown(sel);
  wrap.appendChild(hit);
}
document.querySelectorAll('select').forEach(pakaiDropdown);

// ===== Halaman Catat Transaksi (layar penuh): kategori berikon + numpad sendiri =====
// ponytail: #jenis/#kategori/#jumlah tetap elemen form biasa (disembunyikan), jadi submit, scan struk, Pindah, dan "tambah di tanggal ini" tidak diubah
const KAT_MASUK = ['Gaji', 'Bonus', 'Bisnis', 'Investasi', 'Hadiah', 'Lainnya'];
const KAT_WARNA = ['#f97316', '#8b5cf6', '#0ea5e9', '#3b82f6', '#22c55e', '#ec4899', '#14b8a6', '#ef4444'];
const katWarna = k => KAT_WARNA[[...k].reduce((a, c) => a + c.charCodeAt(0), 0) % KAT_WARNA.length];
let trxKatEdit = false; // mode "Atur": tiap kategori punya tombol hapus

// kategori buatan sendiri / yang disembunyikan disimpan sebagai catatan {nama, jenis, ikon, hidden} (ikut backup)
const katRecs = () => globalData.kategori || [];
const katTersembunyi = (k, j) => katRecs().some(r => r.hidden && r.jenis === j && r.nama.toLowerCase() === (k || '').trim().toLowerCase());
function setKatRec(rec) {
  const l = (globalData.kategori = globalData.kategori || []);
  const i = l.findIndex(r => r.jenis === rec.jenis && r.nama.toLowerCase() === rec.nama.toLowerCase());
  if (i > -1) l[i] = Object.assign({}, l[i], rec); else l.push(Object.assign({ ikon: '', hidden: false }, rec));
  localStorage.setItem('budggt_local_cache', JSON.stringify(globalData));
  google.script.run.withFailureHandler(err => alert('Gagal simpan kategori: ' + err.message)).setKategori(i > -1 ? l[i] : l[l.length - 1]);
}

function trxCats(j, termasukHidden) {
  const inc = j === 'Pemasukan';
  const out = new Map();
  const add = k => { k = (k || '').trim(); if (k && !out.has(k.toLowerCase())) out.set(k.toLowerCase(), k); };
  if (inc) KAT_MASUK.forEach(add);
  else {
    document.querySelectorAll('#kategoriList option').forEach(o => add(o.value));
    budgetList().forEach(b => b.cats.forEach(add));
  }
  (globalData.transactions || []).forEach(t => { if (!netral(t) && (t.jenis === 'Pemasukan') === inc) add(t.kategori); });
  katRecs().forEach(r => { if (r.jenis === j) add(r.nama); });
  return [...out.values()].filter(k => termasukHidden || !katTersembunyi(k, j));
}

function renderTrxCats() {
  const j = document.getElementById('jenis').value;
  if (j === 'Transfer') return;
  const cur = document.getElementById('kategori').value.trim().toLowerCase();
  const list = trxCats(j);
  if (cur && !list.some(k => k.toLowerCase() === cur)) list.push(document.getElementById('kategori').value.trim()); // mis. hasil scan struk
  document.getElementById('tpCats').innerHTML = list.map(k => `
    <button type="button" class="tc ${k.toLowerCase() === cur ? 'on' : ''}" style="--c:${katWarna(k)}" ${trxKatEdit ? '' : `onclick="pickTrxKat('${jsq(k)}')"`}>
      ${trxKatEdit ? `<span class="x" onclick="hapusKat('${jsq(k)}')"><i class="fa fa-xmark"></i></span>` : ''}
      <span class="ic"><i class="fa ${katIkon(k)}"></i></span><span class="nm">${esc(k)}</span>
    </button>`).join('') + `
    <button type="button" class="tc" style="--c:#64748b" onclick="newTrxKat()">
      <span class="ic"><i class="fa fa-plus"></i></span><span class="nm">Baru</span>
    </button>
    <button type="button" class="tc ${trxKatEdit ? 'on' : ''}" style="--c:#64748b" onclick="toggleKatEdit()">
      <span class="ic"><i class="fa ${trxKatEdit ? 'fa-check' : 'fa-pen'}"></i></span><span class="nm">${trxKatEdit ? 'Selesai' : 'Atur'}</span>
    </button>`;
}

function pickTrxKat(k) {
  document.getElementById('kategori').value = k;
  renderTrxCats();
}

function toggleKatEdit() { trxKatEdit = !trxKatEdit; renderTrxCats(); }

// hapus = sembunyikan dari daftar; transaksi lama tetap utuh. Bisa diurungkan.
function hapusKat(k) {
  const j = document.getElementById('jenis').value;
  setKatRec({ nama: k, jenis: j, hidden: true });
  const kat = document.getElementById('kategori');
  if (kat.value.trim().toLowerCase() === k.toLowerCase()) kat.value = '';
  renderTrxCats();
  showUndo('Kategori "' + k + '" dihapus', () => { setKatRec({ nama: k, jenis: j, hidden: false }); renderTrxCats(); });
}

// pilihan ikon untuk kategori baru
const KAT_PILIHAN_IKON = ['fa-utensils', 'fa-mug-hot', 'fa-burger', 'fa-pizza-slice', 'fa-ice-cream', 'fa-cookie-bite', 'fa-cart-shopping', 'fa-bag-shopping', 'fa-shirt', 'fa-gift', 'fa-car-side', 'fa-motorcycle',
  'fa-bus', 'fa-train', 'fa-plane', 'fa-gas-pump', 'fa-house', 'fa-couch', 'fa-bolt', 'fa-droplet', 'fa-wifi', 'fa-mobile-screen', 'fa-file-invoice', 'fa-heart-pulse',
  'fa-pills', 'fa-tooth', 'fa-dumbbell', 'fa-film', 'fa-gamepad', 'fa-music', 'fa-book', 'fa-graduation-cap', 'fa-paw', 'fa-baby', 'fa-scissors', 'fa-wrench',
  'fa-camera', 'fa-laptop', 'fa-money-bill-wave', 'fa-wallet', 'fa-piggy-bank', 'fa-chart-line', 'fa-briefcase', 'fa-store', 'fa-handshake', 'fa-star', 'fa-tag', 'fa-ellipsis',
  'fa-umbrella-beach', 'fa-cake-candles', 'fa-hand-holding-heart', 'fa-building-columns', 'fa-credit-card', 'fa-coins', 'fa-seedling', 'fa-bicycle', 'fa-futbol', 'fa-spa', 'fa-soap', 'fa-gem'];
let katIkonPilih = 'fa-tag';

function renderKatIcons() {
  document.getElementById('katIcons').innerHTML = KAT_PILIHAN_IKON.map(ic =>
    `<button type="button" class="ic-opt ${ic === katIkonPilih ? 'on' : ''}" onclick="katIkonPilih='${ic}'; renderKatIcons()"><i class="fa ${ic}"></i></button>`).join('');
}

function newTrxKat() {
  katIkonPilih = 'fa-tag';
  document.getElementById('katNama').value = '';
  renderKatIcons();
  toggleModal('modalKat');
}

function submitKat() {
  const nama = document.getElementById('katNama').value.trim().replace(/\s+/g, ' ');
  if (!nama) { alert('Isi nama kategori'); return; }
  const j = document.getElementById('jenis').value;
  const kenal = trxCats(j, true).find(k => k.toLowerCase() === nama.toLowerCase()) || nama; // pakai penulisan yang sudah ada
  setKatRec({ nama: kenal, jenis: j, ikon: katIkonPilih, hidden: false });
  toggleModal('modalKat');
  pickTrxKat(kenal);
}

function setTrxJenis(j) {
  document.getElementById('jenis').value = j;
  document.getElementById('kategori').value = ''; // kategori Pengeluaran dan Pemasukan beda daftar
  trxKatEdit = false;
  onJenisChange();
}

function onJenisChange() {
  const j = document.getElementById('jenis').value;
  const isTrf = j === 'Transfer';
  const tujuan = document.getElementById('rekeningTujuan');
  const kat = document.getElementById('kategori');
  document.getElementById('modalTrx').dataset.mode = j;
  document.querySelectorAll('#tpSeg button').forEach(b => b.classList.toggle('on', b.dataset.j === j));
  document.getElementById('tpDari').textContent = isTrf ? 'Dari' : 'Dompet';
  if (isTrf) {
    kat.value = 'Transfer';
    const dari = document.getElementById('rekening').value;
    const prev = tujuan.value;
    tujuan.innerHTML = '<option value="">Pilih tujuan...</option>' +
      (globalData.accounts || []).filter(a => a.id !== dari)
        .map(a => `<option value="${a.id}">${a.nama}</option>`).join('');
    tujuan.value = prev; // kosong kalau pilihan lama sudah tidak valid
  } else if (kat.value === 'Transfer') {
    kat.value = '';
  }
  renderTrxCats();
  showAmt();
  trxDateLabel();
}

function swapTrx() {
  const a = document.getElementById('rekening'), b = document.getElementById('rekeningTujuan');
  const dari = a.value, ke = b.value;
  if (!ke) return;
  a.value = ke;
  onJenisChange();
  b.value = dari;
}

function showAmt() {
  document.getElementById('amtShow').textContent = document.getElementById('jumlah').value || '0';
}

function trxDateLabel() {
  const v = document.getElementById('tanggal').value;
  document.getElementById('tpDate').textContent = !v ? '-' : v === todayStr() ? 'Hari ini'
    : new Date(v + 'T00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
}

// numpad: angka masuk ke #jumlah (hidden), tampilan besar ikut diperbarui
function padTap(e) {
  const btn = e.target.closest('[data-k]');
  if (!btn) return;
  const k = btn.dataset.k;
  if (navigator.vibrate) navigator.vibrate(k === 'ok' ? 18 : 8); // getar halus (Android)
  if (k === 'ok') { document.getElementById('trxForm').requestSubmit(); return; }
  const j = document.getElementById('jumlah');
  let d = j.value.replace(/\./g, '');
  if (k === 'del') d = d.slice(0, -1);
  else if (k === 'C') d = '';
  else d = (d + k).replace(/^0+/, '').slice(0, 12);
  j.value = formatRupiahInput(d);
  showAmt();
}

function openTransfer() {
  document.getElementById('jenis').value = 'Transfer';
  onJenisChange();
  toggleModal('modalTrx');
}

function submitTransfer() {
  const dari = document.getElementById('rekening').value;
  const ke = document.getElementById('rekeningTujuan').value;
  const jumlah = Number(document.getElementById('jumlah').value.replace(/\./g, '')) || 0;
  const tanggal = document.getElementById('tanggal').value;
  const cat = document.getElementById('keterangan').value.trim();

  if (!dari || !ke || dari === ke) { alert('Pilih rekening asal dan tujuan yang berbeda'); return; }
  if (jumlah <= 0) { alert('Isi jumlah yang dipindah'); return; }

  const extra = cat ? ' · ' + cat : '';
  const keluar = { tanggal, jenis: 'Pengeluaran', kategori: 'Transfer', jumlah, rekeningId: dari, keterangan: 'Ke ' + getAccountName(ke) + extra };
  const masuk = { tanggal, jenis: 'Pemasukan', kategori: 'Transfer', jumlah, rekeningId: ke, keterangan: 'Dari ' + getAccountName(dari) + extra };

  // update instan
  (globalData.transactions = globalData.transactions || []).unshift(
    Object.assign({ id: 'temp_m' + Date.now() }, masuk),
    Object.assign({ id: 'temp_k' + Date.now() }, keluar)
  );
  const sd = (globalData.accountSummary || []).find(a => a.id === dari);
  const sk = (globalData.accountSummary || []).find(a => a.id === ke);
  if (sd) sd.saldoAkhir -= jumlah;
  if (sk) sk.saldoAkhir += jumlah;
  localStorage.setItem('budggt_local_cache', JSON.stringify(globalData));
  renderAllLocalUI();

  document.getElementById('trxForm').reset();
  onJenisChange();
  document.getElementById('tanggal').value = todayStr();
  toggleModal('modalTrx');

  google.script.run
    .withSuccessHandler(() => loadData())
    .withFailureHandler(err => alert('Gagal pindah saldo: ' + err.message))
    .addTransfer({ masuk, keluar });
}

// HAPUS DATA INSTAN
function confirmDeleteAcc(id, nama) {
  if (confirm(`Hapus rekening "${nama}"? Semua transaksi di rekening ini juga akan dihapus!`)) {
    globalData.accounts = (globalData.accounts || []).filter(a => a.id !== id);
    globalData.accountSummary = (globalData.accountSummary || []).filter(a => a.id !== id);
    globalData.transactions = (globalData.transactions || []).filter(t => t.rekeningId !== id);
    localStorage.setItem('budggt_local_cache', JSON.stringify(globalData));
    renderAllLocalUI();

    google.script.run
      .withSuccessHandler(() => { loadData(); })
      .deleteAccount(id);
  }
}

// saldo rekening mengikuti transaksi yang dibuang (dir = -1) atau dikembalikan (dir = 1)
function adjustSaldo(t, dir) {
  const a = (globalData.accountSummary || []).find(x => x.id === t.rekeningId);
  if (a) a.saldoAkhir += dir * (t.jenis === 'Pemasukan' ? 1 : -1) * (Number(t.jumlah) || 0);
}

// Hapus langsung, tanpa konfirmasi; salah hapus bisa diurungkan lewat toast (id dan posisi asli kembali)
function confirmDeleteTrx(id, kategori) {
  const list = globalData.transactions || [];
  const index = list.findIndex(t => t.id === id);
  if (index < 0) return;
  const t = list.splice(index, 1)[0];
  adjustSaldo(t, -1);
  localStorage.setItem('budggt_local_cache', JSON.stringify(globalData));
  renderAllLocalUI();

  google.script.run
    .withSuccessHandler(() => { loadData(); })
    .deleteTransaction(id);

  showUndo('"' + kategori + '" dihapus', () => {
    (globalData.transactions = globalData.transactions || []).splice(index, 0, t);
    adjustSaldo(t, 1);
    localStorage.setItem('budggt_local_cache', JSON.stringify(globalData));
    renderAllLocalUI();
    google.script.run
      .withSuccessHandler(() => { loadData(); })
      .restoreTransaction({ t, index });
  });
}

function showUndo(msg, onUndo) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.style.cssText = 'background: #1e293b; display: flex; justify-content: space-between; align-items: center; gap: 12px;';
  const span = document.createElement('span');
  span.textContent = msg;
  const btn = document.createElement('button');
  btn.textContent = 'Urungkan';
  btn.style.cssText = 'background: none; border: none; color: var(--primary); font-weight: 600; font-size: 0.85rem; cursor: pointer;';
  btn.onclick = () => { el.remove(); onUndo(); };
  el.append(span, btn);
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 6000);
}

// ===== SCANNER STRUK: OCR di HP dulu (gratis, foto tidak dikirim ke mana pun); AI hanya kalau OCR gagal dan kamu setuju =====
// ponytail: parser berbasis kata kunci "TOTAL" + angka; akurasi bergantung kualitas foto. Kalau sering meleset, tambahkan kata kunci toko di STRUK_KAT.
const STRUK_KAT = [ // urutan = prioritas; [kategori, kata kunci]
  ['Kesehatan', /apotek|apotik|kimia farma|guardian|k-?24|klinik|rumah sakit|\brs\b|dokter|century/],
  ['Transport', /spbu|pertamina|shell|\bbp\b|bensin|pertalite|pertamax|parkir|\btol\b|grab|gojek|bluebird|\bkai\b|damri/],
  ['Tagihan', /\bpln\b|listrik|pdam|indihome|telkom|pulsa|token|bpjs/],
  ['Hiburan', /bioskop|cinema|\bxxi\b|cgv|netflix|spotify|timezone/],
  ['Makanan', /resto|cafe|kafe|kopi|coffee|warung|bakso|mie |ayam|nasi|kfc|mcd|burger|pizza|starbucks|bakery|roti|geprek|sate|sushi|boba|chatime|food|dapur/],
  ['Belanja', /indomaret|alfamart|alfa |superindo|hypermart|lotte|carrefour|transmart|giant|ranch|mart\b|minimarket|toserba|swalayan/]
];
const BULAN_ID = { jan: 1, feb: 2, mar: 3, apr: 4, mei: 5, jun: 6, jul: 7, agu: 8, ags: 8, aug: 8, sep: 9, okt: 10, oct: 10, nov: 11, des: 12, dec: 12 };

// "45.000,00" / "1,250,000" / "Rp 12.500" -> angka bulat; null kalau bukan nominal
function angkaStruk(tok) {
  const n = Number(tok.replace(/[.,]\d{2}$/, '').replace(/\D/g, '')); // ",00" di belakang = desimal, dibuang
  return n > 0 && n < 1e9 ? n : null;
}

function parseStruk(text, hariIni) {
  const lines = String(text || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const low = lines.map(l => l.toLowerCase());
  const nums = l => (l.match(/\d[\d.,]*/g) || []).map(angkaStruk).filter(n => n && n >= 100);
  const buruk = /tunai|cash|kembali|change|diskon|disc|ppn|pajak|tax|hemat|poin|point|voucher/;

  // 1) baris "TOTAL" (grand total / total bayar / total belanja); angka di baris itu atau baris berikutnya
  let jumlah = null;
  for (const re of [/grand\s*total|total\s*(bayar|belanja|tagihan|pembayaran)|total\s*akhir|netto/, /(^|[^a-z])total([^a-z]|$)/, /tagihan|jumlah|amount/]) {
    for (let i = 0; i < lines.length && !jumlah; i++) {
      if (!re.test(low[i]) || buruk.test(low[i]) || /sub\s*total|subtotal|item|qty/.test(low[i])) continue;
      const n = nums(lines[i]).pop() || nums(lines[i + 1] || '').pop();
      if (n) jumlah = n;
    }
    if (jumlah) break;
  }
  // 2) tidak ada kata TOTAL: nominal terbesar yang berformat ribuan (bukan nomor telepon/NPWP) dan bukan uang tunai/kembalian
  if (!jumlah) {
    const k = [];
    lines.forEach((l, i) => { if (!buruk.test(low[i])) (l.match(/\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{2})?/g) || []).forEach(t => { const n = angkaStruk(t); if (n) k.push(n); }); });
    jumlah = k.length ? Math.max(...k) : null;
  }
  if (!jumlah) return null;

  // tanggal: dd/mm/yyyy, dd-mm-yy, yyyy-mm-dd, atau "12 Okt 2026"; tidak valid atau di masa depan -> hari ini
  const hari = hariIni || todayStr();
  let tanggal = hari;
  const body = low.join(' ');
  const cek = (y, m, d) => {
    y = y < 100 ? 2000 + y : y;
    const t = y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
    return y >= 2000 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= new Date(y, m, 0).getDate() && t <= hari ? t : null;
  };
  let m;
  if ((m = body.match(/(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/))) tanggal = cek(+m[1], +m[2], +m[3]) || tanggal;
  else if ((m = body.match(/(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2,4})/))) tanggal = cek(+m[3], +m[2], +m[1]) || tanggal;
  else if ((m = body.match(/\b(\d{1,2})\s*(jan|feb|mar|apr|mei|jun|jul|agu|ags|aug|sep|okt|oct|nov|des|dec)[a-z]*\.?\s*(\d{2,4})\b/))) tanggal = cek(+m[3], BULAN_ID[m[2]], +m[1]) || tanggal;

  // kategori dari nama toko / isi struk, lalu dicocokkan ke kategori yang sudah ada di app
  const hit = STRUK_KAT.find(([, re]) => re.test(body));
  return { jumlah, tanggal, kategori: hit ? hit[0] : 'Lainnya' };
}

let tessMuat = null;
function muatTesseract() {
  if (window.Tesseract) return Promise.resolve();
  return tessMuat || (tessMuat = new Promise((ok, gagal) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
    s.onload = ok;
    s.onerror = () => { tessMuat = null; gagal(new Error('pembaca struk belum terunduh (butuh internet sekali)')); };
    document.head.appendChild(s);
  }));
}

// unduh pembaca struk di latar belakang sekali saja (saat online, bukan hemat data / seluler), supaya scan pertama pun sudah bisa offline
function siapkanOcr() {
  const kon = navigator.connection || {};
  let siap = false;
  try { siap = localStorage.getItem('budggt_ocr') === '1'; } catch (e) {}
  if (siap || !navigator.onLine || kon.saveData || kon.type === 'cellular') return;
  setTimeout(async () => {
    try {
      await muatTesseract();
      const w = await Tesseract.createWorker('ind'); // mengunduh mesin + data bahasa ke cache
      await w.terminate();
      localStorage.setItem('budggt_ocr', '1');
    } catch (e) {}
  }, 4000);
}
window.addEventListener('load', siapkanOcr);
window.addEventListener('online', siapkanOcr);

function gambarKeCanvas(img, lebar, kontras) {
  const k = Math.min(1, lebar / img.width);
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  const ctx = c.getContext('2d');
  if (kontras) ctx.filter = 'grayscale(1) contrast(1.4)'; // struk thermal pudar lebih mudah dibaca
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return c;
}

async function ocrStruk(canvas) {
  await muatTesseract();
  const w = await Tesseract.createWorker('ind');
  try { return (await w.recognize(canvas)).data.text; } finally { await w.terminate(); }
}

function isiHasilScan(res) {
  document.getElementById("jumlah").value = res.jumlah ? formatRupiahInput(res.jumlah) : '';
  document.getElementById("kategori").value = matchKategori(res.kategori) || '';
  document.getElementById("jenis").value = "Pengeluaran";
  onJenisChange();
  if (res.tanggal) document.getElementById("tanggal").value = res.tanggal;
  trxDateLabel();
}

function handleReceipt(e) {
  const file = e.target.files[0];
  e.target.value = ''; // foto yang sama boleh dipilih lagi
  if (!file) return;

  const btn = document.getElementById(e.target.id === 'scanCamera' ? 'btnCam' : 'btnGal');
  const html0 = btn ? btn.innerHTML : '';
  if (btn) { btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i>'; btn.disabled = true; }
  const selesai = () => { if (btn) { btn.innerHTML = html0; btn.disabled = false; } };
  if (!window.Tesseract && navigator.onLine) showToast('Menyiapkan pembaca struk... pertama kali butuh internet', 1);

  const reader = new FileReader();
  reader.onload = evt => {
    const img = new Image();
    img.onload = async () => {
      let alasan = 'total belanja tidak terbaca', rusak = false;
      try {
        const res = parseStruk(await ocrStruk(gambarKeCanvas(img, 1600, true)));
        if (res) { isiHasilScan(res); selesai(); return; }
      } catch (err) { alasan = err.message; rusak = true; }
      selesai();

      // offline: AI tidak mungkin, jadi jangan ditawarkan
      if (!navigator.onLine) {
        alert(rusak ? 'Pembaca struk belum terunduh. Sambungkan internet sekali (sebaiknya Wi-Fi), lalu coba lagi. Setelah itu bisa dipakai offline.'
                    : 'Struk belum terbaca (' + alasan + '). Coba foto lebih terang dan lurus, atau isi manual.');
        return;
      }

      let cfg = {};
      try { cfg = JSON.parse(localStorage.getItem('budggt_cfg')) || {}; } catch (x) {}
      if (!(cfg.url && cfg.token)) { alert('Struk belum terbaca (' + alasan + '). Coba foto lebih terang dan lurus, atau isi manual.'); return; }
      if (!confirm('Struk belum terbaca di HP (' + alasan + '). Coba dengan AI? Foto akan dikirim ke Google Gemini.')) return;

      if (btn) { btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i>'; btn.disabled = true; }
      const base64 = gambarKeCanvas(img, 800, false).toDataURL('image/jpeg', 0.6).split(',')[1];
      google.script.run
        .withSuccessHandler(res => { selesai(); if (res) isiHasilScan(res); })
        .withFailureHandler(er => { selesai(); alert("Gagal memproses struk: " + er.message); })
        .parseReceiptWithGemini(base64, daftarKategori());
    };
    img.src = evt.target.result;
  };
  reader.readAsDataURL(file);
}

// SIMPAN PREFERENSI PROFIL
function saveProfile(e) {
  e.preventDefault();
  const newName = document.getElementById("prefDisplayName").value.trim();
  if (!newName) return;

  localStorage.setItem('user_display_name', newName);
  updateGreeting(newName);
  renderLevel();
  alert("Nama tampilan berhasil diperbarui!");
}


// ===== DONUT PENGELUARAN PER KATEGORI =====
// palet donat: warna-warni tapi dalam/kalem; mode gelap lebih redam, mode terang sedikit lebih segar
const CAT_RONA = [200, 350, 160, 35, 270, 90, 320, 12, 230, 55];
const catGelap = () => document.body.classList.contains('dark-mode');
function catPalette(n) {
  const [sat, lt] = catGelap() ? [42, 40] : [58, 46];
  return Array.from({ length: n }, (_, i) => `hsl(${CAT_RONA[i % CAT_RONA.length]}, ${sat}%, ${lt}%)`);
}
const catLainnya = () => catGelap() ? '#52525b' : '#94a3b8';
const CAT_TOP = 3; // di halaman Laporan hanya 5 teratas, sisanya digabung

function catData(key, jenis = recapJenis) {
  const map = new Map();
  let total = 0;
  inMonth(globalData.transactions, key)
        .filter(t => !netral(t) && t.jenis === jenis)
    .forEach(t => {
      const n = Number(t.jumlah) || 0;
      const nama = (t.kategori || '').trim() || 'Lainnya';
      const k = nama.toLowerCase();
      if (!map.has(k)) map.set(k, { nama, jumlah: 0, n: 0 });
      const c = map.get(k);
      c.jumlah += n;
      c.n++;
      total += n;
    });
  const list = [...map.values()].sort((a, b) => b.jumlah - a.jumlah);
  const pal = catPalette(list.length);
  list.forEach((c, i) => {
    c.warna = pal[i];
    c.pct = total > 0 ? c.jumlah / total * 100 : 0;
  });
  return { list, total };
}

function catRowHtml(c) {
  const pct = c.pct >= 1 ? Math.round(c.pct) + '%' : '<1%';
  return `
    <div style="display: flex; align-items: center; gap: 12px; padding: 8px 0;">
      <span style="min-width: 46px; text-align: center; background: ${c.warna}; color: #fff; font-size: 0.72rem; font-weight: 600; padding: 6px 0; border-radius: 6px;">${pct}</span>
      <div style="flex: 1;">
        <span style="font-size: 0.9rem; font-weight: 500;">${c.nama}</span>
        ${c.n ? `<p style="font-size: 0.72rem; color: var(--text-muted); font-weight: 500;">${c.n} transaksi</p>` : ''}
      </div>
      <span style="font-size: 0.9rem; font-weight: 600;">${format(c.jumlah)}</span>
    </div>`;
}

// donut di halaman Laporan: 5 teratas + "Lainnya"
function renderFlowChart() {
  const canvasEl = document.getElementById('chartFlow');
  if (!canvasEl) return;

  const jl = recapJenis === 'Pemasukan' ? 'Pemasukan' : 'Pengeluaran';
  const ct = document.getElementById('catTitle'); if (ct) ct.innerText = jl + ' per Kategori';
  const cl = document.getElementById('catCenterLbl'); if (cl) cl.innerText = jl;
  const { list, total } = catData(recapMonth);
  let rows = list;
  if (list.length > CAT_TOP + 1) {
    const rest = list.slice(CAT_TOP);
    const jumlah = rest.reduce((s, c) => s + c.jumlah, 0);
    rows = list.slice(0, CAT_TOP).concat([{
      nama: 'Lainnya (' + rest.length + ' kategori)',
      jumlah, warna: catLainnya(), pct: total > 0 ? jumlah / total * 100 : 0
    }]);
  }

  const card = document.getElementById('catCard');
  const btn = document.getElementById('catDetailBtn');
  const legend = document.getElementById('catLegend');
  const totalEl = document.getElementById('catTotal');

  if (flowChart) { flowChart.destroy(); flowChart = null; }

  if (total <= 0) {
    if (card) card.style.display = 'none';
    if (btn) btn.style.display = 'none';
    if (legend) legend.innerHTML = `<p style="text-align: center; color: var(--text-muted); padding: 15px 0; font-size: 0.85rem;">Belum ada data ${recapJenis.toLowerCase()} bulan ini</p>`;
    return;
  }

  if (card) card.style.display = '';
  if (btn) btn.style.display = '';
  if (totalEl) totalEl.innerText = format(total);
  if (legend) legend.innerHTML = rows.map(catRowHtml).join('');

  flowChart = new Chart(canvasEl.getContext('2d'), {
    type: 'doughnut',
    data: {
      labels: rows.map(c => c.nama),
      datasets: [{ data: rows.map(c => c.jumlah), backgroundColor: rows.map(c => c.warna), borderWidth: 0 }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '65%',
      plugins: { legend: { display: false }, tooltip: { enabled: false } }
    }
  });
}

// halaman detail: semua kategori
let catDetailChart;

function openCatDetail() {
  document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
  document.getElementById('analyticsDetail').classList.remove('hidden');
  renderCatDetail();
  window.scrollTo({ top: 0 });
}

function backToRecap() {
  document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
  document.getElementById('analytics').classList.remove('hidden');
  renderRecap(); // grafik digambar ulang setelah halaman tampil lagi
  window.scrollTo({ top: 0 });
}

function renderCatDetail() {
  const { list, total } = catData(recapMonth);
  const card = document.getElementById('catDetailCard');
  const box = document.getElementById('catDetailList');
  const canvasEl = document.getElementById('chartCatDetail');
  document.getElementById('catDetailMonth').innerText = monthLabel(recapMonth);
  document.getElementById('catDetailTitle').innerText = 'Detail ' + recapJenis;
  document.getElementById('catDetailTotal').innerText = format(total);

  if (catDetailChart) { catDetailChart.destroy(); catDetailChart = null; }

  if (total <= 0) {
    card.style.display = 'none';
    box.innerHTML = `<p style="text-align: center; color: var(--text-muted); padding: 20px 0; font-size: 0.9rem;">Belum ada ${recapJenis.toLowerCase()} di bulan ini</p>`;
    return;
  }

  card.style.display = '';
  box.innerHTML = list.map(catRowHtml).join('');
  catDetailChart = new Chart(canvasEl.getContext('2d'), {
    type: 'doughnut',
    data: {
      labels: list.map(c => c.nama),
      datasets: [{ data: list.map(c => c.jumlah), backgroundColor: list.map(c => c.warna), borderWidth: 0 }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '62%',
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: c => c.label + ': ' + format(c.parsed) } }
      }
    }
  });
}
// GRAFIK TREN 6 BULAN
let trendChart;

function renderTrend() {
  const canvasEl = document.getElementById('chartTrend');
  if (!canvasEl) return;

  const [y, m] = recapMonth.split('-').map(Number);
  const labels = [], inc = [], exp = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(y, m - 1 - i, 1);
    const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    const s = monthTotals(key);
    labels.push(BULAN[d.getMonth()].slice(0, 3) + ' ' + String(d.getFullYear()).slice(2));
    inc.push(s.inc);
    exp.push(s.exp);
  }

  if (trendChart) trendChart.destroy();
  trendChart = new Chart(canvasEl.getContext('2d'), {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Masuk', data: inc, backgroundColor: accent(), borderRadius: 4 },
        { label: 'Keluar', data: exp, backgroundColor: getComputedStyle(document.body).getPropertyValue('--neg').trim() || '#e11d48', borderRadius: 4 }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom' },
        tooltip: { callbacks: { label: c => c.dataset.label + ': ' + format(c.parsed.y) } }
      },
      scales: {
        y: { beginAtZero: true, ticks: { callback: v => formatShort(v) } },
        x: { grid: { display: false } }
      }
    }
  });
}

// RENDER KALENDER
function renderCalendar(transactions) {
  const container = document.getElementById('calendarGridContainer');
  const titleEl = document.getElementById('calMonthTitle');
  if (!container || !titleEl) return;
  
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  
  const monthNames = ["JANUARI", "FEBRUARI", "MARET", "APRIL", "MEI", "JUNI", "JULI", "AGUSTUS", "SEPTEMBER", "OKTOBER", "NOVEMBER", "DESEMBER"];
  titleEl.innerText = `${monthNames[month]} ${year}`;

  let dailyMap = {};
  (transactions || []).filter(t => !netral(t)).forEach(t => {
    let jml = Number(t.jumlah) || 0;
    if (!dailyMap[t.tanggal]) {
      dailyMap[t.tanggal] = { expense: 0, income: 0 };
    }
    if (t.jenis === "Pemasukan") {
      dailyMap[t.tanggal].income += jml;
    } else {
      dailyMap[t.tanggal].expense += jml;
    }
  });

  const firstDayIndex = new Date(year, month, 1).getDay();
  let adjustedFirstDay = firstDayIndex === 0 ? 6 : firstDayIndex - 1;
  const totalDays = new Date(year, month + 1, 0).getDate();
  const todayDateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  // penanda tagihan: tanggal jatuh tempo bulan ini -> status paling mendesak
  const billByDay = {};
  const urutBill = { telat: 0, soon: 1, ok: 2, lunas: 3 };
  billList().forEach(b => {
    const s = billStatus(b);
    const dd = s.due.getDate();
    if (!billByDay[dd] || urutBill[s.lv] < urutBill[billByDay[dd].lv]) billByDay[dd] = s;
  });
  
  let html = '';
  for (let i = 0; i < adjustedFirstDay; i++) {
    html += `<div class="cal-cell" style="opacity: 0.2; border:none; background:none;"></div>`;
  }

  for (let day = 1; day <= totalDays; day++) {
    let dayStr = String(day).padStart(2, '0');
    let monthStr = String(month + 1).padStart(2, '0');
    let fullDateStr = `${year}-${monthStr}-${dayStr}`;

    let trx = dailyMap[fullDateStr];
    let hasTrx = trx && (trx.expense > 0 || trx.income > 0);
    let isToday = fullDateStr === todayDateStr;

    let cellClass = "cal-cell";
    if (hasTrx) cellClass += " has-trx";
    if (isToday) cellClass += " active-today";

    let nominalHtml = '';
    if (trx) {
      if (trx.expense > 0) {
        nominalHtml += `<span class="cal-nominal">-${formatShort(trx.expense)}</span>`;
      }
      if (trx.income > 0) {
        nominalHtml += `<span class="cal-nominal income">+${formatShort(trx.income)}</span>`;
      }
    }

    const bs = billByDay[day];
    const billDot = bs ? `<span class="cal-bill" style="background: ${bs.warna};"></span>` : '';

    html += `
      <div class="${cellClass}" onclick="openDay('${fullDateStr}')" style="cursor: pointer;">
        ${billDot}
        <span class="cal-date-num">${day}</span>
        ${nominalHtml}
      </div>
    `;
  }

  container.innerHTML = html;
}

// ===== BUDGET: halaman sendiri; tiap budget punya nama, periode, banyak kategori, dan batas peringatan sendiri =====
const BUDGET_KUNING = 50;  // % mulai kuning, dihitung relatif terhadap batas peringatan (50/80)
const BUDGET_MERAH = 80;   // batas peringatan bawaan (%)
const BUDGET_WARNA = ['var(--pos)', 'var(--warn)', 'var(--neg)']; // hijau, kuning, merah
const BUDGET_STATUS = ['Aman', 'Hati-hati', 'Hampir habis'];
const KAT_IKON = { makanan: 'fa-utensils', belanja: 'fa-bag-shopping', transport: 'fa-car-side', tagihan: 'fa-file-invoice', hiburan: 'fa-film', kesehatan: 'fa-heart-pulse', investasi: 'fa-chart-line', lainnya: 'fa-ellipsis', gaji: 'fa-money-bill-wave', bonus: 'fa-star', bisnis: 'fa-store', hadiah: 'fa-gift' };
const katIkon = k => {
  const key = (k || '').trim().toLowerCase();
  const r = (globalData.kategori || []).find(x => x.ikon && x.nama.toLowerCase() === key); // ikon pilihan pengguna didahulukan
  return (r && r.ikon) || KAT_IKON[key] || 'fa-tag';
};
const dstr = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');

// budget lama {kategori, batas} dimigrasi di tempat ke format baru (id sama dengan yang dibuat gas-shim.js)
function budgetList() {
  const l = globalData.budgets || [];
  l.forEach(b => {
    if (b.cats) return;
    const k = String(b.kategori || '').trim();
    b.id = b.id || 'bud_' + k.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    b.nama = b.nama || k;
    b.cats = k ? [k] : [];
    b.periode = b.periode || 'bulanan';
    b.alert = b.alert || BUDGET_MERAH;
    delete b.kategori;
  });
  return l;
}

// ponytail: kalau 2 budget berbagi kategori, hanya yang pertama yang memunculkan peringatan
function findBudget(kategori) {
  const k = (kategori || '').trim().toLowerCase();
  return budgetList().find(b => b.cats.some(c => c.trim().toLowerCase() === k));
}

// rentang periode berjalan: bulanan = tgl 1 s/d akhir bulan, mingguan = Senin s/d Minggu
function budgetRange(b) {
  const t = new Date();
  if (b.periode === 'mingguan') {
    const s = new Date(t.getFullYear(), t.getMonth(), t.getDate() - (t.getDay() + 6) % 7);
    return [s, new Date(s.getFullYear(), s.getMonth(), s.getDate() + 6)];
  }
  return [new Date(t.getFullYear(), t.getMonth(), 1), new Date(t.getFullYear(), t.getMonth() + 1, 0)];
}

function budgetRangeLabel(b) {
  const f = d => d.getDate() + ' ' + BULAN[d.getMonth()].slice(0, 3);
  const [s, e] = budgetRange(b);
  return f(s) + ' – ' + f(e);
}

function spentFor(b) {
  const [s, e] = budgetRange(b).map(dstr);
  const cats = new Set(b.cats.map(c => c.trim().toLowerCase()));
  return (globalData.transactions || [])
    .filter(t => !netral(t) && t.jenis === 'Pengeluaran' && t.tanggal >= s && t.tanggal <= e && cats.has((t.kategori || '').trim().toLowerCase()))
    .reduce((sum, t) => sum + (Number(t.jumlah) || 0), 0);
}

function budgetPct(b) { return b.batas > 0 ? spentFor(b) / b.batas * 100 : 0; }

// 0 aman, 1 hati-hati, 2 hampir habis; batas peringatan diambil dari budget-nya
function budgetLevel(b, pct) {
  if (pct === undefined) pct = budgetPct(b);
  const w = Number(b.alert) || BUDGET_MERAH;
  return pct >= w ? 2 : (pct >= w * BUDGET_KUNING / BUDGET_MERAH ? 1 : 0);
}

function budgetCardHtml(b) {
  const spent = spentFor(b);
  const pct = b.batas > 0 ? spent / b.batas * 100 : 0;
  const lv = budgetLevel(b, pct);
  const warna = BUDGET_WARNA[lv];
  const sisa = b.batas - spent;
  const status = pct >= 100 ? 'Melebihi budget' : BUDGET_STATUS[lv];
  return `
    <div class="list-card" onclick="openBudgetForm('${b.id}')" style="cursor: pointer;">
      <div style="display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-bottom: 4px;">
        <strong style="font-size: 1rem;">${esc(b.nama)}</strong>
        <span style="font-size: 0.75rem; font-weight: 500; color: ${warna}; white-space: nowrap;">${status} · ${Math.round(pct)}%</span>
      </div>
      <p style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 16px;">${b.periode === 'mingguan' ? 'Mingguan' : 'Bulanan'} · ${budgetRangeLabel(b)} · ${b.cats.map(esc).join(', ')}</p>
      <div class="budget-track"><div class="budget-fill" style="width: ${Math.min(pct, 100)}%; background: ${warna};"></div></div>
      <div style="display: flex; justify-content: space-between; font-size: 0.78rem; color: var(--text-muted); margin-top: 10px;">
        <span>${format(spent)} / ${format(b.batas)}</span>
        <span>${sisa >= 0 ? 'Sisa ' + format(sisa) : 'Lebih ' + format(-sisa)}</span>
      </div>
    </div>`;
}

// dashboard (3 teratas) + halaman Budget
function renderBudgets() {
  const list = budgetList();
  const box = document.getElementById('budgetContainer');
  if (box) {
    box.innerHTML = list.length
      ? list.slice(0, 3).map(budgetCardHtml).join('') +
        (list.length > 3 ? `<p onclick="openPage('budgets')" style="text-align: center; color: var(--text-muted); font-size: 0.85rem; cursor: pointer; padding: 4px 0;">Lihat semua (${list.length}) budget</p>` : '')
      : `<p style="text-align: center; color: var(--text-muted); padding: 12px 0; font-size: 0.85rem;">Belum ada budget. Tap "Atur" untuk membuat.</p>`;
  }
  renderBudgetPage(list);
}

function renderBudgetPage(list) {
  const body = document.getElementById('budgetPageBody');
  if (!body) return;
  if (list.length === 0) {
    body.innerHTML = `
      <div class="wl-empty" style="margin-top: 40px; border: none;">
        <i class="fa fa-chart-pie" style="font-size: 3rem;"></i>
        <p style="margin: 14px 0 6px; font-size: 1rem;">Belum ada budget</p>
        <small>Batasi pengeluaran per kategori, per minggu atau per bulan</small>
        <button type="button" class="btn-primary" onclick="openBudgetForm()" style="width: auto; padding: 14px 28px; margin-top: 22px;">Buat Budget</button>
      </div>`;
    return;
  }
  const batas = list.reduce((s, b) => s + (Number(b.batas) || 0), 0);
  const spent = list.reduce((s, b) => s + spentFor(b), 0);
  const pct = batas > 0 ? spent / batas * 100 : 0;
  const lv = budgetLevel({ alert: BUDGET_MERAH }, pct);
  const warna = BUDGET_WARNA[lv];
  const sisa = batas - spent;
  const arc = 'M10 60 A50 50 0 0 1 110 60';
  body.innerHTML = `
    <div class="bgt-sum">
      <p class="bgt-month">${monthLabel(currentMonthKey())}</p>
      <div class="bgt-top">
        <div>
          <p class="bgt-cap">${sisa >= 0 ? 'Masih bisa dibelanjakan' : 'Melebihi total budget'}</p>
          <h2 class="bgt-big">${format(Math.abs(sisa))}</h2>
          <p class="bgt-cap">dari ${list.length} budget aktif</p>
        </div>
        <span class="bgt-badge" style="color: ${warna}; background: color-mix(in srgb, ${warna} 12%, transparent);"><i class="fa ${lv === 0 ? 'fa-circle-check' : 'fa-triangle-exclamation'}"></i> ${pct >= 100 ? 'Melebihi' : BUDGET_STATUS[lv]}</span>
      </div>
      <div class="bgt-gauge">
        <svg viewBox="0 0 120 68"><path d="${arc}" fill="none" stroke="var(--border-color)" stroke-width="12" stroke-linecap="round"/>${pct > 0 ? `<path d="${arc}" fill="none" stroke="${warna}" stroke-width="12" stroke-linecap="round" pathLength="100" stroke-dasharray="${Math.min(pct, 100)} 100"/>` : ''}</svg>
        <div><b>${Math.round(pct)}%</b><span class="bgt-cap">terpakai</span></div>
      </div>
      <p class="bgt-line"><b>${format(spent)}</b> / ${format(batas)}</p>
    </div>` + list.map(budgetCardHtml).join('');
}

// ----- form tambah / ubah budget -----
let bfCats = [];        // kategori terpilih
let bfExtra = [];       // kategori baru yang diketik di form
let bfPeriode = 'bulanan';

function setBudgetPeriode(p) {
  bfPeriode = p === 'mingguan' ? 'mingguan' : 'bulanan';
  document.getElementById('bfp-bulanan').classList.toggle('active', bfPeriode === 'bulanan');
  document.getElementById('bfp-mingguan').classList.toggle('active', bfPeriode === 'mingguan');
  document.getElementById('bfPeriodeHint').innerText = bfPeriode === 'mingguan' ? 'Dihitung ulang tiap Senin.' : 'Dihitung ulang tiap tanggal 1.';
}

function openBudgetForm(id) {
  const b = id ? budgetList().find(x => x.id === id) : null;
  if (id && !b) return;
  document.getElementById('bfTitle').innerText = b ? 'Ubah Budget' : 'Budget Baru';
  document.getElementById('bfId').value = b ? b.id : '';
  document.getElementById('bfBatas').value = b ? formatRupiahInput(b.batas) : '';
  document.getElementById('bfNama').value = b ? b.nama : '';
  document.getElementById('bfAlert').value = b ? b.alert : BUDGET_MERAH;
  document.getElementById('bfKatBaru').value = '';
  document.getElementById('bfHapus').classList.toggle('hidden', !b);
  bfCats = b ? b.cats.slice() : [];
  bfExtra = [];
  setBudgetPeriode(b ? b.periode : 'bulanan');
  renderBudgetChips();
  openPage('budgetForm');
}

// kategori yang masuk akal untuk budget: bawaan, sudah dipakai di budget, dan yang pernah jadi pengeluaran
function katPengeluaran() {
  const out = [];
  document.querySelectorAll('#kategoriList option').forEach(o => out.push(o.value));
  budgetList().forEach(b => out.push(...b.cats));
  (globalData.transactions || []).forEach(t => { if (!netral(t) && t.jenis === 'Pengeluaran') out.push(t.kategori); });
  katRecs().forEach(r => { if (r.jenis === 'Pengeluaran') out.push(r.nama); });
  return out.filter(k => !katTersembunyi(k, 'Pengeluaran'));
}

function renderBudgetChips() {
  const known = new Map();
  [...katPengeluaran(), ...bfCats, ...bfExtra].forEach(k => { k = (k || '').trim(); if (k && !known.has(k.toLowerCase())) known.set(k.toLowerCase(), k); });
  const on = new Set(bfCats.map(c => c.trim().toLowerCase()));
  document.getElementById('bfChips').innerHTML = [...known.values()].map(k => `
    <button type="button" class="cat-chip ${on.has(k.toLowerCase()) ? 'on' : ''}" onclick="toggleBudgetCat('${jsq(k)}')">
      <span class="cat-ic"><i class="fa ${on.has(k.toLowerCase()) ? 'fa-check' : katIkon(k)}"></i></span>
      <span class="cat-nm">${esc(k)}</span>
    </button>`).join('');
}

function toggleBudgetCat(k) {
  const low = k.trim().toLowerCase();
  const ada = bfCats.some(c => c.trim().toLowerCase() === low);
  bfCats = ada ? bfCats.filter(c => c.trim().toLowerCase() !== low) : bfCats.concat(k);
  renderBudgetChips();
}

function addBudgetCat() {
  const el = document.getElementById('bfKatBaru');
  const k = el.value.trim();
  if (!k) return;
  if (!bfCats.some(c => c.trim().toLowerCase() === k.toLowerCase())) bfCats.push(k);
  bfExtra.push(k);
  el.value = '';
  renderBudgetChips();
}

function submitBudgetForm() {
  const id = document.getElementById('bfId').value;
  const batas = Number(document.getElementById('bfBatas').value.replace(/\./g, '')) || 0;
  const alertPct = Math.min(100, Math.max(1, parseInt(document.getElementById('bfAlert').value, 10) || BUDGET_MERAH));
  if (batas <= 0) { alert('Isi batas nominal lebih dari 0'); return; }
  if (bfCats.length === 0) { alert('Pilih minimal 1 kategori'); return; }
  const nama = document.getElementById('bfNama').value.trim() || bfCats.slice(0, 2).join(' & ');

  const item = { id: id || 'bud_' + Date.now(), nama, batas, periode: bfPeriode, cats: bfCats.slice(), alert: alertPct };
  const list = (globalData.budgets = globalData.budgets || []);
  const i = list.findIndex(x => x.id === item.id);
  if (i > -1) list[i] = item; else list.push(item);

  localStorage.setItem('budggt_local_cache', JSON.stringify(globalData));
  renderBudgets();
  openPage('budgets');
  google.script.run
    .withFailureHandler(err => alert('Gagal simpan budget: ' + err.message))
    .setBudget(item);
}

function removeBudgetForm() {
  const id = document.getElementById('bfId').value;
  const b = budgetList().find(x => x.id === id);
  if (!b || !confirm(`Hapus budget "${b.nama}"?`)) return;
  globalData.budgets = globalData.budgets.filter(x => x.id !== id);
  localStorage.setItem('budggt_local_cache', JSON.stringify(globalData));
  renderBudgets();
  openPage('budgets');
  google.script.run
    .withFailureHandler(err => alert('Gagal hapus budget: ' + err.message))
    .deleteBudget(id);
}

function showToast(msg, lv) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.style.background = ['#4d7c0f', '#eab308', '#be123c'][lv] || '#be123c';
  if (lv === 1) el.style.color = '#000';
  el.innerText = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

// Dipanggil setelah pengeluaran disimpan; lvBefore = level sebelum transaksi
function warnBudget(kategori, lvBefore) {
  const b = findBudget(kategori);
  if (!b) return;
  const pct = budgetPct(b);
  const lv = budgetLevel(b, pct);
  if (lv > lvBefore) {
    const teks = pct >= 100
      ? `⚠️ Budget ${b.nama} sudah melebihi batas (${Math.round(pct)}%)!`
      : `Budget ${b.nama} sudah terpakai ${Math.round(pct)}%`;
    showToast(teks, lv);
  }
}

// ===== TAGIHAN BULANAN =====
const TAGIHAN_SOON = 3; // hari menjelang jatuh tempo yang ditandai kuning

function billList() { return globalData.bills || []; }

function billDueDate(b, key) {
  const [y, m] = key.split('-').map(Number);
  const last = new Date(y, m, 0).getDate(); // tanggal 31 di bulan 30 hari -> hari terakhir
  return new Date(y, m - 1, Math.min(Number(b.tanggal) || 1, last));
}

function billStatus(b) {
  const key = currentMonthKey();
  const due = billDueDate(b, key);
  if (b.lunas === key) return { lv: 'lunas', label: 'Lunas', warna: 'var(--pos)', due };
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.round((due - today) / 86400000);
  if (diff < 0) return { lv: 'telat', label: 'Terlambat ' + (-diff) + ' hari', warna: 'var(--neg)', due };
  if (diff === 0) return { lv: 'soon', label: 'Jatuh tempo hari ini', warna: 'var(--warn)', due };
  if (diff <= TAGIHAN_SOON) return { lv: 'soon', label: diff + ' hari lagi', warna: 'var(--warn)', due };
  return { lv: 'ok', label: diff + ' hari lagi', warna: 'var(--text-muted)', due };
}

function renderTagihan() {
  renderBills();
  renderBillSummary();
}

function renderBills() {
  const box = document.getElementById('billList');
  if (!box) return;
  const items = billList().map(b => ({ b, s: billStatus(b) }));
  if (items.length === 0) {
    box.innerHTML = `<p style="text-align: center; color: var(--text-muted); padding: 20px 0; font-size: 0.9rem;">Belum ada tagihan. Tap "Tambah" untuk membuat.</p>`;
    return;
  }
  const urut = { telat: 0, soon: 1, ok: 2, lunas: 3 };
  items.sort((x, y) => urut[x.s.lv] - urut[y.s.lv] || x.s.due - y.s.due);

  box.innerHTML = items.map(({ b, s }) => `
    <div class="acc-card">
      <div style="display: flex; justify-content: space-between; align-items: center; gap: 12px;">
        <div style="display: flex; align-items: center; gap: 12px; min-width: 0;">
          <div class="wl-ic" style="background: #ef444426; color: #ef4444;"><i class="fa fa-file-invoice-dollar"></i></div>
          <div style="min-width: 0;">
            <h4 class="wl-name">${esc(b.nama)}</h4>
            <p class="wl-sub" style="color: ${s.warna};">${s.label}</p>
          </div>
        </div>
        <div style="text-align: right; flex: none;">
          <h3 class="wl-bal">${format(b.jumlah)}</h3>
          <p class="wl-cap">Tiap tgl ${b.tanggal} · ${esc(b.kategori)}</p>
        </div>
      </div>
      <div class="wl-actions" style="justify-content: flex-start; flex-wrap: wrap; margin-top: 14px;">
        ${s.lv !== 'lunas' ? `<button type="button" class="wl-btn p" onclick="openPayBill('${b.id}')"><i class="fa fa-check"></i> Bayar</button>` : ''}
        <button type="button" class="wl-btn" onclick="openBill('${b.id}')"><i class="fa fa-pen"></i> Ubah</button>
        <button type="button" class="wl-btn d" onclick="removeBill('${b.id}')"><i class="fa fa-trash"></i> Hapus</button>
      </div>
    </div>    </div>`).join('');
}

// Ringkasan di dashboard + titik merah di lonceng
function renderBillSummary() {
  const box = document.getElementById('billSummary');
  const dot = document.getElementById('billDot');
  const items = billList().map(b => ({ b, s: billStatus(b) }));
  const urgent = items.filter(x => x.s.lv === 'telat' || x.s.lv === 'soon').sort((x, y) => x.s.due - y.s.due);
  if (dot) dot.classList.toggle('hidden', urgent.length === 0);
  if (!box) return;

  const note = txt => `<p style="text-align: center; color: var(--text-muted); padding: 12px 0; font-size: 0.85rem;">${txt}</p>`;
  if (items.length === 0) { box.innerHTML = note('Belum ada tagihan. Tap "Kelola" untuk menambah.'); return; }
  if (urgent.length === 0) { box.innerHTML = note('Tidak ada tagihan yang dekat jatuh tempo 🎉'); return; }

  box.innerHTML = urgent.slice(0, 3).map(({ b, s }) => `
    <div class="list-card" onclick="openPage('bills')" style="cursor: pointer; padding: 14px 16px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center;">
      <div>
        <strong style="font-size: 0.9rem;">${b.nama}</strong>
        <p style="font-size: 0.7rem; font-weight: 600; color: ${s.warna}; margin-top: 2px;">${s.label}</p>
      </div>
      <span style="font-weight: 600; font-size: 0.9rem;">${format(b.jumlah)}</span>
    </div>`).join('') +
    (urgent.length > 3 ? note('+ ' + (urgent.length - 3) + ' tagihan lainnya') : '');
}

function accountOptions(selectedId) {
  return (globalData.accounts || []).map(a =>
    `<option value="${a.id}" ${a.id === selectedId ? 'selected' : ''}>${a.nama}</option>`).join('');
}

function openBill(id) {
  const b = id ? billList().find(x => x.id === id) : null;
  if (id && !b) return;
  if ((globalData.accounts || []).length === 0) { alert('Tambah rekening dulu di menu Rekening'); return; }
  document.getElementById('billTitle').innerText = b ? 'Ubah Tagihan' : 'Tambah Tagihan';
  document.getElementById('billId').value = b ? b.id : '';
  document.getElementById('billNama').value = b ? b.nama : '';
  document.getElementById('billJumlah').value = b ? formatRupiahInput(b.jumlah) : '';
  document.getElementById('billTanggal').value = b ? b.tanggal : '';
  document.getElementById('billKategori').value = b ? b.kategori : 'Tagihan';
  document.getElementById('billRekening').innerHTML = accountOptions(b ? b.rekeningId : '');
  toggleModal('modalBill');
}

function submitBill() {
  const id = document.getElementById('billId').value;
  const nama = document.getElementById('billNama').value.trim();
  const jumlah = Number(document.getElementById('billJumlah').value.replace(/\./g, '')) || 0;
  const tgl = parseInt(document.getElementById('billTanggal').value, 10);
  const kategori = document.getElementById('billKategori').value.trim();
  const rekeningId = document.getElementById('billRekening').value;

  if (!nama) { alert('Isi nama tagihan'); return; }
  if (jumlah <= 0) { alert('Isi nominal tagihan (perkiraan juga boleh)'); return; }
  if (!(tgl >= 1 && tgl <= 31)) { alert('Tanggal jatuh tempo harus 1 sampai 31'); return; }
  if (!kategori) { alert('Isi kategori'); return; }
  if (!rekeningId) { alert('Pilih rekening'); return; }

  if (!globalData.bills) globalData.bills = [];
  let bill;
  if (id) {
    bill = billList().find(x => x.id === id);
    if (!bill) return;
    Object.assign(bill, { nama, jumlah, tanggal: tgl, kategori, rekeningId });
  } else {
    bill = { id: 'bill_' + Date.now(), nama, jumlah, tanggal: tgl, kategori, rekeningId, lunas: '' };
    // tanggal bulan ini sudah lewat: tanya, supaya tidak langsung tampil "Terlambat"
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (billDueDate(bill, currentMonthKey()) < today &&
        confirm('Jatuh tempo bulan ini sudah lewat. Tandai sudah dibayar untuk bulan ini?')) {
      bill.lunas = currentMonthKey();
    }
    globalData.bills.push(bill);
  }

  localStorage.setItem('budggt_local_cache', JSON.stringify(globalData));
  toggleModal('modalBill');
  renderTagihan();

  google.script.run
    .withFailureHandler(err => alert('Gagal simpan tagihan: ' + err.message))
    .setBill(bill);
}

function removeBill(id) {
  const b = billList().find(x => x.id === id);
  if (!b) return;
  if (!confirm(`Hapus tagihan "${b.nama}"? Transaksi yang sudah tercatat tidak ikut terhapus.`)) return;
  globalData.bills = globalData.bills.filter(x => x.id !== id);
  localStorage.setItem('budggt_local_cache', JSON.stringify(globalData));
  renderTagihan();
  google.script.run
    .withFailureHandler(err => alert('Gagal hapus tagihan: ' + err.message))
    .deleteBill(id);
}

function openPayBill(id) {
  const b = billList().find(x => x.id === id);
  if (!b) return;
  document.getElementById('payBillId').value = b.id;
  document.getElementById('payBillName').innerText = b.nama + ' · jatuh tempo tanggal ' + b.tanggal;
  document.getElementById('payJumlah').value = formatRupiahInput(b.jumlah);
  document.getElementById('payRekening').innerHTML = accountOptions(b.rekeningId);
  toggleModal('modalPayBill');
}

function submitPayBill() {
  const b = billList().find(x => x.id === document.getElementById('payBillId').value);
  if (!b) return;
  const jumlah = Number(document.getElementById('payJumlah').value.replace(/\./g, '')) || 0;
  const rekeningId = document.getElementById('payRekening').value;
  if (jumlah <= 0) { alert('Isi nominal yang dibayar'); return; }
  if (!rekeningId) { alert('Pilih rekening'); return; }

  const bdg = findBudget(b.kategori);
  const lvBefore = bdg ? budgetLevel(bdg) : 0;

  const trx = { tanggal: todayStr(), jenis: 'Pengeluaran', kategori: b.kategori, keterangan: b.nama, jumlah, rekeningId };
  (globalData.transactions = globalData.transactions || []).unshift(Object.assign({ id: 'temp_' + Date.now() }, trx));
  const acc = (globalData.accountSummary || []).find(a => a.id === rekeningId);
  if (acc) acc.saldoAkhir -= jumlah;

  b.lunas = currentMonthKey();
  b.jumlah = jumlah;          // nominal terakhir jadi isian awal bulan depan
  b.rekeningId = rekeningId;

  localStorage.setItem('budggt_local_cache', JSON.stringify(globalData));
  toggleModal('modalPayBill');
  renderAllLocalUI();
  if (bdg) warnBudget(b.kategori, lvBefore);

  google.script.run
    .withFailureHandler(err => alert('Gagal simpan status tagihan: ' + err.message))
    .setBill(b);
  google.script.run
    .withSuccessHandler(() => loadData())
    .withFailureHandler(err => alert('Gagal mencatat pembayaran: ' + err.message))
    .addTransaction(Object.assign({}, trx, { jumlah: String(jumlah) }));
}

// ===== DETAIL HARIAN (ketuk tanggal di kalender) =====
const HARI = ["Minggu","Senin","Selasa","Rabu","Kamis","Jumat","Sabtu"];
let dayKey = '';

function openDay(key) {
  dayKey = key;
  renderDay();
  const el = document.getElementById('modalDay');
  if (el && el.classList.contains('hidden')) toggleModal('modalDay');
}

function renderDay() {
  const box = document.getElementById('dayList');
  if (!box || !dayKey) return;

  const [y, m, d] = dayKey.split('-').map(Number);
  document.getElementById('dayTitle').innerText = HARI[new Date(y, m - 1, d).getDay()] + ', ' + d + ' ' + BULAN[m - 1];

  const list = (globalData.transactions || []).filter(t => t.tanggal === dayKey);
  let inc = 0, exp = 0;
  list.filter(t => !netral(t)).forEach(t => {
    const n = Number(t.jumlah) || 0;
    if (t.jenis === 'Pemasukan') inc += n; else exp += n;
  });

  const cap = 'font-size: 0.72rem; font-weight: 500; color: var(--text-muted); margin-bottom: 6px;';
  const val = 'font-size: 1.05rem; font-weight: 700; letter-spacing: -0.3px;';
  document.getElementById('daySummary').innerHTML = `
    <div class="list-card" style="margin: 0; padding: 14px;">
      <p style="${cap}">Masuk</p>
      <h3 style="${val} color: var(--pos);">${format(inc)}</h3>
    </div>
    <div class="list-card" style="margin: 0; padding: 14px;">
      <p style="${cap}">Keluar</p>
      <h3 style="${val} color: var(--neg);">${format(exp)}</h3>
    </div>`;

   // tagihan yang jatuh tempo di tanggal ini (kalender hanya bulan berjalan)
  const dueBills = dayKey.slice(0, 7) === currentMonthKey()
    ? billList().map(b => ({ b, s: billStatus(b) })).filter(x => x.s.due.getDate() === d)
    : [];
  const lbl = 'font-size: 0.7rem; font-weight: 600; color: var(--text-muted);';

  const billHtml = dueBills.length ? `
    <p style="${lbl} margin-bottom: 8px;">Tagihan</p>
    ${dueBills.map(({ b, s }) => `
      <div class="list-card" style="padding: 12px 14px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; gap: 10px;">
        <div>
          <strong style="font-size: 0.9rem;">${b.nama}</strong>
          <p style="font-size: 0.7rem; font-weight: 600; color: ${s.warna}; margin-top: 2px;">${s.label}</p>
        </div>
        <div style="display: flex; align-items: center; gap: 10px;">
          <span style="font-weight: 600; font-size: 0.9rem;">${format(b.jumlah)}</span>
          ${s.lv !== 'lunas' ? `<button type="button" onclick="openPayBill('${b.id}')" style="background: var(--primary); color: #000; border: none; padding: 6px 14px; border-radius: 20px; font-size: 0.75rem; font-weight: 600; cursor: pointer;">Bayar</button>` : ''}
        </div>
      </div>`).join('')}
    <p style="${lbl} margin: 14px 0 8px;">Transaksi</p>` : '';

    box.innerHTML = billHtml + (list.length
    ? list.map((t, i) => renderTrxHtml(t, i, 'day')).join('')
    : `<p style="text-align: center; color: var(--text-muted); padding: 20px 0; font-size: 0.9rem;">Belum ada transaksi di tanggal ini</p>`);

  const btn = document.getElementById('dayAddBtn');
  if (btn) btn.style.display = dayKey > todayStr() ? 'none' : 'flex';
}

function addForDay() {
  toggleModal('modalTrx');
  document.getElementById('tanggal').value = dayKey; // toggleModal mengisi hari ini, ditimpa di sini
  trxDateLabel();
}


// ===== LEVEL (dari konsistensi mencatat; semua dihitung ulang dari transaksi, tidak ada yang disimpan) =====
const LEVEL_TITLES = ['Pemula', 'Pencatat Rajin', 'Penabung Handal', 'Pengatur Uang', 'Juragan Hemat', 'Sultan Budget', 'Legenda'];
const xpForLevel = n => 50 * n * (n - 1); // Lv2 = 100 XP, Lv3 = 300, Lv4 = 600, Lv5 = 1000 ...
const dayIdx = s => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d) / 86400000; };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function levelStats() {
  const today = dayIdx(todayStr());
  // hanya pencatatan sungguhan: Transfer dan Koreksi Saldo tidak dihitung, tanggal masa depan juga tidak
  const real = (globalData.transactions || []).filter(t => !netral(t) && /^\d{4}-\d{2}-\d{2}$/.test(t.tanggal || '') && dayIdx(t.tanggal) <= today);
  const days = [...new Set(real.map(t => dayIdx(t.tanggal)))].sort((a, b) => a - b);

  let best = 0, run = 0, bonus = 0, prev = null;
  days.forEach(d => {
    if (prev !== null && d === prev + 1) run++;
    else { bonus += Math.floor(run / 7) * 50; run = 1; }
    best = Math.max(best, run);
    prev = d;
  });
  bonus += Math.floor(run / 7) * 50;
  const cur = prev !== null && prev >= today - 1 ? run : 0; // streak masih hidup kalau kemarin atau hari ini ada catatan

  const xp = days.length * 10 + bonus;
  let level = 1;
  while (xp >= xpForLevel(level + 1)) level++;

  const st = { days: days.length, trx: real.length, cur, best, xp, level, start: xpForLevel(level), next: xpForLevel(level + 1),
    title: LEVEL_TITLES[Math.min(level, LEVEL_TITLES.length) - 1] };
  const B = [
    ['fa-pen',               'Catatan Pertama',  'Catat 1 transaksi',  st.trx >= 1],
    ['fa-fire',              'Mulai Panas',      'Streak 3 hari',      best >= 3],
    ['fa-fire-flame-curved', 'Seminggu Penuh',   'Streak 7 hari',      best >= 7],
    ['fa-bolt',              'Sebulan Konsisten','Streak 30 hari',     best >= 30],
    ['fa-calendar-check',    'Rajin',            '10 hari aktif',      st.days >= 10],
    ['fa-calendar-days',     'Langganan',        '50 hari aktif',      st.days >= 50],
    ['fa-medal',             'Veteran',          '100 hari aktif',     st.days >= 100],
    ['fa-receipt',           '50 Catatan',       '50 transaksi',       st.trx >= 50],
    ['fa-book',              'Buku Tebal',       '200 transaksi',      st.trx >= 200],
    ['fa-percent',           'Pengatur Budget',  'Buat 1 budget',      budgetList().length > 0],
    ['fa-bell',              'Pelacak Tagihan',  'Buat 1 tagihan',     billList().length > 0],
    ['fa-crown',             'Juragan',          'Capai Level 5',      level >= 5]
  ];
  st.badges = B.map(([ic, nama, desc, ok]) => ({ ic, nama, desc, ok }));
  return st;
}

function renderLevel() {
  const st = levelStats();
  const chip = document.getElementById('lvlChip');
  if (chip) chip.innerText = 'Lv ' + st.level + (st.cur > 0 ? ' · 🔥' + st.cur : '');

  // selamat saat naik level; pertama kali hanya mencatat level tanpa toast
  try {
    const seen = Number(localStorage.getItem('budggt_lvl'));
    if (seen && st.level > seen) showToast('🎉 Naik ke Level ' + st.level + ' · ' + st.title + '!', 1);
    localStorage.setItem('budggt_lvl', st.level);
  } catch (e) {}

  const box = document.getElementById('levelBox');
  if (!box) return;
  const name = localStorage.getItem('user_display_name') || (globalData.user || 'Pengguna').split('@')[0];
  const pct = Math.min(100, Math.round((st.xp - st.start) / (st.next - st.start) * 100));
  const got = st.badges.filter(b => b.ok).length;
  const tile = (ic, col, val, lbl) => `
    <div class="stat-tile">
      <div class="stat-ic" style="background: ${col}29; color: ${col};"><i class="fa ${ic}"></i></div>
      <b>${val}</b><em>${lbl}</em>
    </div>`;

  box.innerHTML = `
    <div class="lvl-hero">
      <div class="lvl-ring" style="background: conic-gradient(var(--primary) ${pct}%, var(--border-color) 0);">
        <div class="lvl-avatar">${esc((name.charAt(0) || '?').toUpperCase())}</div>
        <span class="lvl-pill">Level ${st.level}</span>
      </div>
      <h2 style="font-size: 1.4rem; font-weight: 700; margin-top: 20px;">${esc(name)}</h2>
      <p style="color: var(--text-muted); font-weight: 500; font-size: 0.9rem;">${st.title}</p>
      <p style="font-size: 0.8rem; font-weight: 600; margin-top: 8px;">${st.xp} / ${st.next} XP</p>
      <div class="budget-track" style="width: calc(100% - 56px); margin: 8px auto 0;"><div class="budget-fill" style="width: ${pct}%; background: var(--primary);"></div></div>
      <p style="font-size: 0.7rem; color: var(--text-muted); margin-top: 8px;">10 XP tiap hari kamu mencatat, +50 XP tiap 7 hari beruntun</p>
    </div>
    <div class="stat-grid">
      ${tile('fa-fire', '#f97316', st.cur, 'Streak')}
      ${tile('fa-arrow-trend-up', '#ef4444', st.best, 'Streak terpanjang')}
      ${tile('fa-trophy', 'var(--warn)', st.xp, 'Total XP')}
      ${tile('fa-calendar-check', '#3b82f6', st.days, 'Hari aktif')}
      ${tile('fa-receipt', '#14b8a6', st.trx, 'Transaksi')}
      ${tile('fa-medal', '#22c55e', got, 'Lencana')}
    </div>
    <div class="section-title-row" style="margin-bottom: 12px;">
      <h3 class="section-title">Pencapaian</h3>
      <span style="font-size: 0.8rem; color: var(--text-muted); font-weight: 500;">${got}/${st.badges.length}</span>
    </div>
    <div class="badge-grid">
      ${st.badges.map(b => `
        <div class="badge ${b.ok ? '' : 'locked'}">
          <div class="stat-ic" style="background: var(--circle-bg); color: ${b.ok ? 'var(--text-main)' : 'var(--text-muted)'};"><i class="fa ${b.ok ? b.ic : 'fa-lock'}"></i></div>
          <strong>${b.nama}</strong><small>${b.desc}</small>
        </div>`).join('')}
    </div>`;
}

// UTILITIES

// Semua kategori yang dikenal app, dikirim ke Gemini supaya dia memilih dari sini
function daftarKategori() {
  const set = new Map();
  const add = k => { k = (k || '').trim(); if (k && !set.has(k.toLowerCase())) set.set(k.toLowerCase(), k); };
  document.querySelectorAll('#kategoriList option').forEach(o => add(o.value));
  budgetList().forEach(b => b.cats.forEach(add));
  (globalData.transactions || []).forEach(t => { if (!netral(t)) add(t.kategori); });
  katRecs().forEach(r => { if (r.jenis === 'Pengeluaran') add(r.nama); });
  return [...set.values()].filter(k => !katTersembunyi(k, 'Pengeluaran'));
}

// Cocokkan kategori hasil scan ke kategori yang sudah dikenal (datalist, budget, transaksi)
function matchKategori(raw) {
  const r = (raw || '').trim().toLowerCase();
  if (!r) return '';
  const known = new Set();
  document.querySelectorAll('#kategoriList option').forEach(o => known.add(o.value));
  budgetList().forEach(b => b.cats.forEach(c => known.add(c)));
  (globalData.transactions || []).forEach(t => { if (t.kategori && !netral(t)) known.add(t.kategori); });

  const list = [...known];
  const exact = list.find(k => k.trim().toLowerCase() === r);
  if (exact) return exact;
  const part = list.find(k => {
    const x = k.trim().toLowerCase();
    return x.length > 2 && (r.includes(x) || x.includes(r));
  });
  return part || raw.trim();
}
function formatShort(num) {
  if (num >= 1000000) return +(num / 1000000).toFixed(1) + 'jt';
  if (num >= 1000) return Math.round(num / 1000) + 'rb';
  return num;
}

function formatRupiahInput(value) {
  if (!value) return "";
  let number_string = value.toString().replace(/[^0-9]/g, '');
  return number_string.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

// FUNGSI MODAL AMAN
function toggleModal(id) {
  const el = document.getElementById(id);
  if (!el) return;

  if (el.classList.contains('hidden')) {
    el.classList.remove('hidden');
    el.style.display = 'flex';
    if (id === 'modalTrx') { document.getElementById('tanggal').value = todayStr(); trxKatEdit = false; onJenisChange(); }
  } else {
    if (el.classList.contains('closing')) return;
    el.classList.add('closing'); // animasi turun dulu (style.css), baru disembunyikan
    setTimeout(() => {
      el.classList.remove('closing');
      el.classList.add('hidden');
      el.style.display = 'none';
    }, 280);
  }
}

function format(num) { 
  return "Rp " + Number(num || 0).toLocaleString('id-ID'); 
}

// TAP DI LUAR MODAL = TUTUP
let pointerDownTarget = null;
document.addEventListener('pointerdown', e => { pointerDownTarget = e.target; });
document.addEventListener('click', e => {
  const m = e.target;
  // harus tepat di latar gelap, dan tekan + lepasnya sama-sama di latar (bukan drag dari dalam form)
  if (!m.classList || !m.classList.contains('modal')) return;
  if (pointerDownTarget !== m) return;
  if (m.dataset.lock) return;   // modal yang diberi data-lock tidak ikut tertutup
  toggleModal(m.id);
});
