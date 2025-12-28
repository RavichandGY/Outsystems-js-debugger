/*!
 * OutSystems JS Debugger
 * Copyright (c) 2025 RavichandGY
 * All rights reserved.
 */

/* =====================================================
   STATE
===================================================== */
const groups = {
  OnInitialize: [],
  OnReady: [],
  OnRender: [],
  OnAfterFetch: [],
  Others: []
};

let allSnippets = [];
let currentScreen = null;
let activeSnippet = null;

/* =====================================================
   UI ELEMENTS (MATCH HTML EXACTLY)
===================================================== */
const status = document.getElementById("status");
const breadcrumbEl = document.getElementById("breadcrumb");
const breadcrumbLink = document.getElementById("breadcrumb-action");
const runBtn = document.getElementById("run");
const resetBtn = document.getElementById("reset");

/* =====================================================
   CODEMIRROR
===================================================== */
const editor = CodeMirror(document.getElementById("editor"), {
  mode: "javascript",
  lineNumbers: true,
  indentUnit: 2,
  tabSize: 2
});

/* =====================================================
   HELPERS
===================================================== */
function classify(snippet) {
  const n = snippet.module || "";
  if (n.includes(".OnInitialize.")) return "OnInitialize";
  if (n.includes(".OnReady.")) return "OnReady";
  if (n.includes(".OnRender.")) return "OnRender";
  if (n.includes("OnAfterFetch")) return "OnAfterFetch";
  return "Others";
}

function activateTab(type) {
  document.querySelectorAll(".row").forEach(r => {
    r.classList.toggle("active", r.dataset.type === type);
  });
}

function buildBreadcrumb(snippet) {
  if (!snippet || !snippet.module) return "";
  const parts = snippet.module.split(".");
  const app = parts[0];
  const flow = parts[1] || "";
  const screen = snippet.screen || "Global";
  const action = parts[parts.length - 1];
  return `${app} / ${flow} / ${screen} / ${action}`;
}

/**
 * Remove trailing OutSystems closure `};`
 */
function normalizeCode(code) {
  return code.replace(/\}\s*;\s*$/, "").trim();
}

/* =====================================================
   RENDER
===================================================== */
function render(type) {
  const items = groups[type];
  activeSnippet = null;

  if (!items || items.length === 0) {
    editor.setValue(`// No JS found for ${type}`);
    breadcrumbEl.textContent = "";
    status.textContent = `No JS found for ${type}`;
    activateTab(type);
    return;
  }

  activeSnippet = items[0];

  editor.setValue(activeSnippet.code);
  breadcrumbEl.textContent = buildBreadcrumb(activeSnippet);
  status.textContent = `Loaded ${type}`;
  activateTab(type);
}

/* =====================================================
   LOAD SNIPPETS FROM PAGE
===================================================== */
chrome.devtools.inspectedWindow.eval(
  "window.__OS_DEBUGGER__ && window.__OS_DEBUGGER__.getAll()",
  result => {
    if (!Array.isArray(result)) {
      editor.setValue("// No JS found");
      status.textContent = "Debugger not initialized";
      return;
    }

    allSnippets = result;

    const screenSnippet = allSnippets.find(s => s.screen);
    currentScreen = screenSnippet ? screenSnippet.screen : null;

    Object.keys(groups).forEach(k => (groups[k] = []));

    allSnippets
      .filter(s => s.screen === currentScreen || s.screen === null)
      .forEach(s => {
        groups[classify(s)].push(s);
      });

    if (groups.OnReady.length) render("OnReady");
    else if (groups.OnInitialize.length) render("OnInitialize");
    else if (groups.OnAfterFetch.length) render("OnAfterFetch");
    else render("Others");
  }
);

/* =====================================================
   TAB CLICK
===================================================== */
document.querySelectorAll(".row").forEach(row => {
  row.onclick = () => render(row.dataset.type);
});

/* =====================================================
   RUN (EDIT & TEST)
===================================================== */
runBtn.onclick = () => {
  if (!activeSnippet) {
    status.textContent = "No snippet selected";
    return;
  }

  const code = normalizeCode(editor.getValue());

  chrome.devtools.inspectedWindow.eval(
    `(function(){ ${code} })();`,
    () => {
      status.textContent = "Executed (check Console)";
    }
  );
};

/* =====================================================
   RESET
===================================================== */
resetBtn.onclick = () => {
  if (!activeSnippet) return;
  editor.setValue(activeSnippet.code);
  status.textContent = "Snippet reset";
};

/* =====================================================
   NAVIGATE TO SOURCE (FIXED – NO CLIPBOARD)
===================================================== */
breadcrumbLink.onclick = () => {
  if (!activeSnippet) {
    status.textContent = "No snippet selected";
    return;
  }

  chrome.devtools.inspectedWindow.eval(
    `(function() {
      return Array.from(document.scripts)
        .map(s => s.src)
        .filter(Boolean);
    })();`,
    (scripts) => {
      if (!Array.isArray(scripts)) {
        status.textContent = "Unable to inspect loaded scripts";
        return;
      }

      const marker = ".mvc$controller";
      const idx = activeSnippet.module.indexOf(marker);
      if (idx === -1) {
        status.textContent = "Not a screen MVC JS";
        return;
      }

      const app = activeSnippet.module.split(".")[0];
      const screenPath = activeSnippet.module.substring(0, idx);
      const expected = `/${app}/scripts/${screenPath}.mvc.js`;

      // Find real compiled JS (with cache key)
      const realUrl = scripts.find(src => src.includes(expected));

      if (!realUrl) {
        status.textContent = "Compiled JS file not found in page";
        return;
      }

      chrome.devtools.panels.openResource(realUrl, 0);

      // 🔴 Clipboard removed – show guidance instead
      status.textContent =
        `Source opened. In Sources tab press Ctrl+F and search:\n` +
        `define("${activeSnippet.module}")`;
    }
  );
};
