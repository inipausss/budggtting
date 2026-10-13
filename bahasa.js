// ===== BAHASA (multi-bahasa) =====
// Cara kerja: teks asli aplikasi adalah Bahasa Indonesia (bahasa sumber). Bahasa lain = kamus { teks Indonesia: terjemahan }.
//
// Menambah bahasa:
//   1. Buat file lang-xx.js berisi:
//        (window.BAHASA = window.BAHASA || {}).xx = { nama: 'English', locale: 'en-US', kamus: { 'Menu Utama': 'Main Menu', ... } };
//   2. Muat SEBELUM bahasa.js di index.html, dan daftarkan di sw.js (daftar F).
//   Kunci kamus yang memuat {0}, {1} adalah pola untuk teks dengan bagian berubah-ubah:
//        'Halo, {0} 🌙': 'Hi, {0} 🌙'
//
// ponytail: penerjemahan = pencocokan teks persis di DOM (teks, placeholder, title, aria-label) + alert/confirm/prompt,
// jadi script.js dan index.html tidak perlu diubah per kalimat. Batasnya: teks buatan pengguna yang kebetulan SAMA PERSIS
// dengan kunci kamus ikut diterjemahkan (beri translate="no" pada elemen untuk mencegahnya).
// Mengganti bahasa memuat ulang halaman (data aman di penyimpanan lokal).

const LANG_KEY = 'budggt_lang';
const LANGS = Object.assign({ id: { nama: 'Bahasa Indonesia', locale: 'id-ID', kamus: null } }, window.BAHASA);
let bahasaAktif = 'id';
try { const v = localStorage.getItem(LANG_KEY); if (v && LANGS[v]) bahasaAktif = v; } catch (e) {}
const LOCALE = LANGS[bahasaAktif].locale; // dipakai script.js untuk nama hari/bulan
document.documentElement.lang = bahasaAktif;

// ----- mesin terjemah: tidak aktif untuk Indonesia (teks sumber dipakai apa adanya) -----
const _exact = new Map(), _pola = [];
(function () {
  const kamus = LANGS[bahasaAktif].kamus;
  if (!kamus) return;
  Object.keys(kamus).forEach(k => {
    if (!/\{\d+\}/.test(k)) { _exact.set(k.trim(), kamus[k]); return; }
    const label = [], bagian = k.trim().split(/\{(\d+)\}/); // ganjil = label placeholder
    const re = bagian.map((b, i) => i % 2 ? (label.push(b), '([\\s\\S]+?)') : b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('');
    _pola.push({ re: new RegExp('^' + re + '$'), out: kamus[k], g: Object.fromEntries(label.map((l, i) => [l, i + 1])), lit: k.replace(/\{\d+\}/g, '').length });
  });
  _pola.sort((a, b) => b.lit - a.lit); // pola yang paling spesifik (teks tetap terpanjang) dicoba lebih dulu
})();

// bagian dinamis ({0}) ikut diterjemahkan bila cocok kamus; daftar "a, b" dipecah per item
function trBagian(g) { const r = tr(g); return r !== g ? r : g.split(', ').map(tr).join(', '); }

function tr(s) { // terjemahkan satu teks; tidak ada di kamus = apa adanya
  const core = s.trim();
  if (!core || bahasaAktif === 'id') return s;
  let r = _exact.get(core);
  if (r === undefined) {
    for (const p of _pola) {
      const m = core.match(p.re);
      if (m) { r = p.out.replace(/\{(\d+)\}/g, (_, i) => m[p.g[i]] === undefined ? '' : trBagian(m[p.g[i]])); break; }
    }
  }
  return r === undefined ? s : s.replace(core, () => r);
}
const t = tr; // untuk dipakai langsung di kode: t('Tersimpan')

if (bahasaAktif !== 'id') {
  const SKIP = /^(SCRIPT|STYLE|TEXTAREA|CODE|NOSCRIPT)$/, ATTR = ['placeholder', 'title', 'aria-label', 'alt'];
  const tidak = el => !el || SKIP.test(el.nodeName) || (el.closest && el.closest('[translate="no"]'));
  const trNode = n => { if (tidak(n.parentNode)) return; const v = n.nodeValue, r = tr(v); if (r !== v) n.nodeValue = r; };
  const trAttr = el => ATTR.forEach(a => { const v = el.getAttribute(a); if (v) { const r = tr(v); if (r !== v) el.setAttribute(a, r); } });
  const trTree = root => {
    if (root.nodeType === 3) return trNode(root);
    if (root.nodeType !== 1 || tidak(root)) return;
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), ns = [];
    for (let n; (n = w.nextNode());) ns.push(n);
    ns.forEach(trNode);
    if (!tidak(root)) { trAttr(root); root.querySelectorAll('[placeholder],[title],[aria-label],[alt]').forEach(el => { if (!tidak(el)) trAttr(el); }); }
  };
  trTree(document.body);
  new MutationObserver(ms => ms.forEach(m => {
    if (m.type === 'childList') m.addedNodes.forEach(trTree);
    else if (m.type === 'characterData') trNode(m.target);
    else if (!tidak(m.target)) trAttr(m.target);
  })).observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTR });
  ['alert', 'confirm', 'prompt'].forEach(f => { const o = window[f].bind(window); window[f] = (m, ...r) => o(typeof m === 'string' ? tr(m) : m, ...r); });
}

// ----- pemilih bahasa (menu roda gigi > Bahasa) -----
function openBahasa() { renderBahasa(); toggleModal('modalBahasa'); }

function renderBahasa() {
  const box = document.getElementById('bahasaBox');
  if (!box) return;
  box.innerHTML = Object.keys(LANGS).map(k => {
    const on = k === bahasaAktif;
    return `
      <div onclick="pilihBahasa('${k}')" style="display: flex; align-items: center; gap: 14px; padding: 12px 14px; margin-bottom: 10px; border-radius: 16px; cursor: pointer; background: var(--circle-bg); border: 2px solid ${on ? 'var(--primary)' : 'var(--border-color)'};">
        <div style="width: 40px; height: 40px; border-radius: 12px; background: var(--card-bg); display: flex; align-items: center; justify-content: center; color: var(--text-main);"><i class="fa fa-language"></i></div>
        <strong translate="no" style="flex: 1; font-size: 0.95rem;">${LANGS[k].nama}</strong>
        ${on ? '<i class="fa fa-circle-check" style="color: var(--pos); font-size: 1.2rem;"></i>' : ''}
      </div>`;
  }).join('');
}

function pilihBahasa(k) {
  if (!LANGS[k]) return;
  if (k === bahasaAktif) { toggleModal('modalBahasa'); return; }
  try { localStorage.setItem(LANG_KEY, k); } catch (e) {}
  location.reload();
}
