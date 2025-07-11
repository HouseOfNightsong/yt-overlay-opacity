// YouTube Overlay Opacity Reducer - Content Script (CSS-based approach)
(function() {
    'use strict';
    
    // Debug mode - set to false for production
    const DEBUG = false;
    
    // State variables
    let isEnabled = true;
    let opacityLevel = 0.3;
    const processedElements = new WeakMap();
    
    // Performance optimization variables
    let checkInterval = null;
    let mutationTimeout = null;
    const timeouts = new Map();
    
    // Specific YouTube selectors
    const youtubeSelectors = [
        '.ytp-ce-element-show',
        '.ytReelMetapanelViewModelHost'
    ];
    
    // Debug logging function
    function debugLog(...args) {
        if (DEBUG) console.log('[YT-Opacity]', ...args);
    }
    
    // Create dynamic CSS and inject it
    function injectStyles() {
        let styleElement = document.getElementById('yt-opacity-reducer-styles');
        
        if (!styleElement) {
            styleElement = document.createElement('style');
            styleElement.id = 'yt-opacity-reducer-styles';
            document.head.appendChild(styleElement);
        }
        
        // Update the CSS with current opacity level
        styleElement.textContent = `
            /* Base styles for reduced opacity elements */
            [data-yt-opacity-reduced="true"] {
                transition: opacity 0.3s ease !important;
            }
            
            /* Apply opacity only when not hidden by YouTube */
            [data-yt-opacity-reduced="true"]:not([style*="display: none"]):not([style*="display:none"]):not([style*="visibility: hidden"]):not([style*="visibility:hidden"]):not(.ytp-ce-element-hide):not([aria-hidden="true"]):not(.ytp-autohide) {
                opacity: ${opacityLevel} !important;
            }
            
            /* Hover state - restore full opacity - HIGHER SPECIFICITY */
            [data-yt-opacity-reduced="true"]:not([style*="display: none"]):not([style*="display:none"]):not([style*="visibility: hidden"]):not([style*="visibility:hidden"]):not(.ytp-ce-element-hide):not([aria-hidden="true"]):not(.ytp-autohide):hover {
                opacity: 1 !important;
            }
            
            /* Ensure elements in autohide state stay hidden */
            .ytp-autohide [data-yt-opacity-reduced="true"],
            [data-yt-opacity-reduced="true"].ytp-autohide {
                opacity: 0 !important;
                pointer-events: none !important;
            }
            
            /* Never touch player controls */
            .ytp-chrome-bottom,
            .ytp-chrome-top,
            .ytp-gradient-bottom,
            .ytp-gradient-top,
            .ytp-chrome-controls,
            .ytp-progress-bar-container {
                opacity: 1 !important;
            }
            
            /* Respect YouTube's autohide for controls */
            .ytp-autohide .ytp-chrome-bottom,
            .ytp-autohide .ytp-chrome-top,
            .ytp-autohide .ytp-gradient-bottom,
            .ytp-autohide .ytp-gradient-top {
                opacity: 0 !important;
            }
        `;
        
        debugLog('Styles injected/updated with opacity:', opacityLevel);
    }
    
    // Managed timeout system
    function setManagedTimeout(key, callback, delay) {
        if (timeouts.has(key)) {
            clearTimeout(timeouts.get(key));
        }
        
        const timeoutId = setTimeout(() => {
            callback();
            timeouts.delete(key);
        }, delay);
        
        timeouts.set(key, timeoutId);
    }
    
    // Clear all managed timeouts
    function clearAllTimeouts() {
        timeouts.forEach(timeout => clearTimeout(timeout));
        timeouts.clear();
    }
    
    // Load settings from storage
    function loadSettings() {
        try {
            if (typeof browser !== 'undefined' && browser.storage) {
                browser.storage.sync.get(['enabled', 'opacity']).then(result => {
                    isEnabled = result.enabled !== undefined ? result.enabled : true;
                    opacityLevel = result.opacity !== undefined ? result.opacity : 0.3;
                    debugLog('Settings loaded:', {enabled: isEnabled, opacity: opacityLevel});
                    if (isEnabled) {
                        injectStyles();
                        startMonitoring();
                        applyOpacityToElements();
                    } else {
                        stopMonitoring();
                        removeOpacityFromElements();
                    }
                }).catch(err => {
                    debugLog('Storage error:', err);
                    // Try local storage as fallback
                    browser.storage.local.get(['enabled', 'opacity']).then(result => {
                        isEnabled = result.enabled !== undefined ? result.enabled : true;
                        opacityLevel = result.opacity !== undefined ? result.opacity : 0.3;
                        debugLog('Settings loaded from local:', {enabled: isEnabled, opacity: opacityLevel});
                        if (isEnabled) {
                            injectStyles();
                            startMonitoring();
                            applyOpacityToElements();
                        }
                    });
                });
            } else {
                if (isEnabled) {
                    injectStyles();
                    startMonitoring();
                    applyOpacityToElements();
                }
            }
        } catch (error) {
            debugLog('Using default settings, storage not available');
            if (isEnabled) {
                injectStyles();
                startMonitoring();
                applyOpacityToElements();
            }
        }
    }
    
    // Save settings to storage
    function saveSettings() {
        try {
            if (typeof browser !== 'undefined' && browser.storage) {
                const settings = {
                    enabled: isEnabled,
                    opacity: opacityLevel
                };
                browser.storage.sync.set(settings).catch(() => {
                    browser.storage.local.set(settings);
                });
            }
        } catch (error) {
            debugLog('Could not save settings');
        }
    }
    
    // Check if element should be processed
    function shouldProcessElement(element) {
        // Skip if element is part of player controls
        const isPlayerControl = element.closest('.ytp-chrome-bottom, .ytp-chrome-top, .ytp-chrome-controls, .ytp-gradient-bottom, .ytp-gradient-top');
        if (isPlayerControl) {
            return false;
        }
        
        // Skip if element has specific hide classes
        if (element.classList.contains('ytp-ce-element-hide') || 
            element.classList.contains('ytp-autohide')) {
            return false;
        }
        
        // Skip if element is hidden
        const style = window.getComputedStyle(element);
        if (style.display === 'none' || style.visibility === 'hidden') {
            return false;
        }
        
        return true;
    }
    
    // Apply opacity to specific YouTube elements
    function applyOpacityToElements() {
        if (!isEnabled) return;
        
        let newElementsProcessed = 0;
        
        youtubeSelectors.forEach(selector => {
            try {
                const elements = document.querySelectorAll(selector);
                
                elements.forEach(element => {
                    if (!shouldProcessElement(element)) {
                        return;
                    }
                    
                    if (element && !element.hasAttribute('data-yt-opacity-reduced')) {
                        // Just add the attribute, CSS will handle the rest
                        element.setAttribute('data-yt-opacity-reduced', 'true');
                        
                        // Mark as processed
                        processedElements.set(element, true);
                        
                        newElementsProcessed++;
                        debugLog('Processed element:', element);
                    }
                });
            } catch (error) {
                debugLog(`Error processing selector ${selector}:`, error);
            }
        });
        
        if (newElementsProcessed > 0) {
            debugLog(`Processed ${newElementsProcessed} new elements`);
        }
    }
    
    // Remove opacity from elements
    function removeOpacityFromElements() {
        debugLog('Removing opacity from YouTube elements...');
        
        const elements = document.querySelectorAll('[data-yt-opacity-reduced="true"]');
        elements.forEach(element => {
            element.removeAttribute('data-yt-opacity-reduced');
            processedElements.delete(element);
        });
        
        debugLog('Opacity removed from all elements');
    }
    
    // Remove injected styles
    function removeStyles() {
        const styleElement = document.getElementById('yt-opacity-reducer-styles');
        if (styleElement) {
            styleElement.remove();
        }
    }
    
    // Start monitoring for new elements
    function startMonitoring() {
        // Start interval check
        if (!checkInterval) {
            checkInterval = setInterval(() => {
                if (isEnabled) {
                    applyOpacityToElements();
                }
            }, 3000);
            debugLog('Interval monitoring started');
        }
    }
    
    // Stop monitoring
    function stopMonitoring() {
        // Clear interval
        if (checkInterval) {
            clearInterval(checkInterval);
            checkInterval = null;
            debugLog('Interval monitoring stopped');
        }
        
        // Clear any pending mutation timeouts
        if (mutationTimeout) {
            clearTimeout(mutationTimeout);
            mutationTimeout = null;
        }
    }
    
    // Listen for messages from popup
    try {
        if (typeof browser !== 'undefined' && browser.runtime) {
            browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
                debugLog('Message received:', request);
                
                if (request.action === 'toggleEnabled') {
                    isEnabled = request.enabled;
                    saveSettings();
                    if (isEnabled) {
                        injectStyles();
                        startMonitoring();
                        applyOpacityToElements();
                    } else {
                        stopMonitoring();
                        removeOpacityFromElements();
                        removeStyles();
                    }
                    sendResponse({success: true, enabled: isEnabled});
                } else if (request.action === 'setOpacity') {
                    opacityLevel = request.opacity;
                    saveSettings();
                    if (isEnabled) {
                        // Update styles with new opacity
                        injectStyles();
                    }
                    sendResponse({success: true, opacity: opacityLevel});
                } else if (request.action === 'getStatus') {
                    sendResponse({enabled: isEnabled, opacity: opacityLevel});
                } else if (request.action === 'reapply') {
                    if (isEnabled) {
                        removeOpacityFromElements();
                        setManagedTimeout('reapplyManual', () => {
                            applyOpacityToElements();
                        }, 100);
                    }
                    sendResponse({success: true});
                }
                return true; // Keep message channel open for async response
            });
        }
    } catch (error) {
        debugLog('Extension messaging not available:', error);
    }
    
    // Throttled mutation observer
    const observer = new MutationObserver(function(mutations) {
        if (!isEnabled) return;
        
        // Clear existing timeout
        if (mutationTimeout) {
            clearTimeout(mutationTimeout);
        }
        
        // Throttle the reapplication
        mutationTimeout = setTimeout(() => {
            let shouldReapply = false;
            
            mutations.forEach(mutation => {
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    for (let node of mutation.addedNodes) {
                        if (node.nodeType === 1) {
                            for (let selector of youtubeSelectors) {
                                try {
                                    if ((node.matches && node.matches(selector)) || 
                                        (node.querySelector && node.querySelector(selector))) {
                                        shouldReapply = true;
                                        break;
                                    }
                                } catch (e) {
                                    // Ignore selector errors
                                }
                            }
                            if (shouldReapply) break;
                        }
                    }
                }
            });
            
            if (shouldReapply) {
                debugLog('New elements detected, reapplying opacity...');
                applyOpacityToElements();
            }
        }, 250);
    });
    
    // Cleanup function
    function cleanup() {
        debugLog('Cleaning up...');
        stopMonitoring();
        clearAllTimeouts();
        if (observer) observer.disconnect();
        removeOpacityFromElements();
        removeStyles();
    }
    
    // Clean up when page unloads
    window.addEventListener('unload', cleanup);
    window.addEventListener('pagehide', cleanup);
    
    // Initialize
    debugLog('YouTube Overlay Opacity Reducer initialized');
    loadSettings();
    
    // Start observing
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
    
    // Apply immediately after a short delay
    setManagedTimeout('initialApply', () => {
        if (isEnabled) {
            applyOpacityToElements();
        }
    }, 1000);
    
})();