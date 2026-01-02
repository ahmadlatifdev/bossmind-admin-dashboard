/* BossMind Admin Dashboard — 3 Projects (Static Cloudflare Pages)
   - No server required
   - Stores config locally in browser (localStorage)
   - Reads:
      1) Orchestrator: /health (and optional endpoints)
      2) Supabase: REST tables for videos + optional products/categories
*/

const LS = {
  ORCH_URL: "bm_orchestrator_base_url",
  SB_URL: "bm_supabase_url",
  SB_ANON: "bm_supabase_anon_key",
  VIDEO_TABLE: "bm_video_table",
  VIDEO_COL_TITLE: "bm_video_col_title",
  VIDEO_COL_STATUS: "bm_video_col_status",
  VIDEO_COL_URL: "bm_video_col_url",
  VIDEO_COL_LANG: "bm_video_col_lang",
  PRODUCTS_TABLE: "bm_products_table",
  CATS_JSON: "bm_categories_json",
};

const DEFAULTS = {
  videoTable: "video_queue",
  videoColTitle: "title",
  videoColStatus: "status",
  videoColUrl: "video_url",
  videoColLang: "lang",
  productsTable: "products",
};

const state = {
  active: "overview",
  orchBase: localStorage.getItem(LS.ORCH_URL) || "",
  sbUrl: localStorage.getItem(LS.SB_URL) || "",
  sbAnon: localStorage.getItem(LS.SB_ANON) || "",
  videoTable: localStorage.getItem(LS.VIDEO_TABLE) || DEFAULTS.videoTable,
  videoColTitle: localStorage.getItem(LS.VIDEO_COL_TITLE) || DEFAULTS.videoColTitle,
  videoColStatus: localStorage.getItem(LS.VIDEO_COL_STATUS) || DEFAULTS.videoColStatus,
  videoColUrl: localStorage.getItem(LS.VIDEO_COL_URL) || DEFAULTS.videoColUrl,
  videoColLang: localStorage.getItem(LS.VIDEO_COL_LANG) || DEFAULTS.videoColLang,
  productsTable: localStorage.getItem(LS.PRODUCTS_TABLE) || DEFAULTS.productsTable,
  categoriesJson: localStorage.getItem(LS.CATS_JSON) || "",
  last: {
    orch: null,
    videos: [],
    products: [],
  },
};

const elApp = document.getElementById("app");

function esc(s){
  return String(s ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
}

function setActive(key){
  state.active = key;
  render();
  if (key === "overview") refreshOverview();
  if (key === "orchestrator") refreshOrchestrator();
  if (key === "videos") refreshVideos();
  if (key === "hero") renderHeroPreviewOnly();
}

function saveConfig(){
  localStorage.setItem(LS.ORCH_URL, state.orchBase.trim());
  localStorage.setItem(LS.SB_URL, state.sbUrl.trim());
  localStorage.setItem(LS.SB_ANON, state.sbAnon.trim());

  localStorage.setItem(LS.VIDEO_TABLE, state.videoTable.trim());
  localStorage.setItem(LS.VIDEO_COL_TITLE, state.videoColTitle.trim());
  localStorage.setItem(LS.VIDEO_COL_STATUS, state.videoColStatus.trim());
  localStorage.setItem(LS.VIDEO_COL_URL, state.videoColUrl.trim());
  localStorage.setItem(LS.VIDEO_COL_LANG, state.videoColLang.trim());

  localStorage.setItem(LS.PRODUCTS_TABLE, state.productsTable.trim());
  localStorage.setItem(LS.CATS_JSON, state.categoriesJson);

  toast("Saved locally (browser).");
}

function clearConfig(){
  Object.values(LS).forEach(k => localStorage.removeItem(k));
  location.reload();
}

function toast(msg){
  const t = document.createElement("div");
  t.className = "notice";
  t.style.position = "fixed";
  t.style.right = "18px";
  t.style.bottom = "18px";
  t.style.zIndex = "9999";
  t.style.maxWidth = "420px";
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(()=> t.remove(), 2200);
}

function normalizeUrl(u){
  const s = (u || "").trim();
  if (!s) return "";
  return s.endsWith("/") ? s.slice(0, -1) : s;
}

async function fetchJson(url, opts = {}){
  const res = await fetch(url, opts);
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  if (!res.ok){
    const err = new Error(`HTTP ${res.status} ${res.statusText}`);
    err.status = res.status;
    err.body = data;
    throw err;
  }
  return data;
}

/* ======================
   ORCHESTRATOR
====================== */
async function orchHealth(){
  const base = normalizeUrl(state.orchBase);
  if (!base) return { ok:false, reason:"No orchestrator URL set." };

  const url = `${base}/health`;
  try{
    const data = await fetchJson(url, { method:"GET" });
    return { ok:true, url, data };
  }catch(e){
    return { ok:false, url, error: { message: e.message, status: e.status, body: e.body } };
  }
}

/* ======================
   SUPABASE REST
====================== */
function sbHeaders(){
  const anon = (state.sbAnon || "").trim();
  const headers = {
    "Content-Type": "application/json",
  };
  if (anon){
    headers["apikey"] = anon;
    headers["Authorization"] = `Bearer ${anon}`;
  }
  return headers;
}

function sbBase(){
  const u = normalizeUrl(state.sbUrl);
  return u ? u : "";
}

async function sbSelect(table, select = "*", limit = 50, order = ""){
  const base = sbBase();
  if (!base) throw new Error("No Supabase URL set.");
  if (!state.sbAnon.trim()) throw new Error("No Supabase publishable (anon) key set.");

  const t = encodeURIComponent(table);
  const params = new URLSearchParams();
  params.set("select", select);
  params.set("limit", String(limit));
  if (order) params.set("order", order);

  const url = `${base}/rest/v1/${t}?${params.toString()}`;
  return await fetchJson(url, { headers: sbHeaders() });
}

async function loadVideos(){
  const t = state.videoTable.trim();
  const cols = [
    state.videoColTitle.trim(),
    state.videoColStatus.trim(),
    state.videoColUrl.trim(),
    state.videoColLang.trim(),
    "id",
    "created_at",
  ].filter(Boolean);

  const select = Array.from(new Set(cols)).join(",");
  const rows = await sbSelect(t, select, 50, "created_at.desc");
  return Array.isArray(rows) ? rows : [];
}

async function loadProducts(){
  const t = state.productsTable.trim();
  const rows = await sbSelect(t, "*", 30, "created_at.desc");
  return Array.isArray(rows) ? rows : [];
}

/* ======================
   RENDER
====================== */
function navItem(icon, title, key, pillText = ""){
  const active = state.active === key ? "active" : "";
  return `
    <button class="navItem ${active}" data-nav="${esc(key)}">
      <div class="left">
        <span class="badge" style="width:28px;height:28px">${esc(icon)}</span>
        <div style="display:flex;flex-direction:column;gap:2px">
          <div style="font-size:12px;font-weight:700">${esc(title)}</div>
          <div style="font-size:11px;color:rgba(255,255,255,.55)">${esc(key)}</div>
        </div>
      </div>
      ${pillText ? `<span class="pill">${esc(pillText)}</span>` : `<span class="pill">Open</span>`}
    </button>
  `;
}

function render(){
  elApp.innerHTML = `
    <div class="wrap">
      <aside class="sidebar">
        <div class="brand">
          <div class="badge"><strong>BM</strong></div>
          <div>
            <h1>BossMind Admin Dashboard</h1>
            <p>3 Projects • Cloudflare Pages • Read-safe</p>
          </div>
        </div>

        <div class="nav">
          <div class="navGroupTitle">Core</div>
          ${navItem("◉","Overview","overview","Live")}

          <div class="navGroupTitle">Projects</div>
          ${navItem("🧠","BossMind Orchestrator","orchestrator","Health")}
          ${navItem("🎬","AI Video Generator","videos","Queue")}
          ${navItem("🏗️","AI Builder / Hero Page","hero","UI")}

          <div class="navGroupTitle">System</div>
          ${navItem("⚙️","Connections","connections","Config")}
        </div>

        <div class="footerNote">
          No destructive actions. Config stored in your browser only.
        </div>
      </aside>

      <main class="main">
        ${renderTopbar()}
        <div class="grid">
          ${renderPanel()}
        </div>
      </main>
    </div>
  `;

  // nav clicks
  document.querySelectorAll("[data-nav]").forEach(btn=>{
    btn.addEventListener("click", () => setActive(btn.getAttribute("data-nav")));
  });

  wirePanelEvents();
}

function renderTopbar(){
  const subtitles = {
    overview: "Realtime snapshot from Orchestrator + Supabase",
    orchestrator: "Orchestrator health + endpoints",
    videos: "Video queue pulled from Supabase (REST)",
    hero: "Hero page preview + categories",
    connections: "Set URLs and publishable keys (stored locally)",
  };
  return `
    <div class="topbar">
      <div class="hTitle">
        <h2>${esc(panelTitle())}</h2>
        <span>${esc(subtitles[state.active] || "")}</span>
      </div>
      <div class="actions">
        <button class="btn" id="btnRefresh">Refresh</button>
        <button class="btn primary" id="btnSave">Save</button>
        <button class="btn danger" id="btnClear">Reset</button>
      </div>
    </div>
  `;
}

function panelTitle(){
  if (state.active === "overview") return "Overview";
  if (state.active === "orchestrator") return "BossMind Orchestrator";
  if (state.active === "videos") return "AI Video Generator";
  if (state.active === "hero") return "AI Builder / Hero Page";
  if (state.active === "connections") return "Connections";
  return "Dashboard";
}

function renderPanel(){
  if (state.active === "overview") return renderOverview();
  if (state.active === "orchestrator") return renderOrchestrator();
  if (state.active === "videos") return renderVideos();
  if (state.active === "hero") return renderHero();
  if (state.active === "connections") return renderConnections();
  return `<div class="card"><div class="cardBody">Unknown panel.</div></div>`;
}

function renderOverview(){
  return `
    <div class="cards3">
      ${statusCard("Orchestrator", "orch", state.last.orch)}
      ${statusCard("Video Queue", "videos", state.last.videos)}
      ${statusCard("Hero / Products", "products", state.last.products)}
    </div>

    <div class="card">
      <div class="cardHead">
        <h3>Live Feed</h3>
        <div class="meta">Read-only activity</div>
      </div>
      <div class="cardBody">
        <div class="previewBox" id="liveFeed">
          <div class="small">Press Refresh to load current status.</div>
        </div>
      </div>
    </div>
  `;
}

function statusCard(title, kind, data){
  const { dot, line1, line2 } = statusSummary(kind, data);
  return `
    <div class="card">
      <div class="cardHead">
        <h3>${esc(title)}</h3>
        <div class="meta"><span class="statusDot ${dot}"></span>${esc(dotLabel(dot))}</div>
      </div>
      <div class="cardBody">
        <div style="font-size:22px;font-weight:850;letter-spacing:.2px">${esc(line1)}</div>
        <div class="small">${esc(line2)}</div>
      </div>
    </div>
  `;
}

function dotLabel(dot){
  if (dot === "good") return "OK";
  if (dot === "warn") return "Needs config";
  if (dot === "bad") return "Error";
  return "Unknown";
}

function statusSummary(kind, data){
  if (kind === "orch"){
    if (!state.orchBase.trim()) return { dot:"warn", line1:"Not set", line2:"Paste Railway Orchestrator Public URL" };
    if (!data) return { dot:"warn", line1:"Unknown", line2:"Press Refresh to check /health" };
    return data.ok
      ? { dot:"good", line1:"Online", line2: `Health: ${safeOneLine(JSON.stringify(data.data))}` }
      : { dot:"bad", line1:"Offline", line2: `${data.error?.message || data.reason || "Failed"}${data.url ? " • " + data.url : ""}` };
  }

  if (kind === "videos"){
    if (!state.sbUrl.trim() || !state.sbAnon.trim()) return { dot:"warn", line1:"Not set", line2:"Add Supabase URL + publishable key" };
    const n = Array.isArray(data) ? data.length : 0;
    return { dot: n>0 ? "good" : "warn", line1: String(n), line2:`Rows from ${state.videoTable}` };
  }

  if (kind === "products"){
    if (!state.sbUrl.trim() || !state.sbAnon.trim()) return { dot:"warn", line1:"Not set", line2:"Add Supabase URL + publishable key" };
    const n = Array.isArray(data) ? data.length : 0;
    return { dot: n>0 ? "good" : "warn", line1: String(n), line2:`Rows from ${state.productsTable}` };
  }

  return { dot:"warn", line1:"—", line2:"—" };
}

function safeOneLine(s){
  const t = String(s || "");
  return t.length > 120 ? (t.slice(0,117) + "...") : t;
}

function renderOrchestrator(){
  const base = esc(state.orchBase);
  const last = state.last.orch;

  return `
    <div class="card">
      <div class="cardHead">
        <h3>Orchestrator Base URL</h3>
        <div class="meta">Railway Public Networking</div>
      </div>
      <div class="cardBody">
        <div class="fieldRow">
          <input class="input" id="orchBase" placeholder="https://bossmind-orchestrator-production.up.railway.app" value="${base}">
          <button class="btn primary" id="orchTest">Test /health</button>
        </div>
        <div class="small">Stored locally. No tokens. Read-only calls.</div>
      </div>
    </div>

    <div class="card">
      <div class="cardHead">
        <h3>Latest Health Result</h3>
        <div class="meta">${last ? (last.ok ? "Online" : "Error") : "Not checked"}</div>
      </div>
      <div class="cardBody">
        ${renderHealthKV(last)}
      </div>
    </div>
  `;
}

function renderHealthKV(last){
  if (!last) return `<div class="small">Press Refresh or Test /health.</div>`;
  if (last.ok){
    return `
      <div class="kv"><div class="k">URL</div><div class="v">${esc(last.url)}</div></div>
      <div class="kv"><div class="k">Response</div><div class="v">${esc(JSON.stringify(last.data))}</div></div>
    `;
  }
  return `
    <div class="kv"><div class="k">URL</div><div class="v">${esc(last.url || "")}</div></div>
    <div class="kv"><div class="k">Error</div><div class="v">${esc(last.error?.message || last.reason || "Failed")}</div></div>
    <div class="kv"><div class="k">Status</div><div class="v">${esc(String(last.error?.status ?? ""))}</div></div>
    <div class="kv"><div class="k">Body</div><div class="v">${esc(JSON.stringify(last.error?.body ?? ""))}</div></div>
  `;
}

function renderVideos(){
  const rows = Array.isArray(state.last.videos) ? state.last.videos : [];
  const titleKey = state.videoColTitle.trim();
  const statusKey = state.videoColStatus.trim();
  const urlKey = state.videoColUrl.trim();
  const langKey = state.videoColLang.trim();

  return `
    <div class="card">
      <div class="cardHead">
        <h3>Video Queue Source</h3>
        <div class="meta">Supabase REST</div>
      </div>
      <div class="cardBody">
        <div class="split">
          <div>
            <div class="small">Table name</div>
            <input class="input" id="videoTable" value="${esc(state.videoTable)}" />
          </div>
          <div>
            <div class="small">Products table (for hero)</div>
            <input class="input" id="productsTable" value="${esc(state.productsTable)}" />
          </div>
        </div>

        <div class="split" style="margin-top:10px">
          <div>
            <div class="small">Title column</div>
            <input class="input" id="videoColTitle" value="${esc(titleKey)}" />
          </div>
          <div>
            <div class="small">Status column</div>
            <input class="input" id="videoColStatus" value="${esc(statusKey)}" />
          </div>
        </div>

        <div class="split" style="margin-top:10px">
          <div>
            <div class="small">Video URL column</div>
            <input class="input" id="videoColUrl" value="${esc(urlKey)}" />
          </div>
          <div>
            <div class="small">Language column</div>
            <input class="input" id="videoColLang" value="${esc(langKey)}" />
          </div>
        </div>

        <div class="small">Press Refresh to load the latest rows.</div>
      </div>
    </div>

    <div class="card">
      <div class="cardHead">
        <h3>Videos (latest)</h3>
        <div class="meta">${rows.length} rows</div>
      </div>
      <div class="cardBody">
        ${rows.length ? renderVideoTable(rows, titleKey, statusKey, urlKey, langKey) : `<div class="small">No rows loaded yet.</div>`}
      </div>
    </div>

    <div class="card">
      <div class="cardHead">
        <h3>Play (if URL exists)</h3>
        <div class="meta">Open link or inline preview</div>
      </div>
      <div class="cardBody">
        <div class="previewBox" id="videoPreview">
          <div class="small">Click “Open” in a row to preview here.</div>
        </div>
      </div>
    </div>
  `;
}

function renderVideoTable(rows, titleKey, statusKey, urlKey, langKey){
  const head = `
    <table class="table">
      <thead>
        <tr>
          <th>Title</th>
          <th>Status</th>
          <th>Lang</th>
          <th class="right">Open</th>
        </tr>
      </thead>
      <tbody>
  `;
  const body = rows.map((r, idx)=>{
    const title = r?.[titleKey] ?? r?.title ?? "";
    const status = r?.[statusKey] ?? r?.status ?? "";
    const lang = r?.[langKey] ?? r?.lang ?? "";
    const url = r?.[urlKey] ?? r?.video_url ?? r?.url ?? "";

    return `
      <tr data-vrow="${idx}">
        <td>${esc(String(title))}</td>
        <td class="mono">${esc(String(status))}</td>
        <td class="mono">${esc(String(lang))}</td>
        <td class="right">
          ${url ? `<button class="btn" data-open="${esc(String(url))}">Open</button>` : `<span class="pill">No URL</span>`}
        </td>
      </tr>
    `;
  }).join("");
  const foot = `</tbody></table>`;
  return head + body + foot;
}

function renderHero(){
  return `
    <div class="card">
      <div class="cardHead">
        <h3>Hero Page Categories</h3>
        <div class="meta">Paste categories JSON</div>
      </div>
      <div class="cardBody">
        <textarea class="input" id="catsJson" rows="8" placeholder='Paste JSON array here' style="resize:vertical">${esc(state.categoriesJson)}</textarea>
        <div class="small">This controls the sidebar categories shown in the Hero preview.</div>
      </div>
    </div>

    <div class="card">
      <div class="cardHead">
        <h3>Hero Preview (Active/Reactive)</h3>
        <div class="meta">Luxury layout</div>
      </div>
      <div class="cardBody">
        <div class="previewBox" id="heroPreview"></div>
        <div class="footerNote">Hero preview is local UI. Products list can be pulled from Supabase after Refresh (if table exists).</div>
      </div>
    </div>
  `;
}

function renderHeroPreviewOnly(){
  const box = document.getElementById("heroPreview");
  if (!box) return;

  const parsed = parseCategories(state.categoriesJson);
  const cats = parsed.ok ? parsed.value : [];
  const products = Array.isArray(state.last.products) ? state.last.products : [];

  box.innerHTML = `
    <div style="display:grid;grid-template-columns:260px 1fr;gap:14px">
      <div style="border:1px solid rgba(255,255,255,.08);border-radius:18px;padding:12px;background:rgba(0,0,0,.18)">
        <div style="font-weight:800;font-size:12px;margin-bottom:10px;color:rgba(255,255,255,.86)">Categories</div>
        ${
          cats.length
            ? cats.map(c => `<div style="padding:10px 10px;border-radius:14px;border:1px solid rgba(255,255,255,.06);background:rgba(255,255,255,.02);margin-bottom:8px">${esc(catLabel(c))}</div>`).join("")
            : `<div class="notice">No categories JSON loaded yet.</div>`
        }
      </div>

      <div style="border:1px solid rgba(255,255,255,.08);border-radius:18px;padding:12px;background:rgba(0,0,0,.18)">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px">
          <div style="font-weight:900;font-size:14px">ElegancyArt Hero</div>
          <span class="pill">Preview</span>
        </div>
        <div style="color:rgba(255,255,255,.65);font-size:12px;margin-bottom:12px">
          Active/Reactive layout. Sidebar categories + product surface.
        </div>

        <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px">
          ${
            products.length
              ? products.slice(0,9).map(p => `
                <div style="border:1px solid rgba(255,255,255,.08);border-radius:18px;padding:12px;background:rgba(255,255,255,.02)">
                  <div style="font-weight:850;font-size:12px">${esc(p?.title || p?.name || "Product")}</div>
                  <div style="margin-top:6px;color:rgba(255,255,255,.55);font-size:11px">${esc(p?.category || p?.subcategory || "")}</div>
                  <div style="margin-top:10px" class="pill">${esc(String(p?.price ?? ""))}</div>
                </div>
              `).join("")
              : `<div class="notice" style="grid-column:1/-1">No products loaded yet. Press Refresh (needs a products table in Supabase).</div>`
          }
        </div>
      </div>
    </div>
  `;
}

function catLabel(c){
  if (typeof c === "string") return c;
  if (c && typeof c === "object"){
    return c.name || c.title || JSON.stringify(c);
  }
  return String(c ?? "");
}

function parseCategories(json){
  const s = (json || "").trim();
  if (!s) return { ok:true, value: [] };
  try{
    const v = JSON.parse(s);
    if (!Array.isArray(v)) return { ok:false, error:"Categories JSON must be an array." };
    return { ok:true, value: v };
  }catch(e){
    return { ok:false, error: e.message };
  }
}

function renderConnections(){
  return `
    <div class="card">
      <div class="cardHead">
        <h3>Supabase</h3>
        <div class="meta">URL + publishable key</div>
      </div>
      <div class="cardBody">
        <div class="small">Supabase Project URL</div>
        <input class="input" id="sbUrl" placeholder="https://YOUR_PROJECT.supabase.co" value="${esc(state.sbUrl)}" />
        <div style="height:10px"></div>
        <div class="small">Supabase publishable (anon) key</div>
        <input class="input" id="sbAnon" placeholder="sb_publishable_..." value="${esc(state.sbAnon)}" />
        <div class="small">This is safe for browser use with RLS policies enabled.</div>
      </div>
    </div>

    <div class="card">
      <div class="cardHead">
        <h3>Orchestrator</h3>
        <div class="meta">Railway Public URL</div>
      </div>
      <div class="cardBody">
        <div class="small">Railway Public Base URL</div>
        <input class="input" id="orchBase2" placeholder="https://bossmind-orchestrator-production.up.railway.app" value="${esc(state.orchBase)}" />
        <div class="small">Used for /health calls.</div>
      </div>
    </div>

    <div class="card">
      <div class="cardHead">
        <h3>Safety</h3>
        <div class="meta">Read-only mode</div>
      </div>
      <div class="cardBody">
        <div class="notice">
          This dashboard does NOT write to Supabase and does NOT call destructive endpoints.
          It only reads /health and reads tables via Supabase REST.
        </div>
      </div>
    </div>
  `;
}

function wirePanelEvents(){
  // top buttons
  const btnRefresh = document.getElementById("btnRefresh");
  const btnSave = document.getElementById("btnSave");
  const btnClear = document.getElementById("btnClear");
  if (btnRefresh) btnRefresh.onclick = () => doRefresh();
  if (btnSave) btnSave.onclick = () => { pullInputs(); saveConfig(); renderHeroPreviewOnly(); };
  if (btnClear) btnClear.onclick = () => clearConfig();

  // per panel wiring
  if (state.active === "orchestrator"){
    const orchTest = document.getElementById("orchTest");
    if (orchTest) orchTest.onclick = async () => {
      pullInputs();
      state.last.orch = await orchHealth();
      render();
    };
  }

  // videos open preview
  document.querySelectorAll("[data-open]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const url = btn.getAttribute("data-open");
      previewVideo(url);
    });
  });

  // hero preview render
  if (state.active === "hero"){
    renderHeroPreviewOnly();
  }
}

function pullInputs(){
  const orchBase = document.getElementById("orchBase") || document.getElementById("orchBase2");
  const sbUrl = document.getElementById("sbUrl");
  const sbAnon = document.getElementById("sbAnon");

  const videoTable = document.getElementById("videoTable");
  const productsTable = document.getElementById("productsTable");
  const vct = document.getElementById("videoColTitle");
  const vcs = document.getElementById("videoColStatus");
  const vcu = document.getElementById("videoColUrl");
  const vcl = document.getElementById("videoColLang");

  const catsJson = document.getElementById("catsJson");

  if (orchBase) state.orchBase = orchBase.value;
  if (sbUrl) state.sbUrl = sbUrl.value;
  if (sbAnon) state.sbAnon = sbAnon.value;

  if (videoTable) state.videoTable = videoTable.value;
  if (productsTable) state.productsTable = productsTable.value;
  if (vct) state.videoColTitle = vct.value;
  if (vcs) state.videoColStatus = vcs.value;
  if (vcu) state.videoColUrl = vcu.value;
  if (vcl) state.videoColLang = vcl.value;

  if (catsJson) state.categoriesJson = catsJson.value;
}

async function doRefresh(){
  pullInputs();
  saveConfig();

  if (state.active === "overview"){
    await refreshOverview();
    render();
    return;
  }
  if (state.active === "orchestrator"){
    await refreshOrchestrator();
    render();
    return;
  }
  if (state.active === "videos"){
    await refreshVideos();
    render();
    return;
  }
  if (state.active === "hero"){
    await refreshHero();
    render();
    return;
  }
  if (state.active === "connections"){
    toast("Saved config. Switch panels and press Refresh.");
  }
}

async function refreshOverview(){
  const feed = document.getElementById("liveFeed");
  if (feed) feed.innerHTML = `<div class="small">Loading…</div>`;

  state.last.orch = await orchHealth();

  try{
    state.last.videos = await loadVideos();
  }catch(e){
    state.last.videos = [];
  }

  try{
    state.last.products = await loadProducts();
  }catch(e){
    state.last.products = [];
  }

  if (feed){
    const orchLine = state.last.orch?.ok ? "Orchestrator: Online" : "Orchestrator: Offline";
    const vidLine = `Videos: ${state.last.videos.length}`;
    const prodLine = `Products: ${state.last.products.length}`;
    feed.innerHTML = `
      <div class="kv"><div class="k">Now</div><div class="v">${esc(new Date().toISOString())}</div></div>
      <div class="kv"><div class="k">Core</div><div class="v">${esc(orchLine)}</div></div>
      <div class="kv"><div class="k">Queue</div><div class="v">${esc(vidLine)}</div></div>
      <div class="kv"><div class="k">Hero</div><div class="v">${esc(prodLine)}</div></div>
    `;
  }
}

async function refreshOrchestrator(){
  state.last.orch = await orchHealth();
}

async function refreshVideos(){
  try{
    state.last.videos = await loadVideos();
  }catch(e){
    toast(e.message || "Failed to load videos.");
    state.last.videos = [];
  }
}

async function refreshHero(){
  try{
    state.last.products = await loadProducts();
  }catch(e){
    state.last.products = [];
  }
  renderHeroPreviewOnly();
}

function previewVideo(url){
  const box = document.getElementById("videoPreview");
  if (!box) return;
  const u = (url || "").trim();
  if (!u){
    box.innerHTML = `<div class="small">No URL.</div>`;
    return;
  }

  // Inline if direct video file. Otherwise open link.
  const lower = u.toLowerCase();
  const isDirectVideo =
    lower.endsWith(".mp4") || lower.endsWith(".webm") || lower.endsWith(".mov") || lower.endsWith(".m3u8");

  box.innerHTML = `
    <div class="kv"><div class="k">URL</div><div class="v">${esc(u)}</div></div>
    <div style="height:10px"></div>
    <div style="display:flex;gap:10px;flex-wrap:wrap">
      <a class="btn primary" href="${esc(u)}" target="_blank" rel="noreferrer">Open in new tab</a>
    </div>
    <div style="height:12px"></div>
    ${
      isDirectVideo
        ? `<video controls style="width:100%;border-radius:18px;border:1px solid rgba(255,255,255,.10);background:rgba(0,0,0,.30)" src="${esc(u)}"></video>`
        : `<div class="notice">This URL is not a direct video file. Use “Open in new tab”.</div>`
    }
  `;
}

/* Boot */
render();
refreshOverview();
