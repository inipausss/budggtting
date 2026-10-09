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
  renderTrend();
  renderRecapHistory();
  renderFullTransactions();
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
  { id: 'gelap',  nama: 'Gelap',      ic: 'fa-moon',   dark: true,  sw: ['#0f1115', '#181b20', '#ccff00'] },
  { id: 'malam',  nama: 'Malam',      ic: 'fa-star',   dark: true,  sw: ['#0b1020', '#141b34', '#22d3ee'] },
  { id: 'kopi',   nama: 'Kopi',       ic: 'fa-mug-hot', dark: true, sw: ['#17110d', '#241a14', '#fbbf24'] },
  { id: 'oled',   nama: 'Hitam OLED', ic: 'fa-circle', dark: true,  sw: ['#000000', '#0d0d0d', '#4ade80'] }
];
const THEME_KEY = 'budggt_theme';
let themePref = 'terang'; // id tema, atau 'auto' = ikuti sistem
try { themePref = localStorage.getItem(THEME_KEY) || (localStorage.getItem('theme') === 'dark' ? 'gelap' : 'terang'); } catch (e) {}

// warna aksen tema aktif, untuk grafik (canvas tidak bisa membaca var() CSS)
function accent() { return getComputedStyle(document.body).getPropertyValue('--primary').trim() || '#ccff00'; }

function applyTheme(pref) {
  const sysDark = !!(window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
  const id = pref === 'auto' ? (sysDark ? 'gelap' : 'terang') : pref;
  const th = THEMES.find(t => t.id === id) || THEMES[0];
  document.body.dataset.theme = th.id;
  document.body.classList.toggle('dark-mode', th.dark);
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
  box.innerHTML = row('auto', 'Ikuti sistem', 'fa-mobile-screen') + lbl('Tema terang') + grup(false) + lbl('Tema gelap') + grup(true);
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

function renderBalanceDisplay() {
  const elSaldo = document.getElementById("sumSaldo");
  const elIncome = document.getElementById("sumIncome");
  const elExpense = document.getElementById("sumExpense");
  const lockIcon = document.getElementById("lockIcon");

  if (!elSaldo) return;

  if (isBalanceHidden) {
    elSaldo.innerText = "Rp •••••••";
    if (elIncome) elIncome.innerText = "Rp •••••••";
    if (elExpense) elExpense.innerText = "Rp •••••••";
    if (lockIcon) {
      lockIcon.className = "fa fa-lock";
      lockIcon.style.color = "#ffffff";
    }
  } else {
    elSaldo.innerText = format(rawSummary.saldo);
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

function prevMonthKey() {
  const [y, m] = currentMonthKey().split('-').map(Number);
  const d = new Date(y, m - 2, 1);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

function setDelta(el, cur, old, upIsGood) {
  if (!el) return;
  let text = 'Belum ada data bulan lalu', good = true;
  if (old > 0) {
    const pct = Math.round((cur - old) / old * 100);
    text = (pct > 0 ? '+' : '') + pct + '% vs bulan lalu';
    good = pct === 0 || (pct > 0) === upIsGood;
  }
  el.innerText = text;
  el.style.background = good ? 'var(--pos-bg)' : 'var(--neg-bg)';
  el.style.color = good ? 'var(--pos)' : 'var(--neg)';
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
  let inc = 0, exp = 0, sal = 0, fInc = 0, fExp = 0;
  const picked = saldoAccounts();
  const ids = new Set(picked.map(a => a.id));

  inMonth(res.transactions, currentMonthKey()).filter(t => !netral(t)).forEach(t => {
    const amt = Number(t.jumlah) || 0;
    const masuk = t.jenis === "Pemasukan";
    if (masuk) inc += amt; else exp += amt;
    if (ids.has(t.rekeningId)) { if (masuk) fInc += amt; else fExp += amt; }
  });
  picked.forEach(a => { sal += Number(a.saldoAkhir) || 0; });

  // kartu atas mengikuti rekening yang dipilih
  rawSummary = { saldo: sal, income: fInc, expense: fExp };
  renderBalanceDisplay();
  renderSaldoLabel();

  // dua kartu di bawah tetap total semua rekening
  const incEl = document.getElementById("dashTotalIncome");
  const expEl = document.getElementById("dashTotalExpense");
  if (incEl) incEl.innerText = format(inc);
  if (expEl) expEl.innerText = format(exp);

  const prev = monthTotals(prevMonthKey());
  setDelta(incEl && incEl.nextElementSibling, inc, prev.inc, true);
  setDelta(expEl && expEl.nextElementSibling, exp, prev.exp, false);
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
  const kekayaan = saldo + tabungan;
  const dulu = kekayaan - delta;
  return { saldo, utang, tabungan, tagihan, delta, kekayaan, pct: dulu > 0 ? delta / dulu * 100 : 0 };
}

function walletHeroHtml() {
  const s = walletStats();
  const naik = s.delta >= 0;
  const tile = (lbl, val) => `<div class="wh-tile"><p>${lbl}</p><b>${format(val)}</b></div>`;
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
        ${tile('Utang / Minus', s.utang)}
        ${tile('Tabungan Aktif', s.tabungan)}
        ${tile('Tagihan Mendatang', s.tagihan)}
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
            <p class="wl-sub">SAVINGS GOALS • IDR</p>
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 12px;">
          <div style="text-align: right;">
            <p class="wl-cap">Saldo Tabungan</p>
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
  container.innerHTML = list.map((t, index) => renderTrxHtml(t, index, 'full')).join("");
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
      const ketVal = document.getElementById("keterangan").value.trim();
      const newTrx = {
        id: "temp_" + Date.now(),
        tanggal: document.getElementById("tanggal").value,
        jenis: document.getElementById("jenis").value,
        kategori: document.getElementById("kategori").value,
        keterangan: ketVal,
        jumlah: rawJumlah,
        rekeningId: document.getElementById("rekening").value
      };

      // 1. Update UI Detik ini juga (Instant)
      if (!globalData.transactions) globalData.transactions = [];
      const bdg = newTrx.jenis === 'Pengeluaran' ? findBudget(newTrx.kategori) : null;
      const lvBefore = bdg ? budgetLevel(budgetPct(bdg)) : 0;
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
const KATEGORI_NETRAL = ['Transfer', 'Koreksi Saldo', KAT_SETOR, KAT_TARIK]; // tidak dihitung sebagai pemasukan/pengeluaran
function netral(t) { return KATEGORI_NETRAL.includes(t.kategori); }

function onJenisChange() {
  const isTrf = document.getElementById('jenis').value === 'Transfer';
  const tujuan = document.getElementById('rekeningTujuan');
  const kat = document.getElementById('kategori');
  tujuan.classList.toggle('hidden', !isTrf);
  kat.classList.toggle('hidden', isTrf);
  if (isTrf) {
    kat.value = 'Transfer';
    const dari = document.getElementById('rekening').value;
    tujuan.innerHTML = '<option value="">→ Ke rekening tujuan...</option>' +
      (globalData.accounts || []).filter(a => a.id !== dari)
        .map(a => `<option value="${a.id}">${a.nama}</option>`).join('');
  } else if (kat.value === 'Transfer') {
    kat.value = '';
  }
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

// SCANNER STRUK AI
function handleReceipt(e) {
  const file = e.target.files[0];
  if (!file) return;
  
  let activeBtnId = e.target.id === 'scanCamera' ? 'btnCam' : 'btnGal';
  const btn = document.getElementById(activeBtnId);
  
  let originalHTML = '';
  if (btn) {
    originalHTML = btn.innerHTML;
    btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Memproses...';
    btn.disabled = true;
  }

  const reader = new FileReader();
  reader.onload = function(evt) {
    const img = new Image();
    img.onload = function() {
      const canvas = document.createElement('canvas');
      const MAX_WIDTH = 800;
      let scaleSize = MAX_WIDTH / img.width;
      if (scaleSize > 1) scaleSize = 1;
      canvas.width = img.width * scaleSize;
      canvas.height = img.height * scaleSize;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      
      const base64 = canvas.toDataURL('image/jpeg', 0.6).split(',')[1];

      google.script.run
        .withSuccessHandler(res => {
          if (btn) {
            btn.innerHTML = originalHTML;
            btn.disabled = false;
          }
          if (!res) return;
          document.getElementById("jumlah").value = res.jumlah ? formatRupiahInput(res.jumlah) : '';
          document.getElementById("kategori").value = res.kategori || '';
          document.getElementById("jenis").value = "Pengeluaran";
                    onJenisChange();
          if (res.tanggal) document.getElementById("tanggal").value = res.tanggal;
        })
        .withFailureHandler(err => {
          if (btn) {
            btn.innerHTML = originalHTML;
            btn.disabled = false;
          }
          alert("Gagal memproses struk: " + err.message);
        })
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
const CAT_PALETTE = ['#ccff00', '#f43f5e', '#38bdf8', '#f59e0b', '#a855f7', '#22c55e', '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16', '#eab308'];
const CAT_LAINNYA = '#64748b';
const CAT_TOP = 3; // di halaman Laporan hanya 5 teratas, sisanya digabung

function catData(key) {
  const map = new Map();
  let total = 0;
  inMonth(globalData.transactions, key)
    .filter(t => !netral(t) && t.jenis === 'Pengeluaran')
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
  list.forEach((c, i) => {
    c.warna = CAT_PALETTE[i % CAT_PALETTE.length];
    c.pct = total > 0 ? c.jumlah / total * 100 : 0;
  });
  return { list, total };
}

function catRowHtml(c) {
  const pct = c.pct >= 1 ? Math.round(c.pct) + '%' : '<1%';
  return `
    <div style="display: flex; align-items: center; gap: 12px; padding: 8px 0;">
      <span style="min-width: 46px; text-align: center; background: ${c.warna}; color: #000; font-size: 0.72rem; font-weight: 600; padding: 6px 0; border-radius: 6px;">${pct}</span>
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

  const { list, total } = catData(recapMonth);
  let rows = list;
  if (list.length > CAT_TOP + 1) {
    const rest = list.slice(CAT_TOP);
    const jumlah = rest.reduce((s, c) => s + c.jumlah, 0);
    rows = list.slice(0, CAT_TOP).concat([{
      nama: 'Lainnya (' + rest.length + ' kategori)',
      jumlah, warna: CAT_LAINNYA, pct: total > 0 ? jumlah / total * 100 : 0
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
    if (legend) legend.innerHTML = `<p style="text-align: center; color: var(--text-muted); padding: 15px 0; font-size: 0.85rem;">Belum ada data pengeluaran bulan ini</p>`;
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
  document.getElementById('catDetailTotal').innerText = format(total);

  if (catDetailChart) { catDetailChart.destroy(); catDetailChart = null; }

  if (total <= 0) {
    card.style.display = 'none';
    box.innerHTML = `<p style="text-align: center; color: var(--text-muted); padding: 20px 0; font-size: 0.9rem;">Belum ada pengeluaran di bulan ini</p>`;
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

// ===== BUDGET PER KATEGORI =====
const BUDGET_KUNING = 50;  // % mulai kuning
const BUDGET_MERAH = 80;   // % mulai merah
const BUDGET_WARNA = ['var(--pos)', 'var(--warn)', 'var(--neg)']; // hijau, kuning, merah
const BUDGET_STATUS = ['Aman', 'Hati-hati', 'Hampir habis'];

function budgetList() { return globalData.budgets || []; }

function findBudget(kategori) {
  const k = (kategori || '').trim().toLowerCase();
  return budgetList().find(b => b.kategori.trim().toLowerCase() === k);
}

function spentFor(kategori) {
  const k = (kategori || '').trim().toLowerCase();
  return inMonth(globalData.transactions, currentMonthKey())
    .filter(t => !netral(t) && t.jenis === 'Pengeluaran' && (t.kategori || '').trim().toLowerCase() === k)
    .reduce((s, t) => s + (Number(t.jumlah) || 0), 0);
}

function budgetPct(b) { return b.batas > 0 ? (spentFor(b.kategori) / b.batas) * 100 : 0; }
function budgetLevel(pct) { return pct >= BUDGET_MERAH ? 2 : (pct >= BUDGET_KUNING ? 1 : 0); }

function renderBudgets() {
  const box = document.getElementById('budgetContainer');
  if (!box) return;
  const list = budgetList();
  if (list.length === 0) {
    box.innerHTML = `<p style="text-align: center; color: var(--text-muted); padding: 12px 0; font-size: 0.85rem;">Belum ada budget. Tap "Atur" untuk membuat.</p>`;
    return;
  }
  box.innerHTML = list.map(b => {
    const spent = spentFor(b.kategori);
    const pct = budgetPct(b);
    const lv = budgetLevel(pct);
    const warna = BUDGET_WARNA[lv];
    const sisa = b.batas - spent;
    const status = pct >= 100 ? 'Melebihi budget' : BUDGET_STATUS[lv];
    return `
      <div class="list-card" style="padding: 16px; margin-bottom: 10px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <strong style="font-size: 0.95rem;">${b.kategori}</strong>
          <span style="font-size: 0.7rem; font-weight: 600; color: ${warna}; ">${status} · ${Math.round(pct)}%</span>
        </div>
        <div class="budget-track"><div class="budget-fill" style="width: ${Math.min(pct, 100)}%; background: ${warna};"></div></div>
        <div style="display: flex; justify-content: space-between; font-size: 0.75rem; color: var(--text-muted); font-weight: 500; margin-top: 8px;">
          <span>${format(spent)} / ${format(b.batas)}</span>
          <span>${sisa >= 0 ? 'Sisa ' + format(sisa) : 'Lebih ' + format(-sisa)}</span>
        </div>
      </div>`;
  }).join('');
}

function renderBudgetManager() {
  const box = document.getElementById('budgetManager');
  if (!box) return;
  const list = budgetList();
  if (list.length === 0) { box.innerHTML = ''; return; }
  box.innerHTML = list.map((b, i) => `
    <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-top: 1px solid var(--border-color);">
      <div onclick="editBudget(${i})" style="cursor: pointer; flex: 1;">
        <strong style="font-size: 0.9rem;">${b.kategori}</strong>
        <p style="font-size: 0.75rem; color: var(--text-muted);">${format(b.batas)} / bulan</p>
      </div>
      <button type="button" onclick="removeBudget(${i})" style="background: var(--neg-bg); color: var(--neg); border: none; padding: 6px 14px; border-radius: 20px; font-size: 0.75rem; font-weight: 500; cursor: pointer;">
        <i class="fa fa-trash"></i> Hapus
      </button>
    </div>`).join('');
}

function editBudget(i) {
  const b = budgetList()[i];
  if (!b) return;
  document.getElementById('budKategori').value = b.kategori;
  document.getElementById('budBatas').value = formatRupiahInput(b.batas);
}

function submitBudget() {
  const kategori = document.getElementById('budKategori').value.trim();
  const batas = Number(document.getElementById('budBatas').value.replace(/\./g, '')) || 0;
  if (!kategori) { alert('Isi kategori yang mau di-budget'); return; }
  if (batas <= 0) { alert('Isi batas budget lebih dari 0'); return; }

  if (!globalData.budgets) globalData.budgets = [];
  const ada = findBudget(kategori);
  if (ada) { ada.kategori = kategori; ada.batas = batas; }
  else globalData.budgets.push({ kategori, batas });

  localStorage.setItem('budggt_local_cache', JSON.stringify(globalData));
  document.getElementById('budKategori').value = '';
  document.getElementById('budBatas').value = '';
  renderBudgets();
  renderBudgetManager();

  google.script.run
    .withFailureHandler(err => alert('Gagal simpan budget: ' + err.message))
    .setBudget({ kategori, batas });
}

function removeBudget(i) {
  const b = budgetList()[i];
  if (!b) return;
  if (!confirm(`Hapus budget "${b.kategori}"?`)) return;
  globalData.budgets.splice(i, 1);
  localStorage.setItem('budggt_local_cache', JSON.stringify(globalData));
  renderBudgets();
  renderBudgetManager();
  google.script.run
    .withFailureHandler(err => alert('Gagal hapus budget: ' + err.message))
    .deleteBudget(b.kategori);
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
  const lv = budgetLevel(pct);
  if (lv > lvBefore || (pct >= 100 && lv === 2 && lvBefore === 2 && false)) {
    const teks = pct >= 100
      ? `⚠️ Budget ${b.kategori} sudah melebihi batas (${Math.round(pct)}%)!`
      : `Budget ${b.kategori} sudah terpakai ${Math.round(pct)}%`;
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
    <div class="list-card" style="padding: 16px; margin-bottom: 10px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
        <strong style="font-size: 0.95rem;">${b.nama}</strong>
        <span style="font-size: 0.7rem; font-weight: 600; color: ${s.warna}; ">${s.label}</span>
      </div>
      <div style="display: flex; justify-content: space-between; font-size: 0.75rem; color: var(--text-muted); font-weight: 500; margin-bottom: 12px;">
        <span>Tiap tanggal ${b.tanggal} · ${b.kategori}</span>
        <span style="color: var(--text-main); font-weight: 600;">${format(b.jumlah)}</span>
      </div>
      <div style="display: flex; justify-content: flex-end; gap: 8px; border-top: 1px solid var(--border-color); padding-top: 10px;">
        ${s.lv !== 'lunas' ? `<button type="button" onclick="openPayBill('${b.id}')" style="background: var(--primary); color: #000; border: none; padding: 6px 16px; border-radius: 20px; font-size: 0.75rem; font-weight: 600; cursor: pointer;"><i class="fa fa-check"></i> Bayar</button>` : ''}
        <button type="button" onclick="openBill('${b.id}')" style="background: var(--circle-bg); color: var(--text-main); border: 1px solid var(--border-color); padding: 6px 16px; border-radius: 20px; font-size: 0.75rem; font-weight: 500; cursor: pointer;"><i class="fa fa-pen"></i> Ubah</button>
        <button type="button" onclick="removeBill('${b.id}')" style="background: var(--neg-bg); color: var(--neg); border: none; padding: 6px 14px; border-radius: 20px; font-size: 0.75rem; font-weight: 500; cursor: pointer;"><i class="fa fa-trash"></i> Hapus</button>
      </div>
    </div>`).join('');
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
  const lvBefore = bdg ? budgetLevel(budgetPct(bdg)) : 0;

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
  budgetList().forEach(b => add(b.kategori));
  (globalData.transactions || []).forEach(t => { if (!netral(t)) add(t.kategori); });
  return [...set.values()];
}

// Cocokkan kategori hasil scan ke kategori yang sudah dikenal (datalist, budget, transaksi)
function matchKategori(raw) {
  const r = (raw || '').trim().toLowerCase();
  if (!r) return '';
  const known = new Set();
  document.querySelectorAll('#kategoriList option').forEach(o => known.add(o.value));
  budgetList().forEach(b => known.add(b.kategori));
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
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'JT';
  if (num >= 1000) return Math.round(num / 1000) + 'RB';
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
    if (id === 'modalBudget') renderBudgetManager();
    el.classList.remove('hidden');
    el.style.display = 'flex';
    if (id === 'modalTrx') document.getElementById('tanggal').value = todayStr();
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
