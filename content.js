// YouTube Overlay Opacity Reducer - Content Script (Optimized)
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
    let hoverListenerAdded = false;
    const timeouts = new Map();
    
    // Specific YouTube selectors
    const youtubeSelectors = [
        '.ytp-ce-element-show',
        '.ytReelMetapanelViewModelHost',
        '.ytd-reel-video-renderer.style-scope.player-controls > .ytd-reel-video-renderer.style-scope'
    ];
    
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
        debugLog(`${name} took ${(end - start).toFixed(2)}ms`);
        return result;
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
                            startMonitoring();
                            applyOpacityToElements();
                        }
                    });
                });
            }
        } catch (error) {
            debugLog('Using default settings, storage not available');
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
    
    // Event delegation for hover effects
    function handleHoverEnter(e) {
        if (e.target.hasAttribute('data-yt-opacity-reduced') && isEnabled) {
            requestAnimationFrame(() => {
                e.target.style.setProperty('opacity', '1', 'important');
            });
        }
    }
    
    function handleHoverLeave(e) {
        if (e.target.hasAttribute('data-yt-opacity-reduced') && isEnabled) {
            requestAnimationFrame(() => {
                e.target.style.setProperty('opacity', opacityLevel, 'important');
            });
        }
    }
    
    function addHoverListener() {
        if (hoverListenerAdded) return;
        
        document.addEventListener('mouseenter', handleHoverEnter, true);
        document.addEventListener('mouseleave', handleHoverLeave, true);
        hoverListenerAdded = true;
        debugLog('Hover listeners added');
    }
    
    function removeHoverListener() {
        if (!hoverListenerAdded) return;
        
        document.removeEventListener('mouseenter', handleHoverEnter, true);
        document.removeEventListener('mouseleave', handleHoverLeave, true);
        hoverListenerAdded = false;
        debugLog('Hover listeners removed');
    }
    
    // Apply opacity to specific YouTube elements
    function applyOpacityToElements() {
        if (!isEnabled) return;
        
        measurePerformance('applyOpacity', () => {
            let newElementsProcessed = 0;
            
            youtubeSelectors.forEach(selector => {
                try {
                    const elements = document.querySelectorAll(selector);
                    
                    elements.forEach(element => {
                        if (element && !element.hasAttribute('data-yt-opacity-reduced')) {
                            // Store original opacity before modification
                            const computedStyle = window.getComputedStyle(element);
                            const originalOpacity = computedStyle.opacity || '1';
                            
                            // Store element data
                            const elementData = {
                                originalOpacity: originalOpacity,
                                originalStyleOpacity: element.style.opacity || ''
                            };
                            processedElements.set(element, elementData);
                            
                            // Apply reduced opacity with RAF for better performance
                            requestAnimationFrame(() => {
                                element.style.setProperty('opacity', opacityLevel, 'important');
                                element.setAttribute('data-yt-opacity-reduced', 'true');
                            });
                            
                            newElementsProcessed++;
                        }
                    });
                } catch (error) {
                    debugLog(`Error processing selector ${selector}:`, error);
                }
            });
            
            // Only log if new elements were processed
            if (newElementsProcessed > 0) {
                debugLog(`Processed ${newElementsProcessed} new elements`);
                // Ensure hover listeners are added
                addHoverListener();
            }
        });
    }
    
    // Remove opacity from elements and restore original state
    function removeOpacityFromElements() {
        debugLog('Removing opacity from YouTube elements...');
        
        const elements = document.querySelectorAll('[data-yt-opacity-reduced="true"]');
        elements.forEach(element => {
            const elementData = processedElements.get(element);
            
            requestAnimationFrame(() => {
                if (elementData) {
                    // Restore original opacity
                    if (elementData.originalStyleOpacity === '') {
                        element.style.removeProperty('opacity');
                    } else {
                        element.style.opacity = elementData.originalStyleOpacity;
                    }
                    processedElements.delete(element);
                } else {
                    // Fallback if no data stored
                    element.style.removeProperty('opacity');
                }
                
                // Remove attribute
                element.removeAttribute('data-yt-opacity-reduced');
            });
        });
        
        // Remove hover listeners when disabled
        removeHoverListener();
        debugLog('Opacity removed from all elements');
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
                        startMonitoring();
                        applyOpacityToElements();
                    } else {
                        stopMonitoring();
                        removeOpacityFromElements();
                    }
                    sendResponse({success: true, enabled: isEnabled});
                } else if (request.action === 'setOpacity') {
                    opacityLevel = request.opacity;
                    saveSettings();
                    if (isEnabled) {
                        // Remove and reapply with new opacity
                        removeOpacityFromElements();
                        setManagedTimeout('reapplyOpacity', applyOpacityToElements, 100);
                    }
                    sendResponse({success: true, opacity: opacityLevel});
                } else if (request.action === 'getStatus') {
                    sendResponse({enabled: isEnabled, opacity: opacityLevel});
                } else if (request.action === 'reapply') {
                    if (isEnabled) {
                        removeOpacityFromElements();
                        setManagedTimeout('reapplyManual', applyOpacityToElements, 100);
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
                    // Quick check if we should reapply
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
                if (shouldReapply) return;
            });
            
            if (shouldReapply) {
                debugLog('New elements detected, reapplying opacity...');
                applyOpacityToElements();
            }
        }, 250); // Throttle to 250ms
    });
    
    // Cleanup function
    function cleanup() {
        debugLog('Cleaning up...');
        stopMonitoring();
        removeHoverListener();
        clearAllTimeouts();
        if (observer) observer.disconnect();
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
    
    // Debug memory usage (only in debug mode)
    if (DEBUG && performance.memory) {
        setInterval(() => {
            console.log('[YT-Opacity] Memory usage:', {
                used: Math.round(performance.memory.usedJSHeapSize / 1048576) + 'MB',
                total: Math.round(performance.memory.totalJSHeapSize / 1048576) + 'MB'
            });
        }, 30000); // Every 30 seconds
    }
    
})();