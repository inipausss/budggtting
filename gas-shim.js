// Menggantikan google.script.run: semua data disimpan lokal di HP, Google Sheets hanya untuk backup.
(function () {
  const DB = 'budggt_db', CFG = 'budggt_cfg';
  const $ = id => document.getElementById(id);
  const empty = () => ({ accounts: [], transactions: [], budgets: [], bills: [] });
  const load = () => { try { return JSON.parse(localStorage.getItem(DB)) || empty(); } catch (e) { return empty(); } };
  const save = d => localStorage.setItem(DB, JSON.stringify(d));
  const cfg = () => { try { return JSON.parse(localStorage.getItem(CFG)) || {}; } catch (e) { return {}; } };
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(16).slice(2));

  async function remote(action, extra) {
    const c = cfg();
    if (!c.url || !c.token) throw new Error('Isi URL & token backup di menu Preferensi dulu');
    const r = await fetch(c.url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(Object.assign({ token: c.token, profil: c.profil || '', action }, extra))
    });
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || 'Gagal');
    return j;
  }

  const api = {
    getFullData() {
      const d = load();
      const accountSummary = d.accounts.map(a => {
        let s = Number(a.saldoAwal) || 0;
        d.transactions.forEach(t => {
          if (t.rekeningId === a.id) s += (t.jenis === 'Pemasukan' ? 1 : -1) * (Number(t.jumlah) || 0);
        });
        return { id: a.id, nama: a.nama, jenis: a.jenis, nomor: a.nomor || '', saldoAkhir: s };
      });
      return { user: 'Pengguna', accounts: d.accounts, accountSummary, transactions: d.transactions, budgets: d.budgets || [], bills: d.bills || [] };
    },
    addAccount(a) {
      const d = load();
      d.accounts.push({ id: uid(), nama: a.nama, jenis: a.jenis, nomor: a.nomor || '', saldoAwal: Number(a.saldoAwal) || 0 });
      save(d);
    },
    deleteAccount(id) {
      const d = load();
      d.accounts = d.accounts.filter(a => a.id !== id);
      d.transactions = d.transactions.filter(t => t.rekeningId !== id);
      save(d);
    },
    updateAccount(a) {
      const d = load();
      const i = d.accounts.findIndex(x => x.id === a.id);
      if (i > -1) {
        d.accounts[i] = { id: a.id, nama: a.nama, jenis: a.jenis, nomor: a.nomor || '', saldoAwal: Number(a.saldoAwal) || 0 };
        save(d);
      }
    },

    addTransfer(p) {
      const d = load();
      [p.masuk, p.keluar].forEach(t => d.transactions.unshift({
        id: uid(), tanggal: t.tanggal, jenis: t.jenis, kategori: t.kategori,
        keterangan: t.keterangan || '', jumlah: Number(t.jumlah) || 0, rekeningId: t.rekeningId
      }));
      save(d);
    },
    
    addTransaction(t) {
      const d = load();
      d.transactions.unshift({ id: uid(), tanggal: t.tanggal, jenis: t.jenis, kategori: t.kategori, keterangan: t.keterangan || '', jumlah: Number(t.jumlah) || 0, rekeningId: t.rekeningId });
      save(d);
    },
    updateTransaction(t) {
      const d = load();
      const i = d.transactions.findIndex(x => x.id === t.id);
      if (i > -1) { d.transactions[i] = Object.assign({}, t, { jumlah: Number(t.jumlah) || 0 }); save(d); }
    },
    deleteTransaction(id) {
      const d = load();
      d.transactions = d.transactions.filter(t => t.id !== id);
      save(d);
    },
    restoreTransaction(p) { // urungkan hapus: id dan posisi asli kembali
      const d = load();
      if (d.transactions.some(t => t.id === p.t.id)) return;
      d.transactions.splice(Math.min(p.index, d.transactions.length), 0, p.t);
      save(d);
    },

    setBudget(b) {
      const d = load();
      d.budgets = d.budgets || [];
      const nama = String(b.kategori || '').trim();
      const key = nama.toLowerCase();
      const batas = Number(b.batas) || 0;
      const i = d.budgets.findIndex(x => x.kategori.trim().toLowerCase() === key);
      if (i > -1) d.budgets[i] = { kategori: nama, batas };
      else d.budgets.push({ kategori: nama, batas });
      save(d);
    },
    deleteBudget(kategori) {
      const d = load();
      const key = String(kategori || '').trim().toLowerCase();
      d.budgets = (d.budgets || []).filter(x => x.kategori.trim().toLowerCase() !== key);
      save(d);
    },

    setBill(b) {
      const d = load();
      d.bills = d.bills || [];
      const item = {
        id: b.id || uid(), nama: String(b.nama || '').trim(), jumlah: Number(b.jumlah) || 0,
        kategori: String(b.kategori || '').trim(), rekeningId: b.rekeningId || '',
        tanggal: Math.min(31, Math.max(1, Number(b.tanggal) || 1)), lunas: b.lunas || ''
      };
      const i = d.bills.findIndex(x => x.id === item.id);
      if (i > -1) d.bills[i] = item; else d.bills.push(item);
      save(d);
    },
    deleteBill(id) {
      const d = load();
      d.bills = (d.bills || []).filter(x => x.id !== id);
      save(d);
    },
    
      async parseReceiptWithGemini(img, kategori) { return (await remote('scan', { image: img, kategori })).data; } // butuh internet
  };

  function runner(ok, fail) {
    return new Proxy({}, {
      get(_, name) {
        if (name === 'withSuccessHandler') return f => runner(f, fail);
        if (name === 'withFailureHandler') return f => runner(ok, f);
        return (...args) => {
          Promise.resolve().then(() => api[name](...args))
            .then(r => ok && ok(r), e => (fail ? fail(e) : console.error(e)));
        };
      }
    });
  }
  window.google = { script: { run: runner() } };

  function info() {
    const c = cfg(), el = $('backupInfo');
    if (el) el.textContent = c.last ? 'Backup terakhir: ' + c.last : 'Belum pernah backup';
  }
  window.saveCfg = () => {
    const c = cfg();
    c.url = $('cfgUrl').value.trim();
    c.token = $('cfgToken').value;
    c.profil = ($('cfgProfil').value || '').trim().toLowerCase();
    localStorage.setItem(CFG, JSON.stringify(c));
    alert('Pengaturan backup tersimpan di HP ini');
  };
  window.backupNow = async () => {
    try {
      await remote('backup', { data: load() });
      const c = cfg(); c.last = new Date().toLocaleString('id-ID');
      localStorage.setItem(CFG, JSON.stringify(c));
      info(); alert('Backup berhasil');
    } catch (e) { alert('Backup gagal: ' + e.message); }
  };
  window.restoreNow = async () => {
    if (!confirm('Data di HP akan ditimpa dengan data dari Google Sheets. Lanjut?')) return;
    try {
      const j = await remote('restore');
      save(j.data); loadData(); alert('Restore berhasil');
    } catch (e) { alert('Restore gagal: ' + e.message); }
  };

  document.addEventListener('DOMContentLoaded', () => {
    const c = cfg();
    $('cfgUrl').value = c.url || '';
    $('cfgToken').value = c.token || '';
    info();
    $('cfgProfil').value = c.profil || '';
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist();
  });
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
})();
