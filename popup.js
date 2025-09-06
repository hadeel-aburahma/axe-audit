const SEVERITY_CLASSES = {
  minor: 'severity-minor',
  moderate: 'severity-moderate',
  serious: 'severity-serious',
  critical: 'severity-critical'
};

// Listener for the "Run Audit" button
document.getElementById('run-audit-btn').addEventListener('click', () => {
  const statusMessage = document.getElementById('status-message');
  const resultsDiv = document.getElementById('results');
  statusMessage.textContent = 'Running audit...';
  statusMessage.className = 'status-message status-info';
  resultsDiv.innerHTML = '';

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const activeTab = tabs[0];
    if (!activeTab) {
      statusMessage.textContent = 'Error: No active tab found.';
      statusMessage.className = 'status-message violation-group';
      return;
    }

    // 1. Inject the axe-core script into the active tab
    chrome.scripting.executeScript(
      {
        target: { tabId: activeTab.id },
        files: ['axe.min.js'],
      },
      () => {
        if (chrome.runtime.lastError) {
          console.error('Axe-core script injection failed:', chrome.runtime.lastError.message);
          statusMessage.textContent = 'Error: Could not inject axe-core script.';
          statusMessage.className = 'status-message violation-group';
          return;
        }

        // 2. After the script is injected, execute the audit script
        chrome.scripting.executeScript({
          target: { tabId: activeTab.id },
          func: runAxeAndSendResults,
        });
      }
    );
  });
});

// This function will be injected into the page to run the audit.
// It runs in the context of the web page, where `axe` is now defined.
function runAxeAndSendResults() {
  console.log('Starting axe audit...');
  
  axe.run(document, {
    runOnly: {
      type: 'rules',
      values: [
        'target-size',
        'button-name',
        'link-name',
        'color-contrast',
        'aria-allowed-attr',
        'aria-hidden-focus',
        'aria-required-attr',
        'landmark-one-main'
      ]
    },
    rules: {
      'target-size': { enabled: true }
    },
    resultTypes: ['violations', 'incomplete'],
    iframes: true,
    selectors: true
  })
  .then(results => {
    console.log('Axe audit results:', results);
    chrome.runtime.sendMessage({ 
      type: 'axe_results', 
      results,
      timestamp: new Date().toISOString()
    });
  })
  .catch(err => {
    console.error('Error running axe:', err);
    chrome.runtime.sendMessage({ 
      type: 'axe_results', 
      error: `Error running axe: ${err.message}. Please try refreshing the page.`
    });
  });
}

// Listen for the results from the content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'axe_results') {
    displayResults(message.results || { error: message.error });
  }
});

// Function to display the results in the popup UI. This function runs in the popup context.
const displayResults = (results) => {
  const statusMessage = document.getElementById('status-message');
  const resultsDiv = document.getElementById('results');
  resultsDiv.innerHTML = ''; // Clear previous results

  if (results.error) {
    statusMessage.textContent = results.error;
    statusMessage.className = 'status-message violation-group';
    return;
  }

  if (results.violations && results.violations.length > 0) {
    // Add export button
    const exportBtn = document.createElement('button');
    exportBtn.textContent = 'Export Results';
    exportBtn.className = 'export-btn';
    exportBtn.onclick = () => exportResults(results);
    resultsDiv.appendChild(exportBtn);

    // Group violations by severity
    const violationsBySeverity = results.violations.reduce((acc, violation) => {
      if (!acc[violation.impact]) acc[violation.impact] = [];
      acc[violation.impact].push(violation);
      return acc;
    }, {});

    // Display violations grouped by severity
    Object.entries(violationsBySeverity).forEach(([severity, violations]) => {
      const severityGroup = document.createElement('div');
      severityGroup.className = `severity-group ${SEVERITY_CLASSES[severity]}`;
      
      const severityHeader = document.createElement('h2');
      severityHeader.textContent = `${severity.charAt(0).toUpperCase() + severity.slice(1)} (${violations.length})`;
      severityGroup.appendChild(severityHeader);

      violations.forEach(violation => {
        // ... existing violation display code ...
        const violationGroup = document.createElement('div');
        violationGroup.className = 'violation-group';

        const title = document.createElement('div');
        title.className = 'violation-title';
        title.innerHTML = `${violation.id}: ${violation.help} 
          <a href="${violation.helpUrl}" target="_blank">📖</a>`;

        const description = document.createElement('div');
        description.className = 'violation-description';
        description.textContent = violation.description;

        const nodes = document.createElement('pre');
        nodes.className = 'violation-nodes';
        const nodeText = violation.nodes.map(node => 
          `Selector: ${node.target.join(', ')}\nHTML: ${node.html}`).join('\n\n');
        nodes.textContent = nodeText;

        violationGroup.appendChild(title);
        violationGroup.appendChild(description);
        violationGroup.appendChild(nodes);
        severityGroup.appendChild(violationGroup);
      });

      resultsDiv.appendChild(severityGroup);
    });

    statusMessage.textContent = `Audit completed. Found ${results.violations.length} violations.`;
    statusMessage.className = 'status-message status-info';
  } else {
    statusMessage.textContent = 'Audit completed. No violations found.';
    statusMessage.className = 'status-message status-success';
    const noViolationsMessage = document.createElement('div');
    noViolationsMessage.className = 'no-violations';
    noViolationsMessage.textContent = '✅ No WCAG 2.2 AA violations found!';
    resultsDiv.appendChild(noViolationsMessage);
  }
};

// Add export functionality
function exportResults(results) {
  const exportData = {
    url: window.location.href,
    timestamp: results.timestamp,
    violations: results.violations.map(v => ({
      rule: v.id,
      impact: v.impact,
      description: v.help,
      helpUrl: v.helpUrl,
      nodes: v.nodes.map(n => ({
        html: n.html,
        target: n.target
      }))
    }))
  };

  const blob = new Blob([JSON.stringify(exportData, null, 2)], 
    { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `accessibility-audit-${new Date().toISOString()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
