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
let viewMonth = currentMonthKey();

function inMonth(list, key) {
  return (list || []).filter(t => (t.tanggal || '').slice(0, 7) === key);
}

function monthLabel(key) {
  const [y, m] = key.split('-');
  return BULAN[Number(m) - 1] + ' ' + y;
}

function shiftMonth(delta) {
  const [y, m] = viewMonth.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  if (key > currentMonthKey()) return; // tidak bisa ke bulan depan
  viewMonth = key;
  renderFullTransactions();
}

window.onload = () => { 
  const elTgl = document.getElementById("tanggal");
  if (elTgl) elTgl.valueAsDate = new Date();

  // Load tema
  if (localStorage.getItem('theme') === 'dark') {
    document.body.classList.add('dark-mode');
    const icon = document.getElementById('themeIcon');
    if (icon) icon.className = 'fa fa-sun';
  }

  // 1. Tampilkan data dari cache lokal secara instan (0 detik)
  renderAllLocalUI();

  // 2. Tarik sinkronisasi data terbaru dari Google Sheets di latar belakang
  loadData();
  
  initFormListeners();
};

// TOGGLE DARK MODE
function toggleDarkMode() {
  const body = document.body;
  const icon = document.getElementById('themeIcon');
  body.classList.toggle('dark-mode');

  if (body.classList.contains('dark-mode')) {
    if (icon) icon.className = 'fa fa-sun';
    localStorage.setItem('theme', 'dark');
  } else {
    if (icon) icon.className = 'fa fa-moon';
    localStorage.setItem('theme', 'light');
  }
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
      lockIcon.style.color = "#ccff00";
    }
  } else {
    elSaldo.innerText = format(rawSummary.saldo);
    if (elIncome) elIncome.innerText = format(rawSummary.income);
    if (elExpense) elExpense.innerText = format(rawSummary.expense);
    if (lockIcon) {
      lockIcon.className = "fa fa-lock-open";
      lockIcon.style.color = "#94a3b8";
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
  
  if (id === 'analytics') renderFlowChart();
  if (id === 'transactions') { viewMonth = currentMonthKey(); renderFullTransactions();
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
  renderFullTransactions();
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

// UPDATE DASHBOARD RINGKASAN
function updateDashboard(res) {
  let inc = 0, exp = 0, sal = 0;
  inMonth(res.transactions, currentMonthKey()).forEach(t => {
    let amt = Number(t.jumlah) || 0;
    if (t.jenis === "Pemasukan") inc += amt;
    else exp += amt;
  });
  (res.accountSummary || []).forEach(a => { sal += Number(a.saldoAkhir) || 0; });

  rawSummary = { saldo: sal, income: inc, expense: exp };
  renderBalanceDisplay();

  const incEl = document.getElementById("dashTotalIncome");
  const expEl = document.getElementById("dashTotalExpense");
  if (incEl) incEl.innerText = format(inc);
  if (expEl) expEl.innerText = format(exp);
}

function getAccountName(rekeningId) {
  if (!globalData || !globalData.accounts) return 'Dompet Utama';
  let acc = globalData.accounts.find(a => a.id === rekeningId);
  return acc ? acc.nama : 'Dompet Utama';
}

// RENDER REKENING / DOMPET
function renderAccounts(list) {
  let grid = document.getElementById("accountGrid");
  if (!grid) return;
  if (!list || list.length === 0) {
    grid.innerHTML = `<p style="text-align: center; color: var(--text-muted); padding: 20px 0;">Belum ada rekening/dompet terdaftar</p>`;
    return;
  }
  
  grid.innerHTML = list.map((a, index) => {
    let labelNomor = a.jenis === 'Bank' ? 'NOMOR REKENING' : 'NOMOR HP';
    let nomorVal = (a.nomor && a.nomor !== '-' && a.nomor !== 'undefined') ? a.nomor : '-';

    return `
      <div class="acc-card" id="acc-card-${index}">
        <div class="acc-header" onclick="toggleAccDropdown(${index})">
          <div style="display: flex; align-items: center; gap: 12px;">
            <div style="width: 40px; height: 40px; border-radius: 12px; background: var(--circle-bg); border: 1px solid var(--border-color); display: flex; align-items: center; justify-content: center; color: var(--primary);">
              <i class="fa ${a.jenis === 'Bank' ? 'fa-building-columns' : 'fa-wallet'}"></i>
            </div>
            <div>
              <h4 style="font-size: 1rem; font-weight: 800; color: var(--text-main);">${a.nama}</h4>
              <p style="color: var(--text-muted); font-size: 0.7rem; text-transform: uppercase; font-weight: 700;">${a.jenis}</p>
            </div>
          </div>
          
          <div style="display: flex; align-items: center; gap: 14px;">
            <h3 style="font-size: 1.05rem; font-weight: 900; color: var(--text-main);">${format(a.saldoAkhir)}</h3>
            <i class="fa fa-chevron-down" style="font-size: 0.8rem; color: var(--text-muted);"></i>
          </div>
        </div>

        <div class="acc-details">
          ${nomorVal !== '-' ? `
            <div style="background: var(--circle-bg); padding: 12px; border-radius: var(--radius-sm); margin-bottom: 12px; border: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center;">
              <div>
                <p style="font-size: 0.65rem; font-weight: 700; color: var(--text-muted); letter-spacing: 0.5px; margin-bottom: 2px;">${labelNomor}</p>
                <p style="font-size: 0.95rem; font-weight: 700; letter-spacing: 1px; color: var(--text-main);">${nomorVal}</p>
              </div>
              <button type="button" onclick="copyToClipboard('${nomorVal}', this)" style="background: var(--card-bg); border: 1px solid var(--border-color); color: var(--text-main); padding: 6px 12px; border-radius: 8px; font-size: 0.75rem; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 6px;">
                <i class="fa fa-copy"></i> Salin
              </button>
            </div>
          ` : '<p style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 12px;">Tidak ada nomor tercatat</p>'}

          <div style="display: flex; justify-content: flex-end; border-top: 1px solid var(--border-color); padding-top: 10px;">
            <button type="button" onclick="confirmDeleteAcc('${a.id}', '${a.nama}')" style="background: rgba(244,63,94,0.12); color: #f43f5e; border: none; padding: 6px 14px; border-radius: 20px; font-size: 0.75rem; font-weight: 700; cursor: pointer;">
              <i class="fa fa-trash"></i> Hapus Dompet
            </button>
          </div>
        </div>
      </div>
    `;
  }).join("");
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

// RENDER FULL TRANSAKSI
function renderFullTransactions() {
  const container = document.getElementById("fullTrxContainer");
  if (!container) return;

  const label = document.getElementById("trxMonthLabel");
  if (label) label.innerText = monthLabel(viewMonth);
  const nextBtn = document.getElementById("trxNextBtn");
  if (nextBtn) nextBtn.style.opacity = viewMonth >= currentMonthKey() ? 0.3 : 1;

  const list = inMonth(globalData.transactions, viewMonth);
  let inc = 0, exp = 0;
  list.forEach(t => { (t.jenis === "Pemasukan") ? inc += Number(t.jumlah) || 0 : exp += Number(t.jumlah) || 0; });
  const sum = document.getElementById("trxMonthSummary");
  if (sum) sum.innerHTML = `<span style="color: var(--primary);">+ ${format(inc)}</span> &nbsp;|&nbsp; <span style="color: #f472b6;">- ${format(exp)}</span>`;

  if (list.length === 0) {
    container.innerHTML = `<p style="text-align: center; color: var(--text-muted); padding: 20px 0; font-size: 0.9rem;">Tidak ada transaksi di bulan ini</p>`;
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
            <i class="fa ${t.jenis === 'Pemasukan' ? 'fa-arrow-down' : 'fa-basket-shopping'}"></i>
          </div>
          <div>
            <h4 style="font-size: 0.95rem; font-weight: 800; color: var(--text-main);">${mainTitle}</h4>
            ${subTitle ? `<p style="font-size: 0.75rem; color: var(--text-muted); font-weight: 600; margin-top: 1px;">${subTitle}</p>` : ''}
            <p style="font-size: 0.65rem; color: var(--text-muted); margin-top: 1px;">${t.tanggal}</p>
          </div>
        </div>

        <div style="display: flex; align-items: center; gap: 10px;">
          <div style="font-weight: 800; font-size: 0.95rem; color: ${t.jenis === 'Pemasukan' ? 'var(--primary)' : '#f472b6'};">
            ${t.jenis === 'Pemasukan' ? '+' : '-'} ${format(jumlahNum)}
          </div>
          <i class="fa fa-chevron-down" style="font-size: 0.75rem; color: var(--text-muted);"></i>
        </div>
      </div>

      <div class="trx-details-dropdown">
        <div style="display: flex; justify-content: space-between; font-size: 0.8rem; margin-bottom: 6px;">
          <span style="color: var(--text-muted); font-weight: 600;">DARI / DOMPET</span>
          <span style="font-weight: 700; color: var(--text-main);">${getAccountName(t.rekeningId)}</span>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 0.8rem; margin-bottom: 6px;">
          <span style="color: var(--text-muted); font-weight: 600;">KATEGORI</span>
          <span style="font-weight: 700; color: var(--text-main);">${t.kategori}</span>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 0.8rem; margin-bottom: 12px;">
          <span style="color: var(--text-muted); font-weight: 600;">TANGGAL</span>
          <span style="font-weight: 700; color: var(--text-main);">${t.tanggal}</span>
        </div>

        <div style="display: flex; justify-content: flex-end; gap: 8px; border-top: 1px solid var(--border-color); padding-top: 10px;">
          <button type="button" onclick="openEditTrx('${t.id}')" style="background: var(--circle-bg); color: var(--text-main); border: 1px solid var(--border-color); padding: 6px 16px; border-radius: 20px; font-size: 0.75rem; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 6px;">
            <i class="fa fa-pen"></i> Ubah
          </button>
          <button type="button" onclick="confirmDeleteTrx('${t.id}', '${mainTitle}')" style="background: rgba(244,63,94,0.12); color: #f43f5e; border: none; padding: 6px 14px; border-radius: 20px; font-size: 0.75rem; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 6px;">
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
      globalData.transactions.unshift(newTrx);
      
      let targetAcc = (globalData.accountSummary || []).find(a => a.id === newTrx.rekeningId);
      if (targetAcc) {
        if (newTrx.jenis === "Pemasukan") targetAcc.saldoAkhir += newTrx.jumlah;
        else targetAcc.saldoAkhir -= newTrx.jumlah;
      }
      
      localStorage.setItem('budggt_local_cache', JSON.stringify(globalData));
      renderAllLocalUI();
      
      toggleModal('modalTrx');
      e.target.reset();
      document.getElementById("tanggal").valueAsDate = new Date();

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

// HAPUS DATA INSTAN
function confirmDeleteAcc(id, nama) {
  if (confirm(`Hapus rekening "${nama}"? Semua transaksi di rekening ini juga akan dihapus!`)) {
    globalData.accounts = (globalData.accounts || []).filter(a => a.id !== id);
    globalData.accountSummary = (globalData.accountSummary || []).filter(a => a.id !== id);
    localStorage.setItem('budggt_local_cache', JSON.stringify(globalData));
    renderAllLocalUI();

    google.script.run
      .withSuccessHandler(() => { loadData(); })
      .deleteAccount(id);
  }
}

function confirmDeleteTrx(id, kategori) {
  if (confirm(`Hapus transaksi "${kategori}" ini?`)) {
    globalData.transactions = (globalData.transactions || []).filter(t => t.id !== id);
    localStorage.setItem('budggt_local_cache', JSON.stringify(globalData));
    renderAllLocalUI();

    google.script.run
      .withSuccessHandler(() => { loadData(); })
      .deleteTransaction(id);
  }
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
          if (res.tanggal) document.getElementById("tanggal").value = res.tanggal;
        })
        .withFailureHandler(err => {
          if (btn) {
            btn.innerHTML = originalHTML;
            btn.disabled = false;
          }
          alert("Gagal memproses struk: " + err.message);
        })
        .parseReceiptWithGemini(base64);
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
  alert("Nama tampilan berhasil diperbarui!");
}

// RENDER CHART & LAPORAN
function renderFlowChart() {
  const canvasEl = document.getElementById('chartFlow');
  if (!canvasEl) return;
  const ctx = canvasEl.getContext('2d');
  let inc = 0, exp = 0;
  let categoryMap = {};

  inMonth(globalData.transactions, currentMonthKey()).forEach(t => {
    let jml = Number(t.jumlah) || 0;
    if (t.jenis === "Pemasukan") {
      inc += jml; 
    } else {
      exp += jml;
      let kat = t.kategori ? t.kategori.trim() : 'Lainnya';
      categoryMap[kat] = (categoryMap[kat] || 0) + jml;
    }
  });

  if (flowChart) flowChart.destroy();
  flowChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Masuk', 'Keluar'],
      datasets: [{ data: [inc, exp], backgroundColor: ['#ccff00', '#f43f5e'], borderWidth: 0 }]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
  });

  const container = document.getElementById('categoryBarsContainer');
  if (!container) return;
  const categories = Object.keys(categoryMap);

  if (categories.length === 0 || exp === 0) {
    container.innerHTML = `<p style="text-align: center; color: var(--text-muted); padding: 15px 0; font-size: 0.85rem;">Belum ada data pengeluaran kategori</p>`;
    return;
  }

  categories.sort((a, b) => categoryMap[b] - categoryMap[a]);

  container.innerHTML = categories.map(kat => {
    let nominal = categoryMap[kat];
    let percentage = exp > 0 ? ((nominal / exp) * 100).toFixed(1) : 0;

    return `
      <div class="category-bar-item" style="margin-bottom: 10px;">
        <div style="display: flex; justify-content: space-between; font-size: 0.85rem; font-weight: 700; margin-bottom: 4px;">
          <span>${kat}</span>
          <span style="color: var(--text-muted);">${format(nominal)} <strong style="color: var(--text-main); margin-left: 4px;">(${percentage}%)</strong></span>
        </div>
        <div style="height: 6px; background: var(--circle-bg); border-radius: 3px; overflow: hidden;">
          <div style="width: ${percentage}%; height: 100%; background: #ccff00;"></div>
        </div>
      </div>
    `;
  }).join('');
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
  (transactions || []).forEach(t => {
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

    html += `
      <div class="${cellClass}">
        <span class="cal-date-num">${day}</span>
        ${nominalHtml}
      </div>
    `;
  }

  container.innerHTML = html;
}

// UTILITIES
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
    el.classList.remove('hidden');
    el.style.display = 'flex';
  } else {
    el.classList.add('hidden');
    el.style.display = 'none';
  }
}

function format(num) { 
  return "Rp " + Number(num || 0).toLocaleString('id-ID'); 
}
