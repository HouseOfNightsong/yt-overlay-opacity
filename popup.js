// Popup script for YouTube Overlay Opacity Reducer
console.log('Popup script loading...');

// State variables
let isEnabled = true;
let currentOpacity = 0.3;

// DOM elements
let toggleSwitch = null;
let opacitySlider = null;
let opacityValue = null;
let applyBtn = null;
let resetBtn = null;
let status = null;

// Initialize popup when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded, initializing popup...');
    
    // Get DOM elements
    toggleSwitch = document.getElementById('toggleSwitch');
    opacitySlider = document.getElementById('opacitySlider');
    opacityValue = document.getElementById('opacityValue');
    applyBtn = document.getElementById('applyBtn');
    resetBtn = document.getElementById('resetBtn');
    status = document.getElementById('status');
    
    // Load settings from storage
    loadSettings();
    
    // Setup event listeners
    setupEventListeners();
});

// Load settings from storage
function loadSettings() {
    try {
        browser.storage.sync.get(['enabled', 'opacity']).then(result => {
            isEnabled = result.enabled !== undefined ? result.enabled : true;
            currentOpacity = result.opacity !== undefined ? result.opacity : 0.3;
            updateUI();
            updateStatus('Ready');
        }).catch(err => {
            console.error('Error loading settings:', err);
            // Try local storage as fallback
            browser.storage.local.get(['enabled', 'opacity']).then(result => {
                isEnabled = result.enabled !== undefined ? result.enabled : true;
                currentOpacity = result.opacity !== undefined ? result.opacity : 0.3;
                updateUI();
                updateStatus('Ready (local)');
            }).catch(err2 => {
                console.error('Local storage error:', err2);
                updateStatus('Using defaults');
                updateUI();
            });
        });
    } catch (e) {
        console.error('Storage not available:', e);
        updateStatus('Storage error');
        updateUI();
    }
}

// Update UI elements
function updateUI() {
    // Update toggle switch
    if (toggleSwitch) {
        if (isEnabled) {
            toggleSwitch.classList.add('active');
        } else {
            toggleSwitch.classList.remove('active');
        }
    }
    
    // Update opacity slider and display
    if (opacitySlider) {
        opacitySlider.value = currentOpacity;
    }
    updateOpacityDisplay();
}

// Update opacity display
function updateOpacityDisplay() {
    if (opacityValue) {
        const percentage = Math.round(currentOpacity * 100);
        const transparency = percentage < 50 ? 'More Transparent' : 'Less Transparent';
        opacityValue.textContent = `${percentage}% (${transparency})`;
    }
}

// Update status message
function updateStatus(message) {
    if (status) {
        status.textContent = message;
    }
}

// Send message to content script
function sendMessage(message) {
    browser.tabs.query({active: true, currentWindow: true}).then(tabs => {
        if (tabs.length === 0) {
            updateStatus('No active tab');
            return;
        }
        
        const tab = tabs[0];
        if (!tab.url || !tab.url.includes('youtube.com')) {
            updateStatus('Not on YouTube');
            return;
        }
        
        browser.tabs.sendMessage(tab.id, message).then(response => {
            if (response && response.success) {
                updateStatus('Applied!');
                setTimeout(() => updateStatus('Ready'), 2000);
            } else {
                updateStatus('Error - refresh page');
            }
        }).catch(err => {
            console.error('Message error:', err);
            updateStatus('Refresh YouTube page');
        });
    }).catch(err => {
        console.error('Tab query error:', err);
        updateStatus('Tab error');
    });
}

// Save settings
function saveSettings() {
    const settings = {
        enabled: isEnabled,
        opacity: currentOpacity
    };
    
    // Try sync storage first, fall back to local
    browser.storage.sync.set(settings).catch(err => {
        console.error('Sync storage error:', err);
        return browser.storage.local.set(settings);
    }).catch(err => {
        console.error('Local storage error:', err);
    });
}

// Setup event listeners
function setupEventListeners() {
    // Toggle switch
    if (toggleSwitch) {
        toggleSwitch.addEventListener('click', function(e) {
            e.preventDefault();
            isEnabled = !isEnabled;
            updateUI();
            saveSettings();
            sendMessage({action: 'toggleEnabled', enabled: isEnabled});
            updateStatus(isEnabled ? 'Enabled' : 'Disabled');
        });
    }
    
    // Opacity slider
    if (opacitySlider) {
        opacitySlider.addEventListener('input', function(e) {
            currentOpacity = parseFloat(e.target.value);
            updateOpacityDisplay();
        });
        
        opacitySlider.addEventListener('change', function(e) {
            currentOpacity = parseFloat(e.target.value);
            saveSettings();
            if (isEnabled) {
                sendMessage({action: 'setOpacity', opacity: currentOpacity});
            }
        });
    }
    
    // Apply button
    if (applyBtn) {
        applyBtn.addEventListener('click', function(e) {
            e.preventDefault();
            updateStatus('Applying...');
            sendMessage({action: 'reapply'});
        });
    }
    
    // Reset button
    if (resetBtn) {
        resetBtn.addEventListener('click', function(e) {
            e.preventDefault();
            isEnabled = true;
            currentOpacity = 0.3;
            updateUI();
            saveSettings();
            sendMessage({action: 'toggleEnabled', enabled: isEnabled});
            setTimeout(() => {
                sendMessage({action: 'setOpacity', opacity: currentOpacity});
            }, 100);
            updateStatus('Reset to defaults');
        });
    }
    
    // Get current status from content script after a delay
    setTimeout(() => {
        browser.tabs.query({active: true, currentWindow: true}).then(tabs => {
            if (tabs[0] && tabs[0].url && tabs[0].url.includes('youtube.com')) {
                browser.tabs.sendMessage(tabs[0].id, {action: 'getStatus'}).then(response => {
                    if (response) {
                        isEnabled = response.enabled;
                        currentOpacity = response.opacity;
                        updateUI();
                        updateStatus('Connected');
                    }
                }).catch(err => {
                    console.log('Status check failed:', err);
                });
            }
        });
    }, 100);
}