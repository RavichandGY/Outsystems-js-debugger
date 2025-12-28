/*!
 * OutSystems JS Debugger – Page Hook
 * Copyright (c) 2025 RavichandGY
 * All rights reserved.
 */

(function () {
  if (window.__OS_DEBUGGER__) return;

  /* =====================================================
     PLATFORM MODULE PREFIXES (FILTER OUT)
  ===================================================== */
  const PLATFORM_PREFIXES = [
    "OutSystemsUI",
    "OutSystemsReact",
    "System",
    "Users",
    "ServiceCenter"
  ];

  let APP_PREFIX = null;

  /* =====================================================
     DEBUG STORE (PAGE CONTEXT)
  ===================================================== */
  window.__OS_DEBUGGER__ = {
    snippets: [],
    seen: new Set(),

    add(snippet) {
      const key = snippet.module + "::" + snippet.code;
      if (this.seen.has(key)) return;
      this.seen.add(key);
      this.snippets.push(snippet);
    },

    getAll() {
      return this.snippets;
    }
  };

  /* =====================================================
     DETECT APP PREFIX (FIRST NON-PLATFORM MODULE)
  ===================================================== */
  function detectAppPrefix(moduleName) {
    if (APP_PREFIX) return APP_PREFIX;
    if (!moduleName) return null;

    const prefix = moduleName.split(".")[0];
    if (PLATFORM_PREFIXES.includes(prefix)) return null;

    APP_PREFIX = prefix;
    return APP_PREFIX;
  }

  /* =====================================================
     CLEAN OUTSYSTEMS WRAPPERS
  ===================================================== */
  function normalizeBody(body) {
    if (!body) return "";

    // Remove Promise wrapper
    body = body.replace(
      /return\s+new\s+Promise\s*\(\s*function\s*\([^)]*\)\s*{([\s\S]*?)}\s*\)\s*;?/,
      "$1"
    );

    // Extract IIFE body if present
    const iifeMatch = body.match(
      /\(\s*function\s*\(\)\s*{([\s\S]*?)}\s*\)\s*\(\s*\)\s*;?/m
    );
    if (iifeMatch && iifeMatch[1]) {
      body = iifeMatch[1];
    }

    // Remove trailing OutSystems closure
    body = body.replace(/\}\s*;\s*$/, "");

    return body.trim();
  }

  /* =====================================================
     BEST-POSSIBLE SOURCE URL RESOLUTION
  ===================================================== */
  function resolveSourceUrl() {
    try {
      throw new Error();
    } catch (e) {
      const stackLine = (e.stack || "")
        .split("\n")
        .find(l => l.includes(".js:"));
      if (!stackLine) return null;

      const match = stackLine.match(/(https?:\/\/.*\.js):\d+:\d+/);
      return match ? match[1] : null;
    }
  }

  /* =====================================================
     EXTRACT DEVELOPER JS WIDGETS
  ===================================================== */
  function extract(name, factory) {
    try {
      if (typeof name !== "string") return;
      if (typeof factory !== "function") return;

      // JS widgets always end with JS
      if (!name.endsWith("JS")) return;

      const app = detectAppPrefix(name);
      if (!app || !name.startsWith(app + ".")) return;

      const isScreenJS = name.includes(".mvc$controller.");
      const isGlobalJS = name.includes(".controller$");
      if (!isScreenJS && !isGlobalJS) return;

      const src = factory.toString();

      // Extract return function body
      const fnMatch = src.match(
        /return\s+function\s*\([^)]*\)\s*{([\s\S]*?)}\s*;?\s*$/
      );
      if (!fnMatch || !fnMatch[1]) return;

      const cleanedCode = normalizeBody(fnMatch[1]);
      if (cleanedCode.length < 20) return;

      // Screen detection
      let screen = null;
      if (isScreenJS) {
        const parts = name.split(".");
        screen = parts[2] || null;
      }

      window.__OS_DEBUGGER__.add({
        module: name,
        screen,
        code: cleanedCode,
        originalCode: cleanedCode,
        searchKey: `define("${name}"`,
        sourceUrl: resolveSourceUrl()
      });
    } catch {
      /* silent */
    }
  }

  /* =====================================================
     HOOK REQUIREJS (SAFE GUARDED)
  ===================================================== */
  function hookRequireJS() {
    if (!window.requirejs) return false;
    if (!requirejs.s || !requirejs.s.contexts) return false;

    const ctx = requirejs.s.contexts._;
    if (!ctx || !ctx.defQueue) return false;

    if (ctx.defQueue.__OS_HOOKED__) return true;

    const originalPush = ctx.defQueue.push;

    ctx.defQueue.push = function (args) {
      try {
        extract(args[0], args[2]);
      } catch {}
      return originalPush.apply(this, arguments);
    };

    ctx.defQueue.__OS_HOOKED__ = true;

    // Process queued modules
    ctx.defQueue.forEach(args => extract(args[0], args[2]));

    // Process already defined modules
    Object.entries(ctx.defined || {}).forEach(([name, mod]) => {
      if (typeof mod === "function") {
        extract(name, mod);
      }
    });

    return true;
  }

  /* =====================================================
     POLL UNTIL REQUIREJS IS READY
  ===================================================== */
  const timer = setInterval(() => {
    try {
      if (hookRequireJS()) {
        clearInterval(timer);
      }
    } catch {
      /* page still loading */
    }
  }, 50);

})();
