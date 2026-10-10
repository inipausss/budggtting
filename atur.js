// Tambahan untuk Budggt.:
//  1) Atur kategori di halaman Catat Transaksi: ganti nama, ganti ikon, geser urutan, hapus.
//  2) Hapus rekening (bank / cash / e-wallet) tidak menghapus transaksinya.
// Dimuat otomatis oleh gas-shim.js setelah script.js selesai; index.html tidak perlu diubah.
(function () {
  if (window.__aturLoaded || !window.KatLogic) return;
  window.__aturLoaded = true;

  const $ = id => document.getElementById(id);
  const L = window.KatLogic;
  const low = s => String(s == null ? '' : s).trim().toLowerCase();
  const DEFAULT_KELUAR = ['Makanan', 'Belanja', 'Transport', 'Tagihan', 'Hiburan', 'Kesehatan', 'Investasi', 'Lainnya'];
  const cache = () => { try { localStorage.setItem('budggt_local_cache', JSON.stringify(globalData)); } catch (e) {} };
  const rec = (k, j) => (globalData.kategori || []).find(r => r.jenis === j && low(r.nama) === low(k));
  // warna tetap ikut kategori walau namanya diganti (disimpan di catatan kategori)
  const warnaKat = (k, j) => { const r = rec(k, j); return (r && r.warna) || katWarna(k); };

  // ===== daftar kategori: urutan buatan pengguna dulu, sisanya (kategori baru) menyusul =====
  window.trxCats = function (j, termasukHidden) {
    const inc = j === 'Pemasukan';
    const out = new Map();
    const add = k => { k = (k || '').trim(); if (k && !out.has(low(k))) out.set(low(k), k); };
    if (inc) KAT_MASUK.forEach(add);
    else { DEFAULT_KELUAR.forEach(add); budgetList().forEach(b => b.cats.forEach(add)); }
    (globalData.transactions || []).forEach(t => { if (!netral(t) && (t.jenis === 'Pemasukan') === inc) add(t.kategori); });
    (globalData.kategori || []).forEach(r => { if (r.jenis === j) add(r.nama); });
    const arr = [...out.values()].map((k, i) => {
      const r = rec(k, j);
      return { k, i, u: r && typeof r.urut === 'number' ? r.urut : null };
    });
    arr.sort((a, b) => (a.u === null) - (b.u === null) || (a.u === null ? 0 : a.u - b.u) || a.i - b.i);
    return arr.map(x => x.k).filter(k => termasukHidden || !katTersembunyi(k, j));
  };

  // daftar saran di kolom kategori (ubah transaksi, tagihan, budget, scan struk) ikut nama terbaru
  function syncDatalist() {
    const dl = $('kategoriList');
    if (!dl) return;
    dl.innerHTML = trxCats('Pengeluaran').map(k => `<option value="${esc(k)}">`).join('');
  }
  const ral = window.renderAllLocalUI;
  window.renderAllLocalUI = function () { ral(); syncDatalist(); };

  // ===== deretan kategori: mode Atur = ketuk kategori untuk mengubahnya =====
  window.renderTrxCats = function () {
    const j = $('jenis').value;
    if (j === 'Transfer') return;
    const katEl = $('kategori'), cur = low(katEl.value);
    const list = trxCats(j);
    if (cur && !list.some(k => low(k) === cur)) list.push(katEl.value.trim()); // mis. hasil scan struk
    const edit = trxKatEdit;
    $('tpCats').innerHTML = list.map(k => `
      <button type="button" class="tc ${low(k) === cur ? 'on' : ''}" style="--c:${warnaKat(k, j)}"${edit ? ` data-k="${esc(k)}"` : ''} onclick="${edit ? `bukaKatEdit('${jsq(k)}')` : `pickTrxKat('${jsq(k)}')`}">
        ${edit ? `<span class="x" onclick="event.stopPropagation(); hapusKat('${jsq(k)}')"><i class="fa fa-xmark"></i></span>` : ''}
        <span class="ic"><i class="fa ${katIkon(k)}"></i></span><span class="nm">${esc(k)}</span>
      </button>`).join('') + `
      <button type="button" class="tc" style="--c:#64748b" onclick="newTrxKat()">
        <span class="ic"><i class="fa fa-plus"></i></span><span class="nm">Baru</span>
      </button>
      <button type="button" class="tc ${edit ? 'on' : ''}" style="--c:#64748b" onclick="toggleKatEdit()">
        <span class="ic"><i class="fa ${edit ? 'fa-check' : 'fa-pen'}"></i></span><span class="nm">${edit ? 'Selesai' : 'Atur'}</span>
      </button>`;
    const h = $('tpKatHint');
    if (h) h.classList.toggle('hidden', !edit);
  };

  // ===== lembar "Atur Kategori" =====
  let ke = null; // { jenis, nama, ikon, ikonAwal }

  window.bukaKatEdit = function (k) {
    const ic = katIkon(k);
    ke = { jenis: $('jenis').value, nama: k, ikon: ic, ikonAwal: ic };
    $('keNama').value = k;
    keRenderIcons();
    keUpdatePos();
    if ($('modalKatEdit').classList.contains('hidden')) toggleModal('modalKatEdit');
  };

  function keRenderIcons() {
    const set = KAT_PILIHAN_IKON.includes(ke.ikon) ? KAT_PILIHAN_IKON : [ke.ikon].concat(KAT_PILIHAN_IKON);
    $('keIcons').innerHTML = set.map(ic =>
      `<button type="button" class="ic-opt ${ic === ke.ikon ? 'on' : ''}" onclick="keIkon('${ic}')"><i class="fa ${ic}"></i></button>`).join('');
  }
  window.keIkon = ic => { ke.ikon = ic; keRenderIcons(); };

  function keUpdatePos() {
    const list = trxCats(ke.jenis), i = list.findIndex(k => low(k) === low(ke.nama));
    $('kePos').textContent = i < 0 ? '' : '(' + (i + 1) + ' dari ' + list.length + ')';
    $('keKiri').disabled = i <= 0;
    $('keKanan').disabled = i < 0 || i >= list.length - 1;
  }

  function simpanUrut(j, names) {
    L.urutKat(globalData, j, names);
    cache();
    google.script.run
      .withFailureHandler(e => alert('Gagal simpan urutan: ' + e.message))
      .setKategoriBanyak(names.map((n, i) => ({ nama: n, jenis: j, urut: i })));
  }

  window.keGeser = function (dir) {
    const j = ke.jenis, list = trxCats(j);
    const i = list.findIndex(k => low(k) === low(ke.nama)), t = i + dir;
    if (i < 0 || t < 0 || t >= list.length) return;
    [list[i], list[t]] = [list[t], list[i]];
    simpanUrut(j, list);
    renderTrxCats();
    keUpdatePos();
  };

  window.keSimpan = function () {
    const j = ke.jenis, lama = ke.nama;
    const baru = $('keNama').value.trim().replace(/\s+/g, ' ');
    if (!baru) { alert('Isi nama kategori'); return; }
    if (low(baru) !== low(lama)) {
      if (KATEGORI_NETRAL.some(n => low(n) === low(baru))) { alert('Nama "' + baru + '" dipakai sistem, pilih nama lain'); return; }
      if (trxCats(j).some(k => low(k) === low(baru))) { alert('Kategori "' + baru + '" sudah ada, pakai nama lain'); return; }
    }
    if (baru !== lama) {
      const p = { jenis: j, lama, baru, ikon: ke.ikon, warna: warnaKat(lama, j), order: trxCats(j).map(k => low(k) === low(lama) ? baru : k) };
      L.ubahNamaKat(globalData, p);
      cache();
      google.script.run
        .withSuccessHandler(() => loadData())
        .withFailureHandler(e => alert('Gagal simpan kategori: ' + e.message))
        .renameKategori(p);
    } else if (ke.ikon !== ke.ikonAwal) {
      setKatRec({ nama: lama, jenis: j, ikon: ke.ikon });
    }
    const kat = $('kategori');
    if (low(kat.value) === low(lama)) kat.value = baru; // kategori yang sedang dipilih ikut nama baru
    toggleModal('modalKatEdit');
    renderAllLocalUI();
    renderTrxCats();
  };

  // hapus = sembunyikan dari daftar; transaksi lama tetap utuh (bisa diurungkan lewat toast)
  window.keHapus = function () {
    const k = ke.nama;
    toggleModal('modalKatEdit');
    hapusKat(k);
  };

  // ===== rekening: hapus TIDAK menghapus transaksi =====
  window.confirmDeleteAcc = function (id, nama) {
    if (!confirm('Hapus rekening "' + nama + '"? Riwayat transaksinya tetap tersimpan (tetap muncul di Laporan dan daftar transaksi), hanya saldo rekening ini yang tidak dihitung lagi.')) return;
    const a = (globalData.accounts || []).find(x => x.id === id);
    if (a) {
      globalData.akunHapus = (globalData.akunHapus || []).filter(x => x.id !== id)
        .concat([{ id: a.id, nama: a.nama, jenis: a.jenis, nomor: a.nomor || '', saldoAwal: Number(a.saldoAwal) || 0 }]);
    }
    globalData.accounts = (globalData.accounts || []).filter(x => x.id !== id);
    globalData.accountSummary = (globalData.accountSummary || []).filter(x => x.id !== id);
    cache();
    renderAllLocalUI();
    google.script.run
      .withSuccessHandler(() => loadData())
      .deleteAccount(id);
  };

  // transaksi dari rekening yang sudah dihapus tetap menampilkan nama rekeningnya
  window.getAccountName = function (id) {
    const a = (globalData.accounts || []).find(x => x.id === id);
    if (a) return a.nama;
    const h = (globalData.akunHapus || []).find(x => x.id === id);
    return h ? h.nama + ' (dihapus)' : 'Dompet Utama';
  };

  // mengubah transaksi lama dari rekening terhapus: rekeningnya tidak diam-diam pindah ke rekening lain
  const oet = window.openEditTrx;
  window.openEditTrx = function (id) {
    oet(id);
    const t = (globalData.transactions || []).find(x => x.id === id);
    const sel = $('editRekening');
    if (t && sel && !Array.from(sel.options).some(o => o.value === t.rekeningId)) {
      sel.add(new Option(getAccountName(t.rekeningId), t.rekeningId), 0);
      sel.value = t.rekeningId;
    }
  };

  // ===== pasang tampilan: lembar atur kategori + petunjuk =====
  const css = document.createElement('style');
  css.textContent = '#modalKatEdit button:disabled{opacity:.35;pointer-events:none}' +
    '.tc[data-k]{user-select:none;-webkit-user-select:none;-webkit-touch-callout:none}' +
    '.tc.drag{position:relative;z-index:5;opacity:.92}.tc.drag .ic{transform:scale(1.15);box-shadow:0 8px 20px rgba(0,0,0,.5)}';
  document.head.appendChild(css);

  const m = document.createElement('div');
  m.id = 'modalKatEdit';
  m.className = 'modal hidden';
  m.innerHTML = `
    <div class="modal-content">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
        <h3 style="font-size: 1.15rem; font-weight: 600;">Atur Kategori</h3>
        <button type="button" onclick="toggleModal('modalKatEdit')" style="background:none; border:none; font-size: 1.4rem; color: #94a3b8; cursor: pointer;">&times;</button>
      </div>
      <input id="keNama" class="input-field" maxlength="20" autocomplete="off" placeholder="Nama kategori">
      <p style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 10px;">Ikon</p>
      <div id="keIcons" class="ic-grid"></div>
      <p style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 10px;">Urutan <span id="kePos"></span></p>
      <div style="display: flex; gap: 10px; margin-bottom: 20px;">
        <button type="button" id="keKiri" class="btn-sec" onclick="keGeser(-1)"><i class="fa fa-arrow-left"></i> Ke kiri</button>
        <button type="button" id="keKanan" class="btn-sec" onclick="keGeser(1)">Ke kanan <i class="fa fa-arrow-right"></i></button>
      </div>
      <button type="button" class="btn-primary" onclick="keSimpan()">Simpan</button>
      <button type="button" class="bf-del" onclick="keHapus()"><i class="fa fa-trash"></i> Hapus kategori</button>
      <p style="font-size: 0.75rem; color: var(--text-muted); text-align: center; margin-top: 14px;">Transaksi yang sudah tercatat tidak ikut terhapus. Kalau nama diganti, transaksi lamanya ikut memakai nama baru.</p>
    </div>`;
  document.body.appendChild(m);

  const hint = document.createElement('p');
  hint.id = 'tpKatHint';
  hint.className = 'bf-hint hidden';
  hint.style.margin = '0 0 12px';
  hint.textContent = 'Tahan lalu geser kategori untuk ubah urutan. Ketuk untuk ubah nama atau ikon.';
  $('tpCats').after(hint);

  // ===== geser urutan: tahan ~0,3 detik lalu seret (hanya di mode Atur); geser biasa tetap menggulung deretan =====
  const box = $('tpCats');
  let dr = null, sup = false;
  box.addEventListener('contextmenu', e => { if (trxKatEdit) e.preventDefault(); });
  box.addEventListener('click', e => { if (sup) { e.stopPropagation(); e.preventDefault(); sup = false; } }, true); // tap setelah drag tidak membuka lembar atur
  box.addEventListener('touchmove', e => { if (dr && dr.on) e.preventDefault(); }, { passive: false }); // saat drag, deretan jangan ikut menggulung

  function place() {
    const el = dr.el, x = dr.x;
    const tiles = Array.from(box.querySelectorAll('.tc[data-k]'));
    const hit = tiles.find(t => { if (t === el) return false; const r = t.getBoundingClientRect(); return x >= r.left && x <= r.right; });
    if (hit) box.insertBefore(el, tiles.indexOf(hit) > tiles.indexOf(el) ? hit.nextSibling : hit);
    el.style.transform = '';
    const r = el.getBoundingClientRect();
    el.style.transform = 'translateX(' + (x - (r.left + r.width / 2)) + 'px)'; // tile mengikuti jari
  }
  function auto() { // dekat tepi: deretan menggulung sendiri
    if (!dr || !dr.on) return;
    const r = box.getBoundingClientRect();
    if (dr.x < r.left + 40) box.scrollLeft -= 8; else if (dr.x > r.right - 40) box.scrollLeft += 8;
    place();
    dr.raf = requestAnimationFrame(auto);
  }
  function onMove(e) {
    if (!dr || e.pointerId !== dr.id) return;
    if (!dr.on) { if (Math.abs(e.clientX - dr.x0) > 8 || Math.abs(e.clientY - dr.y0) > 8) endDr(false); return; } // gerak sebelum ditahan = gulung biasa
    dr.x = e.clientX;
    place();
  }
  function onUp(e) { if (dr && e.pointerId === dr.id) endDr(e.type === 'pointerup'); }
  function endDr(simpan) {
    if (!dr) return;
    clearTimeout(dr.t); cancelAnimationFrame(dr.raf);
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    document.removeEventListener('pointercancel', onUp);
    const d = dr; dr = null;
    if (!d.on) return;
    d.el.classList.remove('drag'); d.el.style.transform = '';
    sup = true; setTimeout(() => { sup = false; }, 350);
    if (simpan) simpanUrut($('jenis').value, Array.from(box.querySelectorAll('.tc[data-k]')).map(t => t.dataset.k));
    renderTrxCats();
  }
  box.addEventListener('pointerdown', e => {
    const el = trxKatEdit && !e.target.closest('.x') && e.target.closest('.tc[data-k]');
    if (!el || dr) return;
    dr = { el, id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, on: false };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onUp);
    dr.t = setTimeout(() => {
      dr.on = true;
      el.classList.add('drag');
      if (navigator.vibrate) navigator.vibrate(12);
      dr.raf = requestAnimationFrame(auto);
    }, 280);
  });

  syncDatalist();
  renderTrxCats();
})();
