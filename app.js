/* ============================================================
   MOONBEAM STUDIO — app.js
   AI Interior Design SaaS Web App
   ============================================================ */

// ---- FAL AI CONFIG ----
const FAL_CONFIG = {
  key: 'PASTE_FAL_KEY_HERE', // user fills this in
  endpoint: 'https://fal.run/fal-ai/flux/dev/image-to-image'
};

// ---- STATE ----
const STATE = {
  get tier() { return localStorage.getItem('mb_tier') || 'free'; },
  set tier(v) { localStorage.setItem('mb_tier', v); },
  get redesignCount() { return parseInt(localStorage.getItem('mb_redesign_count') || '0'); },
  set redesignCount(v) { localStorage.setItem('mb_redesign_count', String(v)); },
  get colorCount() { return parseInt(localStorage.getItem('mb_color_count') || '0'); },
  set colorCount(v) { localStorage.setItem('mb_color_count', String(v)); },
  get falKey() { return localStorage.getItem('mb_fal_key') || ''; },
  set falKey(v) { localStorage.setItem('mb_fal_key', v); }
};
const FREE_REDESIGN_LIMIT = 2;
let uploadedImageBase64 = null;
let uploadedImageDataUrl = null;
let colorUploadedDataUrl = null;
let lightingUploadedDataUrl = null;
let selectedColors = [];

// ---- INIT ----
document.addEventListener('DOMContentLoaded', function() {
  initFromURL();
  updateUI();
  loadFalKey();
  initDragDrop();
});

function initFromURL() {
  const params = new URLSearchParams(window.location.search);
  const view = params.get('tool') || params.get('service');
  if (view) {
    const viewMap = {
      color: 'color', lighting: 'lighting', furniture: 'furniture',
      residential: 'redesign', commercial: 'redesign',
      builder: 'redesign', lighting_service: 'lighting'
    };
    const target = viewMap[view] || 'dashboard';
    const link = document.querySelector('[data-view="' + target + '"]');
    if (link) switchView(target, link);
  }
}

function updateUI() {
  const count = STATE.redesignCount;
  const remaining = Math.max(0, FREE_REDESIGN_LIMIT - count);
  const el = document.getElementById('sidebarPlanLabel');
  if (el) el.textContent = STATE.tier === 'free'
    ? remaining + ' redesign' + (remaining === 1 ? '' : 's') + ' left'
    : 'Pro — Unlimited';
  const planName = document.getElementById('sidebarPlanName');
  if (planName) planName.textContent = STATE.tier === 'pro' ? 'Pro Plan' : 'Free Plan';
  const dash = document.getElementById('dashRedesignCount');
  if (dash) dash.textContent = remaining;
  const stat = document.getElementById('statRedesigns');
  if (stat) stat.textContent = count;
  const statC = document.getElementById('statColors');
  if (statC) statC.textContent = STATE.colorCount;
  const settingsPlan = document.getElementById('settingsPlan');
  if (settingsPlan) settingsPlan.textContent = STATE.tier === 'pro' ? 'Pro' : 'Free';
  const settingsUsed = document.getElementById('settingsUsed');
  if (settingsUsed) settingsUsed.textContent = count + ' / ' + (STATE.tier === 'pro' ? '∞' : FREE_REDESIGN_LIMIT);
  const limitNotice = document.getElementById('redesignLimitNotice');
  if (limitNotice) limitNotice.style.display = (STATE.tier === 'free' && count >= FREE_REDESIGN_LIMIT) ? 'flex' : 'none';
}

function loadFalKey() {
  const input = document.getElementById('falKeyInput');
  if (input && STATE.falKey) input.value = STATE.falKey;
  if (STATE.falKey && STATE.falKey !== 'PASTE_FAL_KEY_HERE') FAL_CONFIG.key = STATE.falKey;
}

// ---- NAVIGATION ----
function switchView(viewId, linkEl) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.sidebar-nav a').forEach(a => a.classList.remove('active'));
  const view = document.getElementById('view-' + viewId);
  if (view) view.classList.add('active');
  if (linkEl) linkEl.classList.add('active');
  else {
    const auto = document.querySelector('[data-view="' + viewId + '"]');
    if (auto) auto.classList.add('active');
  }
  const titles = {
    dashboard: 'Dashboard', projects: 'My Projects',
    redesign: 'AI Room Redesign', color: 'Color Analysis Tool',
    lighting: 'Lighting Analysis', furniture: 'Furniture Suggestions',
    settings: 'Settings'
  };
  const tb = document.getElementById('topbarTitle');
  if (tb) tb.textContent = titles[viewId] || viewId;
  // close sidebar on mobile
  if (window.innerWidth < 769) document.getElementById('sidebar').classList.remove('open');
  return false;
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
}

// ---- DRAG & DROP ----
function initDragDrop() {
  const zone = document.getElementById('uploadZone');
  if (!zone) return;
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) processUploadFile(file);
  });
}

// ---- FILE UPLOAD (REDESIGN) ----
function handleFileSelect(event) {
  const file = event.target.files[0];
  if (file) processUploadFile(file);
}

function processUploadFile(file) {
  const reader = new FileReader();
  reader.onload = function(e) {
    uploadedImageDataUrl = e.target.result;
    uploadedImageBase64 = e.target.result.split(',')[1];
    document.getElementById('previewImg').src = uploadedImageDataUrl;
    document.getElementById('uploadZone').style.display = 'none';
    document.getElementById('uploadedPreview').style.display = 'block';
    document.getElementById('designOptions').classList.add('visible');
    document.getElementById('resultsPanel').classList.remove('visible');
  };
  reader.readAsDataURL(file);
}

function resetUpload() {
  uploadedImageBase64 = null;
  uploadedImageDataUrl = null;
  document.getElementById('fileInput').value = '';
  document.getElementById('uploadZone').style.display = 'block';
  document.getElementById('uploadedPreview').style.display = 'none';
  document.getElementById('designOptions').classList.remove('visible');
  document.getElementById('resultsPanel').classList.remove('visible');
}

// ---- FORM HELPERS ----
function selectChip(el, gridId) {
  document.querySelectorAll('#' + gridId + ' .room-chip').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
}

function toggleSwatch(el) {
  el.classList.toggle('selected');
  selectedColors = Array.from(document.querySelectorAll('.swatch-mini.selected')).map(s => s.style.background);
}

// ---- FAL AI REDESIGN ----
async function generateRoomRedesign(imageBase64, style, colors, prompt) {
  const key = STATE.falKey && STATE.falKey !== 'PASTE_FAL_KEY_HERE' ? STATE.falKey : FAL_CONFIG.key;
  if (!key || key === 'PASTE_FAL_KEY_HERE') {
    return { demo: true, url: null };
  }
  const colorPrompt = colors.length ? ' Color palette: ' + colors.join(', ') + '.' : '';
  const fullPrompt = style + ' interior design style, professional interior photography, beautifully designed room.' + colorPrompt + (prompt ? ' ' + prompt : '');
  try {
    const response = await fetch(FAL_CONFIG.endpoint, {
      method: 'POST',
      headers: { 'Authorization': 'Key ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image_url: 'data:image/jpeg;base64,' + imageBase64,
        prompt: fullPrompt,
        strength: 0.75,
        num_inference_steps: 28,
        guidance_scale: 7.5
      })
    });
    if (!response.ok) throw new Error('API error: ' + response.status);
    const data = await response.json();
    const url = data.images?.[0]?.url || data.image?.url || data.output?.[0] || null;
    return { demo: false, url };
  } catch (err) {
    console.error('Fal AI error:', err);
    return { demo: true, url: null };
  }
}

async function generateRedesign() {
  if (!uploadedImageBase64) return;

  // Check free tier limit
  if (STATE.tier === 'free' && STATE.redesignCount >= FREE_REDESIGN_LIMIT) {
    showUpgradeModal();
    return;
  }

  const style = document.querySelector('input[name="style"]:checked')?.value || 'Modern';
  const roomType = document.querySelector('.room-chip.selected')?.textContent || 'Living Room';
  const specialReq = document.getElementById('specialRequests')?.value || '';
  const colors = selectedColors;
  const prompt = roomType + ' design. ' + (specialReq || '');

  showSpinner('Analyzing your space and generating redesign&#8230;');
  const btn = document.getElementById('generateBtn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span>&#8987;</span> Generating&#8230;'; }

  try {
    const result = await generateRoomRedesign(uploadedImageBase64, style, colors, prompt);

    STATE.redesignCount = STATE.redesignCount + 1;

    let resultUrl;
    const falNote = document.getElementById('falNote');

    if (result.demo || !result.url) {
      // Demo mode: use a placeholder design image
      const demoImages = [
        'https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?w=800&q=80',
        'https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?w=800&q=80',
        'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800&q=80',
        'https://images.unsplash.com/photo-1554995207-c18c203602cb?w=800&q=80'
      ];
      resultUrl = demoImages[Math.floor(Math.random() * demoImages.length)];
      if (falNote) falNote.style.display = 'block';
    } else {
      resultUrl = result.url;
      if (falNote) falNote.style.display = 'none';
    }

    document.getElementById('originalResult').src = uploadedImageDataUrl;
    document.getElementById('generatedResult').src = resultUrl;
    const dlBtn = document.getElementById('downloadBtn');
    if (dlBtn) dlBtn.href = resultUrl;
    document.getElementById('resultsPanel').classList.add('visible');
    document.getElementById('resultsPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
    updateUI();
  } finally {
    hideSpinner();
    if (btn) { btn.disabled = false; btn.innerHTML = '<span>&#10024;</span> Generate AI Redesign'; }
  }
}

function saveToProjects() {
  const img = document.getElementById('generatedResult').src;
  const proj = document.getElementById('savedProject');
  const projImg = document.getElementById('savedProjectImg');
  if (proj && projImg && img) {
    projImg.src = img;
    document.getElementById('savedProjectTitle').textContent = 'AI Redesign — ' + new Date().toLocaleDateString();
    proj.style.display = 'block';
    const btn = event.target;
    btn.textContent = '&#10003; Saved!';
    setTimeout(() => btn.textContent = '&#128190; Save to Projects', 2000);
  }
}

// ---- COLOR ANALYSIS ----
function handleColorUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    colorUploadedDataUrl = e.target.result;
    const img = document.getElementById('colorPreviewImg');
    img.src = colorUploadedDataUrl;
    document.getElementById('colorPreviewWrap').style.display = 'block';
    document.getElementById('colorUploadZone').style.display = 'none';
    document.getElementById('colorPlaceholder').style.display = 'none';
    extractColors(colorUploadedDataUrl);
  };
  reader.readAsDataURL(file);
}

function extractColors(dataUrl) {
  const img = new Image();
  img.onload = function() {
    const canvas = document.getElementById('colorCanvas');
    canvas.width = 100;
    canvas.height = 100;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, 100, 100);

    // Sample grid of pixels
    const colors = [];
    const gridSize = 5;
    for (let gy = 0; gy < gridSize; gy++) {
      for (let gx = 0; gx < gridSize; gx++) {
        const x = Math.floor((gx / gridSize) * 100) + 5;
        const y = Math.floor((gy / gridSize) * 100) + 5;
        const px = ctx.getImageData(x, y, 1, 1).data;
        colors.push([px[0], px[1], px[2]]);
      }
    }

    // K-means-ish: cluster into 8 groups
    const clusters = clusterColors(colors, 8);
    renderExtractedPalette(clusters);
    STATE.colorCount = STATE.colorCount + 1;
    updateUI();
  };
  img.src = dataUrl;
}

function clusterColors(pixels, k) {
  // Simple clustering: pick evenly-spaced samples, deduplicate similar ones
  const step = Math.floor(pixels.length / k);
  const centers = [];
  for (let i = 0; i < k; i++) {
    const idx = i * step;
    if (idx < pixels.length) centers.push(pixels[idx]);
  }
  return centers;
}

function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(x => Math.round(x).toString(16).padStart(2, '0')).join('').toUpperCase();
}

function getComplementary(r, g, b) {
  const h = rgbToHsl(r, g, b);
  const compH = (h[0] + 180) % 360;
  return hslToRgb(compH, h[1], h[2]);
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;
  if (max === min) { h = s = 0; }
  else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return [h * 360, s, l];
}

function hslToRgb(h, s, l) {
  h /= 360;
  let r, g, b;
  if (s === 0) { r = g = b = l; }
  else {
    const hue2rgb = (p, q, t) => { if (t < 0) t += 1; if (t > 1) t -= 1; if (t < 1/6) return p+(q-p)*6*t; if (t < 1/2) return q; if (t < 2/3) return p+(q-p)*(2/3-t)*6; return p; };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

const PAINT_BRANDS = [
  { brand: 'Benjamin Moore', names: ['White Dove', 'Revere Pewter', 'Hale Navy', 'Simply White', 'Edgecomb Gray', 'Chantilly Lace', 'Pale Oak', 'Newburyport Blue'] },
  { brand: 'Sherwin-Williams', names: ['Accessible Beige', 'Alabaster', 'Agreeable Gray', 'Naval', 'Intellectual Gray', 'Mindful Gray', 'Sea Salt', 'Cityscape'] }
];

function getPaintSuggestion(hex) {
  const idx = Math.abs(parseInt(hex.replace('#',''), 16)) % 8;
  return {
    bm: PAINT_BRANDS[0].names[idx],
    sw: PAINT_BRANDS[1].names[idx]
  };
}

function renderExtractedPalette(clusters) {
  const palette = document.getElementById('extractedPalette');
  const recs = document.getElementById('paintRecommendations');
  palette.innerHTML = '';
  recs.innerHTML = '';

  clusters.forEach(([r, g, b]) => {
    const hex = rgbToHex(r, g, b);
    const swatch = document.createElement('div');
    swatch.className = 'extracted-swatch';
    swatch.style.background = hex;
    swatch.innerHTML = '<div class="swatch-hex">' + hex + '</div>';
    swatch.title = hex;
    swatch.onclick = () => highlightPaintRec(hex);
    palette.appendChild(swatch);

    const paint = getPaintSuggestion(hex);
    const row = document.createElement('div');
    row.className = 'paint-row';
    row.id = 'paint-' + hex.replace('#','');
    row.innerHTML = '<div class="paint-dot" style="background:' + hex + '"></div><div class="paint-info"><strong>' + hex + '</strong><span>BM: ' + paint.bm + ' &nbsp;|&nbsp; SW: ' + paint.sw + '</span></div>';
    recs.appendChild(row);
  });

  document.getElementById('colorResults').style.display = 'block';
}

function highlightPaintRec(hex) {
  document.querySelectorAll('.paint-row').forEach(r => r.style.background = '');
  const row = document.getElementById('paint-' + hex.replace('#',''));
  if (row) { row.style.background = hex + '22'; row.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
}

function applyColorToRedesign() {
  const swatches = document.querySelectorAll('.extracted-swatch');
  const minis = document.querySelectorAll('.swatch-mini');
  swatches.forEach((s, i) => { if (minis[i]) { minis[i].style.background = s.style.background; minis[i].classList.add('selected'); } });
  selectedColors = Array.from(swatches).map(s => s.style.background);
  switchView('redesign', document.querySelector('[data-view="redesign"]'));
}

// ---- LIGHTING ----
function bypassLightingGate() {
  document.getElementById('lightingGate').style.display = 'none';
  document.getElementById('lightingTool').style.display = 'block';
}

function handleLightingUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    lightingUploadedDataUrl = e.target.result;
    document.getElementById('lightingPreviewImg').src = lightingUploadedDataUrl;
    document.getElementById('lightingUploadZone').style.display = 'none';
    document.getElementById('lightingImgWrap').style.display = 'block';
    document.getElementById('lightingPlaceholder').style.display = 'none';
    runLightingAnalysis(lightingUploadedDataUrl);
  };
  reader.readAsDataURL(file);
}

function runLightingAnalysis(dataUrl) {
  const img = new Image();
  img.onload = function() {
    const canvas = document.createElement('canvas');
    canvas.width = 40; canvas.height = 40;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, 40, 40);
    const data = ctx.getImageData(0, 0, 40, 40).data;
    let totalBrightness = 0;
    for (let i = 0; i < data.length; i += 4) {
      totalBrightness += (data[i] * 0.299 + data[i+1] * 0.587 + data[i+2] * 0.114);
    }
    const avg = totalBrightness / (data.length / 4);
    const score = Math.max(3, Math.min(9, Math.round((avg / 255) * 10)));
    document.getElementById('lightScore').textContent = score;
    document.getElementById('lightScoreLabel').textContent = score >= 7
      ? 'Great natural light — minor enhancements recommended'
      : score >= 5 ? 'Good light with room to improve'
      : 'Low light — significant lighting plan recommended';
    addLightZoneOverlay(score);
    document.getElementById('lightingAnalysisPanel').style.display = 'block';
    showSpinner('Analyzing lighting conditions&#8230;');
    setTimeout(hideSpinner, 1200);
  };
  img.src = dataUrl;
}

function addLightZoneOverlay(score) {
  const overlay = document.getElementById('lightZoneOverlay');
  const warm = score >= 7 ? 0.5 : 0.2;
  const cool = score < 5 ? 0.4 : 0.15;
  overlay.style.background = 'radial-gradient(ellipse at 30% 20%, rgba(255,220,50,' + warm + ') 0%, transparent 50%), radial-gradient(ellipse at 70% 80%, rgba(100,160,255,' + cool + ') 0%, transparent 45%), radial-gradient(ellipse at 80% 10%, rgba(50,50,50,.3) 0%, transparent 40%)';
}

// ---- FURNITURE ----
function bypassFurnitureGate() {
  document.getElementById('furnitureGate').style.display = 'none';
  document.getElementById('furnitureTool').style.display = 'block';
  generateFurniture();
}

function updateBudget(val) {
  const n = parseInt(val);
  document.getElementById('budgetDisplay').textContent = '$' + n.toLocaleString();
}

const FURNITURE_DB = {
  'Living Room': [
    { cat:'Seating', name:'3-Seater Sofa', img:'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=400&q=75', price:'$1,200–$3,400', minBudget:1500 },
    { cat:'Seating', name:'Accent Chair', img:'https://images.unsplash.com/photo-1506439773649-6e0eb8cfb237?w=400&q=75', price:'$400–$900', minBudget:500 },
    { cat:'Tables', name:'Coffee Table', img:'https://images.unsplash.com/photo-1581428982868-e410dd047a90?w=400&q=75', price:'$250–$800', minBudget:500 },
    { cat:'Tables', name:'Side Table', img:'https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?w=400&q=75', price:'$80–$320', minBudget:500 },
    { cat:'Lighting', name:'Floor Lamp', img:'https://images.unsplash.com/photo-1507089947368-19c1da9775ae?w=400&q=75', price:'$150–$450', minBudget:500 },
    { cat:'Storage', name:'Media Console', img:'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=400&q=75', price:'$480–$1,200', minBudget:1000 },
    { cat:'Decor', name:'Area Rug 8x10', img:'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=400&q=75', price:'$300–$1,100', minBudget:500 },
    { cat:'Decor', name:'Throw Pillows Set', img:'https://images.unsplash.com/photo-1484101403633-562f891dc89a?w=400&q=75', price:'$60–$200', minBudget:500 }
  ],
  'Bedroom': [
    { cat:'Seating', name:'Upholstered Bench', img:'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?w=400&q=75', price:'$280–$680', minBudget:500 },
    { cat:'Tables', name:'Nightstand (Set of 2)', img:'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=400&q=75', price:'$320–$900', minBudget:500 },
    { cat:'Lighting', name:'Bedside Pendant (Pair)', img:'https://images.unsplash.com/photo-1507089947368-19c1da9775ae?w=400&q=75', price:'$180–$520', minBudget:500 },
    { cat:'Storage', name:'6-Drawer Dresser', img:'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=400&q=75', price:'$580–$1,400', minBudget:1000 },
    { cat:'Decor', name:'Full-Length Mirror', img:'https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?w=400&q=75', price:'$120–$380', minBudget:500 }
  ],
  'Office': [
    { cat:'Seating', name:'Ergonomic Desk Chair', img:'https://images.unsplash.com/photo-1503387762-592deb58ef4e?w=400&q=75', price:'$380–$1,200', minBudget:500 },
    { cat:'Tables', name:'Executive Desk', img:'https://images.unsplash.com/photo-1507089947368-19c1da9775ae?w=400&q=75', price:'$600–$2,800', minBudget:1000 },
    { cat:'Lighting', name:'Adjustable Desk Lamp', img:'https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?w=400&q=75', price:'$80–$280', minBudget:500 },
    { cat:'Storage', name:'Floating Bookshelves', img:'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=400&q=75', price:'$150–$480', minBudget:500 }
  ]
};

function generateFurniture() {
  const room = document.getElementById('furnitureRoom')?.value || 'Living Room';
  const budget = parseInt(document.getElementById('budgetSlider')?.value || '5000');
  const style = document.getElementById('furnitureStyle')?.value || 'Modern';
  const db = FURNITURE_DB[room] || FURNITURE_DB['Living Room'];
  const filtered = db.filter(f => f.minBudget <= budget);
  const grid = document.getElementById('furnitureGrid');
  if (!grid) return;
  grid.innerHTML = filtered.map(f => `
    <div class="furniture-card">
      <img src="${f.img}" alt="${f.name}" loading="lazy">
      <div class="furniture-card-body">
        <span class="category-tag">${f.cat}</span>
        <h4>${style !== 'Modern' ? style + ' ' : ''}${f.name}</h4>
        <span class="price">${f.price}</span>
        <button class="shop-btn" onclick="shopSimilar('${f.name}')">Shop Similar &rarr;</button>
      </div>
    </div>
  `).join('') || '<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--mu)">No items match your budget. Try increasing the slider.</div>';
}

function shopSimilar(name) {
  window.open('https://www.google.com/search?q=' + encodeURIComponent(name + ' furniture'), '_blank');
}

// ---- UPGRADE MODAL ----
function showUpgradeModal() {
  document.getElementById('upgradeModal').classList.add('visible');
}

function closeModal(e) {
  if (e.target === document.getElementById('upgradeModal')) {
    document.getElementById('upgradeModal').classList.remove('visible');
  }
}

// ---- SPINNER ----
function showSpinner(msg) {
  document.getElementById('spinnerText').innerHTML = msg || 'Loading…';
  document.getElementById('spinnerOverlay').classList.add('visible');
  document.body.style.overflow = 'hidden';
}

function hideSpinner() {
  document.getElementById('spinnerOverlay').classList.remove('visible');
  document.body.style.overflow = '';
}

// ---- SETTINGS ----
function saveFalKey() {
  const val = document.getElementById('falKeyInput').value.trim();
  STATE.falKey = val;
  FAL_CONFIG.key = val;
  const btn = event.target;
  const orig = btn.textContent;
  btn.textContent = 'Saved!';
  btn.style.background = '#5a9a5a';
  setTimeout(() => { btn.textContent = orig; btn.style.background = ''; }, 2000);
}

function clearProjects() {
  if (confirm('Clear all saved projects? This cannot be undone.')) {
    document.getElementById('savedProject').style.display = 'none';
    alert('Projects cleared.');
  }
}

function resetUsage() {
  STATE.redesignCount = 0;
  updateUI();
  alert('Usage counter reset.');
}

// ---- ESC KEY ----
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    document.getElementById('upgradeModal')?.classList.remove('visible');
    hideSpinner();
  }
});
