/*!
 * OutSystems JS Debugger – Page Hook
 * Copyright (c) 2025 RavichandGY
 * All rights reserved.
 */

const LIFECYCLES = ["OnInitialize", "OnReady", "OnRender", "OnAfterFetch", "Others"];

const listEl = document.getElementById("list");
const searchEl = document.getElementById("search");
const editor = CodeMirror(document.getElementById("editor"), {
  mode: "javascript",
  lineNumbers: true
});

const breadcrumbEl = document.getElementById("breadcrumb");
const statusEl = document.getElementById("status");
const runBtn = document.getElementById("run");
const resetBtn = document.getElementById("reset");
const breadcrumbAction = document.getElementById("breadcrumb-action");

let allSnippets = [];
let activeSnippet = null;
let currentScreen = null;

/* ============ HELPERS ============ */
function classifyLifecycle(name = "") {
  if (name.includes(".OnInitialize.")) return "OnInitialize";
  if (name.includes(".OnReady.")) return "OnReady";
  if (name.includes(".OnRender.")) return "OnRender";
  if (name.includes("OnAfterFetch")) return "OnAfterFetch";
  return "Others";
}

function extractController(module) {
  const p = module.split(".");
  const idx = p.indexOf("mvc$controller");
  return idx > 0 ? p[idx - 1] : null;
}

function normalizeCode(code) {
  return code.replace(/\}\s*;\s*$/, "").trim();
}

function buildBreadcrumb(s) {
  const p = s.module.split(".");
  return `${p[0]} / ${p[1]} / ${s.owner} / ${p.at(-1)}`;
}

function clearSelection() {
  document.querySelectorAll(".tree-selected").forEach(el =>
    el.classList.remove("tree-selected")
  );
}

/* ============ TREE NODE ============ */
function createNode(label, count, onClick, isParent = false) {
  const node = document.createElement("div");
  node.className = "tree-node";

  const labelEl = document.createElement("div");
  labelEl.className = "tree-label" + (isParent ? " tree-parent" : "");

  const arrow = document.createElement("span");
  arrow.className = "tree-arrow";

  const text = document.createElement("span");
  text.textContent = label;

  const countEl = document.createElement("span");
  countEl.className = "count";
  countEl.textContent = count !== null ? count : "";

  labelEl.append(arrow, text, countEl);
  node.appendChild(labelEl);

  const children = document.createElement("div");
  children.className = "tree-children";
  node.appendChild(children);

  labelEl.onclick = e => {
    e.stopPropagation();
    node.classList.toggle("open");
    if (onClick) onClick(labelEl);
  };

  return { node, children, labelEl };
}

/* ============ RENDER TREE ============ */
function renderTree(snippets) {
  listEl.innerHTML = "";

  const screenNode = createNode(`Screen: ${currentScreen}`, null, null, true);
  listEl.appendChild(screenNode.node);

  const screenLife = {};
  const blocks = {};
  LIFECYCLES.forEach(l => (screenLife[l] = []));

  snippets.forEach(s => {
    const lc = classifyLifecycle(s.module);
    const owner = extractController(s.module);
    if (!owner) return;

    if (owner === currentScreen) {
      s.owner = currentScreen;
      screenLife[lc].push(s);
    } else {
      s.owner = owner;
      blocks[owner] ??= {};
      LIFECYCLES.forEach(l => (blocks[owner][l] ??= []));
      blocks[owner][lc].push(s);
    }
  });

  // Screen lifecycles
  LIFECYCLES.forEach(lc => {
    const list = screenLife[lc];
    const lcNode = createNode(lc, list.length, null, true);
    screenNode.children.appendChild(lcNode.node);

    list.forEach(s => {
      const jsNode = createNode(
        s.module.split(".").at(-1),
        null,
        labelEl => {
          clearSelection();
          labelEl.classList.add("tree-selected");
          activeSnippet = s;
          editor.setValue(s.code);
          breadcrumbEl.textContent = buildBreadcrumb(s);
          statusEl.textContent = "JS loaded";
        }
      );
      lcNode.children.appendChild(jsNode.node);
    });
  });

  // Web Blocks
  const wbNode = createNode("Web Blocks", null, null, true);
  screenNode.children.appendChild(wbNode.node);

  Object.keys(blocks).sort().forEach(block => {
    const blockNode = createNode(block, null, null, true);
    wbNode.children.appendChild(blockNode.node);

    LIFECYCLES.forEach(lc => {
      const list = blocks[block][lc];
      const lcNode = createNode(lc, list.length, null, true);
      blockNode.children.appendChild(lcNode.node);

      list.forEach(s => {
        const jsNode = createNode(
          s.module.split(".").at(-1),
          null,
          labelEl => {
            clearSelection();
            labelEl.classList.add("tree-selected");
            activeSnippet = s;
            editor.setValue(s.code);
            breadcrumbEl.textContent = buildBreadcrumb(s);
            statusEl.textContent = "JS loaded";
          }
        );
        lcNode.children.appendChild(jsNode.node);
      });
    });
  });
}

/* ============ SEARCH ============ */
searchEl.oninput = () => {
  const q = searchEl.value.toLowerCase();
  document.querySelectorAll(".tree-node").forEach(n => {
    const txt = n.textContent.toLowerCase();
    n.style.display = txt.includes(q) ? "" : "none";
    if (q && txt.includes(q)) n.classList.add("open");
  });
};

/* ============ LOAD ============ */
chrome.devtools.inspectedWindow.eval(
  "window.__OS_DEBUGGER__ && window.__OS_DEBUGGER__.getAll()",
  res => {
    if (!Array.isArray(res)) return;
    allSnippets = res;
    currentScreen = res.find(s => s.screen)?.screen || "Screen";
    renderTree(allSnippets);
  }
);

/* ============ RUN / RESET ============ */
runBtn.onclick = () => {
  if (!activeSnippet) return;
  chrome.devtools.inspectedWindow.eval(
    `(function(){ ${normalizeCode(editor.getValue())} })();`
  );
};

resetBtn.onclick = () => {
  if (activeSnippet) editor.setValue(activeSnippet.code);
};

/* ============ SOURCE NAVIGATION ============ */
breadcrumbAction.onclick = () => {
  if (!activeSnippet) return;

  chrome.devtools.inspectedWindow.eval(
    `Array.from(document.scripts).map(s => s.src).filter(Boolean);`,
    scripts => {
      const idx = activeSnippet.module.indexOf(".mvc$controller");
      if (idx === -1) return;

      const app = activeSnippet.module.split(".")[0];
      const screenPath = activeSnippet.module.substring(0, idx);
      const expected = `/${app}/scripts/${screenPath}.mvc.js`;
      const url = scripts.find(s => s.includes(expected));
      if (url) chrome.devtools.panels.openResource(url, 0);
    }
  );
};
