// CONFIG
const SUPABASE_URL  = "https://qppvjvrzozammywpxgtb.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_XbNUzPp5YrkofJSFmHL5Pw_dOHDfJa5";

let sb = null;
if (SUPABASE_URL && SUPABASE_ANON_KEY) {
  if (typeof createClient !== "undefined") {
    sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  } else if (window.supabase && window.supabase.createClient) {
    sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
}

// Pricing defaults (used for suggestion when filaments lack cost info)
let DEFAULT_MAT_COST_PER_KG = 50; // BRL per kg
let DEFAULT_HOURLY_RATE = 10;     // BRL per hour of printing
let DEFAULT_MARGIN = 0.30;        // 30% margin

// persisted application settings (editable in Settings)
var appSettings = {
  matCostPerKg: DEFAULT_MAT_COST_PER_KG,
  hourlyRate: DEFAULT_HOURLY_RATE,
  margin: DEFAULT_MARGIN,
  defaultMultiplier: 1.0
};

async function loadSettings() {
  // Try to load user settings from Supabase; fall back to localStorage
  if (sb) {
    try {
      const { data: userData } = await sb.auth.getUser();
      const userId = userData && userData.user ? userData.user.id : null;
      if (userId) {
          const { data, error } = await sb.from('app_settings').select('*').eq('owner', userId).maybeSingle();
          if (!error && data) {
            if (data.mat_cost_per_kg != null) appSettings.matCostPerKg = parseFloat(data.mat_cost_per_kg) || appSettings.matCostPerKg;
            if (data.hourly_rate != null) appSettings.hourlyRate = parseFloat(data.hourly_rate) || appSettings.hourlyRate;
            if (data.margin != null) appSettings.margin = parseFloat(data.margin) || appSettings.margin;
            if (data.default_multiplier != null) appSettings.defaultMultiplier = parseFloat(data.default_multiplier) || appSettings.defaultMultiplier;
            return;
          }
        }
    } catch (e) { console.warn('loadSettings (supabase) failed', e); }
  }
  // localStorage fallback
  try {
    var s = localStorage.getItem('app_settings');
    if (s) {
      var p = JSON.parse(s);
      if (p.matCostPerKg != null) appSettings.matCostPerKg = parseFloat(p.matCostPerKg) || appSettings.matCostPerKg;
      if (p.hourlyRate != null) appSettings.hourlyRate = parseFloat(p.hourlyRate) || appSettings.hourlyRate;
      if (p.margin != null) appSettings.margin = parseFloat(p.margin) || appSettings.margin;
      if (p.defaultMultiplier != null) appSettings.defaultMultiplier = parseFloat(p.defaultMultiplier) || appSettings.defaultMultiplier;
    }
  } catch (e) { console.warn('loadSettings (local) failed', e); }
}

async function saveSettings() {
  // Persist to Supabase when available and user authenticated; otherwise to localStorage
  var success = true;
  if (sb) {
    try {
      const { data: userData } = await sb.auth.getUser();
      const userId = userData && userData.user ? userData.user.id : null;
      if (userId) {
        const payload = {
          owner: userId,
          mat_cost_per_kg: appSettings.matCostPerKg,
          hourly_rate: appSettings.hourlyRate,
          margin: appSettings.margin,
          default_multiplier: appSettings.defaultMultiplier,
          updated_at: new Date().toISOString()
        };
        // upsert on owner (requires unique constraint on owner in DB)
        const { error } = await sb.from('app_settings').upsert(payload, { onConflict: 'owner' });
        if (error) {
          console.warn('saveSettings supabase upsert error', error);
          success = false;
        } else {
          return true; // persisted to supabase successfully
        }
      }
    } catch (e) { console.warn('saveSettings (supabase) failed', e); success = false; }
  }
  try {
    localStorage.setItem('app_settings', JSON.stringify(appSettings));
  } catch(e) { console.warn('saveSettings (local) failed', e); success = false; }
  return success;
}
// -- Local fallback ----------------------------------------------------------
const localDB = {
  filaments:   JSON.parse(localStorage.getItem("filaments")   || "[]"),
  sales:       JSON.parse(localStorage.getItem("sales")       || "[]"),
  products:    JSON.parse(localStorage.getItem("products")    || "[]"),
  sale_items:  JSON.parse(localStorage.getItem("sale_items")  || "[]"),
  orders:      JSON.parse(localStorage.getItem("orders")      || "[]"),
  order_items: JSON.parse(localStorage.getItem("order_items") || "[]"),
  customers:   JSON.parse(localStorage.getItem("customers")   || "[]"),
  save() {
    // Remove base64 photos before persisting — they're huge and already estão no Supabase
    var noB64 = function(arr) {
      return arr.map(function(r) {
        if (!r || !r.photo || !String(r.photo).startsWith("data:")) return r;
        var c = Object.assign({}, r); c.photo = null; return c;
      });
    };
    try {
      localStorage.setItem("filaments",   JSON.stringify(noB64(this.filaments)));
      localStorage.setItem("sales",       JSON.stringify(this.sales));
      localStorage.setItem("products",    JSON.stringify(noB64(this.products)));
      localStorage.setItem("sale_items",  JSON.stringify(this.sale_items));
      localStorage.setItem("orders",      JSON.stringify(this.orders));
      localStorage.setItem("order_items", JSON.stringify(this.order_items));
      localStorage.setItem("customers",   JSON.stringify(this.customers));
    } catch(e) {
      console.warn("localStorage cheio, dados apenas em memória esta sessão:", e.message);
    }
  }
};

// -- Loading overlay ---------------------------------------------------------
const overlay = document.getElementById("loading-overlay");
function showLoading() {
  if (overlay) overlay.classList.remove("hidden");
  document.querySelectorAll("#app-nav button").forEach(b => { b.disabled = true; b.classList.add("busy"); });
}
function hideLoading() {
  if (overlay) overlay.classList.add("hidden");
  document.querySelectorAll("#app-nav button").forEach(b => { b.disabled = false; b.classList.remove("busy"); });
}

// -- Sections ----------------------------------------------------------------
const ALL_SECTIONS = [
  "sec-dashboard",
  "sec-filaments-hub",
  "sec-filaments-register",
  "sec-filaments-list",
  "sec-filament-usage",
  "sec-sales-hub",
  "sec-sales-register",
  "sec-sales-list",
  "sec-products",
  "sec-orders",
  "sec-customers",
  "sec-settings",
  "sec-admin"
];

var _previousSection = null;
function showSection(id) {
  // store previous visible section
  try {
    var current = ALL_SECTIONS.find(function(s) { var el = document.getElementById(s); return el && !el.classList.contains('hidden'); });
    if (current && current !== id) _previousSection = current;
  } catch (e) {}
  ALL_SECTIONS.forEach(s => {
    const el = document.getElementById(s);
    if (el) el.classList.toggle("hidden", s !== id);
  });
}

function goBack() {
  if (_previousSection) { navTo(_previousSection); _previousSection = null; }
  else { navTo('sec-dashboard'); }
}

// Navega para uma seção ativando seu botão de nav (reaproveita lógica de render do click handler)
function navTo(secId) {
  var btn = appNav ? appNav.querySelector("[data-sec='" + secId + "']") : null;
  if (btn) { btn.click(); } else { showSection(secId); }
}

// -- Sales hub wiring ------------------------------------------------------
function hubNavActive() {
  appNav.querySelectorAll("button[data-sec]").forEach(function(b) { b.classList.remove("active"); });
  var hb = appNav ? appNav.querySelector("[data-sec='sec-sales-hub']") : null; if (hb) hb.classList.add("active");
}
var _hgSell = document.getElementById("hub-go-sell");
if (_hgSell) _hgSell.addEventListener("click", async function() {
  showLoading(); await fetchFilaments(); hubNavActive(); prepSaleForm(); hideLoading(); showSection("sec-sales-register");
});
var _hgSales = document.getElementById("hub-go-sales");
if (_hgSales) _hgSales.addEventListener("click", async function() {
  showLoading(); await refreshAll(); renderSales(); hubNavActive(); hideLoading(); showSection("sec-sales-list");
});
var _hgOrders = document.getElementById("hub-go-orders");
if (_hgOrders) _hgOrders.addEventListener("click", async function() {
  showLoading(); await fetchFilaments(); await fetchOrders(); await fetchOrderItems();
  hubNavActive(); prepOrderForm(); renderOrders(); hideLoading(); showSection("sec-orders");
});
var _hgCustomers = document.getElementById("hub-go-customers");
if (_hgCustomers) _hgCustomers.addEventListener("click", async function() {
  showLoading(); await fetchCustomers(); await fetchOrders();
  hubNavActive(); renderCustomers(); hideLoading(); showSection("sec-customers");
});

// -- Filaments hub wiring --------------------------------------------------
function filamentsHubActive() {
  appNav.querySelectorAll("button[data-sec]").forEach(function(b) { b.classList.remove("active"); });
  var hb = appNav ? appNav.querySelector("[data-sec='sec-filaments-hub']") : null; if (hb) hb.classList.add("active");
}
var _hfgReg = document.getElementById("hub-filament-go-register");
if (_hfgReg) _hfgReg.addEventListener("click", async function() {
  showLoading(); await fetchFilaments({ withPhoto: false }); filamentsHubActive(); hideLoading(); showSection("sec-filaments-register");
});
var _hfgList = document.getElementById("hub-filament-go-list");
if (_hfgList) _hfgList.addEventListener("click", async function() {
  showLoading(); await fetchFilaments({ withPhoto: true }); filamentsHubActive(); renderFilamentsList(); hideLoading(); showSection("sec-filaments-list");
});

async function goToFilamentUsage() {
  showLoading(); await fetchFilaments({ withPhoto: false }); await fetchProducts(); filamentsHubActive(); prepFilamentUsageForm(); hideLoading(); showSection("sec-filament-usage");
}
var _hfgUsage = document.getElementById("hub-filament-go-usage");
if (_hfgUsage) _hfgUsage.addEventListener("click", goToFilamentUsage);
var _dashUsage = document.getElementById("dash-shortcut-usage");
if (_dashUsage) _dashUsage.addEventListener("click", goToFilamentUsage);
var _dashOrders = document.getElementById("dash-shortcut-orders");
if (_dashOrders) _dashOrders.addEventListener("click", async function() {
  showLoading(); await fetchFilaments(); await fetchOrders(); await fetchOrderItems();
  hubNavActive(); prepOrderForm(); renderOrders(); hideLoading(); showSection("sec-orders");
});

// -- Auth --------------------------------------------------------------------
const authDiv  = document.getElementById("auth");
const appEl    = document.getElementById("app");
const appNav   = document.getElementById("app-nav");
const userArea = document.getElementById("user-area");

function showAuth() {
  authDiv.classList.remove("hidden");
  appEl.classList.add("hidden");
  if (appNav) appNav.classList.add("hidden");
  ALL_SECTIONS.forEach(s => { const el = document.getElementById(s); if (el) el.classList.add("hidden"); });
  setTimeout(() => { const em = document.getElementById("email"); if (em) em.focus(); }, 120);
}

async function showApp(userEmail) {
  authDiv.classList.add("hidden");
  appEl.classList.remove("hidden");
  if (appNav) appNav.classList.remove("hidden");
  let display = userEmail || "";
  if (sb) {
    try {
      const { data } = await sb.auth.getUser();
      if (data && data.user) display = (data.user.user_metadata && data.user.user_metadata.display_name) || data.user.email || display;
    } catch (_) {}
  }
  userArea.innerHTML = `<div class="user-menu-wrap"><button id="user-menu-btn">Olá, ${display} ▾</button><div id="user-menu" class="hidden"><button id="open-settings">⚙️ Configurações</button><button id="open-admin">🔒 Administração</button><button id="signout">Sair</button></div></div>`;
  var umb = document.getElementById("user-menu-btn"); if (umb) umb.onclick = function(){ var m = document.getElementById('user-menu'); if (m) m.classList.toggle('hidden'); };
  var msign = document.getElementById("signout"); if (msign) msign.onclick = signOut;
  var openSettings = document.getElementById('open-settings'); if (openSettings) openSettings.onclick = function(){ var mm = document.getElementById('user-menu'); if (mm) mm.classList.add('hidden'); navTo('sec-settings'); };
  var openAdmin = document.getElementById('open-admin'); if (openAdmin) openAdmin.onclick = function(){ var mm = document.getElementById('user-menu'); if (mm) mm.classList.add('hidden'); navTo('sec-admin'); };

  document.getElementById("sales-view-list").onclick = function() {
    salesViewMode = "list";
    this.classList.add("active"); document.getElementById("sales-view-table").classList.remove("active");
    renderSales();
  };
  document.getElementById("sales-view-table").onclick = function() {
    salesViewMode = "table";
    this.classList.add("active"); document.getElementById("sales-view-list").classList.remove("active");
    renderSales();
  };

  document.querySelectorAll("#dash-period button").forEach(function(btn) {
    btn.onclick = function() {
      dashPeriod = btn.dataset.period;
      document.querySelectorAll("#dash-period button").forEach(function(b) { b.classList.remove("active"); });
      btn.classList.add("active");
      renderDashboard();
    };
  });

  showLoading();
  await yieldUI();
  await loadSettings();
  // Refresh settings inputs after loading persisted values
  var _iMat2 = document.getElementById('settings-mat-cost'); if (_iMat2) _iMat2.value = appSettings.matCostPerKg;
  var _iHour2 = document.getElementById('settings-hourly-rate'); if (_iHour2) _iHour2.value = appSettings.hourlyRate;
  var _iMargin2 = document.getElementById('settings-margin'); if (_iMargin2) _iMargin2.value = appSettings.margin;
  var _iDMult2 = document.getElementById('settings-default-multiplier'); if (_iDMult2) _iDMult2.value = appSettings.defaultMultiplier;
  await refreshAll();
  hideLoading();
  renderDashboard();
  showSection("sec-dashboard");
  if (appNav) {
    appNav.querySelectorAll("button[data-sec]").forEach(function(b) { b.classList.remove("active"); });
    var hb = appNav.querySelector("[data-sec='sec-dashboard']"); if (hb) hb.classList.add("active");
  }
}

async function signUp() {
  const email    = document.getElementById("email").value;
  const password = document.getElementById("password").value;
  if (sb) {
    const { error } = await sb.auth.signUp({ email: email, password: password });
    if (error) return alert(error.message);
    alert("Verifique seu email ou entre com a senha cadastrada.");
  } else {
    alert("Supabase não configurado.");
  }
}

async function signIn() {
  const email    = document.getElementById("email").value;
  const password = document.getElementById("password").value;
  if (sb) {
    const { data, error } = await sb.auth.signInWithPassword({ email: email, password: password });
    if (error) return alert(error.message);
    await showApp(data.user.email);
  } else {
    await showApp(email);
  }
}

async function signOut() {
  if (sb) await sb.auth.signOut();
  showAuth();
}

// -- Unsaved form guard -------------------------------------------------------
function _hasUnsavedForm() {
  var activeSec = document.querySelector(".section:not(.hidden)");
  if (!activeSec) return false;
  var inputs = activeSec.querySelectorAll("input:not([type='hidden']):not([type='file']):not([type='search']):not([type='checkbox']), textarea");
  for (var i = 0; i < inputs.length; i++) {
    var el = inputs[i];
    // skip inputs inside hidden wrappers (e.g. product-form-wrap when collapsed)
    if (el.closest('.hidden')) continue;
    if ((el.value || "").trim() !== "") return true;
  }
  return false;
}

// -- Navigation ---------------------------------------------------------------
if (appNav) {
  appNav.querySelectorAll("button[data-sec]").forEach(function(btn) {
    btn.addEventListener("click", async function() {
      if (_hasUnsavedForm() && !confirm("Há dados não salvos no formulário atual. Deseja sair mesmo assim?")) return;
      appNav.querySelectorAll("button[data-sec]").forEach(function(b) { b.classList.remove("active"); });
      btn.classList.add("active");
      var secId = btn.dataset.sec;
      showLoading();
      await yieldUI();
      if (secId === "sec-dashboard") {
        await refreshAll();
        renderDashboard();
      } else if (secId === "sec-sales-hub") {
        // hub only shows cards, no fetch needed
      } else if (secId === "sec-filaments-list") {
        await fetchFilaments({ withPhoto: true });
        renderFilamentsList();
      } else if (secId === "sec-sales-register") {
        await fetchFilaments();
        prepSaleForm();
      } else if (secId === "sec-sales-list") {
        await refreshAll();
        renderSales();
      } else if (secId === "sec-products") {
        await fetchProducts();
        renderProducts();
      } else if (secId === "sec-customers") {
        await fetchCustomers();
        renderCustomers();
      } else if (secId === "sec-orders") {
        await fetchFilaments();
        await fetchOrders();
        await fetchOrderItems();
        prepOrderForm();
        renderOrders();
      }
      hideLoading();
      showSection(secId);
    });
  });
}

// -- Data fetching ------------------------------------------------------------
async function fetchFilaments(opts) {
  // opts: { withPhoto: boolean } - by default fetch only lightweight columns to reduce payload
  opts = opts || {};
  if (!sb) return;
  var cols = opts.withPhoto ? "*" : "id,name,color,manufacturer,quantity,price_per_kg";
  const { data, error } = await sb.from("filaments").select(cols);
  if (!error && data) { localDB.filaments = data; localDB.save(); }
}

async function fetchSales() {
  if (!sb) return;
  const { data, error } = await sb.from("sales").select("*");
  if (!error && data) { localDB.sales = data; localDB.save(); }
}

async function fetchProducts() {
  if (!sb) return;
  const { data, error } = await sb.from("products").select("*");
  if (!error && data) { localDB.products = data; localDB.save(); }
}

async function fetchSaleItems() {
  if (!sb) return;
  const { data, error } = await sb.from("sale_items").select("*");
  if (!error && data) { localDB.sale_items = data; localDB.save(); }
}

async function fetchCustomers() {
  if (!sb) return;
  const { data, error } = await sb.from("customers").select("*");
  if (!error && data) { localDB.customers = data; localDB.save(); }
}

async function fetchOrders() {
  if (!sb) return;
  const { data, error } = await sb.from("orders").select("*");
  if (!error && data) { localDB.orders = data; localDB.save(); }
}

async function fetchOrderItems() {
  if (!sb) return;
  const { data, error } = await sb.from("order_items").select("*");
  if (!error && data) { localDB.order_items = data; localDB.save(); }
}

async function refreshAll() {
  await Promise.all([fetchFilaments(), fetchSales(), fetchProducts(), fetchSaleItems(), fetchOrders(), fetchOrderItems(), fetchCustomers()]);
}

// -- Helpers ------------------------------------------------------------------
function toBase64(file) {
  return new Promise(function(res, rej) { var r = new FileReader(); r.onload = function() { res(r.result); }; r.onerror = rej; r.readAsDataURL(file); });
}

// Compress an image to a target max dimension and size budget.
// Strategy: try progressively smaller quality until under MAX_UPLOAD_BYTES,
// with a hard canvas timeout to avoid hanging forever on mobile.
var MAX_UPLOAD_BYTES = 300 * 1024; // 300 KB target per photo

function _canvasToBlob(canvas, quality) {
  return new Promise(function(resolve) {
    // Timeout per attempt: 10s
    var done = false;
    var t = setTimeout(function() { if (!done) { done = true; resolve(null); } }, 10000);
    canvas.toBlob(function(blob) {
      if (done) return;
      done = true; clearTimeout(t);
      resolve(blob || null);
    }, "image/jpeg", quality);
  });
}

async function compressImage(file, maxPx, quality) {
  if (!file.type.startsWith("image/")) return file;
  maxPx = maxPx || 700;  // 700px is plenty for catalog/filament thumbnails
  quality = quality || 0.82;

  var img = await new Promise(function(resolve, reject) {
    var i = new Image();
    var url = URL.createObjectURL(file);
    i.onload = function() { URL.revokeObjectURL(url); resolve(i); };
    i.onerror = function() { URL.revokeObjectURL(url); reject(); };
    i.src = url;
  }).catch(function() { return null; });

  if (!img) return file; // can't decode — upload as-is

  var w = img.width, h = img.height;
  var scale = Math.min(maxPx / w, maxPx / h, 1); // never upscale
  var cw = Math.round(w * scale), ch = Math.round(h * scale);

  var canvas = document.createElement("canvas");
  canvas.width = cw; canvas.height = ch;
  try {
    canvas.getContext("2d").drawImage(img, 0, 0, cw, ch);
  } catch (e) {
    console.warn("compressImage: canvas draw failed, uploading original", e);
    return file;
  }

  // Try progressively lower quality until we're under MAX_UPLOAD_BYTES
  var qualities = [quality, 0.70, 0.55, 0.40];
  for (var qi = 0; qi < qualities.length; qi++) {
    var blob = await _canvasToBlob(canvas, qualities[qi]);
    if (!blob) break; // timeout — fall back to original
    if (blob.size <= MAX_UPLOAD_BYTES || qi === qualities.length - 1) {
      console.log("compressImage: " + Math.round(file.size/1024) + "KB → " + Math.round(blob.size/1024) + "KB (q=" + qualities[qi] + ", " + cw + "x" + ch + ")");
      return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
    }
    // still too large — try again with lower quality
  }

  // All attempts failed or timed out — upload original and warn
  console.warn("compressImage: could not compress under " + MAX_UPLOAD_BYTES/1024 + "KB, uploading original (" + Math.round(file.size/1024) + "KB)");
  return file;
}

async function uploadFiles(files, bucket) {
  if (!files || !files.length) return null;
  if (!sb) throw new Error("Supabase não está configurado. A foto não pode ser enviada.");
  var paths = [];
  for (var i = 0; i < files.length; i++) {
    var file = files[i];
    if (!file || !file.size) continue;
    file = await compressImage(file);
    var uuid = (crypto && crypto.randomUUID) ? crypto.randomUUID() : (Date.now() + "-" + i + "-" + Math.random().toString(36).slice(2));
    var fn = uuid + "-" + file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
    var up = await sb.storage.from(bucket).upload(fn, file, { cacheControl: "3600", upsert: true });
    if (up.error) {
      throw new Error("Falha ao enviar foto para o Supabase (" + bucket + "): " + up.error.message + "\n\nVerifique se o bucket existe e se a política RLS permite uploads autenticados.");
    }
    paths.push(fn);
  }
  if (!paths.length) return null;
  return paths.length === 1 ? paths[0] : JSON.stringify(paths);
}

async function resolvePhotoUrl(photo, bucket) {
  if (!bucket) bucket = "filament-photos";
  if (!photo || typeof photo !== "string") return null;
  // JSON array — take first element
  if (photo.startsWith("[")) { try { photo = JSON.parse(photo)[0]; } catch(_) {} }
  if (!photo || typeof photo !== "string") return null;
  if (photo.startsWith("data:") || photo.startsWith("http")) return photo;
  if (!sb) return null;
  try {
    const { data, error } = await sb.storage.from(bucket).download(photo);
    if (!error && data) return URL.createObjectURL(data);
  } catch (_) {}
  try {
    const { data } = sb.storage.from(bucket).getPublicUrl(photo);
    if (data && data.publicUrl) return data.publicUrl;
  } catch (_) {}
  return null;
}

async function resolveAllPhotoUrls(photo, bucket) {
  if (!bucket) bucket = "filament-photos";
  if (!photo || typeof photo !== "string") return [];
  var paths;
  if (photo.startsWith("[")) { try { paths = JSON.parse(photo); } catch(_) { paths = [photo]; } }
  else { paths = [photo]; }
  var urls = [];
  for (var i = 0; i < paths.length; i++) {
    var u = await resolvePhotoUrl(paths[i], bucket);
    if (u) urls.push(u);
  }
  return urls;
}

function showError(msg, err) {
  console.error(msg, err);
  alert(msg + (err && err.message ? "\n\n" + err.message : ""));
}

function trashIcon() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"></path></svg>`;
}

function btnLoad(btn) {
  if (!btn) return;
  btn._origHTML = btn.innerHTML;
  btn.classList.add("btn-loading");
  btn.disabled = true;
}
function btnUnload(btn) {
  if (!btn) return;
  if (btn._origHTML !== undefined) btn.innerHTML = btn._origHTML;
  btn.classList.remove("btn-loading");
  btn.disabled = false;
}
function btnReset(btn, text) {
  if (!btn) return;
  btn.innerHTML = text !== undefined ? text : (btn._origHTML || "");
  btn.classList.remove("btn-loading");
  btn.disabled = false;
}
function yieldUI() { return new Promise(function(r) { requestAnimationFrame(r); }); }
var BLANK = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
var dashPeriod = "total";
var LOW_STOCK_THRESHOLD = 200; // gramas

// -- Lightbox -------------------------------------------------------------
var _lbUrls = []; var _lbIdx = 0;
function openLightbox(urls, startIdx) {
  _lbUrls = Array.isArray(urls) ? urls : [urls];
  _lbIdx = startIdx || 0;
  _lbShow();
}
function _lbShow() {
  var lb = document.getElementById("lightbox");
  var img = document.getElementById("lightbox-img");
  var dots = document.getElementById("lightbox-dots");
  var prev = document.getElementById("lightbox-prev");
  var next = document.getElementById("lightbox-next");
  if (!lb) return;
  img.src = _lbUrls[_lbIdx] || "";
  lb.classList.remove("hidden");
  prev.classList.toggle("hidden", _lbUrls.length < 2);
  next.classList.toggle("hidden", _lbUrls.length < 2);
  dots.innerHTML = "";
  if (_lbUrls.length > 1) {
    _lbUrls.forEach(function(_, i) {
      var s = document.createElement("span"); if (i === _lbIdx) s.className = "active";
      s.onclick = function() { _lbIdx = i; _lbShow(); };
      dots.appendChild(s);
    });
  }
}
function closeLightbox() { var lb = document.getElementById("lightbox"); if (lb) lb.classList.add("hidden"); }
(function() {
  document.getElementById("lightbox-backdrop").onclick = closeLightbox;
  document.getElementById("lightbox-close").onclick = closeLightbox;
  document.getElementById("lightbox-prev").onclick = function() { _lbIdx = (_lbIdx - 1 + _lbUrls.length) % _lbUrls.length; _lbShow(); };
  document.getElementById("lightbox-next").onclick = function() { _lbIdx = (_lbIdx + 1) % _lbUrls.length; _lbShow(); };
  document.addEventListener("keydown", function(e) {
    var lb = document.getElementById("lightbox");
    if (!lb || lb.classList.contains("hidden")) return;
    if (e.key === "Escape") closeLightbox();
    if (e.key === "ArrowLeft") { _lbIdx = (_lbIdx - 1 + _lbUrls.length) % _lbUrls.length; _lbShow(); }
    if (e.key === "ArrowRight") { _lbIdx = (_lbIdx + 1) % _lbUrls.length; _lbShow(); }
  });
  // Touch swipe support for mobile
  var _lbTouchX = null;
  var lbContent = document.getElementById("lightbox-content");
  lbContent.addEventListener("touchstart", function(e) {
    _lbTouchX = e.touches[0].clientX;
  }, { passive: true });
  lbContent.addEventListener("touchend", function(e) {
    if (_lbTouchX === null || _lbUrls.length < 2) return;
    var dx = e.changedTouches[0].clientX - _lbTouchX;
    _lbTouchX = null;
    if (Math.abs(dx) < 50) return; // too short — ignore
    if (dx < 0) { _lbIdx = (_lbIdx + 1) % _lbUrls.length; _lbShow(); }
    else        { _lbIdx = (_lbIdx - 1 + _lbUrls.length) % _lbUrls.length; _lbShow(); }
  }, { passive: true });
})();

// -- Filaments list render -------------------------------------------------
function renderFilamentsList() {
  var el = document.getElementById("filaments-list");
  el.innerHTML = "";
  var q = (document.getElementById("filaments-search").value || "").toLowerCase().trim();
  var seen = new Set();
  var rows = localDB.filaments.filter(function(f) { var k = f.id || f.name; if (seen.has(k)) return false; seen.add(k); return true; }).filter(function(f) {
    if (!q) return true;
    return (f.name||"").toLowerCase().includes(q)||(f.color||"").toLowerCase().includes(q)||(f.manufacturer||"").toLowerCase().includes(q);
  }).sort(function(a, b) { return (a.name||"").localeCompare(b.name||"", "pt-BR", {sensitivity:"base"}); });
  if (!rows.length && localDB.filaments.length) { el.innerHTML = "<p class='muted' style='padding:10px 0'>Nenhum resultado para \"" + q + "\".</p>"; return; }
  rows.forEach(function(f) {
    var isLow = (parseFloat(f.quantity) || 0) < LOW_STOCK_THRESHOLD;
    var div = document.createElement("div"); div.className = "item" + (isLow ? " item-low-stock" : "");
    var img = document.createElement("img"); img.alt = ""; img.src = BLANK; img.style.cursor = "pointer";
    var fPhoto = f.photo; var fBucket = "filament-photos";
    resolvePhotoUrl(fPhoto, fBucket).then(function(u) {
      if (u) { img.src = u; img.onclick = function() { resolveAllPhotoUrls(fPhoto, fBucket).then(function(urls) { openLightbox(urls, 0); }); }; }
    }).catch(function() {});
    var info = document.createElement("div"); info.className = "item-info clickable"; info.title = "Clique para editar";
    info.innerHTML = "<div class='item-info-inner'><strong>" + f.name + "</strong><div class='muted'>" + f.color + " — " + f.manufacturer + "</div>" + (isLow ? "<span style='font-size:11px;color:var(--danger);font-weight:600;margin-top:2px;display:block'>⚠ Estoque baixo</span>" : "") + "</div>";
    var fEdit = f; info.onclick = function() { openFilamentEdit(fEdit); };
    var acts = document.createElement("div"); acts.className = "item-actions";
    var badge = document.createElement("span"); badge.className = "qty-badge" + (isLow ? " qty-badge-low" : ""); badge.id = "badge-" + (f.id || f.name); badge.textContent = (f.quantity || 0) + " g";
    var refillBtn = document.createElement("button"); refillBtn.textContent = "+1kg"; refillBtn.title = "Adicionar 1000g ao estoque";
    refillBtn.style.cssText = "padding:6px 10px;font-size:12px";
    var fCopy2 = f;
    refillBtn.onclick = async function() {
      btnLoad(refillBtn);
      await addFilamentStock(fCopy2.id, fCopy2.name, 1000);
      btnUnload(refillBtn);
    };
    var delBtn = document.createElement("button"); delBtn.innerHTML = trashIcon(); delBtn.title = "Remover filamento";
    var fCopy = f;
    delBtn.onclick = async function() {
      if (!confirm("Confirma exclusão do filamento \"" + fCopy.name + "\"?")) return;
      await deleteFilament(fCopy.id, fCopy.name);
    };
    acts.appendChild(badge); acts.appendChild(refillBtn); acts.appendChild(delBtn);
    div.appendChild(img); div.appendChild(info); div.appendChild(acts);
    el.appendChild(div);
  });
}

// -- Filament Usage (build tracking) -------------------------------------
function prepFilamentUsageForm() {
  // Populate product select (only products without any sales)
  var prodSel = document.getElementById("fu-product-sel"); if (!prodSel) return;
  var soldNames = new Set((localDB.sales || []).map(function(s) { return s.product_name; }));
  prodSel.innerHTML = "<option value=''>Selecione um produto existente…</option>";
  (localDB.products || []).slice().sort(function(a,b){ return (a.name||"").localeCompare(b.name||"","pt-BR",{sensitivity:"base"}); }).forEach(function(p) {
    if (soldNames.has(p.name)) return;
    var o = document.createElement("option"); o.value = p.name; o.textContent = p.name; prodSel.appendChild(o);
  });
  var newOpt = document.createElement("option"); newOpt.value = "__new__"; newOpt.textContent = "+ Novo produto…";
  prodSel.appendChild(newOpt);
  var nameInput = document.getElementById("fu-product-name");
  prodSel.onchange = function() {
    if (nameInput) {
      if (prodSel.value === "__new__") { nameInput.classList.remove("hidden"); nameInput.required = true; nameInput.value = ""; nameInput.focus(); }
      else { nameInput.classList.add("hidden"); nameInput.required = false; nameInput.value = ""; }
    }
  };
  if (nameInput) { nameInput.classList.add("hidden"); nameInput.required = false; nameInput.value = ""; }
  // Populate filament select
  var sel = document.getElementById("fu-filament-sel"); if (!sel) return;
  sel.innerHTML = "<option value=''>Escolha o filamento\u2026</option>";
  localDB.filaments.slice().sort(function(a, b) {
    var n = (a.name||"").localeCompare(b.name||"", "pt-BR", {sensitivity:"base"});
    return n !== 0 ? n : (a.color||"").localeCompare(b.color||"", "pt-BR", {sensitivity:"base"});
  }).forEach(function(f) {
    var o = document.createElement("option"); o.value = f.id || f.name;
    o.textContent = f.name + " \u2014 " + (f.color || "?") + " (" + (parseFloat(f.quantity)||0).toFixed(0) + "g disp.)";
    sel.appendChild(o);
  });
  var pn = document.getElementById("fu-product-name"); if (pn) { pn.value = ""; pn.classList.add("hidden"); pn.required = false; }
  var ps = document.getElementById("fu-product-sel"); if (ps) ps.value = "";
  var fq = document.getElementById("fu-qty"); if (fq) fq.value = "";
  var ft = document.getElementById("fu-print-time"); if (ft) ft.value = "";
}

document.getElementById("filament-usage-form").addEventListener("submit", async function(e) {
  e.preventDefault();
  var submitBtn = document.getElementById("fu-submit");
  btnLoad(submitBtn); showLoading(); await yieldUI();

  var _fuProdSel = document.getElementById("fu-product-sel");
  var _fuProdSelVal = _fuProdSel ? _fuProdSel.value : "";
  var productName = (_fuProdSelVal && _fuProdSelVal !== "__new__")
    ? _fuProdSelVal
    : (document.getElementById("fu-product-name").value || "").trim();
  var filamentId  = document.getElementById("fu-filament-sel").value;
  var qty         = parseFloat(document.getElementById("fu-qty").value) || 0;
  var printTime   = parseFloat(document.getElementById("fu-print-time").value) || 0;

  if (!productName || !filamentId || qty <= 0) {
    alert("Preencha produto, filamento e quantidade.");
    hideLoading(); btnUnload(submitBtn); return;
  }

  // Check product not locked (has a sale)
  var soldNames = new Set((localDB.sales || []).map(function(s) { return s.product_name; }));
  if (soldNames.has(productName)) {
    alert("Este produto j\u00e1 possui vendas registradas. N\u00e3o \u00e9 poss\u00edvel adicionar uso a um produto conclu\u00eddo.");
    hideLoading(); btnUnload(submitBtn); return;
  }

  var fil = localDB.filaments.find(function(f) { return f.id === filamentId || f.name === filamentId; });
  if (!fil) { alert("Filamento n\u00e3o encontrado."); hideLoading(); btnUnload(submitBtn); return; }

  // Find or create product
  var prod = (localDB.products || []).find(function(p) { return p.name === productName; });

  if (sb) {
    // 1. Deduct stock
    var newQty = Math.max(0, (parseFloat(fil.quantity) || 0) - qty);
    var { error: stockErr } = await sb.from("filaments").update({ quantity: newQty }).eq("id", fil.id);
    if (stockErr) { showError("Erro ao deduzir estoque.", stockErr); hideLoading(); btnUnload(submitBtn); return; }
    fil.quantity = newQty;

    // 2. Find or create product, merge filaments_info and print_time
    var filInfo = [];
    var existPrintTime = 0;
    if (prod) {
      try { filInfo = prod.filaments_info ? JSON.parse(prod.filaments_info) : []; } catch(ex) {}
      existPrintTime = parseFloat(prod.print_time) || 0;
    }
    // Merge: if same filament_id already present, add qty; else push new entry
    var existing = filInfo.find(function(fi) { return fi.filament_id === fil.id || fi.filament_id === filamentId; });
    if (existing) {
      existing.qty = (parseFloat(existing.qty) || 0) + qty;
    } else {
      filInfo.push({ filament_id: fil.id || filamentId, name: fil.name, color: fil.color || "", qty: qty });
    }
    var newPrintTime = existPrintTime + printTime;
    var prodPayload = { name: productName, filaments_info: JSON.stringify(filInfo), print_time: newPrintTime || null };

    if (prod) {
      var { error: updErr } = await sb.from("products").update(prodPayload).eq("id", prod.id);
      if (updErr) { showError("Erro ao atualizar produto.", updErr); }
      else { prod.filaments_info = prodPayload.filaments_info; prod.print_time = prodPayload.print_time; }
    } else {
      prodPayload.price = 0;
      var { data: newProd, error: insErr } = await sb.from("products").insert(prodPayload).select().single();
      if (insErr) { showError("Erro ao criar produto.", insErr); hideLoading(); btnUnload(submitBtn); return; }
      localDB.products.push(newProd);
    }
    await fetchFilaments();
    await fetchProducts();
  } else {
    // Local fallback
    fil.quantity = Math.max(0, (parseFloat(fil.quantity) || 0) - qty);
    if (!prod) {
      prod = { id: "local-" + Date.now(), name: productName, price: 0, filaments_info: null, print_time: null };
      localDB.products.push(prod);
    }
    var fi2 = []; try { fi2 = prod.filaments_info ? JSON.parse(prod.filaments_info) : []; } catch(ex) {}
    var ex2 = fi2.find(function(fi) { return fi.filament_id === filamentId; });
    if (ex2) { ex2.qty = (parseFloat(ex2.qty)||0) + qty; } else { fi2.push({ filament_id: filamentId, name: fil.name, color: fil.color||"", qty: qty }); }
    prod.filaments_info = JSON.stringify(fi2);
    prod.print_time = (parseFloat(prod.print_time)||0) + printTime || null;
    localDB.save();
  }

  hideLoading(); btnUnload(submitBtn);
  var summary = fil.name + " \u2014 " + qty + "g" + (printTime ? " / " + printTime + "h" : "") + " adicionado(s) a \"" + productName + "\".";
  alert("Uso registrado!\n" + summary);
  prepFilamentUsageForm();
});

var _fuCancel = document.getElementById("fu-cancel");
if (_fuCancel) _fuCancel.addEventListener("click", function() { goBack(); });

// -- Filament edit modal --------------------------------------------------
var _editFilId = null;

function openFilamentEdit(f) {
  _editFilId = f.id || null;
  document.getElementById("edit-fil-name").value = f.name || "";
  document.getElementById("edit-fil-color").value = f.color || "";
  document.getElementById("edit-fil-manufacturer").value = f.manufacturer || "";
  document.getElementById("edit-fil-quantity").value = f.quantity != null ? f.quantity : "";
  document.getElementById("edit-fil-price_per_kg").value = f.price_per_kg != null ? f.price_per_kg : "";
  document.getElementById("edit-fil-photo").value = "";
  document.getElementById("filament-edit-modal").classList.remove("hidden");
  document.getElementById("edit-fil-name").focus();
}

document.getElementById("filament-edit-cancel").addEventListener("click", function() {
  document.getElementById("filament-edit-modal").classList.add("hidden");
});
document.getElementById("filament-edit-modal").addEventListener("click", function(e) {
  if (e.target === this) this.classList.add("hidden");
});

document.getElementById("filament-edit-form").addEventListener("submit", async function(e) {
  e.preventDefault();
  var submitBtn = document.getElementById("edit-fil-submit");
  btnLoad(submitBtn);
  showLoading();
  await yieldUI();
  var updates = {
    name: document.getElementById("edit-fil-name").value.trim(),
    color: document.getElementById("edit-fil-color").value.trim(),
    manufacturer: document.getElementById("edit-fil-manufacturer").value.trim(),
    quantity: parseFloat(document.getElementById("edit-fil-quantity").value) || 0
  };
  var pp = document.getElementById("edit-fil-price_per_kg").value;
  if (pp !== undefined && pp !== null && pp !== "") updates.price_per_kg = parseFloat(pp) || 0;
  var photoFiles = document.getElementById("edit-fil-photo").files;
  if (photoFiles && photoFiles.length) {
    var newPhoto = await uploadFiles(photoFiles, "filament-photos");
    if (newPhoto) updates.photo = newPhoto;
  }
  if (sb && _editFilId) {
    var { error } = await sb.from("filaments").update(updates).eq("id", _editFilId);
    if (error) { showError("Erro ao atualizar filamento.", error); hideLoading(); btnUnload(submitBtn); return; }
  }
  var local = localDB.filaments.find(function(f) { return _editFilId ? f.id === _editFilId : f.name === updates.name; });
  if (local) { Object.assign(local, updates); localDB.save(); }
  await fetchFilaments();
  hideLoading();
  btnUnload(submitBtn);
  document.getElementById("filament-edit-modal").classList.add("hidden");
});

// -- Filament form ---------------------------------------------------------
document.getElementById("filament-form").addEventListener("submit", async function(e) {
  e.preventDefault();
  var submitBtn = e.target.querySelector("[type='submit']");
  btnLoad(submitBtn);
  showLoading();
  await yieldUI();
  var fd = new FormData(e.target);
  var obj = { name: fd.get("name"), color: fd.get("color"), manufacturer: fd.get("manufacturer"), quantity: parseFloat(fd.get("quantity")) || 0, photo: null };
  var pp = fd.get("price_per_kg"); if (pp !== null && pp !== "") obj.price_per_kg = parseFloat(pp) || 0;
  var file = e.target.photo.files;
  if (file && file.length) {
    var photoVal = await uploadFiles(file, "filament-photos");
    if (photoVal) obj.photo = photoVal;
  }
  if (sb) {
    var { error } = await sb.from("filaments").insert(obj);
    if (error) { showError("Erro ao salvar filamento.", error); hideLoading(); btnUnload(submitBtn); return; }
  } else {
    localDB.filaments.push(obj); localDB.save();
  }
  e.target.reset();
  // clear previousSection when saved and go to list
  _previousSection = null;
  await fetchFilaments();
  hideLoading();
  btnUnload(submitBtn);
  alert("Filamento salvo!");
});

// Cancel button on filament form: go back to previous section
var _filCancelBtn = document.getElementById("filament-form-cancel");
if (_filCancelBtn) _filCancelBtn.addEventListener("click", function() { goBack(); });

var _orderCancelBtn = document.getElementById("order-form-cancel");
if (_orderCancelBtn) _orderCancelBtn.addEventListener("click", function() {
  document.getElementById("order-form").reset();
  var oc = document.getElementById("order-usage-items"); if (oc) { oc.innerHTML = ""; addOrderUsageRow(); }
  goBack();
});

async function addFilamentStock(id, name, grams) {
  var newQty;
  if (sb && id) {
    // Lê quantidade atual direto do Supabase para evitar valor desatualizado no cache
    var { data: cur, error: fetchErr } = await sb.from("filaments").select("quantity").eq("id", id).single();
    if (fetchErr || !cur) { showError("Erro ao ler estoque atual.", fetchErr); return; }
    newQty = (parseFloat(cur.quantity) || 0) + grams;
    var { error } = await sb.from("filaments").update({ quantity: newQty }).eq("id", id);
    if (error) { showError("Erro ao atualizar estoque.", error); return; }
  } else {
    var fil0 = localDB.filaments.find(function(f) { return f.name === name; });
    if (!fil0) return;
    newQty = (parseFloat(fil0.quantity) || 0) + grams;
  }
  // Atualiza cache local — busca exclusivamente por id OU por name, nunca os dois juntos
  var fil = localDB.filaments.find(function(f) { return id ? f.id === id : f.name === name; });
  if (fil) { fil.quantity = newQty; localDB.save(); }
  var badge = document.getElementById("badge-" + (id || name));
  if (badge) badge.textContent = newQty + " g";
}

async function deleteFilament(id, name) {
  showLoading();
  await yieldUI();
  if (!id) {
    var idx = localDB.filaments.findIndex(function(f) { return f.name === name; });
    if (idx >= 0) { localDB.filaments.splice(idx, 1); localDB.save(); }
  } else {
    var { data: refs } = await sb.from("sale_items").select("id").eq("filament_id", id).limit(1);
    if (refs && refs.length) { hideLoading(); alert("Não é possível remover: filamento referenciado em vendas."); return; }
    var { error } = await sb.from("filaments").delete().eq("id", id);
    if (error) { showError("Erro ao remover filamento.", error); hideLoading(); return; }
    await fetchFilaments();
  }
  renderFilamentsList();
  hideLoading();
}

// -- Sales form ------------------------------------------------------------
var usageItems = document.getElementById("usage-items");
var salesViewMode = "list";

function prepSaleForm() {
  usageItems.innerHTML = "";
  addUsageRow();
  // Populate customer selector
  var saleCustSel = document.getElementById("sale-customer-sel");
  if (saleCustSel) {
    saleCustSel.innerHTML = "<option value=''>Sem cliente vinculado</option>";
    var sorted = (localDB.customers || []).slice().sort(function(a,b){return (a.name||"" ).localeCompare(b.name||"","pt-BR",{sensitivity:"base"});});
    sorted.forEach(function(c) {
      var o = document.createElement("option"); o.value = c.id;
      o.textContent = c.name + (c.contact ? " ("+c.contact+")" : "");
      saleCustSel.appendChild(o);
    });
    var newOpt = document.createElement("option"); newOpt.value = "__new__"; newOpt.textContent = "+ Novo cliente…";
    saleCustSel.appendChild(newOpt);
    saleCustSel.onchange = function() {
      var wrap = document.getElementById("sale-new-customer-fields");
      if (wrap) wrap.classList.toggle("hidden", saleCustSel.value !== "__new__");
    };
  }
}

function addUsageRow() {
  var row = document.createElement("div"); row.className = "usage-row";
  var sel = document.createElement("select"); sel.name = "filament_id"; sel.style.flex = "1";
  var qty = document.createElement("input"); qty.name = "qty"; qty.type = "number"; qty.step = "0.1"; qty.placeholder = "g usado"; qty.style.width = "110px";
  var delBtn = document.createElement("button"); delBtn.type = "button"; delBtn.innerHTML = trashIcon();
  delBtn.onclick = function() { row.remove(); updateDelVisibility(); };

  var placeholder = document.createElement("option"); placeholder.value = ""; placeholder.text = "Escolha filamento"; sel.appendChild(placeholder);
  var seen = new Set();
  localDB.filaments.slice().sort(function(a, b) {
    var n = (a.name || "").localeCompare(b.name || "", "pt-BR", {sensitivity: "base"});
    return n !== 0 ? n : (a.color || "").localeCompare(b.color || "", "pt-BR", {sensitivity: "base"});
  }).forEach(function(f, i) {
    var key = f.id || f.name || String(i);
    if (seen.has(key)) return; seen.add(key);
    var o = document.createElement("option");
    o.value = f.id || String(i);
    o.text = f.name + " \u2014 " + (f.color || "?") + " (" + (f.quantity || 0) + "g)";
    sel.appendChild(o);
  });

  sel.addEventListener("change", function() {
    if (sel.value && usageItems.lastElementChild === row) addUsageRow();
    updateDelVisibility();
  });

  row.appendChild(sel); row.appendChild(qty); row.appendChild(delBtn);
  usageItems.appendChild(row);
  updateDelVisibility();
}

function updateDelVisibility() {
  var rows = usageItems.querySelectorAll("div");
  rows.forEach(function(r) { var b = r.querySelector("button"); if (b) b.style.display = rows.length > 1 ? "inline-block" : "none"; });
}

document.getElementById("sale-form").addEventListener("submit", async function(e) {
  e.preventDefault();
  var submitBtn = e.target.querySelector("[type='submit']");
  btnLoad(submitBtn);
  showLoading();
  await yieldUI();
  var fd = new FormData(e.target);
  var product_name = fd.get("product_name");
  var price = parseFloat(fd.get("price")) || 0;
  var notes = fd.get("notes") || "";

  // Resolve customer_id (optional)
  var saleCustSel = document.getElementById("sale-customer-sel");
  var _saleCustId = saleCustSel ? saleCustSel.value : "";
  var saleCustomerId = null;
  if (_saleCustId === "__new__") {
    var _scName = (document.getElementById("sale-new-cust-name") || {}).value || "";
    var _scContact = (document.getElementById("sale-new-cust-contact") || {}).value || "";
    if (_scName.trim() && sb) {
      var _scIns = await sb.from("customers").insert({ name: _scName.trim(), contact: _scContact.trim() }).select().single();
      if (!_scIns.error) { saleCustomerId = _scIns.data.id; await fetchCustomers(); }
    }
  } else if (_saleCustId) {
    saleCustomerId = _saleCustId;
  }

  var usages = [];
  usageItems.querySelectorAll("div").forEach(function(r) {
    var s = r.querySelector("select"); var q = r.querySelector("input");
    if (s && s.value && q && q.value) usages.push({ filament_id: s.value, qty: parseFloat(q.value) || 0 });
  });
  var noDeduct = document.getElementById("sale-no-deduct") && document.getElementById("sale-no-deduct").checked;

  if (sb) {
    var ins = await sb.from("sales").insert({ product_name: product_name, price: price, notes: notes, customer_id: saleCustomerId, created_at: new Date().toISOString() }).select().single();
    var saleData;
    if (ins.error) {
      if (String(ins.error.message).indexOf("notes") >= 0 || String(ins.error.message).indexOf("customer_id") >= 0) {
        var ins2 = await sb.from("sales").insert({ product_name: product_name, price: price, created_at: new Date().toISOString() }).select().single();
        if (ins2.error) { showError("Erro ao inserir venda.", ins2.error); hideLoading(); btnUnload(submitBtn); return; }
        saleData = ins2.data;
      } else { showError("Erro ao inserir venda.", ins.error); hideLoading(); btnUnload(submitBtn); return; }
    } else { saleData = ins.data; }

    var productFile = e.target.product_photo.files;
    var productPhoto = null;
    if (productFile && productFile.length) {
      productPhoto = await uploadFiles(productFile, "product-photos");
    }

    for (var i = 0; i < usages.length; i++) {
      var u = usages[i];
      var fil = localDB.filaments.find(function(f) { return f.id === u.filament_id; });
      if (fil && fil.id) {
        await sb.from("sale_items").insert({ sale_id: saleData.id, filament_id: fil.id, qty_used: u.qty });
        if (!noDeduct) {
          var newQty = Math.max(0, (parseFloat(fil.quantity) || 0) - u.qty);
          await sb.from("filaments").update({ quantity: newQty }).eq("id", fil.id);
          fil.quantity = newQty;
        }
      }
    }

    var existRes = await sb.from("products").select("id,filaments_info").eq("name", product_name).limit(1);
    var existProd = existRes.data;
    var _saleFilJson = usages.length ? JSON.stringify(usages.map(function(u) {
      var _ff = localDB.filaments.find(function(f) { return f.id === u.filament_id; });
      return { filament_id: u.filament_id, name: _ff ? _ff.name : "", color: _ff ? (_ff.color||"") : "", qty: u.qty };
    })) : null;
    if (!existProd || !existProd.length) {
      var prodObj = { name: product_name, price: price };
      if (productPhoto) prodObj.photo = productPhoto;
      if (_saleFilJson) prodObj.filaments_info = _saleFilJson;
      await sb.from("products").insert(prodObj);
    } else {
      var _prodUpd = {};
      if (productPhoto) _prodUpd.photo = productPhoto;
      if (_saleFilJson && !existProd[0].filaments_info) _prodUpd.filaments_info = _saleFilJson;
      if (Object.keys(_prodUpd).length) await sb.from("products").update(_prodUpd).eq("id", existProd[0].id);
    }

    await refreshAll();
  } else {
    localDB.sales.push({ product_name: product_name, price: price, notes: notes, created_at: new Date().toISOString(), usages: usages });
    var _lsProd = localDB.products.find(function(p) { return p.name === product_name; });
    var _lsFilJson = usages.length ? JSON.stringify(usages.map(function(u) {
      var _ff = localDB.filaments.find(function(f) { return f.id === u.filament_id || f.name === u.filament_id; });
      return { filament_id: u.filament_id, name: _ff ? _ff.name : "", color: _ff ? (_ff.color||"") : "", qty: u.qty };
    })) : null;
    if (!_lsProd) { var _newP = { name: product_name, price: price }; if (_lsFilJson) _newP.filaments_info = _lsFilJson; localDB.products.push(_newP); }
    else if (_lsFilJson && !_lsProd.filaments_info) { _lsProd.filaments_info = _lsFilJson; }
    if (!noDeduct) {
      usages.forEach(function(u) { var f = localDB.filaments.find(function(x) { return x.id === u.filament_id || x.name === u.filament_id; }); if (f) f.quantity = Math.max(0, (f.quantity || 0) - u.qty); });
    }
    localDB.save();
  }

  e.target.reset();
  usageItems.innerHTML = ""; addUsageRow();
  hideLoading();
  btnUnload(submitBtn);
  alert("Venda registrada!");
});

var _saleCancelBtn = document.getElementById("sale-form-cancel");
if (_saleCancelBtn) _saleCancelBtn.addEventListener("click", function() {
  document.getElementById("sale-form").reset();
  usageItems.innerHTML = ""; addUsageRow();
  var snf = document.getElementById("sale-new-customer-fields"); if (snf) snf.classList.add("hidden");
  goBack();
});

document.getElementById("save-as-order").onclick = async function() {
  var btn = this;
  var fd = new FormData(document.getElementById("sale-form"));
  var product_name = fd.get("product_name");
  var price = parseFloat(fd.get("price")) || 0;
  var notes = fd.get("notes") || "";
  if (!product_name) { alert("Preencha o nome do produto."); return; }
  var usageList = [];
  usageItems.querySelectorAll("div").forEach(function(r) {
    var s = r.querySelector("select"); var q = r.querySelector("input");
    if (s && s.value && q && q.value) usageList.push({ filament_id: s.value, qty_needed: parseFloat(q.value) || 0 });
  });
  if (!usageList.length) { alert("Selecione pelo menos um filamento."); return; }
  btnLoad(btn); showLoading(); await yieldUI();
  if (sb) {
    var ins = await sb.from("orders").insert({ product_name: product_name, price: price, notes: notes, status: "pendente", created_at: new Date().toISOString() }).select().single();
    if (ins.error) { showError("Erro ao criar encomenda.", ins.error); hideLoading(); btnUnload(btn); return; }
    var orderId = ins.data.id;
    for (var i = 0; i < usageList.length; i++) {
      await sb.from("order_items").insert({ order_id: orderId, filament_id: usageList[i].filament_id, qty_needed: usageList[i].qty_needed });
    }
    await fetchOrders(); await fetchOrderItems();
  } else {
    var order = { id: "local-" + Date.now(), product_name: product_name, price: price, notes: notes, status: "pendente", created_at: new Date().toISOString() };
    localDB.orders.push(order);
    usageList.forEach(function(u) { localDB.order_items.push({ order_id: order.id, filament_id: u.filament_id, qty_needed: u.qty_needed }); });
    localDB.save();
  }
  document.getElementById("sale-form").reset();
  usageItems.innerHTML = ""; addUsageRow();
  hideLoading(); btnUnload(btn);
  appNav.querySelectorAll("button[data-sec]").forEach(function(b) { b.classList.remove("active"); });
  var ob = appNav ? appNav.querySelector("[data-sec='sec-orders']") : null; if (ob) ob.classList.add("active");
  renderOrders();
  showSection("sec-orders");
  alert("Encomenda criada!");
};

// -- Sales list render -----------------------------------------------------
function renderSales() {
  var listEl  = document.getElementById("sales-list");
  var tableEl = document.getElementById("sales-table");
  listEl.innerHTML = ""; tableEl.innerHTML = "";
  var q = (document.getElementById("sales-search").value || "").toLowerCase().trim();
  var rows = (localDB.sales || []).slice().reverse().filter(function(s) {
    if (!q) return true;
    return (s.product_name||"").toLowerCase().includes(q)||(s.notes||"").toLowerCase().includes(q);
  });

  if (salesViewMode === "list") {
    listEl.style.display = "flex"; tableEl.style.display = "none";
    rows.forEach(function(s) {
      var d = document.createElement("div"); d.className = "item";
      var prod = localDB.products.find(function(p) { return p.name === s.product_name; });
      var img = document.createElement("img"); img.alt = ""; img.src = BLANK; img.style.cursor = "pointer";
      var sPhoto = prod ? prod.photo : null; var sBucket = "product-photos";
      if (sPhoto) {
        resolvePhotoUrl(sPhoto, sBucket).then(function(u) {
          if (u) { img.src = u; img.onclick = function() { resolveAllPhotoUrls(sPhoto, sBucket).then(function(urls) { openLightbox(urls, 0); }); }; }
        }).catch(function() {});
      }
      d.appendChild(img);
      var info = document.createElement("div"); info.className = "item-info";
      var sCust = s.customer_id ? (localDB.customers || []).find(function(c) { return c.id === s.customer_id; }) : null;
      var custHtml = sCust ? "<div class='muted' style='font-size:12px;margin-top:2px'>👤 " + sCust.name + (sCust.contact ? " &middot; " + sCust.contact : "") + "</div>" : "";
      info.innerHTML = "<strong>" + s.product_name + "</strong><div class='muted'>R$ " + parseFloat(s.price).toFixed(2) + " &middot; " + new Date(s.created_at).toLocaleString() + "</div>" + custHtml + (s.notes ? "<div class='muted'>" + s.notes + "</div>" : "");
      var acts = document.createElement("div"); acts.className = "item-actions";
      var del = document.createElement("button"); del.textContent = "Apagar";
      var sCopy = s;
      del.onclick = async function() { if (confirm("Confirma exclusão desta venda?")) await deleteSale(sCopy.id); };
      var reuse = document.createElement("button"); reuse.textContent = "Reaproveitar";
      reuse.onclick = async function() { btnLoad(reuse); await reuseSale(sCopy); };
      acts.appendChild(del); acts.appendChild(reuse);
      d.appendChild(info); d.appendChild(acts);
      listEl.appendChild(d);
    });
  } else {
    listEl.style.display = "none"; tableEl.style.display = "block";
    var tbl = document.createElement("table"); tbl.style.cssText = "width:100%;border-collapse:collapse";
    tbl.innerHTML = "<thead><tr><th></th><th>Data</th><th>Produto</th><th>Preço</th><th>Cliente</th><th>Obs.</th><th>Ações</th></tr></thead>";
    var tbody = document.createElement("tbody");
    rows.forEach(function(s) {
      var tr = document.createElement("tr"); tr.style.borderBottom = "1px solid #333";
      // photo cell
      var tdPhoto = document.createElement("td"); tdPhoto.style.padding = "4px 6px 4px 0";
      var tImg = document.createElement("img"); tImg.alt = s.product_name;
      tImg.style.cssText = "width:40px;height:40px;border-radius:6px;object-fit:cover;background:#1e293b;vertical-align:middle;display:block";
      var sProd = localDB.products.find(function(p) { return p.name === s.product_name; });
      if (sProd && sProd.photo) {
        resolvePhotoUrl(sProd.photo, "product-photos").then(function(u) { if (u) tImg.src = u; }).catch(function() {});
      }
      tdPhoto.appendChild(tImg); tr.appendChild(tdPhoto);
      // text cells
      var tCust = s.customer_id ? (localDB.customers || []).find(function(c) { return c.id === s.customer_id; }) : null;
      [[new Date(s.created_at).toLocaleString(), s.product_name, "R$ " + s.price, tCust ? tCust.name : "—", s.notes || ""]].forEach(function(arr) {
        arr.forEach(function(text) { var td = document.createElement("td"); td.textContent = text; tr.appendChild(td); });
      });
      var td = document.createElement("td");
      var del = document.createElement("button"); del.textContent = "Apagar";
      var sCopy = s;
      del.onclick = async function() { if (confirm("Confirma exclusão?")) await deleteSale(sCopy.id); };
      var reuse = document.createElement("button"); reuse.textContent = "Reaproveitar";
      reuse.onclick = async function() { btnLoad(reuse); await reuseSale(sCopy); };
      td.appendChild(del); td.appendChild(reuse); tr.appendChild(td); tbody.appendChild(tr);
    });
    tbl.appendChild(tbody); tableEl.appendChild(tbl);
  }
}

async function deleteSale(saleId) {
  if (!saleId) return;
  showLoading();
  await yieldUI();
  var { error } = await sb.from("sales").delete().eq("id", saleId);
  if (error) { showError("Erro ao remover venda.", error); hideLoading(); return; }
  await refreshAll();
  renderSales();
  hideLoading();
}

async function reuseSale(sale) {
  showLoading();
  await fetchFilaments();
  appNav.querySelectorAll("button[data-sec]").forEach(function(b) { b.classList.remove("active"); });
  var vb = appNav ? appNav.querySelector("[data-sec='sec-sales-register']") : null; if (vb) vb.classList.add("active");
  showSection("sec-sales-register");
  prepSaleForm();
  document.querySelector("[name='product_name']").value = sale.product_name || "";
  document.querySelector("[name='price']").value = sale.price || "";
  var notesEl = document.querySelector("[name='notes']"); if (notesEl) notesEl.value = sale.notes || "";
  // Re-populate filaments from sale_items
  var saleItems = (localDB.sale_items || []).filter(function(i) { return i.sale_id === sale.id; });
  if (saleItems.length) {
    usageItems.innerHTML = "";
    saleItems.forEach(function(si) {
      addUsageRow();
      var lastRow = usageItems.lastElementChild;
      var s = lastRow.querySelector("select"); var q = lastRow.querySelector("input");
      if (s) s.value = si.filament_id || "";
      if (q) q.value = si.qty_used || si.qty || "";
    });
    addUsageRow(); updateDelVisibility();
  }
  hideLoading();
}

// -- Products render -------------------------------------------------------
function renderProducts() {
  var el = document.getElementById("products-list"); el.innerHTML = "";
  var q = (document.getElementById("products-search").value || "").toLowerCase().trim();
  var rows = localDB.products.filter(function(p) {
    if (!q) return true;
    return (p.name||"").toLowerCase().includes(q);
  });
  rows.forEach(function(p) {
    var d = document.createElement("div"); d.className = "item product-item";
    d.addEventListener("click", function(e) {
      if (e.target.closest("button") || e.target.closest("a")) return;
      d.classList.toggle("expanded");
    });
    var img = document.createElement("img"); img.alt = ""; img.src = BLANK; img.style.cursor = "pointer";
    var pPhoto = p.photo; var pBucket = "product-photos";
    resolvePhotoUrl(pPhoto, pBucket).then(function(u) {
      if (u) { img.src = u; img.onclick = function() { resolveAllPhotoUrls(pPhoto, pBucket).then(function(urls) { openLightbox(urls, 0); }); }; }
    }).catch(function() {});
    var info = document.createElement("div"); info.className = "item-info";
    var filChipsHtml = "";
    if (p.filaments_info) {
      var filArr = []; try { filArr = JSON.parse(p.filaments_info); } catch(e) {}
      if (filArr.length) filChipsHtml = "<div class='fil-chips'>" + filArr.map(function(f) { return "<span class='fil-chip'>" + (f.color || f.name || "") + ": " + (f.qty || 0) + "g</span>"; }).join("") + "</div>";
    }
    var _pNameNorm = (p.name || "").trim().toLowerCase();
    var hasSale = (localDB.sales || []).some(function(s) { return (s.product_name || "").trim().toLowerCase() === _pNameNorm; });
    var underConstructionBadge = (!hasSale && p.filaments_info) ? "<span class='badge-construction'>\uD83D\uDD27 Em constru\u00e7\u00e3o</span>" : "";
    info.innerHTML = "<strong>" + p.name + "</strong>" + underConstructionBadge + "<div class='muted'>R$ " + parseFloat(p.price || 0).toFixed(2) + "</div>" + filChipsHtml;
    var acts = document.createElement("div"); acts.className = "item-actions";
    var pCopy = p;

    // "Ver fotos" button — large tap target, useful on mobile
    if (pCopy.photo) {
      var verFotosBtn = document.createElement("button");
      verFotosBtn.textContent = "📷 Ver fotos";
      verFotosBtn.title = "Ver fotos do produto";
      verFotosBtn.onclick = function(e) {
        e.stopPropagation();
        resolveAllPhotoUrls(pCopy.photo, "product-photos").then(function(urls) {
          if (urls.length) openLightbox(urls, 0);
          else alert("Sem fotos disponíveis.");
        });
      };
      acts.appendChild(verFotosBtn);
    }

    var prontaBtn = document.createElement("button");
    prontaBtn.textContent = "Peça pronta";
    prontaBtn.title = "Registrar venda de peça já impressa \u2014 estoque não é alterado";
    prontaBtn.onclick = async function() {
      if (!confirm("Registrar venda de \"" + pCopy.name + "\" (R$ " + parseFloat(pCopy.price || 0).toFixed(2) + ")? O estoque NÃO será alterado.")) return;
      btnLoad(prontaBtn); showLoading(); await yieldUI();
      if (sb) {
        var ins = await sb.from("sales").insert({ product_name: pCopy.name, price: pCopy.price || 0, notes: "Peça pronta", created_at: new Date().toISOString() }).select().single();
        if (ins.error) {
          var ins2 = await sb.from("sales").insert({ product_name: pCopy.name, price: pCopy.price || 0, created_at: new Date().toISOString() }).select().single();
          if (ins2.error) { showError("Erro ao registrar venda.", ins2.error); hideLoading(); btnUnload(prontaBtn); return; }
        }
        await fetchSales();
      } else {
        localDB.sales.push({ product_name: pCopy.name, price: pCopy.price || 0, notes: "Peça pronta", created_at: new Date().toISOString() });
        localDB.save();
      }
      hideLoading(); btnUnload(prontaBtn);
      alert("Venda registrada! Estoque não alterado.");
    };

    var venderBtn = document.createElement("button"); venderBtn.textContent = "Imprimir e vender";
    venderBtn.title = "Preenche o formulário de venda \u2014 dá baixa no estoque ao confirmar";
    venderBtn.onclick = async function() {
      btnLoad(venderBtn); showLoading(); await yieldUI();
      await fetchFilaments();
      appNav.querySelectorAll("button[data-sec]").forEach(function(b) { b.classList.remove("active"); });
      var vb = appNav ? appNav.querySelector("[data-sec='sec-sales-register']") : null; if (vb) vb.classList.add("active");
      showSection("sec-sales-register"); prepSaleForm();
      document.querySelector("[name='product_name']").value = pCopy.name;
      document.querySelector("[name='price']").value = pCopy.price || "";
      // auto-fill filaments from product
      var prodFil = []; try { prodFil = pCopy.filaments_info ? JSON.parse(pCopy.filaments_info) : []; } catch(e) {}
      if (prodFil.length) {
        usageItems.innerHTML = "";
        prodFil.forEach(function(f) {
          addUsageRow();
          var lastRow = usageItems.lastElementChild;
          var s = lastRow.querySelector("select"); var q = lastRow.querySelector("input");
          if (s) s.value = f.filament_id || f.name || "";
          if (q) q.value = f.qty || "";
        });
        addUsageRow(); updateDelVisibility();
      }
      hideLoading();
    };

    var encomendar = document.createElement("button"); encomendar.textContent = "Encomendar";
    encomendar.onclick = async function() {
      btnLoad(encomendar); showLoading(); await yieldUI();
      await fetchFilaments(); await fetchOrders(); await fetchOrderItems();
      appNav.querySelectorAll("button[data-sec]").forEach(function(b) { b.classList.remove("active"); });
      var ob = appNav ? appNav.querySelector("[data-sec='sec-orders']") : null; if (ob) ob.classList.add("active");
      prepOrderForm();
      renderOrders();
      showSection("sec-orders");
      var pnEl = document.querySelector("#order-form [name='product_name']");
      var prEl = document.querySelector("#order-form [name='price']");
      if (pnEl) pnEl.value = pCopy.name;
      if (prEl) prEl.value = pCopy.price || "";
      // Pre-fill filaments from product catalog
      var prodFil2 = []; try { prodFil2 = pCopy.filaments_info ? JSON.parse(pCopy.filaments_info) : []; } catch(e) {}
      if (prodFil2.length) {
        var orderContainer = document.getElementById("order-usage-items");
        if (orderContainer) {
          orderContainer.innerHTML = "";
          prodFil2.forEach(function(f) {
            addOrderUsageRow();
            var lastRow = orderContainer.lastElementChild;
            var s = lastRow.querySelector("select"); var q = lastRow.querySelector("input[type='number']");
            if (s) s.value = f.filament_id || f.name || "";
            if (q) q.value = f.qty || "";
          });
          addOrderUsageRow(); updateOrderDelVisibility();
        }
      }
      hideLoading();
    };

    var editBtn = document.createElement("button"); editBtn.textContent = "Editar";
    editBtn.onclick = function(e) { e.stopPropagation(); openProductEdit(pCopy); };

    var dupBtn = document.createElement("button"); dupBtn.textContent = "Duplicar";
    dupBtn.title = "Cria uma cópia deste produto para ajustar quantidades";
    dupBtn.onclick = function(e) {
      e.stopPropagation();
      openProductEdit(Object.assign({}, pCopy, { id: null, name: pCopy.name + " (cópia)" }));
    };

    var delBtn = document.createElement("button"); delBtn.textContent = "Remover";
    delBtn.onclick = async function() {
      if (!confirm("Remover \"" + pCopy.name + "\"?")) return;
      if (sb) {
        showLoading();
        var { error } = await sb.from("products").delete().eq("id", pCopy.id);
        if (error) { showError("Erro ao remover produto.", error); } else { await fetchProducts(); renderProducts(); }
        hideLoading();
      } else {
        var idx = localDB.products.findIndex(function(x) { return x.name === pCopy.name; });
        if (idx >= 0) { localDB.products.splice(idx, 1); localDB.save(); renderProducts(); }
      }
    };

    acts.appendChild(prontaBtn); acts.appendChild(venderBtn); acts.appendChild(encomendar); acts.appendChild(editBtn); acts.appendChild(dupBtn); acts.appendChild(delBtn);
    d.appendChild(img); d.appendChild(info); d.appendChild(acts);
    el.appendChild(d);
  });
}

// -- Product catalog form --------------------------------------------------
function addProductUsageRow() {
  var container = document.getElementById("product-usage-items");
  var row = document.createElement("div"); row.className = "usage-row";
  var sel = document.createElement("select"); sel.style.flex = "1";
  var qty = document.createElement("input"); qty.type = "number"; qty.step = "0.1"; qty.placeholder = "g utilizado"; qty.style.width = "110px";
  var delBtn = document.createElement("button"); delBtn.type = "button"; delBtn.innerHTML = trashIcon();
  var placeholder = document.createElement("option"); placeholder.value = ""; placeholder.text = "Escolha filamento"; sel.appendChild(placeholder);
  var seen = new Set();
  localDB.filaments.sort(function(a,b){return (a.name||"").localeCompare(b.name||"","pt-BR",{sensitivity:"base"});}).forEach(function(f) {
    var key = f.id || f.name; if (seen.has(key)) return; seen.add(key);
    var o = document.createElement("option");
    o.value = f.id || f.name;
    o.text = f.name + " \u2014 " + (f.color || "?") + " (" + (f.quantity || 0) + "g)";
    sel.appendChild(o);
  });
  sel.addEventListener("change", function() {
    if (sel.value && container.lastElementChild === row) addProductUsageRow();
    updateProductDelVisibility(); updateProductTotalGrams();
  });
  qty.addEventListener("input", function() { updateProductTotalGrams(); });
  delBtn.onclick = function() { row.remove(); updateProductDelVisibility(); updateProductTotalGrams(); };
  row.appendChild(sel); row.appendChild(qty); row.appendChild(delBtn);
  container.appendChild(row);
  updateProductDelVisibility();
}

function computeSuggestedPrice() {
  var totalMat = 0;
  var fallbackCost = appSettings.matCostPerKg || DEFAULT_MAT_COST_PER_KG;
  document.querySelectorAll("#product-usage-items .usage-row").forEach(function(row) {
    var s = row.querySelector("select"); var q = row.querySelector("input[type='number']");
    if (!s || !s.value || !q || !q.value) return;
    var fil = localDB.filaments.find(function(f){ return f.id===s.value || f.name===s.value; }) || {};
    var pricePerKg = fil.price_per_kg || fil.cost_per_kg || fil.cost || fallbackCost;
    totalMat += (parseFloat(q.value)||0) / 1000 * (parseFloat(pricePerKg)||fallbackCost);
  });
  var ptEl = document.querySelector("[name='prod_print_time']");
  var pt = ptEl && ptEl.value ? parseFloat(ptEl.value)||0 : 0;
  // apply product-level filament multiplier (defaults to 1)
  var multEl = document.querySelector("[name='prod_multiplier']");
  var mult = (multEl && multEl.value) ? (parseFloat(multEl.value) || appSettings.defaultMultiplier || 1) : (appSettings.defaultMultiplier || 1);
  totalMat = totalMat * mult;
  var timeCost = pt * (appSettings.hourlyRate || DEFAULT_HOURLY_RATE);
  var base = totalMat + timeCost;
  var suggested = base * (1 + (appSettings.margin != null ? appSettings.margin : DEFAULT_MARGIN));
  var el = document.getElementById("product-price-suggestion");
  if (el) el.textContent = "Sugestão: R$ " + suggested.toFixed(2).replace('.', ',');
  return suggested;
}

function computeSuggestedPriceForEdit() {
  var totalMat = 0;
  var fallbackCost = appSettings.matCostPerKg || DEFAULT_MAT_COST_PER_KG;
  document.querySelectorAll("#edit-prod-usage-items .usage-row").forEach(function(row) {
    var s = row.querySelector("select"); var q = row.querySelector("input[type='number']");
    if (!s || !s.value || !q || !q.value) return;
    var fil = localDB.filaments.find(function(f){ return f.id===s.value || f.name===s.value; }) || {};
    var pricePerKg = fil.price_per_kg || fil.cost_per_kg || fil.cost || fallbackCost;
    totalMat += (parseFloat(q.value)||0) / 1000 * (parseFloat(pricePerKg)||fallbackCost);
  });
  var ptEl = document.getElementById("edit-prod-print-time");
  var pt = ptEl && ptEl.value ? parseFloat(ptEl.value)||0 : 0;
  var multEl = document.getElementById('edit-prod-multiplier');
  var mult = (multEl && multEl.value) ? (parseFloat(multEl.value) || appSettings.defaultMultiplier || 1) : (appSettings.defaultMultiplier || 1);
  totalMat = totalMat * mult;
  var timeCost = pt * (appSettings.hourlyRate || DEFAULT_HOURLY_RATE);
  var base = totalMat + timeCost;
  var suggested = base * (1 + (appSettings.margin != null ? appSettings.margin : DEFAULT_MARGIN));
  var el = document.getElementById("edit-prod-price-suggestion");
  if (el) el.textContent = "Sugestão: R$ " + suggested.toFixed(2).replace('.', ',');
  return suggested;
}

function updateProductDelVisibility() {
  var rows = document.querySelectorAll("#product-usage-items .usage-row");
  rows.forEach(function(r) { var b = r.querySelector("button"); if (b) b.style.display = rows.length > 1 ? "inline-block" : "none"; });
}

function updateProductTotalGrams() {
  var total = 0;
  document.querySelectorAll("#product-usage-items .usage-row").forEach(function(row) {
    var q = row.querySelector("input[type='number']"); if (q && q.value) total += parseFloat(q.value) || 0;
  });
  var el = document.getElementById("product-total-grams");
  if (el) el.textContent = "Total utilizado: " + total.toFixed(1) + " g";
  computeSuggestedPrice();
}

function addProductEditUsageRow(preFilId, preQty) {
  var container = document.getElementById("edit-prod-usage-items");
  var row = document.createElement("div"); row.className = "usage-row";
  var sel = document.createElement("select"); sel.style.flex = "1";
  var qty = document.createElement("input"); qty.type = "number"; qty.step = "0.1"; qty.placeholder = "g utilizado"; qty.style.width = "110px";
  var delBtn = document.createElement("button"); delBtn.type = "button"; delBtn.innerHTML = trashIcon();
  var placeholder = document.createElement("option"); placeholder.value = ""; placeholder.text = "Escolha filamento"; sel.appendChild(placeholder);
  var seen = new Set();
  localDB.filaments.sort(function(a,b){return (a.name||"").localeCompare(b.name||"","pt-BR",{sensitivity:"base"});}).forEach(function(f) {
    var key = f.id || f.name; if (seen.has(key)) return; seen.add(key);
    var o = document.createElement("option");
    o.value = f.id || f.name;
    o.text = f.name + " \u2014 " + (f.color || "?") + " (" + (f.quantity || 0) + "g)";
    sel.appendChild(o);
  });
  if (preFilId) sel.value = preFilId;
  if (preQty) qty.value = preQty;
  qty.addEventListener("input", function() { updateEditProductTotalGrams(); });
  sel.addEventListener("change", function() {
    if (sel.value && container.lastElementChild === row) addProductEditUsageRow();
    updateEditProductDelVisibility(); updateEditProductTotalGrams();
  });
  delBtn.onclick = function() { row.remove(); updateEditProductDelVisibility(); updateEditProductTotalGrams(); };
  row.appendChild(sel); row.appendChild(qty); row.appendChild(delBtn);
  container.appendChild(row);
  updateEditProductDelVisibility(); updateEditProductTotalGrams();
}

function updateEditProductDelVisibility() {
  var rows = document.querySelectorAll("#edit-prod-usage-items .usage-row");
  rows.forEach(function(r) { var b = r.querySelector("button"); if (b) b.style.display = rows.length > 1 ? "inline-block" : "none"; });
}

function updateEditProductTotalGrams() {
  var total = 0;
  document.querySelectorAll("#edit-prod-usage-items .usage-row").forEach(function(row) {
    var q = row.querySelector("input[type='number']"); if (q && q.value) total += parseFloat(q.value) || 0;
  });
  var el = document.getElementById("edit-prod-total-grams");
  if (el) el.textContent = "Total: " + total.toFixed(1) + " g";
  computeSuggestedPriceForEdit();
}

document.getElementById("product-form-toggle").addEventListener("click", function() {
  var wrap = document.getElementById("product-form-wrap");
  var nowHidden = wrap.classList.toggle("hidden");
  this.textContent = nowHidden ? "+ Cadastrar produto" : "\u2715 Cancelar cadastro";
  if (!nowHidden && !document.getElementById("product-usage-items").children.length) addProductUsageRow();
  // update suggestion when opening
  setTimeout(function(){ updateProductTotalGrams(); }, 20);
});

var _prodFormCancel = document.getElementById("product-form-cancel");
if (_prodFormCancel) _prodFormCancel.addEventListener("click", function() {
  document.getElementById("product-form").reset();
  document.getElementById("product-usage-items").innerHTML = "";
  addProductUsageRow();
  var ps = document.getElementById("product-price-suggestion"); if (ps) ps.textContent = "Sugestão: R$ 0,00";
  var pgs = document.getElementById("product-total-grams"); if (pgs) pgs.textContent = "Total utilizado: 0 g";
  document.getElementById("product-form-wrap").classList.add("hidden");
  document.getElementById("product-form-toggle").textContent = "+ Cadastrar produto";
});

document.getElementById("product-form").addEventListener("submit", async function(e) {
  e.preventDefault();
  var submitBtn = document.getElementById("product-form-submit");
  btnLoad(submitBtn); showLoading(); await yieldUI();
  var name = e.target.prod_name.value.trim();
  var price = parseFloat(e.target.prod_price.value) || 0;
  var printTime = e.target.prod_print_time.value ? (parseFloat(e.target.prod_print_time.value) || null) : null;
  var multiplier = e.target.prod_multiplier && e.target.prod_multiplier.value ? (parseFloat(e.target.prod_multiplier.value) || appSettings.defaultMultiplier || 1) : (appSettings.defaultMultiplier || 1);
  var filInfo = [];
  document.querySelectorAll("#product-usage-items .usage-row").forEach(function(row) {
    var sel = row.querySelector("select"); var qty = row.querySelector("input");
    if (!sel || !sel.value || !qty || !qty.value) return;
    var fil = localDB.filaments.find(function(f) { return f.id === sel.value || f.name === sel.value; });
    filInfo.push({ filament_id: sel.value, name: fil ? fil.name : sel.value, color: fil ? (fil.color || "") : "", qty: parseFloat(qty.value) || 0 });
  });
  var photoFiles = e.target.prod_photo.files;
  var photoVal = null;
  if (photoFiles && photoFiles.length) { photoVal = await uploadFiles(photoFiles, "product-photos"); }
  var obj = { name: name, price: price, print_time: printTime, filaments_info: filInfo.length ? JSON.stringify(filInfo) : null, multiplier: multiplier };
  if (photoVal) obj.photo = photoVal;
  if (sb) {
    var { error } = await sb.from("products").insert(obj);
    if (error) { showError("Erro ao salvar produto.", error); hideLoading(); btnUnload(submitBtn); return; }
    await fetchProducts();
  } else {
    obj.id = "local-" + Date.now();
    localDB.products.push(obj); localDB.save();
  }
  e.target.reset();
  document.getElementById("product-usage-items").innerHTML = "";
  addProductUsageRow();
  // reset suggestion
  var ps = document.getElementById("product-price-suggestion"); if (ps) ps.textContent = "Sugestão: R$ 0,00";
  var pgs = document.getElementById("product-total-grams"); if (pgs) pgs.textContent = "Total utilizado: 0 g";
  document.getElementById("product-form-wrap").classList.add("hidden");
  document.getElementById("product-form-toggle").textContent = "+ Cadastrar produto";
  hideLoading(); btnUnload(submitBtn);
  renderProducts();
  alert("Produto cadastrado!");
});

// -- Product edit modal ---------------------------------------------------
var _editProdId = null;
function openProductEdit(p) {
  _editProdId = p.id || null;
  document.getElementById("edit-prod-name").value = p.name || "";
  document.getElementById("edit-prod-price").value = p.price || "";
  document.getElementById("edit-prod-print-time").value = p.print_time || "";
  document.getElementById("edit-prod-multiplier").value = p.multiplier != null ? p.multiplier : 1;
  var container = document.getElementById("edit-prod-usage-items");
  container.innerHTML = "";
  var filArr = [];
  if (p.filaments_info) { try { filArr = JSON.parse(p.filaments_info); } catch(e) {} }
  filArr.forEach(function(f) { addProductEditUsageRow(f.filament_id, f.qty); });
  addProductEditUsageRow();
  updateEditProductTotalGrams();
  document.getElementById("product-edit-modal").classList.remove("hidden");
  document.getElementById("edit-prod-name").focus();
}
document.getElementById("product-edit-cancel").addEventListener("click", function() {
  document.getElementById("product-edit-modal").classList.add("hidden");
});
document.getElementById("product-edit-modal").addEventListener("click", function(e) {
  if (e.target === this) this.classList.add("hidden");
});
document.getElementById("product-edit-form").addEventListener("submit", async function(e) {
  e.preventDefault();
  var submitBtn = document.getElementById("edit-prod-submit");
  btnLoad(submitBtn); showLoading(); await yieldUI();
  var name  = document.getElementById("edit-prod-name").value.trim();
  var price = parseFloat(document.getElementById("edit-prod-price").value) || 0;
  var ptVal = document.getElementById("edit-prod-print-time").value;
  var pTime = ptVal ? (parseFloat(ptVal) || null) : null;
  var filInfo = [];
  document.querySelectorAll("#edit-prod-usage-items .usage-row").forEach(function(row) {
    var sel = row.querySelector("select"); var qty = row.querySelector("input[type='number']");
    if (!sel || !sel.value || !qty || !qty.value) return;
    var fil = localDB.filaments.find(function(f) { return f.id === sel.value || f.name === sel.value; });
    filInfo.push({ filament_id: sel.value, name: fil ? fil.name : sel.value, color: fil ? (fil.color || "") : "", qty: parseFloat(qty.value) || 0 });
  });
  var updates = { name: name, price: price, print_time: pTime, filaments_info: filInfo.length ? JSON.stringify(filInfo) : null };
  var pm = document.getElementById('edit-prod-multiplier');
  updates.multiplier = pm && pm.value ? (parseFloat(pm.value) || 1) : 1;
  var photoFiles = document.getElementById("edit-prod-photo").files;
  if (photoFiles && photoFiles.length) { updates.photo = await uploadFiles(photoFiles, "product-photos"); }
  if (sb && _editProdId) {
    var { error } = await sb.from("products").update(updates).eq("id", _editProdId);
    if (error) { showError("Erro ao atualizar produto.", error); btnUnload(submitBtn); hideLoading(); return; }
    await fetchProducts();
  } else if (sb && !_editProdId) {
    // duplicate: insert as new
    var { error: insErr } = await sb.from("products").insert(updates);
    if (insErr) { showError("Erro ao duplicar produto.", insErr); btnUnload(submitBtn); hideLoading(); return; }
    await fetchProducts();
  } else {
    var idx = localDB.products.findIndex(function(x){return x.id===_editProdId;});
    if (_editProdId && idx>=0) { Object.assign(localDB.products[idx], updates); }
    else { updates.id = "local-" + Date.now(); localDB.products.push(updates); }
    localDB.save();
  }
  document.getElementById("product-edit-modal").classList.add("hidden");
  renderProducts();
  btnUnload(submitBtn); hideLoading();
});

// Settings form handlers
var settingsForm = document.getElementById('settings-form');
if (settingsForm) {
  // initialize inputs
  var iMat = document.getElementById('settings-mat-cost');
  var iHour = document.getElementById('settings-hourly-rate');
  var iMargin = document.getElementById('settings-margin');
    var iDefaultMult = document.getElementById('settings-default-multiplier');
  if (iMat) iMat.value = appSettings.matCostPerKg;
  if (iHour) iHour.value = appSettings.hourlyRate;
  if (iMargin) iMargin.value = appSettings.margin;
    if (iDefaultMult) iDefaultMult.value = appSettings.defaultMultiplier;
  settingsForm.addEventListener('submit', async function(e){
    e.preventDefault();
    if (iMat) appSettings.matCostPerKg = parseFloat(iMat.value) || appSettings.matCostPerKg;
    if (iHour) appSettings.hourlyRate = parseFloat(iHour.value) || appSettings.hourlyRate;
    if (iMargin) appSettings.margin = parseFloat(iMargin.value) || appSettings.margin;
    if (iDefaultMult) appSettings.defaultMultiplier = parseFloat(iDefaultMult.value) || appSettings.defaultMultiplier;
    showLoading();
    var ok = await saveSettings();
    hideLoading();
    if (ok) {
      alert('Configurações salvas');
      navTo('sec-dashboard');
    } else {
      alert('Falha ao salvar nas configurações remotas. Valores foram salvos localmente. Verifique a conexão ou as políticas do Supabase.');
    }
  });
  var sCancel = document.getElementById('settings-cancel'); if (sCancel) sCancel.addEventListener('click', function(){ goBack(); });
}

// Admin actions
var adminRefresh = document.getElementById('admin-refresh'); if (adminRefresh) adminRefresh.addEventListener('click', async function(){ showLoading(); await refreshAll(); hideLoading(); alert('Refresh concluído'); });
var adminClear = document.getElementById('admin-clear-local'); if (adminClear) adminClear.addEventListener('click', function(){ if(confirm('Limpar cache local (localStorage)?')){ localStorage.clear(); alert('localStorage limpo — recarregue a página.'); } });

// Wire multiplier and print time inputs to recalculate dynamically
var prodMultEl = document.querySelector("[name='prod_multiplier']");
if (prodMultEl) prodMultEl.addEventListener('input', function(){ updateProductTotalGrams(); });
var prodPrintTimeEl = document.querySelector("[name='prod_print_time']");
if (prodPrintTimeEl) prodPrintTimeEl.addEventListener('input', function(){ updateProductTotalGrams(); });
var editProdMultEl = document.getElementById('edit-prod-multiplier');
if (editProdMultEl) editProdMultEl.addEventListener('input', function(){ updateEditProductTotalGrams(); });
var editProdPrintTimeEl = document.getElementById('edit-prod-print-time');
if (editProdPrintTimeEl) editProdPrintTimeEl.addEventListener('input', function(){ updateEditProductTotalGrams(); });

// Apply suggestion buttons
var applyBtn = document.getElementById("apply-price-suggestion"); if (applyBtn) applyBtn.addEventListener("click", function(){
  var s = computeSuggestedPrice(); if (!isNaN(s)) document.querySelector("input[name='prod_price']").value = s.toFixed(2);
});
var applyEditBtn = document.getElementById("apply-edit-price-suggestion"); if (applyEditBtn) applyEditBtn.addEventListener("click", function(){
  var s = computeSuggestedPriceForEdit(); if (!isNaN(s)) document.getElementById("edit-prod-price").value = s.toFixed(2);
});

// -- Dashboard render -------------------------------------------------------
function getPeriodSales() {
  var now = new Date();
  var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return (localDB.sales || []).filter(function(s) {
    if (dashPeriod === "total") return true;
    var d = new Date(s.created_at);
    if (dashPeriod === "hoje")  return d >= today;
    if (dashPeriod === "semana") { var w = new Date(today); w.setDate(w.getDate() - 6);  return d >= w; }
    if (dashPeriod === "mes")   { var m = new Date(today); m.setDate(m.getDate() - 29); return d >= m; }
    return true;
  });
}

function renderDashboard() {
  var fmtMoney = function(v) { return "R$\u00a0" + v.toFixed(2).replace(".", ","); };
  var filtered = getPeriodSales();
  var totalRevenue  = filtered.reduce(function(s, v) { return s + (parseFloat(v.price) || 0); }, 0);
  var totalSales    = filtered.length;
  var currentStock  = localDB.filaments.reduce(function(s, f) { return s + (parseFloat(f.quantity) || 0); }, 0);
  var pendingOrders = (localDB.orders || []).filter(function(o) { return o.status === "pendente"; }).length;

  var h = new Date().getHours();
  var greet = h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
  var greeting = document.getElementById("dash-greeting");
  if (greeting) greeting.innerHTML = "<span class='highlight'>" + greet + "</span>\u00a0<span class='wave'>\uD83D\uDC4B</span>";

  var pLabel = { hoje: "hoje", semana: "\u00faltimos 7 dias", mes: "\u00faltimos 30 dias", total: "total" }[dashPeriod] || "total";
  var catalogCount = (localDB.products || []).length;
  var stats = [
    { icon: "\uD83D\uDCB0", value: fmtMoney(totalRevenue), label: "Receita \u2014 " + pLabel,     sec: "sec-sales-list" },
    { icon: "\uD83D\uDCE6", value: String(totalSales),     label: "Pe\u00e7as \u2014 " + pLabel,     sec: "sec-sales-list" },
    { icon: "\uD83E\uDDF5", value: currentStock.toFixed(0) + "\u00a0g", label: "Estoque atual",    sec: "sec-filaments-list" },
    { icon: "\uD83D\uDCCB", value: String(pendingOrders),  label: "Encomendas pendentes",          sec: "sec-orders" },
    { icon: "\uD83D\uDDC2\uFE0F", value: String(catalogCount), label: "Produtos no cat\u00e1logo", sec: "sec-products" }
  ];
  var grid = document.getElementById("stats-grid");
  if (grid) {
    grid.innerHTML = "";
    stats.forEach(function(s, i) {
      var c = document.createElement("div"); c.className = "stat-card";
      if (i === stats.length - 1 && stats.length % 2 !== 0) c.style.gridColumn = "span 2";
      c.innerHTML = "<div class='stat-icon'>" + s.icon + "</div><div class='stat-value'>" + s.value + "</div><div class='stat-label'>" + s.label + "</div>";
      c.onclick = function() { navTo(s.sec); };
      grid.appendChild(c);
    });
  }

  // Alerta de estoque baixo
  var lowEl = document.getElementById("low-stock-alert");
  if (lowEl) {
    var lowItems = (localDB.filaments || []).filter(function(f) { return (parseFloat(f.quantity) || 0) < LOW_STOCK_THRESHOLD; });
    if (lowItems.length) {
      var html = "<div class='low-stock-card'><div class='low-stock-title'>\u26a0\ufe0f Estoque baixo (&lt; " + LOW_STOCK_THRESHOLD + "g)</div><div class='low-stock-list'>";
      lowItems.forEach(function(f) {
        html += "<div class='low-stock-row'><span>" + f.name + " \u2014 " + (f.color || "") + "</span><span class='stock-" + ((parseFloat(f.quantity)||0) > 0 ? "low" : "none") + "'>" + (parseFloat(f.quantity) || 0).toFixed(0) + "g</span></div>";
      });
      html += "</div></div>";
      lowEl.innerHTML = html;
    } else {
      lowEl.innerHTML = "";
    }
  }

  var recentEl = document.getElementById("recent-sales-list");
  if (!recentEl) return;
  recentEl.innerHTML = "";
  var recent = (localDB.sales || []).slice().reverse().slice(0, 5);
  if (!recent.length) {
    recentEl.innerHTML = "<p class='muted' style='padding:10px 0'>Nenhuma venda registrada ainda.</p>";
    return;
  }
  recent.forEach(function(s) {
    var d = document.createElement("div"); d.className = "recent-item";
    d.innerHTML = "<span class='recent-name'>" + s.product_name + "</span><span class='recent-price'>" + fmtMoney(parseFloat(s.price) || 0) + "</span>";
    recentEl.appendChild(d);
  });
}

// -- Orders (Encomendas) ---------------------------------------------------
function computeOrderPrice() {
  var multEl = document.getElementById("order-multiplier");
  var markupEl = document.getElementById("order-markup");
  var ptEl = document.getElementById("order-print-time");
  var suggEl = document.getElementById("order-price-suggestion");
  if (!suggEl) return;
  var mult = parseFloat((multEl && multEl.value) || 0) || appSettings.defaultMultiplier || 1;
  var markupPct = parseFloat((markupEl && markupEl.value !== "") ? markupEl.value : (appSettings.margin * 100)) || 0;
  var pt = parseFloat((ptEl && ptEl.value) || 0) || 0;
  var fallbackCost = appSettings.matCostPerKg || DEFAULT_MAT_COST_PER_KG;
  var container = document.getElementById("order-usage-items");
  var totalMat = 0;
  if (container) {
    container.querySelectorAll("div.usage-row").forEach(function(r) {
      var s = r.querySelector("select"); var q = r.querySelector("input[type='number']");
      if (s && s.value && q && q.value) {
        var fil = localDB.filaments.find(function(f) { return String(f.id) === String(s.value); });
        var costPerKg = fil ? (fallbackCost) : fallbackCost;
        totalMat += (parseFloat(q.value) || 0) * costPerKg / 1000;
      }
    });
  }
  var base = (totalMat * mult) + (pt * (appSettings.hourlyRate || DEFAULT_HOURLY_RATE));
  var suggested = base * (1 + markupPct / 100);
  if (!totalMat && !pt) { suggEl.textContent = ""; return; }
  suggEl.innerHTML = "💡 Sugestão: <strong>R$ " + suggested.toFixed(2).replace(".", ",") + "</strong> &mdash; <button type='button' id='order-use-suggestion' style='font-size:12px;padding:2px 8px;border-radius:8px;border:1px solid var(--a1);background:transparent;color:var(--a1);cursor:pointer;margin-left:4px'>Usar</button>";
  var useBtn = document.getElementById("order-use-suggestion");
  if (useBtn) useBtn.onclick = function() {
    var prEl = document.querySelector("#order-form [name='price']");
    if (prEl) { prEl.value = suggested.toFixed(2); prEl.focus(); }
  };
}

function prepOrderForm() {
  var el = document.getElementById("order-usage-items");
  if (!el) return;
  el.innerHTML = "";
  addOrderUsageRow();
  // Init calc defaults from appSettings
  var multEl = document.getElementById("order-multiplier");
  var markupEl = document.getElementById("order-markup");
  if (multEl && !multEl.value) multEl.value = appSettings.defaultMultiplier || 1;
  if (markupEl && !markupEl.value) markupEl.value = Math.round((appSettings.margin || 0) * 100);
  var suggEl = document.getElementById("order-price-suggestion");
  if (suggEl) suggEl.textContent = "";
  // Wire calc inputs
  ["order-multiplier", "order-markup", "order-print-time"].forEach(function(id) {
    var inp = document.getElementById(id);
    if (inp) { inp.oninput = computeOrderPrice; }
  });
  // Populate customer selector
  var sel = document.getElementById("order-customer-sel");
  if (!sel) return;
  sel.innerHTML = "<option value=''>Selecione o cliente…</option>";
  var sorted = (localDB.customers || []).slice().sort(function(a,b){return (a.name||"").localeCompare(b.name||"","pt-BR",{sensitivity:"base"});});
  sorted.forEach(function(c) {
    var o = document.createElement("option"); o.value = c.id;
    o.textContent = c.name + (c.contact ? " ("+c.contact+")" : "");
    sel.appendChild(o);
  });
  var newOpt = document.createElement("option"); newOpt.value = "__new__"; newOpt.textContent = "+ Novo cliente…";
  sel.appendChild(newOpt);
  sel.onchange = function() {
    var wrap = document.getElementById("order-new-customer-fields");
    if (wrap) wrap.classList.toggle("hidden", sel.value !== "__new__");
  };
}

function addOrderUsageRow() {
  var container = document.getElementById("order-usage-items");
  var row = document.createElement("div"); row.className = "usage-row";
  var sel = document.createElement("select"); sel.name = "filament_id"; sel.style.flex = "1";
  var qty = document.createElement("input"); qty.name = "qty"; qty.type = "number"; qty.step = "0.1"; qty.placeholder = "g necess\u00e1rios"; qty.style.width = "110px";
  var delBtn = document.createElement("button"); delBtn.type = "button"; delBtn.innerHTML = trashIcon();
  delBtn.onclick = function() { row.remove(); updateOrderDelVisibility(); };
  var placeholder = document.createElement("option"); placeholder.value = ""; placeholder.text = "Escolha filamento";
  sel.appendChild(placeholder);
  var seen = new Set();
  localDB.filaments.slice().sort(function(a, b) {
    var n = (a.name || "").localeCompare(b.name || "", "pt-BR", {sensitivity: "base"});
    return n !== 0 ? n : (a.color || "").localeCompare(b.color || "", "pt-BR", {sensitivity: "base"});
  }).forEach(function(f, i) {
    var key = f.id || f.name || String(i);
    if (seen.has(key)) return; seen.add(key);
    var o = document.createElement("option");
    o.value = f.id || String(i);
    o.text = f.name + " \u2014 " + (f.color || "?") + " (" + (f.quantity || 0) + "g)";
    sel.appendChild(o);
  });
  sel.addEventListener("change", function() {
    if (sel.value && container.lastElementChild === row) addOrderUsageRow();
    updateOrderDelVisibility();
    computeOrderPrice();
  });
  qty.addEventListener("input", computeOrderPrice);
  row.appendChild(sel); row.appendChild(qty); row.appendChild(delBtn);
  container.appendChild(row);
  updateOrderDelVisibility();
}

function updateOrderDelVisibility() {
  var rows = document.getElementById("order-usage-items").querySelectorAll("div");
  rows.forEach(function(r) { var b = r.querySelector("button"); if (b) b.style.display = rows.length > 1 ? "inline-block" : "none"; });
}

document.getElementById("order-form").addEventListener("submit", async function(e) {
  e.preventDefault();
  var submitBtn = e.target.querySelector("[type='submit']");
  btnLoad(submitBtn); showLoading(); await yieldUI();
  var fd = new FormData(e.target);
  var product_name = fd.get("product_name");
  var price = parseFloat(fd.get("price")) || 0;
  var notes = fd.get("notes") || "";
  var container = document.getElementById("order-usage-items");
  // Resolve customer_id
  var selEl = document.getElementById("order-customer-sel");
  var selectedCustId = selEl ? selEl.value : "";
  var customer_id = null;
  if (selectedCustId === "__new__") {
    var newName = (document.getElementById("order-new-cust-name") || {}).value || "";
    var newContact = (document.getElementById("order-new-cust-contact") || {}).value || "";
    if (!newName.trim()) { hideLoading(); btnUnload(submitBtn); alert("Preencha o nome do novo cliente."); return; }
    if (sb) {
      var custIns = await sb.from("customers").insert({ name: newName.trim(), contact: newContact.trim() }).select().single();
      if (custIns.error) { showError("Erro ao criar cliente.", custIns.error); hideLoading(); btnUnload(submitBtn); return; }
      customer_id = custIns.data.id;
      await fetchCustomers();
    } else {
      var newCust = { id: "local-cust-" + Date.now(), name: newName.trim(), contact: newContact.trim(), created_at: new Date().toISOString() };
      localDB.customers.push(newCust); localDB.save();
      customer_id = newCust.id;
    }
  } else if (selectedCustId) {
    customer_id = selectedCustId;
  }
  var usages = [];
  container.querySelectorAll("div").forEach(function(r) {
    var s = r.querySelector("select"); var q = r.querySelector("input");
    if (s && s.value && q && q.value) usages.push({ filament_id: s.value, qty_needed: parseFloat(q.value) || 0 });
  });
  if (!usages.length) { hideLoading(); btnUnload(submitBtn); alert("Selecione pelo menos um filamento."); return; }
  if (sb) {
    var ins = await sb.from("orders").insert({ customer_id: customer_id, product_name: product_name, price: price, notes: notes, status: "pendente", created_at: new Date().toISOString() }).select().single();
    if (ins.error) { showError("Erro ao criar encomenda.", ins.error); hideLoading(); btnUnload(submitBtn); return; }
    var orderId = ins.data.id;
    for (var i = 0; i < usages.length; i++) {
      await sb.from("order_items").insert({ order_id: orderId, filament_id: usages[i].filament_id, qty_needed: usages[i].qty_needed });
    }
    await fetchOrders(); await fetchOrderItems();
  } else {
    var order = { id: "local-" + Date.now(), customer_id: customer_id, product_name: product_name, price: price, notes: notes, status: "pendente", created_at: new Date().toISOString() };
    localDB.orders.push(order);
    usages.forEach(function(u) { localDB.order_items.push({ order_id: order.id, filament_id: u.filament_id, qty_needed: u.qty_needed }); });
    localDB.save();
  }
  e.target.reset(); container.innerHTML = ""; addOrderUsageRow();
  hideLoading(); btnUnload(submitBtn);
  renderOrders();
  alert("Encomenda criada!");
});

function renderOrders() {
  var el = document.getElementById("orders-list");
  if (!el) return;
  el.innerHTML = "";
  var q = (document.getElementById("orders-search").value || "").toLowerCase().trim();
  var orders = (localDB.orders || []).filter(function(o) { return o.status === "pendente"; }).filter(function(o) {
    if (!q) return true;
    return (o.product_name||"").toLowerCase().includes(q)||(o.notes||"").toLowerCase().includes(q);
  });
  if (!orders.length) {
    el.innerHTML = q ? "<p class='muted' style='padding:10px 0'>Nenhum resultado para \"" + q + "\".</p>" : "<p class='muted' style='padding:10px 0'>Nenhuma encomenda pendente.</p>";
    return;
  }
  orders.slice().reverse().forEach(function(order) {
    var items = (localDB.order_items || []).filter(function(i) { return i.order_id === order.id; });
    var allOk = items.length > 0 && items.every(function(item) {
      var fil = localDB.filaments.find(function(f) { return f.id === item.filament_id; });
      return fil && parseFloat(fil.quantity) >= parseFloat(item.qty_needed);
    });
    var someOk = items.some(function(item) {
      var fil = localDB.filaments.find(function(f) { return f.id === item.filament_id; });
      return fil && parseFloat(fil.quantity) > 0;
    });
    var div = document.createElement("div"); div.className = "order-item";
    if (allOk) div.style.borderColor = "rgba(10,245,196,.38)";
    else if (someOk) div.style.borderColor = "rgba(245,192,10,.38)";
    else if (items.length) div.style.borderColor = "rgba(255,91,91,.38)";

    var header = document.createElement("div"); header.className = "order-header";
    var nameEl = document.createElement("strong"); nameEl.textContent = order.product_name;
    var priceEl = document.createElement("span"); priceEl.className = "order-price";
    priceEl.textContent = "R$\u00a0" + parseFloat(order.price).toFixed(2).replace(".", ",");
    var badge = document.createElement("span"); badge.className = "status-badge pendente"; badge.textContent = "Pendente";
    header.appendChild(nameEl); header.appendChild(priceEl); header.appendChild(badge);
    div.appendChild(header);

    // Cliente
    if (order.customer_name) {
      var customerEl = document.createElement("div"); customerEl.style.cssText = "font-size:13px;color:var(--muted);margin:4px 0 2px;display:flex;align-items:center;gap:6px";
      var contactHtml = "";
      if (order.customer_contact) {
        var c = order.customer_contact;
        var digits = c.replace(/\D/g, "");
        if (digits.length >= 8) {
          contactHtml = " &middot; <a href='https://wa.me/" + digits + "' target='_blank' rel='noopener' style='color:var(--a1);text-decoration:none'>\uD83D\uDCAC " + c + "</a>";
        } else {
          contactHtml = " &middot; " + c;
        }
      }
      customerEl.innerHTML = "\uD83D\uDC64 <span>" + order.customer_name + contactHtml + "</span>";
      div.appendChild(customerEl);
    }

    if (items.length) {
      var filDiv = document.createElement("div"); filDiv.className = "order-filaments";
      items.forEach(function(item) {
        var fil = localDB.filaments.find(function(f) { return f.id === item.filament_id; });
        var needed = parseFloat(item.qty_needed) || 0;
        var available = fil ? (parseFloat(fil.quantity) || 0) : 0;
        var frow = document.createElement("div"); frow.className = "order-fil-row";
        var nameSpan = document.createElement("span"); nameSpan.className = "fil-name";
        nameSpan.textContent = (fil ? fil.name : "Filamento removido") + ": " + needed.toFixed(0) + "g";
        var stockSpan = document.createElement("span");
        if (!fil) { stockSpan.className = "stock-none"; stockSpan.textContent = "\u2715 Removido"; }
        else if (available >= needed) { stockSpan.className = "stock-ok"; stockSpan.textContent = "\u2713 " + available.toFixed(0) + "g disp."; }
        else if (available > 0) { stockSpan.className = "stock-low"; stockSpan.textContent = "\u26a0 " + available.toFixed(0) + "g disp."; }
        else { stockSpan.className = "stock-none"; stockSpan.textContent = "\u2715 Sem estoque"; }
        frow.appendChild(nameSpan); frow.appendChild(stockSpan);
        filDiv.appendChild(frow);
      });
      div.appendChild(filDiv);
    }

    if (order.notes) {
      var notesEl2 = document.createElement("div"); notesEl2.className = "order-notes";
      notesEl2.textContent = order.notes; div.appendChild(notesEl2);
    }

    var acts = document.createElement("div"); acts.className = "order-actions";
    var completeBtn = document.createElement("button"); completeBtn.textContent = "\u2713 Marcar como Pronta"; completeBtn.className = "btn-complete";
    var oCopy = order; var iCopy = items.slice();
    completeBtn.onclick = async function() {
      if (!confirm("Converter \"" + oCopy.product_name + "\" em venda? O estoque ser\u00e1 deduzido.")) return;
      btnLoad(completeBtn);
      await completeOrder(oCopy, iCopy);
      btnUnload(completeBtn);
    };
    var delBtn2 = document.createElement("button"); delBtn2.textContent = "Apagar"; delBtn2.className = "btn-danger";
    delBtn2.onclick = async function() {
      if (!confirm("Remover esta encomenda?")) return;
      btnLoad(delBtn2); await deleteOrder(oCopy.id); btnUnload(delBtn2);
    };
    acts.appendChild(completeBtn); acts.appendChild(delBtn2);
    div.appendChild(acts);
    el.appendChild(div);
  });
}

async function completeOrder(order, items) {
  showLoading(); await yieldUI();
  if (sb) {
    var _salePayload = {
      product_name: order.product_name, price: order.price,
      notes: order.notes || "", created_at: new Date().toISOString()
    };
    if (order.customer_id) _salePayload.customer_id = order.customer_id;
    var ins = await sb.from("sales").insert(_salePayload).select().single();
    if (ins.error) { showError("Erro ao criar venda.", ins.error); hideLoading(); return; }
    var saleId = ins.data.id;
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      await sb.from("sale_items").insert({ sale_id: saleId, filament_id: item.filament_id, qty_used: item.qty_needed });
      var fil = localDB.filaments.find(function(f) { return f.id === item.filament_id; });
      if (fil && fil.id) {
        var newQty = Math.max(0, (parseFloat(fil.quantity) || 0) - parseFloat(item.qty_needed));
        await sb.from("filaments").update({ quantity: newQty }).eq("id", fil.id);
        fil.quantity = newQty;
      }
    }
    var existRes = await sb.from("products").select("id").eq("name", order.product_name).limit(1);
    if (!existRes.data || !existRes.data.length) {
      await sb.from("products").insert({ name: order.product_name, price: order.price });
    }
    await sb.from("orders").delete().eq("id", order.id);
    await refreshAll();
  } else {
    localDB.sales.push({ product_name: order.product_name, price: order.price, notes: order.notes || "", created_at: new Date().toISOString() });
    items.forEach(function(item) {
      var f = localDB.filaments.find(function(x) { return x.id === item.filament_id; });
      if (f) f.quantity = Math.max(0, (parseFloat(f.quantity) || 0) - parseFloat(item.qty_needed));
    });
    var oidx = localDB.orders.findIndex(function(o) { return o.id === order.id; });
    if (oidx >= 0) localDB.orders.splice(oidx, 1);
    localDB.order_items = localDB.order_items.filter(function(i) { return i.order_id !== order.id; });
    localDB.save();
  }
  hideLoading();
  renderOrders();
  renderDashboard();
  alert("Encomenda convertida em venda com sucesso!");
}

async function deleteOrder(orderId) {
  showLoading(); await yieldUI();
  if (sb && !String(orderId).startsWith("local-")) {
    var { error } = await sb.from("orders").delete().eq("id", orderId);
    if (error) { showError("Erro ao remover encomenda.", error); hideLoading(); return; }
    await fetchOrders(); await fetchOrderItems();
  } else {
    var idx = localDB.orders.findIndex(function(o) { return o.id === orderId; });
    if (idx >= 0) localDB.orders.splice(idx, 1);
    localDB.order_items = localDB.order_items.filter(function(i) { return i.order_id !== orderId; });
    localDB.save();
  }
  renderOrders();
  hideLoading();
}

// -- Customers render/edit -------------------------------------------------
function renderCustomers() {
  var el = document.getElementById("customers-list"); if (!el) return;
  el.innerHTML = "";
  var q = (document.getElementById("customers-search").value || "").toLowerCase().trim();
  var rows = (localDB.customers || []).filter(function(c) {
    if (!q) return true;
    return (c.name||"").toLowerCase().includes(q)||(c.contact||"").toLowerCase().includes(q);
  }).sort(function(a,b){return (a.name||"").localeCompare(b.name||"","pt-BR",{sensitivity:"base"});});
  if (!rows.length) { el.innerHTML = "<p class='muted' style='padding:10px 0'>" + (q ? "Nenhum resultado para \"" + q + "\"." : "Nenhum cliente cadastrado.") + "</p>"; return; }
  rows.forEach(function(customer) {
    var pendingOrders = (localDB.orders || []).filter(function(o) { return o.customer_id === customer.id && o.status === "pendente"; });
    var totalOrders   = (localDB.orders || []).filter(function(o) { return o.customer_id === customer.id; });
    var totalSales    = (localDB.sales  || []).filter(function(s) { return s.customer_id === customer.id; });
    var totalValue    = totalOrders.reduce(function(s,o){return s+(parseFloat(o.price)||0);},0)
                      + totalSales.reduce(function(s,v){return s+(parseFloat(v.price)||0);},0);
    var totalCount    = totalOrders.length + totalSales.length;
    var div = document.createElement("div"); div.className = "item customer-item";
    var info = document.createElement("div"); info.className = "item-info";
    var contactHtml = "";
    if (customer.contact) {
      var digits = customer.contact.replace(/\D/g,"");
      contactHtml = digits.length >= 8
        ? "<a href='https://wa.me/" + digits + "' target='_blank' rel='noopener' class='wa-link'>💬 " + customer.contact + "</a>"
        : customer.contact;
    }
    var badge = pendingOrders.length
      ? "<span class='cust-badge-pending'>" + pendingOrders.length + " pendente" + (pendingOrders.length>1?"s":"") + "</span>"
      : "<span class='cust-badge-ok'>Sem pendências</span>";
    info.innerHTML = "<strong>" + customer.name + "</strong>" +
      (contactHtml ? "<div class='muted' style='margin-top:3px'>" + contactHtml + "</div>" : "") +
      "<div style='margin-top:6px;display:flex;gap:8px;align-items:center;flex-wrap:wrap'>" + badge +
      "<span class='muted' style='font-size:12px'>" + totalCount + " pedido" + (totalCount!==1?"s":"") +
      (totalValue>0?" &middot; R$ "+totalValue.toFixed(2):"") + "</span></div>";
    if (pendingOrders.length) {
      var ordHtml = "<div class='cust-orders'>";
      pendingOrders.forEach(function(o) { ordHtml += "<div class='cust-order-row'><span>" + o.product_name + "</span><span class='muted'>R$ " + parseFloat(o.price).toFixed(2) + "</span></div>"; });
      ordHtml += "</div>";
      info.innerHTML += ordHtml;
    }
    if (customer.notes) info.innerHTML += "<div class='muted' style='font-size:12px;margin-top:4px'>" + customer.notes + "</div>";
    var acts = document.createElement("div"); acts.className = "item-actions";
    var cCopy = customer;
    var verVendasBtn = document.createElement("button"); verVendasBtn.textContent = "Ver vendas";
    verVendasBtn.onclick = function() {
      var searchEl = document.getElementById("sales-search");
      if (searchEl) { searchEl.value = cCopy.name; }
      appNav.querySelectorAll("button[data-sec]").forEach(function(b){ b.classList.remove("active"); });
      var sb2 = appNav ? appNav.querySelector("[data-sec='sec-sales-list']") : null; if (sb2) sb2.classList.add("active");
      showSection("sec-sales-list"); renderSales();
    };
    var editBtn = document.createElement("button"); editBtn.textContent = "Editar";
    editBtn.onclick = function() { openCustomerEdit(cCopy); };
    var delBtn = document.createElement("button"); delBtn.innerHTML = trashIcon(); delBtn.title = "Remover cliente";
    delBtn.onclick = async function() {
      if (!confirm("Remover \"" + cCopy.name + "\"? Encomendas vinculadas não serão apagadas.")) return;
      if (sb) {
        showLoading();
        var { error } = await sb.from("customers").delete().eq("id", cCopy.id);
        if (error) { showError("Erro ao remover cliente.", error); } else { await fetchCustomers(); renderCustomers(); }
        hideLoading();
      } else {
        var idx = localDB.customers.findIndex(function(x){return x.id===cCopy.id;});
        if (idx>=0){localDB.customers.splice(idx,1);localDB.save();}
        renderCustomers();
      }
    };
    acts.appendChild(editBtn); acts.appendChild(delBtn);
    div.appendChild(info); div.appendChild(acts);
    el.appendChild(div);
  });
}

var _newCustCancelBtn = document.getElementById("new-cust-cancel");
if (_newCustCancelBtn) _newCustCancelBtn.addEventListener("click", function() {
  document.getElementById("new-customer-form").reset();
  goBack();
});

document.getElementById("new-customer-form").addEventListener("submit", async function(e) {
  e.preventDefault();
  var submitBtn = document.getElementById("new-cust-submit");
  btnLoad(submitBtn); showLoading(); await yieldUI();
  var payload = {
    name:    document.getElementById("new-cust-name").value.trim(),
    contact: document.getElementById("new-cust-contact").value.trim() || null,
    notes:   document.getElementById("new-cust-notes").value.trim() || null
  };
  if (!payload.name) { btnReset(submitBtn, "Cadastrar Cliente"); hideLoading(); return; }
  if (sb) {
    var { data, error } = await sb.from("customers").insert(payload).select().single();
    if (error) { showError("Erro ao cadastrar cliente.", error); btnReset(submitBtn, "Cadastrar Cliente"); hideLoading(); return; }
    localDB.customers = localDB.customers || [];
    localDB.customers.push(data);
    localDB.save();
  } else {
    var nc = Object.assign({id: crypto.randomUUID ? crypto.randomUUID() : Date.now()+"", created_at: new Date().toISOString()}, payload);
    localDB.customers = localDB.customers || []; localDB.customers.push(nc); localDB.save();
  }
  document.getElementById("new-cust-name").value = "";
  document.getElementById("new-cust-contact").value = "";
  document.getElementById("new-cust-notes").value = "";
  btnReset(submitBtn, "Cadastrar Cliente");
  renderCustomers();
  hideLoading();
});

var _editCustId = null;
function openCustomerEdit(c) {
  _editCustId = c.id || null;
  document.getElementById("edit-cust-name").value = c.name || "";
  document.getElementById("edit-cust-contact").value = c.contact || "";
  document.getElementById("edit-cust-notes").value = c.notes || "";
  document.getElementById("customer-edit-modal").classList.remove("hidden");
  document.getElementById("edit-cust-name").focus();
}
document.getElementById("customer-edit-cancel").addEventListener("click", function() {
  document.getElementById("customer-edit-modal").classList.add("hidden");
});
document.getElementById("customer-edit-modal").addEventListener("click", function(e) {
  if (e.target === this) this.classList.add("hidden");
});
document.getElementById("customer-edit-form").addEventListener("submit", async function(e) {
  e.preventDefault();
  var submitBtn = document.getElementById("edit-cust-submit");
  btnLoad(submitBtn); showLoading(); await yieldUI();
  var updates = {
    name:    document.getElementById("edit-cust-name").value.trim(),
    contact: document.getElementById("edit-cust-contact").value.trim(),
    notes:   document.getElementById("edit-cust-notes").value.trim()
  };
  if (sb && _editCustId) {
    var { error } = await sb.from("customers").update(updates).eq("id", _editCustId);
    if (error) { showError("Erro ao atualizar cliente.", error); hideLoading(); btnUnload(submitBtn); return; }
  }
  var local = localDB.customers.find(function(c){return c.id===_editCustId;});
  if (local) { Object.assign(local, updates); localDB.save(); }
  await fetchCustomers();
  hideLoading(); btnUnload(submitBtn);
  document.getElementById("customer-edit-modal").classList.add("hidden");
  renderCustomers();
});

// -- Search wiring ---------------------------------------------------------
(function() {
  [["filaments-search", function() { renderFilamentsList(); }],
   ["sales-search",     function() { renderSales(); }],
   ["products-search",  function() { renderProducts(); }],
   ["orders-search",    function() { renderOrders(); }],
   ["customers-search", function() { renderCustomers(); }]]
  .forEach(function(p) { var el = document.getElementById(p[0]); if (el) el.oninput = p[1]; });
})();

// -- Bootstrap -------------------------------------------------------------
document.getElementById("sign-in").onclick = async function() {
  var btn = this; btnLoad(btn);
  try { await signIn(); } finally { btnUnload(btn); }
};
document.getElementById("sign-up").onclick = async function() {
  var btn = this; btnLoad(btn);
  try { await signUp(); } finally { btnUnload(btn); }
};

async function boot() {
  showAuth();
  loadSettings();
  if (sb) {
    try {
      var { data } = await sb.auth.getUser();
      if (data && data.user) await showApp(data.user.email);
    } catch (_) {}
  }
  var curtain = document.getElementById("startup-curtain");
  if (curtain) {
    curtain.classList.add("fade-out");
    setTimeout(function() { if (curtain.parentNode) curtain.parentNode.removeChild(curtain); }, 400);
  }
}
if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
