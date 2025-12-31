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
  const script = document.createElement("script");
  script.src = chrome.runtime.getURL("page-hook.js");
  script.async = false;
  document.documentElement.appendChild(script);

  window.addEventListener("message", event => {
    if (event.source !== window) return;
    if (event.data?.source === "OS_DEBUGGER") {
      chrome.runtime.sendMessage(event.data);
    }
  });
})();
