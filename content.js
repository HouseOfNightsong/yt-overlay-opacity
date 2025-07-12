// YouTube Overlay Opacity Reducer - Content Script (Optimized Performance Version)
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
    
    // Adaptive interval settings
    let currentCheckDelay = 1000; // Start at 1 second
    const MIN_CHECK_DELAY = 1000; // Minimum 1 second
    const MAX_CHECK_DELAY = 10000; // Maximum 10 seconds
    let consecutiveEmptyChecks = 0;
    
    // Specific YouTube selectors - combined for performance
    const youtubeSelectors = [
        '.ytp-ce-element-show',
        '.ytReelMetapanelViewModelHost',
        '.ytd-reel-video-renderer.style-scope.player-controls'
    ];
    const combinedSelector = youtubeSelectors.join(', ');
    
    // Debug logging function
    function debugLog(...args) {
        if (DEBUG) console.log('[YT-Opacity]', ...args);
    }
    
    // Performance measurement wrapper
    function measurePerformance(name, fn) {
        if (!DEBUG) return fn();
        const start = performance.now();
        const result = fn();
        const end = performance.now();
        if (end - start > 10) { // Only log slow operations
            debugLog(`${name} took ${(end - start).toFixed(2)}ms`);
        }
        return result;
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
    
    // Apply opacity to specific YouTube elements (optimized)
    function applyOpacityToElements() {
        if (!isEnabled) return 0;
        
        return measurePerformance('applyOpacity', () => {
            let newElementsProcessed = 0;
            
            try {
                // Use combined selector for better performance
                const elements = document.querySelectorAll(combinedSelector);
                
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
                debugLog('Error processing elements:', error);
            }
            
            if (newElementsProcessed > 0) {
                debugLog(`Processed ${newElementsProcessed} new elements`);
                consecutiveEmptyChecks = 0;
                currentCheckDelay = MIN_CHECK_DELAY; // Reset to fast checking
            } else {
                consecutiveEmptyChecks++;
                // Gradually increase delay when no new elements found
                if (consecutiveEmptyChecks > 2) {
                    currentCheckDelay = Math.min(currentCheckDelay * 1.5, MAX_CHECK_DELAY);
                    debugLog(`No new elements, increasing check delay to ${currentCheckDelay}ms`);
                }
            }
            
            return newElementsProcessed;
        });
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
    
    // Start monitoring with adaptive interval
    function startMonitoring() {
        stopMonitoring(); // Clear any existing interval
        
        function scheduleNextCheck() {
            checkInterval = setTimeout(() => {
                if (isEnabled) {
                    applyOpacityToElements();
                    scheduleNextCheck(); // Schedule next check
                }
            }, currentCheckDelay);
        }
        
        scheduleNextCheck();
        debugLog('Adaptive monitoring started');
    }
    
    // Stop monitoring
    function stopMonitoring() {
        // Clear interval
        if (checkInterval) {
            clearTimeout(checkInterval);
            checkInterval = null;
            debugLog('Monitoring stopped');
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
                        currentCheckDelay = MIN_CHECK_DELAY; // Reset to fast checking
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
    
    // Optimized mutation observer - target YouTube app container
    let observer = null;
    
    function initObserver() {
        // Try to find YouTube app container for more targeted observation
        const targetNode = document.querySelector('ytd-app') || document.body;
        
        observer = new MutationObserver(function(mutations) {
            if (!isEnabled) return;
            
            // Clear existing timeout
            if (mutationTimeout) {
                clearTimeout(mutationTimeout);
            }
            
            // Throttle the reapplication
            mutationTimeout = setTimeout(() => {
                let shouldReapply = false;
                
                // Quick check if relevant elements were added
                for (let mutation of mutations) {
                    if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                        for (let node of mutation.addedNodes) {
                            if (node.nodeType === 1) {
                                // Check if node matches our selectors
                                if (node.matches && node.matches(combinedSelector)) {
                                    shouldReapply = true;
                                    break;
                                }
                                // Check if node contains our selectors
                                if (node.querySelector && node.querySelector(combinedSelector)) {
                                    shouldReapply = true;
                                    break;
                                }
                            }
                        }
                        if (shouldReapply) break;
                    }
                }
                
                if (shouldReapply) {
                    debugLog('New elements detected via mutation observer');
                    currentCheckDelay = MIN_CHECK_DELAY; // Reset to fast checking
                    applyOpacityToElements();
                }
            }, 250);
        });
        
        // Start observing
        observer.observe(targetNode, {
            childList: true,
            subtree: true
        });
        
        debugLog('Mutation observer initialized on:', targetNode.tagName || 'document.body');
    }
    
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
    debugLog('YouTube Overlay Opacity Reducer initialized (Optimized Version)');
    loadSettings();
    
    // Wait for YouTube app to be ready before starting observer
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initObserver);
    } else {
        // Small delay to ensure YouTube app is loaded
        setTimeout(initObserver, 500);
    }
    
    // Apply immediately after a short delay
    setManagedTimeout('initialApply', () => {
        if (isEnabled) {
            applyOpacityToElements();
        }
    }, 1000);
    
    // Performance monitoring in debug mode
    if (DEBUG && window.performance && window.performance.memory) {
        setInterval(() => {
            console.log('[YT-Opacity] Performance stats:', {
                memoryUsed: Math.round(performance.memory.usedJSHeapSize / 1048576) + 'MB',
                checkDelay: currentCheckDelay + 'ms',
                processedElements: document.querySelectorAll('[data-yt-opacity-reduced="true"]').length
            });
        }, 30000); // Every 30 seconds
    }
    
})();