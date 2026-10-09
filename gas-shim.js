// Menggantikan google.script.run: semua data disimpan lokal di HP, Google Sheets hanya untuk backup.
(function () {
  const DB = 'budggt_db', CFG = 'budggt_cfg';
  const $ = id => document.getElementById(id);
  const empty = () => ({ accounts: [], transactions: [], budgets: [], bills: [], goals: [], debts: [] });
  const load = () => { try { return JSON.parse(localStorage.getItem(DB)) || empty(); } catch (e) { return empty(); } };
  const save = d => localStorage.setItem(DB, JSON.stringify(d));
  const cfg = () => { try { return JSON.parse(localStorage.getItem(CFG)) || {}; } catch (e) { return {}; } };
  // budget lama {kategori, batas} otomatis diubah ke format baru; id harus sama dengan migrasi di script.js
  const normB = b => b.cats ? b : {
    id: b.id || 'bud_' + String(b.kategori || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_'),
    nama: b.nama || String(b.kategori || '').trim(), batas: Number(b.batas) || 0, periode: 'bulanan',
    cats: b.kategori ? [String(b.kategori).trim()] : [], alert: 80
  };
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
      return { user: 'Pengguna', accounts: d.accounts, accountSummary, transactions: d.transactions, budgets: (d.budgets || []).map(normB), bills: d.bills || [], goals: d.goals || [], debts: d.debts || [] };
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
      d.budgets = (d.budgets || []).map(normB);
      const item = {
        id: b.id || uid(), nama: String(b.nama || '').trim(), batas: Number(b.batas) || 0,
        periode: b.periode === 'mingguan' ? 'mingguan' : 'bulanan', cats: (b.cats || []).map(String), alert: Number(b.alert) || 80
      };
      const i = d.budgets.findIndex(x => x.id === item.id);
      if (i > -1) d.budgets[i] = item; else d.budgets.push(item);
      save(d);
    },
    deleteBudget(id) {
      const d = load();
      d.budgets = (d.budgets || []).map(normB).filter(x => x.id !== id);
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

    setGoal(g) {
      const d = load();
      d.goals = d.goals || [];
      const item = {
        id: g.id || uid(), nama: String(g.nama || '').trim(), target: Number(g.target) || 0,
        terkumpul: Number(g.terkumpul) || 0, kunci: !!g.kunci
      };
      const i = d.goals.findIndex(x => x.id === item.id);
      if (i > -1) d.goals[i] = item; else d.goals.push(item);
      save(d);
    },
    setDebt(x) {
      const d = load();
      d.debts = d.debts || [];
      const item = {
        id: x.id || uid(), nama: String(x.nama || '').trim(), tipe: x.tipe === 'piutang' ? 'piutang' : 'utang',
        jumlah: Number(x.jumlah) || 0, terbayar: Number(x.terbayar) || 0, jatuh: x.jatuh || '', catatan: String(x.catatan || '').trim()
      };
      const i = d.debts.findIndex(y => y.id === item.id);
      if (i > -1) d.debts[i] = item; else d.debts.push(item);
      save(d);
    },
    deleteDebt(id) {
      const d = load();
      d.debts = (d.debts || []).filter(x => x.id !== id);
      save(d);
    },
    deleteGoal(id) {
      const d = load();
      d.goals = (d.goals || []).filter(x => x.id !== id);
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
