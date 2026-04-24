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

// -- Local fallback ----------------------------------------------------------
const localDB = {
  filaments:   JSON.parse(localStorage.getItem("filaments")   || "[]"),
  sales:       JSON.parse(localStorage.getItem("sales")       || "[]"),
  products:    JSON.parse(localStorage.getItem("products")    || "[]"),
  sale_items:  JSON.parse(localStorage.getItem("sale_items")  || "[]"),
  orders:      JSON.parse(localStorage.getItem("orders")      || "[]"),
  order_items: JSON.parse(localStorage.getItem("order_items") || "[]"),
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
  "sec-filaments-register",
  "sec-filaments-list",
  "sec-sales-register",
  "sec-sales-list",
  "sec-products",
  "sec-orders"
];

function showSection(id) {
  ALL_SECTIONS.forEach(s => {
    const el = document.getElementById(s);
    if (el) el.classList.toggle("hidden", s !== id);
  });
}

// Navega para uma seção ativando seu botão de nav (reaproveita lógica de render do click handler)
function navTo(secId) {
  var btn = appNav ? appNav.querySelector("[data-sec='" + secId + "']") : null;
  if (btn) { btn.click(); } else { showSection(secId); }
}

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
  userArea.innerHTML = `<span>Olá, ${display}</span> <button id="signout">Sair</button>`;
  document.getElementById("signout").onclick = signOut;

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

// -- Navigation ---------------------------------------------------------------
if (appNav) {
  appNav.querySelectorAll("button[data-sec]").forEach(function(btn) {
    btn.addEventListener("click", async function() {
      appNav.querySelectorAll("button[data-sec]").forEach(function(b) { b.classList.remove("active"); });
      btn.classList.add("active");
      var secId = btn.dataset.sec;
      showLoading();
      await yieldUI();
      if (secId === "sec-dashboard") {
        await refreshAll();
        renderDashboard();
      } else if (secId === "sec-filaments-list") {
        await fetchFilaments();
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
async function fetchFilaments() {
  if (!sb) return;
  const { data, error } = await sb.from("filaments").select("*");
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
  const { data, error } = await sb.from("sale_items").select("qty_used");
  if (!error && data) { localDB.sale_items = data; localDB.save(); }
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
  await Promise.all([fetchFilaments(), fetchSales(), fetchProducts(), fetchSaleItems(), fetchOrders(), fetchOrderItems()]);
}

// -- Helpers ------------------------------------------------------------------
function toBase64(file) {
  return new Promise(function(res, rej) { var r = new FileReader(); r.onload = function() { res(r.result); }; r.onerror = rej; r.readAsDataURL(file); });
}

async function uploadFiles(files, bucket) {
  if (!files || !files.length) return null;
  if (!sb) throw new Error("Supabase não está configurado. A foto não pode ser enviada.");
  var paths = [];
  for (var i = 0; i < files.length; i++) {
    var file = files[i];
    if (!file || !file.size) continue;
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
    info.innerHTML = "<div class='item-info-inner'><strong>" + f.name + "</strong><div class='muted'>" + f.color + " — " + f.manufacturer + "</div></div>";
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

// -- Filament edit modal --------------------------------------------------
var _editFilId = null;

function openFilamentEdit(f) {
  _editFilId = f.id || null;
  document.getElementById("edit-fil-name").value = f.name || "";
  document.getElementById("edit-fil-color").value = f.color || "";
  document.getElementById("edit-fil-manufacturer").value = f.manufacturer || "";
  document.getElementById("edit-fil-quantity").value = f.quantity != null ? f.quantity : "";
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
  await fetchFilaments();
  hideLoading();
  btnUnload(submitBtn);
  alert("Filamento salvo!");
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
}

function addUsageRow() {
  var row = document.createElement("div"); row.className = "usage-row";
  var sel = document.createElement("select"); sel.name = "filament_id"; sel.style.flex = "1";
  var qty = document.createElement("input"); qty.name = "qty"; qty.type = "number"; qty.step = "0.1"; qty.placeholder = "g usado"; qty.style.width = "110px";
  var delBtn = document.createElement("button"); delBtn.type = "button"; delBtn.innerHTML = trashIcon();
  delBtn.onclick = function() { row.remove(); updateDelVisibility(); };

  var placeholder = document.createElement("option"); placeholder.value = ""; placeholder.text = "Escolha filamento"; sel.appendChild(placeholder);
  var seen = new Set();
  localDB.filaments.forEach(function(f, i) {
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
  var usages = [];
  usageItems.querySelectorAll("div").forEach(function(r) {
    var s = r.querySelector("select"); var q = r.querySelector("input");
    if (s && s.value && q && q.value) usages.push({ filament_id: s.value, qty: parseFloat(q.value) || 0 });
  });
  if (!usages.length) { hideLoading(); btnUnload(submitBtn); alert("Selecione pelo menos um filamento."); return; }

  if (sb) {
    var ins = await sb.from("sales").insert({ product_name: product_name, price: price, notes: notes, created_at: new Date().toISOString() }).select().single();
    var saleData;
    if (ins.error) {
      if (String(ins.error.message).indexOf("notes") >= 0) {
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
        var newQty = Math.max(0, (parseFloat(fil.quantity) || 0) - u.qty);
        await sb.from("filaments").update({ quantity: newQty }).eq("id", fil.id);
        fil.quantity = newQty;
      }
    }

    var existRes = await sb.from("products").select("id").eq("name", product_name).limit(1);
    var existProd = existRes.data;
    if (!existProd || !existProd.length) {
      var prodObj = { name: product_name, price: price };
      if (productPhoto) prodObj.photo = productPhoto;
      await sb.from("products").insert(prodObj);
    } else if (productPhoto) {
      await sb.from("products").update({ photo: productPhoto }).eq("id", existProd[0].id);
    }

    await refreshAll();
  } else {
    localDB.sales.push({ product_name: product_name, price: price, notes: notes, created_at: new Date().toISOString(), usages: usages });
    if (!localDB.products.find(function(p) { return p.name === product_name; })) localDB.products.push({ name: product_name, price: price });
    usages.forEach(function(u) { var f = localDB.filaments.find(function(x) { return x.id === u.filament_id || x.name === u.filament_id; }); if (f) f.quantity = Math.max(0, (f.quantity || 0) - u.qty); });
    localDB.save();
  }

  e.target.reset();
  usageItems.innerHTML = ""; addUsageRow();
  hideLoading();
  btnUnload(submitBtn);
  alert("Venda registrada!");
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
      info.innerHTML = "<strong>" + s.product_name + "</strong><div class='muted'>R$ " + parseFloat(s.price).toFixed(2) + " &middot; " + new Date(s.created_at).toLocaleString() + "</div>" + (s.notes ? "<div class='muted'>" + s.notes + "</div>" : "");
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
    tbl.innerHTML = "<thead><tr><th></th><th>Data</th><th>Produto</th><th>Preço</th><th>Obs.</th><th>Ações</th></tr></thead>";
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
      [[new Date(s.created_at).toLocaleString(), s.product_name, "R$ " + s.price, s.notes || ""]].forEach(function(arr) {
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
    var d = document.createElement("div"); d.className = "item";
    var img = document.createElement("img"); img.alt = ""; img.src = BLANK; img.style.cursor = "pointer";
    var pPhoto = p.photo; var pBucket = "product-photos";
    resolvePhotoUrl(pPhoto, pBucket).then(function(u) {
      if (u) { img.src = u; img.onclick = function() { resolveAllPhotoUrls(pPhoto, pBucket).then(function(urls) { openLightbox(urls, 0); }); }; }
    }).catch(function() {});
    var info = document.createElement("div"); info.className = "item-info";
    var filChipsHtml = "";
    if (p.filaments_info) {
      var filArr = []; try { filArr = JSON.parse(p.filaments_info); } catch(e) {}
      if (filArr.length) filChipsHtml = "<div class='fil-chips'>" + filArr.map(function(f) { return "<span class='fil-chip'>" + (f.name || "") + ": " + (f.qty || 0) + "g</span>"; }).join("") + "</div>";
    }
    info.innerHTML = "<strong>" + p.name + "</strong><div class='muted'>R$ " + parseFloat(p.price || 0).toFixed(2) + "</div>" + filChipsHtml;
    var acts = document.createElement("div"); acts.className = "item-actions";
    var pCopy = p;

    var prontaBtn = document.createElement("button"); prontaBtn.textContent = "Peça pronta";
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
      hideLoading();
    };

    var editBtn = document.createElement("button"); editBtn.textContent = "Editar preco";
    editBtn.onclick = async function() {
      var val = prompt("Novo preco:", String(pCopy.price || 0)); if (val === null) return;
      var newPrice = parseFloat(val) || 0;
      if (sb) {
        showLoading();
        var { error } = await sb.from("products").update({ price: newPrice }).eq("id", pCopy.id);
        if (error) { showError("Erro ao atualizar preco.", error); } else { pCopy.price = newPrice; localDB.save(); renderProducts(); }
        hideLoading();
      } else { pCopy.price = newPrice; localDB.save(); renderProducts(); }
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

    acts.appendChild(prontaBtn); acts.appendChild(venderBtn); acts.appendChild(encomendar); acts.appendChild(editBtn); acts.appendChild(delBtn);
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
    updateProductDelVisibility();
  });
  delBtn.onclick = function() { row.remove(); updateProductDelVisibility(); };
  row.appendChild(sel); row.appendChild(qty); row.appendChild(delBtn);
  container.appendChild(row);
  updateProductDelVisibility();
}

function updateProductDelVisibility() {
  var rows = document.querySelectorAll("#product-usage-items .usage-row");
  rows.forEach(function(r) { var b = r.querySelector("button"); if (b) b.style.display = rows.length > 1 ? "inline-block" : "none"; });
}

document.getElementById("product-form-toggle").addEventListener("click", function() {
  var wrap = document.getElementById("product-form-wrap");
  var nowHidden = wrap.classList.toggle("hidden");
  this.textContent = nowHidden ? "+ Cadastrar produto" : "\u2715 Cancelar cadastro";
  if (!nowHidden && !document.getElementById("product-usage-items").children.length) addProductUsageRow();
});

document.getElementById("product-form").addEventListener("submit", async function(e) {
  e.preventDefault();
  var submitBtn = document.getElementById("product-form-submit");
  btnLoad(submitBtn); showLoading(); await yieldUI();
  var name = e.target.prod_name.value.trim();
  var price = parseFloat(e.target.prod_price.value) || 0;
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
  var obj = { name: name, price: price, filaments_info: filInfo.length ? JSON.stringify(filInfo) : null };
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
  document.getElementById("product-form-wrap").classList.add("hidden");
  document.getElementById("product-form-toggle").textContent = "+ Cadastrar produto";
  hideLoading(); btnUnload(submitBtn);
  renderProducts();
  alert("Produto cadastrado!");
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
function prepOrderForm() {
  var el = document.getElementById("order-usage-items");
  if (!el) return;
  el.innerHTML = "";
  addOrderUsageRow();
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
  localDB.filaments.forEach(function(f, i) {
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
  });
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
  var usages = [];
  container.querySelectorAll("div").forEach(function(r) {
    var s = r.querySelector("select"); var q = r.querySelector("input");
    if (s && s.value && q && q.value) usages.push({ filament_id: s.value, qty_needed: parseFloat(q.value) || 0 });
  });
  if (!usages.length) { hideLoading(); btnUnload(submitBtn); alert("Selecione pelo menos um filamento."); return; }
  if (sb) {
    var ins = await sb.from("orders").insert({ product_name: product_name, price: price, notes: notes, status: "pendente", created_at: new Date().toISOString() }).select().single();
    if (ins.error) { showError("Erro ao criar encomenda.", ins.error); hideLoading(); btnUnload(submitBtn); return; }
    var orderId = ins.data.id;
    for (var i = 0; i < usages.length; i++) {
      await sb.from("order_items").insert({ order_id: orderId, filament_id: usages[i].filament_id, qty_needed: usages[i].qty_needed });
    }
    await fetchOrders(); await fetchOrderItems();
  } else {
    var order = { id: "local-" + Date.now(), product_name: product_name, price: price, notes: notes, status: "pendente", created_at: new Date().toISOString() };
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
    var ins = await sb.from("sales").insert({
      product_name: order.product_name, price: order.price,
      notes: order.notes || "", created_at: new Date().toISOString()
    }).select().single();
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

// -- Search wiring ---------------------------------------------------------
(function() {
  [["filaments-search", function() { renderFilamentsList(); }],
   ["sales-search",     function() { renderSales(); }],
   ["products-search",  function() { renderProducts(); }],
   ["orders-search",    function() { renderOrders(); }]]
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
