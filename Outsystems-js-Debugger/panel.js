/*!
 * OutSystems JS Debugger
 * Copyright (c) 2025 RavichandGY
 * All rights reserved.
 *
 * This software is proprietary and confidential.
 * Unauthorized copying, modification, or distribution
 * is strictly prohibited.
 */


/* =========================================================
   Lifecycle groups
========================================================= */
const groups = {
  OnInitialize: [],
  OnReady: [],
  OnRender: [],
  OnClick: [],
  Others: []
};

/* =========================================================
   UI references
========================================================= */
const status = document.getElementById("status");
const runBtn = document.getElementById("run");
const debugBtn = document.getElementById("debug");
const resetBtn = document.getElementById("reset");

/* =========================================================
   CodeMirror editor
========================================================= */
const editor = CodeMirror(document.getElementById("editor"), {
  value: "",
  mode: "javascript",   // 🔴 FORCE JS MODE
  lineNumbers: true,
  indentUnit: 2,
  tabSize: 2,
  gutters: [
    "CodeMirror-linenumbers",
    "breakpoints",
    "CodeMirror-foldgutter"
  ],
  foldGutter: true
});


/* =========================================================
   Pull existing snippets
========================================================= */
chrome.devtools.inspectedWindow.eval(
  "window.__OS_DEBUGGER__ && window.__OS_DEBUGGER__.getAll()",
  result => {
    if (Array.isArray(result)) {
      result.forEach(addSnippet);
    }
  }
);

/* =========================================================
   Live updates
========================================================= */
const port = chrome.runtime.connect({ name: "devtools" });
port.onMessage.addListener(msg => {
  if (msg.action === "snippet") {
    addSnippet(msg.payload);
  }
});

/* =========================================================
   Store snippet
========================================================= */
function addSnippet(snippet) {
  const group = groups[snippet.lifecycle] || groups.Others;
  group.push(snippet);
}

/* =========================================================
   Lifecycle tab click
========================================================= */
const rows = document.querySelectorAll(".row");

rows.forEach(row => {
  row.onclick = () => {
    rows.forEach(r => r.classList.remove("active"));
    row.classList.add("active");
    render(row.dataset.type);
  };
});

/* =========================================================
   Render snippet
========================================================= */
function render(type) {
  const items = groups[type];
  if (!items || items.length === 0) {
    editor.setValue("// No JS found");
    return;
  }

  const s = items[0];
  currentSnippet = s;

  const b = s.breadcrumb;

  editor.setValue(
`// ${b.app} / ${b.module} / ${b.flow} / ${b.screen} / ${b.action}

${s.code}`
  );

  originalCode = editor.getValue();
  status.textContent = "";
}

/* =========================================================
   ▶ Run (re-run logic)
========================================================= */
runBtn.onclick = () => {
  if (!currentSnippet) return;

  chrome.devtools.inspectedWindow.eval(
    `(function(){ ${editor.getValue()} })();`,
    (_, err) => {
      status.textContent = err ? "❌ Error" : "✅ Executed";
    }
  );
};

/* =========================================================
   🐞 Debug (REAL behavior)
========================================================= */
debugBtn.onclick = () => {
  if (!currentSnippet) return;

  // Event-driven JS → patch and wait for click
  if (currentSnippet.lifecycle === "OnClick") {
    chrome.devtools.inspectedWindow.eval(
      `window.__OS_DEBUGGER__.patchEvent("${currentSnippet.actionName}")`,
      result => {
        status.textContent = result
          ? "⏸ Click the button to debug"
          : "❌ Event not found";
      }
    );
    return;
  }

  // Immediate lifecycles → pause now
  chrome.devtools.inspectedWindow.eval(
    `(function(){ debugger; ${editor.getValue()} })();`
  );

  status.textContent = "⏸ Debugging";
};

/* =========================================================
   ↩ Reset
========================================================= */
resetBtn.onclick = () => {
  editor.setValue(originalCode);
  status.textContent = "↩ Reset";
};
