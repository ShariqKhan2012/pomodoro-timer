// background.js

let workDuration = 25 * 60; // Default 25 minutes in seconds
let breakDuration = 5 * 60; // Default 5 minutes in seconds
let currentMode = 'work'; // 'work' or 'break'
let timerRunning = false;
let timerPaused = false;
let timerModeStartTime = 0; // Timestamp when the current mode started or was resumed
let initialModeDuration = 0; // The total duration of the current mode when it started (e.g., 25*60 for work)
let blacklist = [
    "youtube.com", // Corrected default
    "facebook.com",
    "twitter.com",
    "instagram.com",
    "linkedin.com",
    "tiktok.com",
    "reddit.com"
];
let blockingMode = 'redirect'; // 'redirect' or 'cover'

// --- Offscreen Document Management for Audio Playback ---
const OFFSCREEN_DOCUMENT_PATH = 'offscreen.html';

/**
 * Ensures an offscreen document is created and ready for audio playback.
 */
async function setupOffscreenDocument() {
    // Check if an offscreen document is already open
    const offscreenClients = await clients.matchAll({
        includeUncontrolled: true,
        type: 'window'
    });

    let offscreenExists = false;
    for (const client of offscreenClients) {
        if (client.url.includes(OFFSCREEN_DOCUMENT_PATH)) {
            offscreenExists = true;
            break;
        }
    }

    if (!offscreenExists) {
        try {
            await chrome.offscreen.createDocument({
                url: OFFSCREEN_DOCUMENT_PATH,
                reasons: ['AUDIO_PLAYBACK'],
                justification: 'Plays alarm sound for Pomodoro timer.'
            });
            console.log("Pomodoro: Offscreen document created.");
        } catch (error) {
            console.error("Pomodoro: Failed to create offscreen document:", error);
        }
    }
}

/**
 * Sends a message to the offscreen document to play the alarm sound.
 */
async function playAlarmSound() {
    await setupOffscreenDocument(); // Ensure offscreen document is ready
    chrome.runtime.sendMessage({ action: 'playAlarmSound' })
        .catch(error => console.error("Pomodoro: Failed to send message to offscreen document for playback:", error));
}

/**
 * Calculates the current remaining time based on the timer's state.
 * This function should be called whenever remainingTime is needed for display or logic.
 * @returns {number} The calculated remaining time in seconds.
 */
function calculateRemainingTime() {
    if (timerRunning && !timerPaused && timerModeStartTime > 0 && initialModeDuration > 0) {
        const elapsed = Math.floor((Date.now() - timerModeStartTime) / 1000);
        const remaining = Math.max(0, initialModeDuration - elapsed);
        console.log(`Pomodoro: calculateRemainingTime (Running) - Elapsed: ${elapsed}s, Initial: ${initialModeDuration}s, Remaining: ${remaining}s, CurrentTime: ${Date.now()}, StartTime: ${timerModeStartTime}`);
        return remaining;
    } else if (timerPaused) {
        // If paused, remaining time is the initialModeDuration captured at the moment of pause
        console.log(`Pomodoro: calculateRemainingTime (Paused) - InitialModeDuration: ${initialModeDuration}s`);
        return initialModeDuration;
    } else {
        // If not running or paused, it's the default duration for the current mode
        const defaultTime = currentMode === 'work' ? workDuration : breakDuration;
        console.log(`Pomodoro: calculateRemainingTime (Stopped/Default) - Default Time: ${defaultTime}s`);
        return defaultTime;
    }
}

// --- Storage Management ---
/**
 * Loads the timer state from chrome.storage.local.
 */
async function loadState() {
    try {
        const data = await chrome.storage.local.get([
            'workDuration', 'breakDuration', 'currentMode',
            'timerRunning', 'timerPaused', 'timerModeStartTime', 'initialModeDuration', 'blacklist', 'blockingMode'
        ]);

        workDuration = data.workDuration !== undefined ? data.workDuration : 25 * 60;
        breakDuration = data.breakDuration !== undefined ? data.breakDuration : 5 * 60;
        currentMode = data.currentMode !== undefined ? data.currentMode : 'work';
        timerRunning = data.timerRunning !== undefined ? data.timerRunning : false;
        timerPaused = data.timerPaused !== undefined ? data.timerPaused : false;
        timerModeStartTime = data.timerModeStartTime !== undefined ? data.timerModeStartTime : 0;
        initialModeDuration = data.initialModeDuration !== undefined ? data.initialModeDuration : (currentMode === 'work' ? workDuration : breakDuration);
        blacklist = data.blacklist !== undefined ? data.blacklist : [
            "youtube.com", "facebook.com", "twitter.com", "instagram.com",
            "linkedin.com", "tiktok.com", "reddit.com"
        ];
        blockingMode = data.blockingMode !== undefined ? data.blockingMode : 'redirect';

        const calculatedRemainingTime = calculateRemainingTime();
        console.log("Pomodoro: loadState - currentMode:", currentMode, "timerRunning:", timerRunning, "timerPaused:", timerPaused, "initialModeDuration:", initialModeDuration, "timerModeStartTime:", timerModeStartTime, "calculatedRemainingTime:", calculatedRemainingTime);

        if (timerRunning && !timerPaused && calculatedRemainingTime <= 0) {
            // If time ran out while browser was closed, handle the end of the mode
            console.log("Pomodoro: loadState - Timer ran out while closed, handling mode end.");
            handleModeEnd();
        } else if (timerRunning && !timerPaused) {
            // Restart alarm if still running and there's time left
            console.log("Pomodoro: loadState - Timer was running, restarting alarm for:", calculatedRemainingTime, "seconds.");
            startAlarm(calculatedRemainingTime);
            if (currentMode === 'work') {
                await updateDeclarativeNetRequestRules(); // Re-apply blocking rules
                if (blockingMode === 'cover') {
                    applyOverlaysToOpenBlacklistedTabs();
                }
            }
        }

        updateBadge(); // Update badge based on loaded state
        updatePopup(); // Ensure popup gets the latest state upon load
    } catch (error) {
        console.error("Pomodoro: Error loading state:", error);
    }
}

/**
 * Saves the current timer state to chrome.storage.local.
 */
async function saveState() {
    try {
        await chrome.storage.local.set({
            workDuration,
            breakDuration,
            currentMode,
            timerRunning,
            timerPaused,
            timerModeStartTime: timerRunning && !timerPaused ? Date.now() : timerModeStartTime,
            initialModeDuration: initialModeDuration,
            blacklist,
            blockingMode
        });
        console.log("Pomodoro: saveState - State saved. currentMode:", currentMode, "timerRunning:", timerRunning, "timerPaused:", timerPaused, "initialModeDuration:", initialModeDuration, "timerModeStartTime:", timerModeStartTime);
    } catch (error) {
        console.error("Pomodoro: Error saving state:", error);
    }
}

// --- Timer Functions ---

/**
 * Starts the Pomodoro timer in Work mode.
 */
async function startTimer() {
    console.log("Pomodoro: startTimer called.");
    chrome.alarms.clear("pomodoroTimer");
    timerRunning = true;
    timerPaused = false;
    currentMode = 'work';
    timerModeStartTime = Date.now();
    initialModeDuration = workDuration;
    startAlarm(initialModeDuration);
    updateBadge();
    // updatePopup() is called by the listener for state changes
    await saveState(); // Await saveState to ensure state is persisted before blocking
    await updateDeclarativeNetRequestRules(); // Apply blocking rules
    
    // REMOVED: clearAllBlockOverlays() from here as it's redundant and causes flicker on start
    applyOverlaysToOpenBlacklistedTabs(); // Apply overlays to currently open blacklisted tabs
    
    updatePopup(); // Explicitly call updatePopup AFTER all changes are applied
}

/**
 * Pauses the currently running timer.
 */
async function pauseTimer() {
    console.log("Pomodoro: pauseTimer called. State before pause:", {timerRunning, timerPaused, currentMode, initialModeDuration, timerModeStartTime});
    if (!timerRunning) return;
    
    // CRITICAL FIX: Capture the actual remaining time at the moment of pause *before* setting timerPaused
    // This ensures calculateRemainingTime operates on the "running" state to get the correct elapsed time.
    const timeRemainingAtPause = calculateRemainingTime(); 

    chrome.alarms.clear("pomodoroTimer");
    timerPaused = true;
    
    // Now, update initialModeDuration with the correctly captured time remaining
    initialModeDuration = timeRemainingAtPause; 
    
    timerModeStartTime = Date.now(); // Update for consistent state, though not used for remainingTime calculation while paused
    updateBadge();
    // updatePopup() is called by the listener for state changes
    await saveState(); // Await saveState
    await removeDeclarativeNetRequestRules(); // Remove blocking rules on pause
    clearAllBlockOverlays(); // Remove any active overlays
    console.log("Pomodoro: pauseTimer - State after pause:", {timerRunning, timerPaused, currentMode, initialModeDuration, timerModeStartTime, calculatedRemaining: calculateRemainingTime()});
    updatePopup(); // Explicitly call updatePopup AFTER all changes are applied
}

/**
 * Resumes a paused timer.
 */
async function resumeTimer() {
    console.log("Pomodoro: resumeTimer called. State before resume:", {timerRunning, timerPaused, currentMode, initialModeDuration, timerModeStartTime});
    if (!timerRunning || !timerPaused) return;
    timerPaused = false;
    timerModeStartTime = Date.now(); // Reset start time to NOW for accurate calculation from this point forward
    // initialModeDuration already holds the correct remaining time from when it was paused.
    startAlarm(initialModeDuration); // Start alarm with this stored remaining time
    updateBadge();
    // updatePopup() is called by the listener for state changes
    await saveState(); // Await saveState
    await updateDeclarativeNetRequestRules(); // Re-apply blocking rules on resume
    if (blockingMode === 'cover') {
        applyOverlaysToOpenBlacklistedTabs(); // Re-apply overlays if in cover mode
    }
    console.log("Pomodoro: resumeTimer - State after resume:", {timerRunning, timerPaused, currentMode, initialModeDuration, timerModeStartTime, calculatedRemaining: calculateRemainingTime()});
    updatePopup(); // Explicitly call updatePopup AFTER all changes are applied
}

/**
 * Stops the timer and resets it to default Work mode.
 */
async function stopTimer() {
    console.log("Pomodoro: stopTimer called.");
    chrome.alarms.clear("pomodoroTimer");
    timerRunning = false;
    timerPaused = false;
    currentMode = 'work'; // Reset to work mode
    timerModeStartTime = 0;
    initialModeDuration = workDuration; // Reset initial duration for work mode
    updateBadge();
    // updatePopup() is called by the listener for state changes
    await saveState(); // Await saveState
    await removeDeclarativeNetRequestRules(); // Remove blocking rules
    clearAllBlockOverlays(); // Remove any active overlays
    updatePopup(); // Explicitly call updatePopup AFTER all changes are applied
}

/**
 * Sets a Chrome alarm for the given delay.
 * @param {number} delayInSeconds - The delay until the alarm fires, in seconds.
 */
function startAlarm(delayInSeconds) {
    if (delayInSeconds <= 0) {
        console.log("Pomodoro: startAlarm - Delay is 0 or less, not setting alarm.");
        return;
    }

    // Chrome alarms have a minimum of 1 minute for delayInMinutes.
    // We round up to ensure the alarm fires at or after the intended time.
    const delayInMinutes = Math.max(1, Math.ceil(delayInSeconds / 60));
    chrome.alarms.create("pomodoroTimer", { delayInMinutes: delayInMinutes });
    console.log(`Pomodoro: startAlarm - Alarm set for ${delayInMinutes} minutes (${delayInSeconds} seconds).`);
}

// --- Alarm and Notification Handlers ---

/**
 * Handles the end of a work or break session. Plays alarm, shows notification, and transitions modes.
 */
async function handleModeEnd() {
    console.log("Pomodoro: handleModeEnd called. Current mode:", currentMode);
    playAlarmSound(); // Play alarm sound using the offscreen document

    let notificationOptions = {
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: 'Pomodoro Timer',
        message: '',
        priority: 2
    };

    if (currentMode === 'work') {
        notificationOptions.message = 'Work session ended! Time for a break.';
        chrome.notifications.create('workEnd', notificationOptions);
        // Automatically start break mode
        currentMode = 'break';
        timerRunning = true;
        timerPaused = false;
        timerModeStartTime = Date.now(); 
        initialModeDuration = breakDuration;
        startAlarm(initialModeDuration);
        await removeDeclarativeNetRequestRules(); // Stop blocking sites during break
        clearAllBlockOverlays(); // Clear any work mode overlays
        updateBadge();
        updatePopup(); // Notify popup of state change
        saveState();
    } else { // currentMode === 'break'
        notificationOptions.message = 'Break session ended! Ready for next work session?';
        notificationOptions.buttons = [
            { title: 'Extend Break (+5 min)' },
            { title: 'Start Work' }
        ];
        chrome.notifications.create('breakEnd', notificationOptions);
        // Do not automatically start work mode, wait for user input
        timerRunning = false; // Stop timer, wait for user action
        timerPaused = false; // Ensure not paused
        timerModeStartTime = 0; // Reset start time as timer is stopped
        initialModeDuration = breakDuration; // Keep for display purposes
        await removeDeclarativeNetRequestRules(); // Stop blocking sites
        clearAllBlockOverlays(); // Clear any work mode overlays
        updateBadge();
        updatePopup(); // Notify popup of state change
        saveState();
    }
}

// Listener for Chrome alarms firing
chrome.alarms.onAlarm.addListener(alarm => {
    if (alarm.name === "pomodoroTimer") {
        const currentRemaining = calculateRemainingTime();
        console.log("Pomodoro: Alarm fired. Calculated remaining:", currentRemaining);
        // The alarm might fire slightly early due to `delayInMinutes` rounding up.
        // Only trigger `handleModeEnd` if the actual remaining time is very low (e.g., within 5 seconds)
        // or if it's already 0. This prevents double handling or premature mode changes.
        if (currentRemaining <= 5) { // Allow a small buffer for timing
            handleModeEnd();
        } else {
            // Alarm fired early (due to min 1-minute delay), reschedule for remaining time
            console.log("Pomodoro: Alarm fired early, rescheduling for:", currentRemaining, "seconds.");
            startAlarm(currentRemaining);
        }
    }
});

// Listener for notification button clicks
chrome.notifications.onButtonClicked.addListener(async (notificationId, buttonIndex) => {
    if (notificationId === 'breakEnd') {
        if (buttonIndex === 0) { // Extend Break
            console.log("Pomodoro: Notification button: Extend Break clicked.");
            chrome.notifications.clear(notificationId); // Clear the notification
            chrome.alarms.clear("pomodoroTimer");
            currentMode = 'break';
            timerRunning = true;
            timerPaused = false;
            timerModeStartTime = Date.now();
            initialModeDuration = 5 * 60; // New initial duration for extended break
            startAlarm(initialModeDuration);
            await removeDeclarativeNetRequestRules(); // Keep unblocked for extended break
            clearAllBlockOverlays(); // Ensure no lingering overlays
            updateBadge();
            updatePopup(); // Notify popup of state change
            saveState();
        } else if (buttonIndex === 1) { // Start Work
            console.log("Pomodoro: Notification button: Start Work clicked.");
            chrome.notifications.clear(notificationId); // Clear the notification
            await startTimer(); // This will reset to work mode and start
        }
    }
});

// Listener for notification clicks (not buttons)
chrome.notifications.onClicked.addListener((notificationId) => {
    chrome.notifications.clear(notificationId);
});

// --- Site Blocking (Declarative Net Request) ---

const DYNAMIC_RULE_ID_OFFSET = 1000; // Offset for dynamic rules to avoid conflicts

/**
 * Generates declarativeNetRequest rules from the blacklist.
 * @returns {Array} An array of declarativeNetRequest rules.
 */
function generateDeclarativeNetRequestRules() {
    const rules = [];
    blacklist.forEach((site, index) => {
        // Normalize site to remove 'www.' and ensure it's just the core domain
        let normalizedSite = site.toLowerCase();
        if (normalizedSite.startsWith('www.')) {
            normalizedSite = normalizedSite.substring(4);
        }

        // Rule for the root domain (e.g., example.com)
        rules.push({
            id: DYNAMIC_RULE_ID_OFFSET + (index * 2), // Unique ID for root domain
            priority: 1,
            action: {
                type: 'redirect',
                redirect: {
                    url: chrome.runtime.getURL('not_allowed.html')
                }
            },
            condition: {
                // Matches example.com and any path. Add trailing slash for robustness.
                urlFilter: `*://${normalizedSite}/*`,
                resourceTypes: ['main_frame']
            }
        });

        // Rule for subdomains (e.g., *.example.com)
        rules.push({
            id: DYNAMIC_RULE_ID_OFFSET + (index * 2) + 1, // Unique ID for subdomains
            priority: 1,
            action: {
                type: 'redirect',
                redirect: {
                    url: chrome.runtime.getURL('not_allowed.html')
                }
            },
            condition: {
                // Matches sub.example.com and any path. Add trailing slash for robustness.
                urlFilter: `*://*.${normalizedSite}/*`,
                resourceTypes: ['main_frame']
            }
        });
    });
    console.log("Pomodoro: Generated DNR rules:", rules);
    return rules;
}

/**
 * Updates declarativeNetRequest dynamic rules based on the current blacklist and blocking mode.
 */
async function updateDeclarativeNetRequestRules() {
    // First, remove all existing dynamic rules managed by this extension
    const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
    const ruleIdsToRemove = existingRules.map(rule => rule.id);

    if (ruleIdsToRemove.length > 0) {
        await chrome.declarativeNetRequest.updateDynamicRules({
            removeRuleIds: ruleIdsToRemove
        });
        console.log("Pomodoro: Removed existing declarativeNetRequest rules:", ruleIdsToRemove);
    }

    // Add new rules only if in work mode and blockingMode is 'redirect'
    if (timerRunning && !timerPaused && currentMode === 'work' && blockingMode === 'redirect') {
        const newRules = generateDeclarativeNetRequestRules();
        if (newRules.length > 0) {
            await chrome.declarativeNetRequest.updateDynamicRules({
                addRules: newRules
            });
            console.log("Pomodoro: Added new declarativeNetRequest rules:", newRules.map(r => r.id));
        }
    }
}

/**
 * Removes all declarativeNetRequest dynamic rules managed by this extension.
 */
async function removeDeclarativeNetRequestRules() {
    const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
    const ruleIdsToRemove = existingRules.map(rule => rule.id);

    if (ruleIdsToRemove.length > 0) {
        await chrome.declarativeNetRequest.updateDynamicRules({
            removeRuleIds: ruleIdsToRemove
        });
        console.log("Pomodoro: Removed all declarativeNetRequest rules.");
    }
}

// --- Site Blocking (Content Script for Cover Mode) ---

/**
 * Checks if a given URL's domain is present in the blacklist.
 * This version is used for content script injection logic, allowing more flexible matching.
 * @param {string} url - The URL to check.
 * @returns {boolean} True if the URL is blacklisted, false otherwise.
 */
function isUrlBlacklistedForContentScript(url) {
    try {
        const urlObj = new URL(url);
        let domain = urlObj.hostname;

        // Remove 'www.' prefix for consistent matching
        if (domain.startsWith('www.')) {
            domain = domain.substring(4);
        }

        return blacklist.some(blacklistedSite => {
            let normalizedBlacklistedSite = blacklistedSite;
            if (normalizedBlacklistedSite.startsWith('www.')) {
                normalizedBlacklistedSite = normalizedBlacklistedSite.substring(4);
            }
            // Check for exact match or if the domain ends with the blacklisted site (for subdomains)
            return domain === normalizedBlacklistedSite || domain.endsWith('.' + normalizedBlacklistedSite);
        });
    } catch (e) {
        console.error("Pomodoro: Invalid URL for blacklist check (content script):", url, e);
        return false;
    }
}

/**
 * Injects the content script into a specific tab and sends a message to apply the block overlay.
 * @param {number} tabId - The ID of the tab.
 * @param {string} url - The URL of the tab.
 */
async function injectContentScriptAndApplyOverlay(tabId, url) {
    // Only apply to http(s) tabs and if the tab is not chrome://, about:, etc.
    if (!tabId || !url || !(url.startsWith('http://') || url.startsWith('https://'))) {
        console.log(`Pomodoro: Skipping content script injection for non-web URL: ${url}`);
        return;
    }

    // Only apply overlay if timer is running, not paused, in work mode, and blockingMode is 'cover'
    if (timerRunning && !timerPaused && currentMode === 'work' && blockingMode === 'cover' && isUrlBlacklistedForContentScript(url)) {
        try {
            // Ensure the content script is injected
            await chrome.scripting.executeScript({
                target: { tabId: tabId },
                files: ['content_script.js']
            });
            console.log(`Pomodoro: Content script injected into tab ${tabId}.`);

            // Send message to content script to apply overlay
            await chrome.tabs.sendMessage(tabId, { action: 'applyBlockOverlay' });
            console.log(`Pomodoro: Sent 'applyBlockOverlay' message to tab ${tabId}.`);
        } catch (e) {
            // This error often means the script is already injected or tab is not ready
            console.warn(`Pomodoro: Error injecting content script or sending message to tab ${tabId}:`, e);
        }
    }
}

/**
 * Sends a message to a specific tab's content script to remove the block overlay.
 * @param {number} tabId - The ID of the tab.
 */
async function clearBlockOverlayFromTab(tabId) {
    // Before trying to get tab, check if tabId is valid.
    if (typeof tabId !== 'number' || tabId <= 0) {
        console.warn(`Pomodoro: Invalid tabId provided for clearBlockOverlayFromTab: ${tabId}`);
        return;
    }

    // Only apply to http(s) tabs and if the tab is not chrome://, about:, etc.
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    if (!tab || !tab.url || !(tab.url.startsWith('http://') || tab.url.startsWith('https://'))) {
        console.log(`Pomodoro: Skipping overlay removal for non-web URL or invalid tab: ${tab?.url || 'N/A'}`);
        return;
    }

    try {
        // Attempt to inject content script first, in case it's not there or was removed
        await chrome.scripting.executeScript({
            target: { tabId: tabId },
            files: ['content_script.js']
        }).catch(e => console.warn(`Pomodoro: Content script already injected or could not be injected into tab ${tabId} for removal:`, e));

        await chrome.tabs.sendMessage(tabId, { action: 'removeBlockOverlay' })
            .catch(e => console.warn(`Pomodoro: Failed to send 'removeBlockOverlay' message to tab ${tabId}:`, e));
        console.log(`Pomodoro: Sent 'removeBlockOverlay' message to tab ${tabId}.`);
    } catch (e) {
        console.error(`Pomodoro: Error clearing block overlay from tab ${tabId}:`, e);
    }
}

/**
 * Iterates through all open tabs and applies or removes block overlays as necessary.
 */
async function applyOverlaysToOpenBlacklistedTabs() {
    // Query only http(s) tabs
    const tabs = await chrome.tabs.query({ url: ["http://*/*", "https://*/*"] });
    for (const tab of tabs) {
        if (tab.id && tab.url) {
            injectContentScriptAndApplyOverlay(tab.id, tab.url);
        }
    }
}

/**
 * Removes overlays from all open tabs.
 */
async function clearAllBlockOverlays() {
    // Query only http(s) tabs
    const tabs = await chrome.tabs.query({ url: ["http://*/*", "https://*/*"] });
    for (const tab of tabs) {
        if (tab.id && tab.url) {
            clearBlockOverlayFromTab(tab.id);
        }
    }
}

// Listener for tab updates (e.g., when a new URL is loaded in an existing tab)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url) {
        // When a tab finishes loading, check if it should be blocked by overlay
        injectContentScriptAndApplyOverlay(tabId, tab.url);
    }
});

// Listener for tab activation (when user switches tabs)
chrome.tabs.onActivated.addListener(activeInfo => {
    chrome.tabs.get(activeInfo.tabId, (tab) => {
        if (tab && tab.url) { // Ensure tab object is valid and has a URL
            injectContentScriptAndApplyOverlay(activeInfo.tabId, tab.url);
        }
    });
});

// --- UI Updates and Communication with Popup ---

/**
 * Sends the current timer state to the popup.
 */
function updatePopup() {
    const remainingTime = calculateRemainingTime();
    chrome.runtime.sendMessage({
        action: 'updatePopup',
        state: {
            isRunning: timerRunning,
            isPaused: timerPaused,
            mode: currentMode,
            remainingTime: remainingTime,
            workDuration: workDuration,
            breakDuration: breakDuration,
            blacklist: blacklist,
            blockingMode: blockingMode
        }
    }).catch(e => {
        // This catch block is expected to run when the popup is not open,
        // so no error is logged unless it's a different type of error.
        if (e.message !== "Could not establish connection. Receiving end does not exist.") {
            console.error("Pomodoro: Error sending updatePopup message:", e);
        }
    });
}

/**
 * Updates the extension's badge icon with the remaining time.
 */
function updateBadge() {
    if (timerRunning && !timerPaused) {
        const remainingTime = calculateRemainingTime();
        const minutes = Math.ceil(remainingTime / 60);
        chrome.action.setBadgeText({ text: `${minutes} m` });
        chrome.action.setBadgeBackgroundColor({ color: currentMode === 'work' ? '#3498db' : '#2ecc71' });
    } else {
        chrome.action.setBadgeText({ text: '' });
    }
}

// --- Message Listener from Popup ---
chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
    let responseSent = false; // Flag to ensure sendResponse is called only once

    try {
        switch (request.action) {
            case 'getTimerState':
                const remainingTimeOnRequest = calculateRemainingTime();
                sendResponse({
                    isRunning: timerRunning,
                    isPaused: timerPaused,
                    mode: currentMode,
                    remainingTime: remainingTimeOnRequest,
                    workDuration: workDuration,
                    breakDuration: breakDuration,
                    blacklist: blacklist,
                    blockingMode: blockingMode
                });
                responseSent = true;
                break; // Handled by this case, no fallthrough to finally sendResponse for this specific action

            case 'startTimer':
                await startTimer();
                // responseSent is not set here because popup.js no longer expects a direct response for this action
                // Instead, updatePopup() broadcast will handle UI updates.
                break;

            case 'pauseTimer':
                await pauseTimer();
                // responseSent is not set here because popup.js no longer expects a direct response for this action
                break;

            case 'resumeTimer':
                await resumeTimer();
                // responseSent is not set here because popup.js no longer expects a direct response for this action
                break;

            case 'stopTimer':
                await stopTimer();
                // responseSent is not set here because popup.js no longer expects a direct response for this action
                break;

            case 'saveSettings':
                const oldBlockingMode = blockingMode;
                workDuration = request.workDuration;
                breakDuration = request.breakDuration;
                blockingMode = request.blockingMode;
                if (!timerRunning && !timerPaused) {
                    initialModeDuration = workDuration;
                }
                await saveState();
                // updatePopup() is called within the action handlers, so no need here again.
                // It will broadcast the updated state.
                // responseSent is not set here because popup.js no longer expects a direct response for this action
                break;

            case 'addBlacklistSite':
                const newSite = request.site.toLowerCase().replace(/^(https?:\/\/)?(www\.)?/, '');
                if (!blacklist.includes(newSite)) {
                    blacklist.push(newSite);
                    await saveState();
                    // updatePopup() is called within the action handlers, so no need here again.
                    sendResponse({ success: true, blacklist: blacklist });
                } else {
                    sendResponse({ success: false, message: 'Site already exists.' });
                }
                responseSent = true; // For add/remove, we still send a direct response
                break;

            case 'removeBlacklistSite':
                const siteToRemove = request.site;
                blacklist = blacklist.filter(site => site !== siteToRemove);
                await saveState();
                // updatePopup() is called within the action handlers, so no need here again.
                sendResponse({ success: true, blacklist: blacklist });
                responseSent = true; // For add/remove, we still send a direct response
                break;

            // 'updatePopup' and 'updateBlacklist' are messages *received* from background,
            // not *sent* from popup. They don't typically need a direct response back from popup.
            // However, the popup listener for these now includes sendResponse for acknowledging.
            // The background's onMessage listener doesn't need to handle sending responses for these.
            default:
                console.warn("Pomodoro: Unknown action received:", request.action);
                sendResponse({ success: false, error: "Unknown action" });
                responseSent = true;
                break;
        }
    } catch (error) {
        console.error("Pomodoro: Error in runtime.onMessage listener for action:", request.action, error);
        // Only send error response if one hasn't been sent already by a specific case
        if (!responseSent) {
            sendResponse({ success: false, error: error.message });
            responseSent = true;
        }
    }
    // Return true to indicate that sendResponse will be called asynchronously.
    // This is crucial. If a response was sent in a case, responseSent will be true.
    // If not, and we fall through to default, it will be handled there.
    return true; 
});

// --- Auto-start with Browser ---
chrome.runtime.onStartup.addListener(() => {
    console.log("Pomodoro: Browser started. Loading previous state...");
    loadState();
});

// --- Initial Setup on Installation ---
chrome.runtime.onInstalled.addListener(() => {
    console.log("Pomodoro: Extension installed. Initializing state...");
    chrome.storage.local.get(['workDuration', 'breakDuration', 'blacklist', 'blockingMode'], async (data) => {
        if (data.workDuration === undefined) {
            await chrome.storage.local.set({ workDuration: 25 * 60 });
        }
        if (data.breakDuration === undefined) {
            await chrome.storage.local.set({ breakDuration: 5 * 60 });
        }
        // Ensure blacklist is clean on install/update
        const defaultBlacklist = [
            "youtube.com",
            "facebook.com",
            "twitter.com",
            "instagram.com",
            "linkedin.com",
            "tiktok.com",
            "reddit.com"
        ];
        // Check if blacklist is missing, empty, or contains old problematic entries
        const shouldResetBlacklist = data.blacklist === undefined || data.blacklist.length === 0 ||
                                     data.blacklist.some(site => site.includes('googleusercontent.com/youtube.com/0') || site.includes('youtube.com/')); // Check for old formats

        if (shouldResetBlacklist) {
            await chrome.storage.local.set({ blacklist: defaultBlacklist });
            console.log("Pomodoro: Blacklist reset to defaults due to missing, empty, or old entries.");
        }

        if (data.blockingMode === undefined) {
            await chrome.storage.local.set({ blockingMode: 'redirect' });
        }
        loadState();
    });
});

// Load state when the background script first runs (e.g., on browser launch or extension update)
loadState();
