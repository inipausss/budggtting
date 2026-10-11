// ===== TAMPILAN KARTU (gradien kartu saldo di Beranda & Dompet) =====
// File ini dimuat SEBELUM script.js (lihat index.html), supaya applyCard() sudah ada saat script.js menerapkan tema pertama kali.
// Yang dipakai dari script.js (toggleModal, applyTheme, themePref) hanya dipanggil saat berjalan, jadi urutan muat aman.
// Tampilan kotak pilihannya (.cp-grid, .cp-tile, .cp-col) ada di style.css; jendelanya (#modalCard) di index.html.
// ponytail: satu variabel CSS --hero dipakai kartu Beranda & Dompet; mode 'tema' = ikut tema (tidak menimpa apa pun)
const CARD_KEY = 'budggt_card';

// gradien "mesh" ala wallpaper macOS: beberapa cahaya radial di atas warna dasar; semuanya cukup gelap agar teks putih terbaca
const mesh = (base, a, b, c) => `radial-gradient(at 18% 12%, ${a} 0, transparent 55%), radial-gradient(at 88% 22%, ${b} 0, transparent 55%), radial-gradient(at 55% 98%, ${c} 0, transparent 60%), ${base}`;
const lin = (deg, ...s) => `linear-gradient(${deg}deg, ${s.join(', ')})`;

const CARD_PRESET = [
  { id: 'bigsur',    nama: 'Big Sur',    bg: mesh('#3a2a78', '#ff7eb3', '#7a6cff', '#ff9d5c') },
  { id: 'monterey',  nama: 'Monterey',   bg: mesh('#2b2d8f', '#b46cff', '#3aa0ff', '#ff6fa8') },
  { id: 'ventura',   nama: 'Ventura',    bg: mesh('#1c2a6b', '#ff9a5a', '#e0409a', '#3b6bff') },
  { id: 'sonoma',    nama: 'Sonoma',     bg: mesh('#1f5a4a', '#c5d95a', '#2fb5a0', '#2a6fb0') },
  { id: 'sequoia',   nama: 'Sequoia',    bg: mesh('#0e2a30', '#2f7d6e', '#1d4f6e', '#6aa86a') },
  { id: 'tahoe',     nama: 'Tahoe',      bg: mesh('#0f3a63', '#38b6ff', '#1c6ad0', '#5fe0d0') },
  { id: 'catalina',  nama: 'Catalina',   bg: mesh('#17304f', '#3aa0d8', '#6b5bd6', '#e58a6a') },
  { id: 'mojave',    nama: 'Mojave',     bg: mesh('#15122e', '#6a3fd0', '#2d3a9c', '#b04a8f') },
  { id: 'monterey2', nama: 'Fajar',      bg: mesh('#5a1f4a', '#ff8a5c', '#ffb36b', '#c23a7a') },
  { id: 'aurora',    nama: 'Aurora',     bg: mesh('#0c2b3a', '#2fe0a8', '#3a7bff', '#8a4bff') },
  { id: 'rosegold',  nama: 'Rose Gold',  bg: mesh('#4a2a3a', '#e8a090', '#c06a8a', '#f0c27a') },
  { id: 'graphite',  nama: 'Grafit',     bg: mesh('#1c1c20', '#5a5f6a', '#34373f', '#7c8190') },
  { id: 'emasmewah', nama: 'Champagne',  bg: mesh('#241a0c', '#d4af6a', '#8a6a2a', '#f0d68a') },
  { id: 'samudra',   nama: 'Samudra',    bg: mesh('#06222e', '#0f8a9a', '#124a7a', '#3acfc0') }
];

// gradien tambahan, tampil di bagian "Gradien baru"
const CARD_BARU = [
  { id: 'kapas',     nama: 'Permen Kapas',   bg: mesh('#5b2a86', '#ff6fb5', '#6aa8ff', '#ffa86b') },
  { id: 'matcha',    nama: 'Matcha',         bg: mesh('#1f3d2b', '#8fce6a', '#2f9e7a', '#d7e36a') },
  { id: 'lavender',  nama: 'Lavender',       bg: mesh('#3b2d73', '#b79cff', '#7a8cff', '#f08bd0') },
  { id: 'persik',    nama: 'Persik',         bg: mesh('#7a2f3a', '#ff9f7a', '#ff6f91', '#ffc46b') },
  { id: 'blueberry', nama: 'Blueberry',      bg: mesh('#1b1f5e', '#4b6bff', '#8a5cff', '#2fc0ff') },
  { id: 'mint',      nama: 'Mint Dingin',    bg: mesh('#0f4a4a', '#5de0c4', '#3a9bd0', '#a6f0a0') },
  { id: 'sakura',    nama: 'Sakura',         bg: mesh('#5a2a4a', '#ff9cc4', '#e0709e', '#ffc7a0') },
  { id: 'gletser',   nama: 'Gletser',        bg: mesh('#12324f', '#7fd3ff', '#4a8fe0', '#b6c8ff') },
  { id: 'galaksi',   nama: 'Galaksi',        bg: mesh('#0d0b2a', '#6a3fd0', '#c13b9a', '#2f6bd0') },
  { id: 'kabut',     nama: 'Hutan Kabut',    bg: mesh('#10261f', '#3f8f6a', '#2a6a7a', '#9ab86a') },
  { id: 'senja',     nama: 'Senja',          bg: lin(160, '#e8643a 0%', '#d63a74 48%', '#4e2a8c 100%') },
  { id: 'berry',     nama: 'Berry Soda',     bg: lin(135, '#d63a78', '#8f3bc4 55%', '#3a54c8') },
  { id: 'neon',      nama: 'Neon Kota',      bg: lin(135, '#0a8fd0', '#5a4cd8 50%', '#d02a8a') },
  { id: 'tropis',    nama: 'Tropis',         bg: lin(150, '#0a8a6e', '#0a6cc4 55%', '#5a48c8') },
  { id: 'lava',      nama: 'Lava',           bg: lin(145, '#d8402a', '#c01a62 58%', '#45186a') },
  { id: 'mandarin',  nama: 'Mandarin',       bg: lin(135, '#d86a1e', '#cc3a4a 55%', '#7a2a6a') },
  { id: 'pelangi',   nama: 'Pelangi Lembut', bg: 'conic-gradient(from 210deg at 70% 30%, #4b3fb8, #a8348a, #c8582e, #2a78b8, #4b3fb8)' }
];
const CARD_SEMUA = CARD_PRESET.concat(CARD_BARU);

let cardCfg = { mode: 'tema', id: 'bigsur', c: ['#5b3fd0', '#c13b9a', '#ff8a5c'], ang: 135 };
try { Object.assign(cardCfg, JSON.parse(localStorage.getItem(CARD_KEY) || '{}')); } catch (e) {}

function cardBg() {
  if (cardCfg.mode === 'preset') return (CARD_SEMUA.find(p => p.id === cardCfg.id) || CARD_PRESET[0]).bg;
  if (cardCfg.mode === 'kustom') return `linear-gradient(${cardCfg.ang}deg, ${cardCfg.c.join(', ')})`;
  return '';
}
function applyCard() {
  const v = cardBg();
  if (v) document.body.style.setProperty('--hero', v);
  else if (themePref !== 'kustom') document.body.style.removeProperty('--hero'); // tema kustom mengisi --hero sendiri (lihat applyTheme)
}
function simpanCard(render = true) {
  try { localStorage.setItem(CARD_KEY, JSON.stringify(cardCfg)); } catch (e) {}
  applyTheme(themePref); // menerapkan ulang --hero dari tema lalu menimpanya dengan pilihan kartu
  if (render) renderCardPicker();
}
function pickCard(mode, id) { cardCfg.mode = mode; if (id) cardCfg.id = id; simpanCard(); }
function setCardCustom(i, v, render) {
  if (i === 'ang') cardCfg.ang = Number(v); else cardCfg.c[i] = v;
  cardCfg.mode = 'kustom'; simpanCard(!!render);
}
function openCard() { renderCardPicker(); toggleModal('modalCard'); }

function renderCardPicker() {
  const box = document.getElementById('cardBox');
  if (!box) return;
  const on = (m, id) => cardCfg.mode === m && (!id || cardCfg.id === id);
  const tile = (bg, nama, aktif, fn) => `<button type="button" class="cp-tile${aktif ? ' on' : ''}" style="background: ${bg};" onclick="${fn}"><span>${nama}</span>${aktif ? '<i class="fa fa-circle-check"></i>' : ''}</button>`;
  const lbl = t => `<p style="font-size: 0.7rem; font-weight: 600; color: var(--text-muted); margin: 18px 0 8px;">${t}</p>`;
  const picker = i => `<label class="cp-col" style="background: ${cardCfg.c[i]};"><input type="color" value="${cardCfg.c[i]}" oninput="setCardCustom(${i}, this.value, false); this.parentNode.style.background = this.value" onchange="setCardCustom(${i}, this.value, true)"></label>`;
  const grid = list => `<div class="cp-grid">${list.map(p => tile(p.bg, p.nama, on('preset', p.id), `pickCard('preset', '${p.id}')`)).join('')}</div>`;
  box.innerHTML = `
    <div class="main-card" style="margin-bottom: 4px; padding: 18px;">
      <div class="card-top-tag" style="margin-bottom: 10px; min-height: 0;"><span class="tag-pill"><i class="fa fa-bolt"></i> Pratinjau</span></div>
      <h2 class="balance-value" style="font-size: 1.5rem;">Rp 12.500.000</h2>
      <div class="flow-row" style="margin-top: 14px;">
        <div class="flow-col" style="padding: 10px 12px;"><p style="margin-bottom: 6px;">Pemasukan</p><h4>Rp 8.000.000</h4></div>
        <div class="flow-col" style="padding: 10px 12px;"><p style="margin-bottom: 6px;">Pengeluaran</p><h4>Rp 3.200.000</h4></div>
      </div>
    </div>
    ${lbl('Ikuti tema')}
    <div class="cp-grid">${tile('var(--card-bg)', 'Sesuai tema', on('tema'), "pickCard('tema')")}</div>
    ${lbl('Gradien siap pakai')}
    ${grid(CARD_PRESET)}
    ${lbl('Gradien baru')}
    ${grid(CARD_BARU)}
    ${lbl('Buat sendiri')}
    <div style="padding: 14px; border-radius: 16px; background: var(--circle-bg); border: 2px solid ${on('kustom') ? 'var(--primary)' : 'var(--border-color)'};">
      <div style="height: 54px; border-radius: 12px; margin-bottom: 14px; background: linear-gradient(${cardCfg.ang}deg, ${cardCfg.c.join(', ')});"></div>
      <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 14px;">${[0, 1, 2].map(picker).join('')}<span style="font-size: 0.75rem; color: var(--text-muted);">Ketuk lingkaran untuk memilih warna</span></div>
      <label style="font-size: 0.75rem; color: var(--text-muted); display: flex; align-items: center; gap: 12px;">Arah <input type="range" min="0" max="360" step="15" value="${cardCfg.ang}" oninput="setCardCustom('ang', this.value, false)" onchange="setCardCustom('ang', this.value, true)" style="flex: 1;"> ${cardCfg.ang}°</label>
    </div>`;
}
