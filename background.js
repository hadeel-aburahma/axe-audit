// This function will be injected into the page to run the audit.
// It must be self-contained and not use any external variables.
function runAxeInPageContext() {
  // This function is stringified and injected, so it runs in the page's context.
  // It cannot use chrome.* APIs.
  // We wrap the logic in a Promise to handle the async nature of axe.run.
  return new Promise(async (resolve) => {
    try {
      // The axe.min.js script should have been injected before this runs.
      if (typeof window.axe === 'undefined') {
        throw new Error('axe-core is not available on the page.');
      }
      
      const results = await window.axe.run(document, {
        // KEY CHANGE: Use 'wcag2aa' to include all Level AA rules, including color-contrast.
        runOnly: { type: 'tag', values: ['wcag2aa'] }, 
        rules: { 
            // You can still explicitly enable WCAG 2.2 rules here if they are disabled by default.
            'target-size': { enabled: true } 
        },
        iframes: true
      });
      
      // On success, resolve the promise with the results.
      resolve({ success: true, results: results });

    } catch (error) {
      // On failure, resolve the promise with a serializable error object.
      resolve({ success: false, error: { message: error.message } });
    }
  });
}

// This listener waits for the "run" command from the DevTools panel.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'RUN_AUDIT_IN_PAGE') {
    const tabId = message.tabId;

    // This is an async operation, but we are not replying to this specific message.
    // We are starting a new message chain, so we do not return true.
    chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ['axe.min.js'],
    })
    .then(() => {
      console.log('axe.min.js injected successfully.');
      return chrome.scripting.executeScript({
        target: { tabId: tabId },
        function: runAxeInPageContext,
      });
    })
    .then((injectionResults) => {
      console.log('Audit function executed, processing results.');
      const pageResult = injectionResults[0].result;
      
      // Send the final result back to all parts of the extension.
      chrome.runtime.sendMessage({
        type: 'AXE_AUDIT_RESULTS',
        payload: pageResult
      });
    })
    .catch((err) => {
      console.error('Failed to inject script or run audit:', err);
      chrome.runtime.sendMessage({
        type: 'AXE_AUDIT_RESULTS',
        payload: { success: false, error: { message: `Audit failed: ${err.message}` } }
      });
    });
  }
  // DO NOT return true here. We are not using the sendResponse callback.
});