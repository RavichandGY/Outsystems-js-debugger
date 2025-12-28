/*!
 * OutSystems JS Debugger
 * Copyright (c) 2025 RavichandGY
 * All rights reserved.
 *
 * This software is proprietary and confidential.
 * Unauthorized copying, modification, or distribution
 * is strictly prohibited.
 */

(function () {
  if (window.__OS_DEBUGGER__) return;

  /* =========================================================
     Debugger API
  ========================================================= */
  window.__OS_DEBUGGER__ = {
    snippets: [],

    add(snippet) {
      this.snippets.push(snippet);
      window.postMessage(
        { source: "OS_DEBUGGER", action: "snippet", payload: snippet },
        "*"
      );
    },

    getAll() {
      return this.snippets;
    },

    /* ---------------------------------------------------------
       Patch event handler so debugger pauses on REAL execution
    --------------------------------------------------------- */
    patchEvent(actionName) {
      try {
        const fn = window[actionName];
        if (typeof fn === "function") {
          if (fn.__patched) return true;

          window[actionName] = function () {
            debugger;
            return fn.apply(this, arguments);
          };

          window[actionName].__patched = true;
          return true;
        }
      } catch (e) {}
      return false;
    }
  };

  /* =========================================================
     Breadcrumb parser
  ========================================================= */
  function parseBreadcrumb(moduleName) {
    const parts = moduleName.split(".");
    return {
      app: parts[0] || "",
      module: parts[1] || "",
      flow: parts[2] || "",
      screen: parts[3] || "",
      action: parts.find(p => p.startsWith("On")) || ""
    };
  }

  /* =========================================================
     Extract developer JS from factory
  ========================================================= */
  function extractFromFactory(name, factory) {
    try {
      if (
        typeof name !== "string" ||
        !name.includes(".JavaScript") ||
        typeof factory !== "function"
      ) return;

      let lifecycle = "Others";
      if (name.includes(".OnInitialize.")) lifecycle = "OnInitialize";
      else if (name.includes(".OnReady.")) lifecycle = "OnReady";
      else if (name.includes(".OnRender.")) lifecycle = "OnRender";
      else if (name.includes(".OnClick.")) lifecycle = "OnClick";

      const src = factory.toString();

      const match = src.match(
        /return\s+function\s*\([^)]*\)\s*{([\s\S]*?)}\s*;?\s*}$/m
      );

      if (!match || !match[1]) return;

      const breadcrumb = parseBreadcrumb(name);

      window.__OS_DEBUGGER__.add({
        lifecycle,
        module: name,
        actionName: breadcrumb.action,
        breadcrumb,
        code: match[1].trim(),
        timestamp: Date.now()
      });
    } catch (e) {}
  }

  /* =========================================================
     Hook future define()
  ========================================================= */
  if (typeof window.define === "function") {
    const originalDefine = window.define;

    window.define = function (name, deps, factory) {
      extractFromFactory(name, factory);
      return originalDefine.apply(this, arguments);
    };
  }

  /* =========================================================
     Scan already-registered RequireJS modules
  ========================================================= */
  function scanExistingModules() {
    if (!window.requirejs || !requirejs.s || !requirejs.s.contexts) return;

    Object.values(requirejs.s.contexts).forEach(ctx => {
      if (!ctx.defined) return;

      Object.entries(ctx.defined).forEach(([name, mod]) => {
        if (typeof mod === "function") {
          extractFromFactory(name, mod);
        }
      });
    });
  }

  setTimeout(scanExistingModules, 0);
})();
