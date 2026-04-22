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
  filaments: JSON.parse(localStorage.getItem("filaments") || "[]"),
  sales:     JSON.parse(localStorage.getItem("sales")     || "[]"),
  products:  JSON.parse(localStorage.getItem("products")  || "[]"),
  save() {
    localStorage.setItem("filaments", JSON.stringify(this.filaments));
    localStorage.setItem("sales",     JSON.stringify(this.sales));
    localStorage.setItem("products",  JSON.stringify(this.products));
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
  "sec-filaments-register",
  "sec-filaments-list",
  "sec-sales-register",
  "sec-sales-list",
  "sec-products"
];

function showSection(id) {
  ALL_SECTIONS.forEach(s => {
    const el = document.getElementById(s);
    if (el) el.classList.toggle("hidden", s !== id);
  });
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
  userArea.innerHTML = `<span>Ola, ${display}</span> <button id="signout">Sair</button>`;
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

  showLoading();
  await yieldUI();
  await refreshAll();
  hideLoading();
}

async function signUp() {
  const email    = document.getElementById("email").value;
  const password = document.getElementById("password").value;
  if (sb) {
    const { error } = await sb.auth.signUp({ email: email, password: password });
    if (error) return alert(error.message);
    alert("Verifique seu email ou entre com a senha cadastrada.");
  } else {
    alert("Supabase nao configurado.");
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
      if (secId === "sec-filaments-list") {
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

async function refreshAll() {
  await Promise.all([fetchFilaments(), fetchSales(), fetchProducts()]);
}

// -- Helpers ------------------------------------------------------------------
function toBase64(file) {
  return new Promise(function(res, rej) { var r = new FileReader(); r.onload = function() { res(r.result); }; r.onerror = rej; r.readAsDataURL(file); });
}

async function resolvePhotoUrl(photo, bucket) {
  if (!bucket) bucket = "filament-photos";
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

// -- Filaments list render -------------------------------------------------
function renderFilamentsList() {
  var el = document.getElementById("filaments-list");
  el.innerHTML = "";
  var seen = new Set();
  var rows = localDB.filaments.filter(function(f) { var k = f.id || f.name; if (seen.has(k)) return false; seen.add(k); return true; });
  rows.forEach(function(f) {
    var div = document.createElement("div"); div.className = "item";
    var img = document.createElement("img"); img.alt = ""; img.src = BLANK;
    resolvePhotoUrl(f.photo, "filament-photos").then(function(u) { if (u) img.src = u; }).catch(function() {});
    var info = document.createElement("div"); info.className = "item-info";
    info.innerHTML = "<strong>" + f.name + "</strong><div class='muted'>" + f.color + " � " + f.manufacturer + "</div>";
    var acts = document.createElement("div"); acts.className = "item-actions";
    var badge = document.createElement("span"); badge.className = "qty-badge"; badge.textContent = (f.quantity || 0) + " g";
    var delBtn = document.createElement("button"); delBtn.innerHTML = trashIcon(); delBtn.title = "Remover filamento";
    var fCopy = f;
    delBtn.onclick = async function() {
      if (!confirm("Confirma exclusao do filamento \"" + fCopy.name + "\"?")) return;
      await deleteFilament(fCopy.id, fCopy.name);
    };
    acts.appendChild(badge); acts.appendChild(delBtn);
    div.appendChild(img); div.appendChild(info); div.appendChild(acts);
    el.appendChild(div);
  });
}

// -- Filament form ---------------------------------------------------------
document.getElementById("filament-form").addEventListener("submit", async function(e) {
  e.preventDefault();
  var submitBtn = e.target.querySelector("[type='submit']");
  btnLoad(submitBtn);
  showLoading();
  await yieldUI();
  var fd = new FormData(e.target);
  var obj = { name: fd.get("name"), color: fd.get("color"), manufacturer: fd.get("manufacturer"), quantity: parseFloat(fd.get("quantity")) || 0, photo: null };
  var file = e.target.photo.files[0];
  if (file) {
    if (sb) {
      var uuid = (crypto && crypto.randomUUID) ? crypto.randomUUID() : (Date.now() + "-" + Math.random().toString(36).slice(2));
      var filename = uuid + "-" + file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
      var upRes = await sb.storage.from("filament-photos").upload(filename, file, { cacheControl: "3600", upsert: false });
      if (upRes.error) { console.warn("Upload falhou:", upRes.error.message); obj.photo = await toBase64(file); }
      else { obj.photo = filename; }
    } else {
      obj.photo = await toBase64(file);
    }
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

async function deleteFilament(id, name) {
  showLoading();
  await yieldUI();
  if (!id) {
    var idx = localDB.filaments.findIndex(function(f) { return f.name === name; });
    if (idx >= 0) { localDB.filaments.splice(idx, 1); localDB.save(); }
  } else {
    var { data: refs } = await sb.from("sale_items").select("id").eq("filament_id", id).limit(1);
    if (refs && refs.length) { hideLoading(); alert("Nao e possivel remover: filamento referenciado em vendas."); return; }
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

    var productFile = fd.get("product_photo");
    var productPhoto = null;
    if (productFile && productFile.size) {
      var uuid2 = (crypto && crypto.randomUUID) ? crypto.randomUUID() : Date.now();
      var fn = uuid2 + "-" + productFile.name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
      var upRes2 = await sb.storage.from("product-photos").upload(fn, productFile, { cacheControl: "3600", upsert: false });
      if (!upRes2.error) productPhoto = fn; else console.warn("Product photo upload failed:", upRes2.error.message);
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
  usageItems.innerHTML = "";
  hideLoading();
  btnUnload(submitBtn);
  alert("Venda registrada!");
});

// -- Sales list render -----------------------------------------------------
function renderSales() {
  var listEl  = document.getElementById("sales-list");
  var tableEl = document.getElementById("sales-table");
  listEl.innerHTML = ""; tableEl.innerHTML = "";
  var rows = (localDB.sales || []).slice().reverse();

  if (salesViewMode === "list") {
    listEl.style.display = "flex"; tableEl.style.display = "none";
    rows.forEach(function(s) {
      var d = document.createElement("div"); d.className = "item";
      var prod = localDB.products.find(function(p) { return p.name === s.product_name; });
      var img = document.createElement("img"); img.alt = ""; img.src = BLANK;
      if (prod && prod.photo) {
        resolvePhotoUrl(prod.photo, "product-photos").then(function(u) { if (u) img.src = u; }).catch(function() {});
      }
      d.appendChild(img);
      var info = document.createElement("div"); info.className = "item-info";
      info.innerHTML = "<strong>" + s.product_name + "</strong><div class='muted'>R$ " + parseFloat(s.price).toFixed(2) + " &middot; " + new Date(s.created_at).toLocaleString() + "</div>" + (s.notes ? "<div class='muted'>" + s.notes + "</div>" : "");
      var acts = document.createElement("div"); acts.className = "item-actions";
      var del = document.createElement("button"); del.textContent = "Apagar";
      var sCopy = s;
      del.onclick = async function() { if (confirm("Confirma exclusao desta venda?")) await deleteSale(sCopy.id); };
      var reuse = document.createElement("button"); reuse.textContent = "Reaproveitar";
      reuse.onclick = async function() { btnLoad(reuse); await reuseSale(sCopy); };
      acts.appendChild(del); acts.appendChild(reuse);
      d.appendChild(info); d.appendChild(acts);
      listEl.appendChild(d);
    });
  } else {
    listEl.style.display = "none"; tableEl.style.display = "block";
    var tbl = document.createElement("table"); tbl.style.cssText = "width:100%;border-collapse:collapse";
    tbl.innerHTML = "<thead><tr><th></th><th>Data</th><th>Produto</th><th>Preco</th><th>Obs.</th><th>Acoes</th></tr></thead>";
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
      del.onclick = async function() { if (confirm("Confirma exclusao?")) await deleteSale(sCopy.id); };
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
  localDB.products.forEach(function(p) {
    var d = document.createElement("div"); d.className = "item";
    var img = document.createElement("img"); img.alt = ""; img.src = BLANK;
    resolvePhotoUrl(p.photo, "product-photos").then(function(u) { if (u) img.src = u; }).catch(function() {});
    var info = document.createElement("div"); info.className = "item-info";
    info.innerHTML = "<strong>" + p.name + "</strong><div class='muted'>R$ " + parseFloat(p.price || 0).toFixed(2) + "</div>";
    var acts = document.createElement("div"); acts.className = "item-actions";
    var pCopy = p;

    var venderBtn = document.createElement("button"); venderBtn.textContent = "Vender";
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

    acts.appendChild(venderBtn); acts.appendChild(editBtn); acts.appendChild(delBtn);
    d.appendChild(img); d.appendChild(info); d.appendChild(acts);
    el.appendChild(d);
  });
}

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
