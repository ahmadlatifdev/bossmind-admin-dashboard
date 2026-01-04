/* BossMind Admin Dashboard (Static)
   - Routing (views)
   - Local settings (API bases)
   - Switch Control (local toggles)
   - Logs (local log stream)
   - Health checks (API if configured, otherwise safe mock)
   - Backup triggers (API if configured, otherwise safe mock)
*/

(() => {
  "use strict";

  /* =========================
     Helpers
  ========================= */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const nowISO = () => new Date().toISOString();
  const niceTime = (d = new Date()) =>
    d.toLocaleString(undefined, { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });

  const safeJSONParse = (s, fallback) => {
    try { return JSON.parse(s); } catch { return fallback; }
  };

  const storage = {
    get(key, fallback) {
      const v = localStorage.getItem(key);
      if (v === null || v === undefined) return fallback;
      return safeJSONParse(v, fallback);
    },
    set(key, val) {
      localStorage.setItem(key, JSON.stringify(val));
    },
    del(key) {
      localStorage.removeItem(key);
    }
  };

  const delay = (ms) => new Promise((r) => setTimeout(r, ms));

  const clampText = (s, max = 120) => (String(s).length > max ? String(s).slice(0, max - 1) + "…" : String(s));

  /* =========================
     Constants / Keys
  ========================= */
  const LS_SETTINGS = "bm_admin_settings_v1";
  const LS_SWITCHES = "bm_admin_switches_v1";
  const LS_LOGS = "bm_admin_logs_v1";
  const LS_UI_LOCK = "bm_admin_ui_lock_v1";

  const ROUTES = [
    "overview",
    "project-builder",
    "project-video",
    "project-stock",
    "health",
    "switches",
    "logs",
    "settings"
  ];

  const PROJECTS = {
    builder: {
      key: "builder",
      name: "AI Builder",
      repo: "ahmadlatifdev/elegancyart-ai",
      defaultApiBase: ""
    },
    video: {
      key: "video",
      name: "AI Video Generator",
      repo: "ahmadlatifdev/ai-video-generator",
      defaultApiBase: ""
    },
    stock: {
      key: "stock",
      name: "AI Stocks",
      repo: "ahmadlatifdev/bossmind-orchestrator",
      defaultApiBase: ""
    }
  };

  const DEFAULT_SETTINGS = {
    apiBase: {
      builder: "",
      video: "",
      stock: ""
    },
    buildStamp: "static",
    orchestrator: {
      connected: false
    }
  };

  const DEFAULT_SWITCHES = {
    global: {
      maintenance_mode: false,
      feature_autofix: true,
      feature_backups: true,
      feature_logs: true
    },
    builder: {
      enable_deepseek: true,
      enable_supabase: true,
      enable_stripe: true,
      enable_autopublish: false
    },
    video: {
      enable_deepseek: true,
      enable_queue: true,
      enable_youtube_upload: false,
      enable_multilang: true
    },
    stock: {
      enable_risk_sentinel: true,
      enable_paper_trading: true,
      enable_live_trading: false
    }
  };

  const SWITCH_META = {
    global: [
      { key: "maintenance_mode", name: "Maintenance Mode", desc: "Freeze writes and show maintenance state across systems." },
      { key: "feature_autofix", name: "Auto-Fix", desc: "Allow BossMind to auto-fix recoverable errors." },
      { key: "feature_backups", name: "Backups", desc: "Enable backup buttons and backup calls." },
      { key: "feature_logs", name: "Logs", desc: "Enable log recording and export." }
    ],
    builder: [
      { key: "enable_deepseek", name: "DeepSeek", desc: "Enable AI generation routes." },
      { key: "enable_supabase", name: "Supabase", desc: "Enable database persistence." },
      { key: "enable_stripe", name: "Stripe", desc: "Enable billing/credits calls." },
      { key: "enable_autopublish", name: "Auto Publish", desc: "Allow publishing workflows (off by default)." }
    ],
    video: [
      { key: "enable_deepseek", name: "DeepSeek", desc: "Enable AI script/scenario generation." },
      { key: "enable_queue", name: "Queue Engine", desc: "Enable queue processing." },
      { key: "enable_youtube_upload", name: "YouTube Upload", desc: "Allow upload jobs (off by default)." },
      { key: "enable_multilang", name: "Multi-language", desc: "Enable title/description translations." }
    ],
    stock: [
      { key: "enable_risk_sentinel", name: "Risk Sentinel", desc: "Risk controls & guardrails." },
      { key: "enable_paper_trading", name: "Paper Trading", desc: "Safe simulation mode." },
      { key: "enable_live_trading", name: "Live Trading", desc: "Real trading (off by default)." }
    ]
  };

  /* =========================
     State
  ========================= */
  const state = {
    route: "overview",
    settings: storage.get(LS_SETTINGS, DEFAULT_SETTINGS),
    switches: storage.get(LS_SWITCHES, DEFAULT_SWITCHES),
    logs: storage.get(LS_LOGS, []),
    uiLocked: storage.get(LS_UI_LOCK, false),

    health: {
      builder: { status: "unknown", note: "—", at: null },
      video: { status: "unknown", note: "—", at: null },
      stock: { status: "unknown", note: "—", at: null }
    }
  };

  /* =========================
     UI References
  ========================= */
  const ui = {
    crumbCurrent: $("#crumbCurrent"),
    globalStatusText: $("#globalStatusText"),
    globalStatus: $("#globalStatus"),
    btnRunHealth: $("#btnRunHealth"),
    btnBackupAll: $("#btnBackupAll"),
    btnLockUI: $("#btnLockUI"),
    modeLabel: $("#modeLabel"),

    modal: $("#modal"),
    modalTitle: $("#modalTitle"),
    modalBody: $("#modalBody"),
    modalActions: $("#modalActions"),

    toast: $("#toast"),

    buildStamp: $("#buildStamp"),

    sidebar: $(".sidebar"),
    btnToggleSidebar: $("#btnToggleSidebar"),

    healthGrid: $("#healthGrid"),
    logAll: $("#logAll"),

    builderApiBase: $("#builderApiBase"),
    videoApiBase: $("#videoApiBase"),
    stockApiBase: $("#stockApiBase"),

    maintenanceLabel: $("#maintenanceLabel"),
    backupLabel: $("#backupLabel"),
    orchestratorLabel: $("#orchestratorLabel"),
    activityLabel: $("#activityLabel")
  };

  /* =========================
     Logs
  ========================= */
  const addLog = (scope, message, level = "info", extra = null) => {
    const entry = {
      id: crypto?.randomUUID ? crypto.randomUUID() : String(Date.now()) + "_" + Math.random().toString(16).slice(2),
      at: nowISO(),
      time: niceTime(new Date()),
      scope,
      level,
      message: String(message),
      extra
    };
    state.logs.unshift(entry);
    state.logs = state.logs.slice(0, 600);
    storage.set(LS_LOGS, state.logs);
    renderLogs();
    setActivity(entry.time);
  };

  const clearLogs = () => {
    state.logs = [];
    storage.set(LS_LOGS, state.logs);
    renderLogs();
    toast("Logs cleared.");
  };

  const exportLogs = () => {
    const blob = new Blob([JSON.stringify(state.logs, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bossmind-logs-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    addLog("system", "Exported logs as JSON.", "info");
  };

  /* =========================
     Toast
  ========================= */
  let toastTimer = null;
  const toast = (msg) => {
    if (!ui.toast) return;
    ui.toast.textContent = clampText(msg, 140);
    ui.toast.classList.add("is-show");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => ui.toast.classList.remove("is-show"), 2200);
  };

  /* =========================
     Modal
  ========================= */
  const openModal = ({ title = "Confirm", body = "", actions = [] }) => {
    ui.modalTitle.textContent = title;
    ui.modalBody.innerHTML = body;
    ui.modalActions.innerHTML = "";

    actions.forEach((a) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = a.className || "btn btn-secondary";
      btn.textContent = a.label || "OK";
      btn.addEventListener("click", () => {
        if (a.onClick) a.onClick();
        closeModal();
      });
      ui.modalActions.appendChild(btn);
    });

    ui.modal.classList.add("is-open");
    ui.modal.setAttribute("aria-hidden", "false");
  };

  const closeModal = () => {
    ui.modal.classList.remove("is-open");
    ui.modal.setAttribute("aria-hidden", "true");
  };

  /* =========================
     Routing
  ========================= */
  const setRoute = (route) => {
    if (!ROUTES.includes(route)) route = "overview";
    state.route = route;

    // set active nav
    $$(".nav-item").forEach((b) => {
      b.classList.toggle("is-active", b.dataset.route === route);
    });

    // set active view
    $$(".view").forEach((v) => {
      v.classList.toggle("is-active", v.dataset.view === route);
    });

    // crumb
    const labelMap = {
      overview: "Overview",
      "project-builder": "AI Builder",
      "project-video": "AI Video Generator",
      "project-stock": "AI Stocks",
      health: "Health Check",
      switches: "Switch Control",
      logs: "Logs",
      settings: "Settings"
    };
    ui.crumbCurrent.textContent = labelMap[route] || "Overview";

    // close sidebar on mobile
    if (ui.sidebar?.classList.contains("is-open")) ui.sidebar.classList.remove("is-open");
  };

  /* =========================
     Data Binding
  ========================= */
  const setBind = (keyPath, value) => {
    $$(`[data-bind="${keyPath}"]`).forEach((el) => {
      el.textContent = value;
    });
  };

  const setMiniStatus = (projectKey, status, note) => {
    const card = $(`.project-card[data-project="${projectKey}"]`);
    if (!card) return;

    const textEl = $(`[data-bind="${projectKey}.statusText"]`, card) || $(`[data-bind="${projectKey}.statusText"]`);
    if (textEl) textEl.textContent = note;

    const dot = $(".mini-dot", card);
    dot?.classList.remove("dot-good", "dot-warn", "dot-bad");
    if (status === "good") dot?.classList.add("dot-good");
    if (status === "warn") dot?.classList.add("dot-warn");
    if (status === "bad") dot?.classList.add("dot-bad");

    // also update lastCheck bind
    setBind(`${projectKey}.lastCheck`, state.health[projectKey]?.at ? state.health[projectKey].at : "—");
  };

  /* =========================
     Switch Rendering
  ========================= */
  const renderSwitchLists = () => {
    $$(`.switch-list`).forEach((container) => {
      const scope = container.dataset.switchScope;
      if (!scope || !state.switches[scope]) return;

      container.innerHTML = "";
      const meta = SWITCH_META[scope] || [];

      meta.forEach((m) => {
        const row = document.createElement("div");
        row.className = "switch-row";

        const left = document.createElement("div");
        left.className = "switch-meta";

        const name = document.createElement("div");
        name.className = "switch-name";
        name.textContent = m.name;

        const desc = document.createElement("div");
        desc.className = "switch-desc";
        desc.textContent = m.desc;

        left.appendChild(name);
        left.appendChild(desc);

        const toggle = document.createElement("div");
        toggle.className = "toggle" + (state.switches[scope][m.key] ? " is-on" : "");
        toggle.setAttribute("role", "switch");
        toggle.setAttribute("tabindex", state.uiLocked ? "-1" : "0");
        toggle.setAttribute("aria-checked", String(!!state.switches[scope][m.key]));
        toggle.setAttribute("data-scope", scope);
        toggle.setAttribute("data-key", m.key);

        const onToggle = () => {
          if (state.uiLocked) return toast("UI is locked.");
          state.switches[scope][m.key] = !state.switches[scope][m.key];
          toggle.classList.toggle("is-on", state.switches[scope][m.key]);
          toggle.setAttribute("aria-checked", String(!!state.switches[scope][m.key]));
          renderSummary();
        };

        toggle.addEventListener("click", onToggle);
        toggle.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle();
          }
        });

        row.appendChild(left);
        row.appendChild(toggle);
        container.appendChild(row);
      });
    });
  };

  const saveSwitches = () => {
    storage.set(LS_SWITCHES, state.switches);
    addLog("system", "Switches saved.", "info", { switches: state.switches });
    toast("Switches saved.");
    renderSummary();
  };

  const resetSwitches = () => {
    if (state.uiLocked) return toast("UI is locked.");
    state.switches = structuredClone(DEFAULT_SWITCHES);
    storage.set(LS_SWITCHES, state.switches);
    renderSwitchLists();
    addLog("system", "Switches reset to defaults.", "warn");
    toast("Switches reset.");
    renderSummary();
  };

  /* =========================
     Settings
  ========================= */
  const renderSettings = () => {
    ui.builderApiBase.value = state.settings.apiBase.builder || "";
    ui.videoApiBase.value = state.settings.apiBase.video || "";
    ui.stockApiBase.value = state.settings.apiBase.stock || "";

    setBind("builder.apiBase", state.settings.apiBase.builder || "Not set");
    setBind("video.apiBase", state.settings.apiBase.video || "Not set");
    setBind("stock.apiBase", state.settings.apiBase.stock || "Not set");

    setBind("builder.repo", PROJECTS.builder.repo);
    setBind("video.repo", PROJECTS.video.repo);
    setBind("stock.repo", PROJECTS.stock.repo);
  };

  const saveSettings = () => {
    if (state.uiLocked) return toast("UI is locked.");
    state.settings.apiBase.builder = ui.builderApiBase.value.trim();
    state.settings.apiBase.video = ui.videoApiBase.value.trim();
    state.settings.apiBase.stock = ui.stockApiBase.value.trim();

    storage.set(LS_SETTINGS, state.settings);
    renderSettings();
    addLog("system", "Settings saved.", "info", { apiBase: state.settings.apiBase });
    toast("Settings saved.");
  };

  const resetSettings = () => {
    if (state.uiLocked) return toast("UI is locked.");
    state.settings = structuredClone(DEFAULT_SETTINGS);
    storage.set(LS_SETTINGS, state.settings);
    renderSettings();
    addLog("system", "Settings reset to defaults.", "warn");
    toast("Settings reset.");
  };

  /* =========================
     Health Checks
  ========================= */
  const setGlobalStatus = (text) => {
    ui.globalStatusText.textContent = text;
  };

  const callJSON = async (url, opts = {}) => {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 9000);

    try {
      const res = await fetch(url, {
        ...opts,
        headers: {
          "Content-Type": "application/json",
          ...(opts.headers || {})
        },
        signal: controller.signal
      });
      const txt = await res.text();
      const data = safeJSONParse(txt, { ok: res.ok, raw: txt });
      return { ok: res.ok, status: res.status, data };
    } finally {
      clearTimeout(t);
    }
  };

  const runHealthFor = async (projectKey) => {
    const apiBase = (state.settings.apiBase[projectKey] || "").trim();
    const at = niceTime(new Date());

    // If no API base, mark warn but functional
    if (!apiBase) {
      state.health[projectKey] = { status: "warn", note: "API not set", at };
      setMiniStatus(projectKey, "warn", "API not set");
      addLog(projectKey, "Health check skipped (API not set).", "warn");
      return state.health[projectKey];
    }

    // Try /health endpoint (standard)
    try {
      const r = await callJSON(`${apiBase.replace(/\/$/, "")}/health`, { method: "GET" });

      if (r.ok) {
        const note = r.data?.status || "OK";
        state.health[projectKey] = { status: "good", note: String(note), at };
        setMiniStatus(projectKey, "good", "Online");
        addLog(projectKey, `Health OK (${note}).`, "info", r.data);
      } else {
        state.health[projectKey] = { status: "bad", note: `HTTP ${r.status}`, at };
        setMiniStatus(projectKey, "bad", `HTTP ${r.status}`);
        addLog(projectKey, `Health FAILED (HTTP ${r.status}).`, "bad", r.data);
      }
    } catch (e) {
      state.health[projectKey] = { status: "bad", note: "Network error", at };
      setMiniStatus(projectKey, "bad", "Network error");
      addLog(projectKey, `Health FAILED (network error).`, "bad", { error: String(e) });
    }

    return state.health[projectKey];
  };

  const runGlobalHealth = async () => {
    setGlobalStatus("Running health check…");
    toast("Running health check…");
    addLog("system", "Global health check started.", "info");

    // render placeholders
    state.health.builder.at = null;
    state.health.video.at = null;
    state.health.stock.at = null;

    // sequential for stability
    await runHealthFor("builder");
    await delay(250);
    await runHealthFor("video");
    await delay(250);
    await runHealthFor("stock");

    renderHealthGrid();
    renderSummary();

    setGlobalStatus("Ready");
    addLog("system", "Global health check finished.", "info");
    toast("Health check complete.");
  };

  const clearHealth = () => {
    if (state.uiLocked) return toast("UI is locked.");
    state.health = {
      builder: { status: "unknown", note: "—", at: null },
      video: { status: "unknown", note: "—", at: null },
      stock: { status: "unknown", note: "—", at: null }
    };
    setMiniStatus("builder", "warn", "Unknown");
    setMiniStatus("video", "warn", "Unknown");
    setMiniStatus("stock", "warn", "Unknown");
    renderHealthGrid();
    renderSummary();
    addLog("system", "Health results cleared.", "warn");
    toast("Health cleared.");
  };

  /* =========================
     Backups
  ========================= */
  const backupProject = async (projectKey) => {
    if (!state.switches.global.feature_backups) {
      toast("Backups are disabled by switch.");
      addLog("system", "Backup blocked: global backups disabled.", "warn");
      return;
    }

    const apiBase = (state.settings.apiBase[projectKey] || "").trim();
    const at = niceTime(new Date());

    if (!apiBase) {
      addLog(projectKey, "Backup simulated (API not set).", "warn", { at });
      toast(`${PROJECTS[projectKey].name}: API not set (simulated backup).`);
      return;
    }

    setGlobalStatus(`Backing up ${PROJECTS[projectKey].name}…`);
    try {
      const r = await callJSON(`${apiBase.replace(/\/$/, "")}/backup`, {
        method: "POST",
        body: JSON.stringify({ scope: projectKey, at })
      });

      if (r.ok) {
        addLog(projectKey, "Backup OK.", "info", r.data);
        toast(`${PROJECTS[projectKey].name}: Backup OK`);
      } else {
        addLog(projectKey, `Backup FAILED (HTTP ${r.status}).`, "bad", r.data);
        toast(`${PROJECTS[projectKey].name}: Backup failed`);
      }
    } catch (e) {
      addLog(projectKey, "Backup FAILED (network error).", "bad", { error: String(e) });
      toast(`${PROJECTS[projectKey].name}: Backup network error`);
    } finally {
      setGlobalStatus("Ready");
      renderSummary();
    }
  };

  const backupAll = async () => {
    if (state.uiLocked) return toast("UI is locked.");
    openModal({
      title: "Backup All Systems",
      body: "This will trigger backup for <b>AI Builder</b>, <b>AI Video Generator</b>, and <b>AI Stocks</b> (API calls if configured, otherwise simulated). Continue?",
      actions: [
        { label: "Cancel", className: "btn btn-ghost" },
        {
          label: "Run Backup",
          className: "btn btn-primary",
          onClick: async () => {
            addLog("system", "Backup all started.", "info");
            await backupProject("builder");
            await delay(250);
            await backupProject("video");
            await delay(250);
            await backupProject("stock");
            addLog("system", "Backup all finished.", "info");
            toast("Backup all complete.");
          }
        }
      ]
    });
  };

  /* =========================
     Rendering
  ========================= */
  const renderHealthGrid = () => {
    if (!ui.healthGrid) return;
    ui.healthGrid.innerHTML = "";

    const items = [
      { key: "builder", title: "AI Builder" },
      { key: "video", title: "AI Video Generator" },
      { key: "stock", title: "AI Stocks" }
    ];

    items.forEach((it) => {
      const h = state.health[it.key];
      const card = document.createElement("div");
      card.className = "health-card";

      const title = document.createElement("div");
      title.className = "health-title";
      title.textContent = it.title;

      const meta = document.createElement("div");
      meta.className = "health-meta";
      meta.textContent = `Last check: ${h.at || "—"}`;

      const pill = document.createElement("div");
      pill.className = "health-pill " + (h.status === "good" ? "is-good" : h.status === "warn" ? "is-warn" : h.status === "bad" ? "is-bad" : "");
      pill.innerHTML = `<span class="pill-dot" aria-hidden="true"></span><span>${h.status.toUpperCase()}</span>`;

      const note = document.createElement("div");
      note.className = "health-meta";
      note.textContent = `Note: ${h.note}`;

      card.appendChild(title);
      card.appendChild(meta);
      card.appendChild(pill);
      card.appendChild(note);

      ui.healthGrid.appendChild(card);
    });
  };

  const renderLogs = () => {
    const toLine = (e) => {
      const lvl = (e.level || "info").toUpperCase();
      return `[${e.time}] [${lvl}] [${e.scope}] ${e.message}`;
    };

    if (ui.logAll) {
      ui.logAll.textContent = state.logs.map(toLine).join("\n");
    }

    // per-scope logboxes
    $$(`[data-log-scope]`).forEach((box) => {
      const scope = box.dataset.logScope;
      const lines = state.logs
        .filter((e) => e.scope === scope || (scope === "system" && e.scope === "system"))
        .slice(0, 80)
        .map(toLine)
        .join("\n");
      box.textContent = lines || "";
    });
  };

  const renderSummary = () => {
    // maintenance
    ui.maintenanceLabel.textContent = state.switches.global.maintenance_mode ? "ON" : "OFF";

    // backups
    ui.backupLabel.textContent = state.switches.global.feature_backups ? "Enabled" : "Disabled";

    // orchestrator label (basic: connected if any api base exists)
    const anyApi =
      !!(state.settings.apiBase.builder || "").trim() ||
      !!(state.settings.apiBase.video || "").trim() ||
      !!(state.settings.apiBase.stock || "").trim();
    ui.orchestratorLabel.textContent = anyApi ? "Configured" : "Not connected";

    // project runtimes
    setBind("builder.runtime", state.settings.apiBase.builder ? "API configured" : "Not connected");
    setBind("video.runtime", state.settings.apiBase.video ? "API configured" : "Not connected");
    setBind("stock.runtime", state.settings.apiBase.stock ? "API configured" : "Not connected");
  };

  const setActivity = (timeText) => {
    if (ui.activityLabel) ui.activityLabel.textContent = timeText || "—";
  };

  /* =========================
     UI Lock
  ========================= */
  const setUILock = (locked) => {
    state.uiLocked = !!locked;
    storage.set(LS_UI_LOCK, state.uiLocked);

    ui.btnLockUI.textContent = state.uiLocked ? "Unlock UI" : "Lock UI";
    ui.modeLabel.textContent = state.uiLocked ? "Locked" : "Admin";

    // disable toggles focus if locked
    $$(".toggle").forEach((t) => t.setAttribute("tabindex", state.uiLocked ? "-1" : "0"));

    addLog("system", state.uiLocked ? "UI locked." : "UI unlocked.", "info");
    toast(state.uiLocked ? "UI locked." : "UI unlocked.");
  };

  /* =========================
     Events
  ========================= */
  const wireNav = () => {
    $$(".nav-item").forEach((btn) => {
      btn.addEventListener("click", () => setRoute(btn.dataset.route));
    });
  };

  const wireActions = () => {
    document.body.addEventListener("click", (e) => {
      const t = e.target;

      // modal close
      const close = t.closest?.(`[data-action="close-modal"]`);
      if (close) return closeModal();

      const actionBtn = t.closest?.("[data-action]");
      if (!actionBtn) return;

      const action = actionBtn.dataset.action;

      if (action === "open-switches") return setRoute("switches");
      if (action === "open-logs") return setRoute("logs");
      if (action === "open-settings") return setRoute("settings");

      if (action === "run-health") return runGlobalHealth();
      if (action === "clear-health") return clearHealth();

      if (action === "save-switches") return saveSwitches();
      if (action === "reset-switches") return resetSwitches();

      if (action === "save-settings") return saveSettings();
      if (action === "reset-settings") return resetSettings();

      if (action === "clear-logs") return clearLogs();
      if (action === "export-logs") return exportLogs();

      if (action === "backup-all") return backupAll();

      if (action === "open-project") {
        const target = actionBtn.dataset.target;
        if (target) return setRoute(target);
      }

      if (action === "project-health") {
        const p = actionBtn.dataset.project;
        if (!p) return;
        runHealthFor(p).then(() => {
          renderHealthGrid();
          renderSummary();
          toast(`${PROJECTS[p].name}: health done`);
        });
        return;
      }

      if (action === "project-backup") {
        const p = actionBtn.dataset.project;
        if (!p) return;
        backupProject(p);
        return;
      }
    });

    // topbar buttons
    ui.btnRunHealth?.addEventListener("click", runGlobalHealth);
    ui.btnBackupAll?.addEventListener("click", backupAll);

    // sidebar toggle (mobile)
    ui.btnToggleSidebar?.addEventListener("click", () => {
      ui.sidebar?.classList.toggle("is-open");
    });

    // lock UI
    ui.btnLockUI?.addEventListener("click", () => setUILock(!state.uiLocked));

    // tabs in switches view
    $$(".tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        if (state.uiLocked) return toast("UI is locked.");
        const key = tab.dataset.tab;
        if (!key) return;

        $$(".tab").forEach((t) => t.classList.toggle("is-active", t === tab));
        $$(".tabpane").forEach((p) => p.classList.toggle("is-active", p.dataset.pane === key));
      });
    });

    // settings input live binds
    [ui.builderApiBase, ui.videoApiBase, ui.stockApiBase].forEach((inp) => {
      inp?.addEventListener("input", () => {
        setBind("builder.apiBase", ui.builderApiBase.value.trim() || "Not set");
        setBind("video.apiBase", ui.videoApiBase.value.trim() || "Not set");
        setBind("stock.apiBase", ui.stockApiBase.value.trim() || "Not set");
      });
    });
  };

  /* =========================
     Boot
  ========================= */
  const boot = () => {
    // stamp
    if (ui.buildStamp) ui.buildStamp.textContent = `Build: ${state.settings.buildStamp || "static"}`;

    // initial binds
    renderSettings();
    renderSwitchLists();
    renderLogs();
    renderHealthGrid();
    renderSummary();

    // init UI lock button label
    ui.btnLockUI.textContent = state.uiLocked ? "Unlock UI" : "Lock UI";
    ui.modeLabel.textContent = state.uiLocked ? "Locked" : "Admin";

    // init mini statuses
    setMiniStatus("builder", "warn", "Unknown");
    setMiniStatus("video", "warn", "Unknown");
    setMiniStatus("stock", "warn", "Unknown");

    // nav wiring
    wireNav();
    wireActions();

    // default route
    setRoute("overview");

    // first log
    addLog("system", "Dashboard booted.", "info");
    setGlobalStatus("Ready");
  };

  // DOM ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
