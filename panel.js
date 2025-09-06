document.addEventListener('DOMContentLoaded', () => {
    const runAuditBtn = document.getElementById('run-audit-btn');
    const exportBtn = document.getElementById('export-btn');
    const statusMessage = document.getElementById('status-message');
    const resultsDiv = document.getElementById('results');
    const summaryDashboard = document.getElementById('summary-dashboard');
    const filterControls = document.getElementById('filter-controls');

    // --- NEW: Set initial button content with an icon ---
    const auditIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="1em" height="1em" style="vertical-align: -0.125em; margin-right: 0.5em;"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>`;
    runAuditBtn.innerHTML = `${auditIcon} Run Audit`;

    let lastAuditResults = null; // Variable to store the latest results
    let allViolations = []; // Store all violations for filtering

    function applyTheme(theme) {
        // The themeName is 'dark' or 'default' (for light).
        if (theme === 'dark') {
            document.body.classList.add('theme-dark');
            document.body.classList.remove('theme-light');
        } else {
            document.body.classList.add('theme-light');
            document.body.classList.remove('theme-dark');
        }
    }

    // Apply theme on initial load
    // Guard to make sure devtools APIs are available before using them.
    if (chrome.devtools && chrome.devtools.panels) {
        applyTheme(chrome.devtools.panels.themeName);

        // Listen for when the theme changes
        if(chrome.devtools.panels.onThemeChanged)
            chrome.devtools.panels.onThemeChanged.addListener(applyTheme);
    }
    // --- END THEME DETECTION LOGIC ---

    // Helper function to safely escape HTML for display
    function escapeHtml(unsafe) {
        if (typeof unsafe !== 'string') return '';
        return unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
    }

    // NEW: Refactored function to render a list of violations
    function renderViolations(violations) {
        resultsDiv.innerHTML = ''; // Clear the current list
        violations.forEach(violation => {
            const violationEl = document.createElement('details');
            violationEl.className = 'violation-group';
            
            if (violation.impact) {
                violationEl.classList.add(`impact-${violation.impact}`);
            }

            violationEl.innerHTML = `
                <summary class="violation-summary">
                    <span class="impact-indicator">${escapeHtml(violation.impact)}</span>
                    <span class="violation-title">${escapeHtml(violation.help)}</span>
                    <span class="violation-node-count">${violation.nodes.length} ${violation.nodes.length === 1 ? 'node' : 'nodes'}</span>
                </summary>
                <div class="violation-details">
                    <p class="violation-description">${escapeHtml(violation.description)} (<a href="${violation.helpUrl}" target="_blank">learn more</a>)</p>
                    <div class="violation-nodes">
                        ${violation.nodes.map(node => {
                            const fixMessages = [...node.any, ...node.all].map(check => check.message);
                            return `
                            <div class="violation-node">
                                <strong>HTML:</strong><pre class="html">${escapeHtml(node.html)}</pre>
                                <strong>Selector:</strong><code class="selector">${escapeHtml(node.target.join(', '))}</code>
                                <button class="goto-element-btn" data-selector='${JSON.stringify(node.target)}'>Inspect</button>
                                ${fixMessages.length > 0 ? `<div class="fix-suggestions"><strong>Suggested Fixes:</strong><ul>${fixMessages.map(msg => `<li>${escapeHtml(msg)}</li>`).join('')}</ul></div>` : ''}
                            </div>`;
                        }).join('')}
                    </div>
                </div>
            `;
            resultsDiv.appendChild(violationEl);
        });
    }

    function displayResults(results) {
        lastAuditResults = results;
        allViolations = results.violations || []; // Store for filtering
        exportBtn.classList.remove('hidden');
        summaryDashboard.innerHTML = '';
        summaryDashboard.classList.add('hidden');
        filterControls.classList.add('hidden'); // Hide filters by default

        if (!results || allViolations.length === 0) {
            statusMessage.textContent = '✅ No WCAG 2.2 AA violations found!';
            resultsDiv.innerHTML = ''; // Ensure results are cleared
        } else {
            statusMessage.textContent = `Found ${allViolations.length} total violations.`;
            // --- Summary Dashboard Logic ---
            const summaryCounts = allViolations.reduce((acc, violation) => {
                const impact = violation.impact || 'unknown';
                acc[impact] = (acc[impact] || 0) + 1;
                return acc;
            }, {});

            // This array defines the display order for the dashboard.
            const impactOrder = ['critical', 'serious', 'moderate', 'minor'];
            summaryDashboard.innerHTML = impactOrder
                .filter(impact => summaryCounts[impact]) // Only show impacts that exist in the results
                .map(impact => `
                    <div class="summary-card impact-${impact}">
                        <span class="summary-count">${summaryCounts[impact]}</span>
                        <span class="summary-label">${impact}</span>
                    </div>
                `).join('');
            
            summaryDashboard.classList.remove('hidden'); // Show the dashboard

            // Sort all violations once
            const impactSortOrder = { "critical": 1, "serious": 2, "moderate": 3, "minor": 4 };
            allViolations.sort((a, b) => impactSortOrder[a.impact] - impactSortOrder[b.impact]);

            // Show filters and render the initial full list
            filterControls.classList.remove('hidden');
            renderViolations(allViolations);
        }
    }

    // Listen for the final results from the background script
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type === 'AXE_AUDIT_RESULTS') {
            console.log('Received final results from background script:', message.payload);
            if (message.payload.success) {
                displayResults(message.payload.results);
            } else {
                const errorMessage = message.payload.error?.message || 'An unknown error occurred.';
                statusMessage.textContent = `Audit failed: ${errorMessage}`;
                statusMessage.className = 'status-message status-error';
                console.error('Audit script failed:', message.payload.error);
            }
            
            // Re-enable the button now that the audit is complete.
            runAuditBtn.disabled = false;

            // Update button content to include a repeat icon and text.
            const rerunIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="1em" height="1em" style="vertical-align: -0.125em; margin-right: 0.5em;"><path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/></svg>`;
            runAuditBtn.innerHTML = `${rerunIcon} Re-run Audit`;
        }
    });

    // When the button is clicked, just ask the background script to run the audit.
    runAuditBtn.addEventListener('click', () => {
        // --- UI Cleanup on Audit Start ---
        runAuditBtn.disabled = true;
        exportBtn.classList.add('hidden');
        summaryDashboard.classList.add('hidden');
        filterControls.classList.add('hidden'); // Hide filters immediately
        resultsDiv.innerHTML = ''; // Clear old results
        
        statusMessage.textContent = 'Running audit...';
        statusMessage.className = 'status-message status-info';
        
        // --- Send Message to Background ---
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs.length === 0) {
                statusMessage.textContent = 'Error: No active tab found.';
                statusMessage.className = 'status-message status-error';
                runAuditBtn.disabled = false;
                return;
            }
            const tabId = tabs[0].id;
            chrome.runtime.sendMessage({ type: 'RUN_AUDIT_IN_PAGE', tabId: tabId });
        });
    });

    // --- NEW: FILTER BUTTON LOGIC ---
    filterControls.addEventListener('click', (event) => {
        const filterBtn = event.target.closest('.filter-btn');
        if (!filterBtn) return;

        // Update active button state
        filterControls.querySelector('.active').classList.remove('active');
        filterBtn.classList.add('active');

        const filterValue = filterBtn.dataset.filter;
        if (filterValue === 'all') {
            renderViolations(allViolations);
        } else {
            const filteredViolations = allViolations.filter(v => v.impact === filterValue);
            
            // If the filter results in an empty list, show a message.
            if (filteredViolations.length === 0) {
                resultsDiv.innerHTML = `<div class="no-results-message">No ${filterValue} violations found.</div>`;
            } else {
                renderViolations(filteredViolations);
            }
        }
    });

    // --- EVENT DELEGATION FOR 'INSPECT' BUTTONS ---
    resultsDiv.addEventListener('click', (event) => {
        const inspectBtn = event.target.closest('.goto-element-btn');
        if (!inspectBtn) {
            return; // Click was not on an inspect button
        }

        try {
            const selectorJson = inspectBtn.dataset.selector;
            if (!selectorJson) return;

            // The selector from axe is a JSON array of strings. We parse it and take the first one.
            const selectors = JSON.parse(selectorJson);
            if (!selectors || selectors.length === 0) return;
            const primarySelector = selectors[0];

            // KEY CHANGE: Use document.querySelector() instead of axe.select().
            // This removes the dependency on axe-core being on the page.
            // We stringify the selector again to safely inject it into the eval string.
            const evalCode = `inspect(document.querySelector(${JSON.stringify(primarySelector)}))`;

            chrome.devtools.inspectedWindow.eval(evalCode, (result, isException) => {
                if (isException) {
                    // This error is now less likely, but good to keep for debugging.
                    console.error('Failed to inspect element:', isException.value);
                }
            });
        } catch (e) {
            console.error('Error handling inspect button click:', e);
        }
    });
});
