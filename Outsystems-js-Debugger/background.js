/*!
 * OutSystems JS Debugger
 * Copyright (c) 2025 RavichandGY
 * All rights reserved.
 *
 * This software is proprietary and confidential.
 * Unauthorized copying, modification, or distribution
 * is strictly prohibited.
 */

let devtoolsPort = null;

chrome.runtime.onConnect.addListener(port => {
  if (port.name === "devtools") {
    devtoolsPort = port;
  }
});

chrome.runtime.onMessage.addListener(message => {
  if (devtoolsPort) {
    devtoolsPort.postMessage(message);
  }
});
