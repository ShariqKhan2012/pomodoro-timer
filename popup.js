// popup.js

document.addEventListener('DOMContentLoaded', () => {
    const startButton = document.getElementById('startButton');
    const pauseResumeButton = document.getElementById('pauseResumeButton');
    const stopButton = document.getElementById('stopButton');
    const workDurationInput = document.getElementById('workDurationInput');
    const breakDurationInput = document.getElementById('breakDurationInput');
    const saveSettingsButton = document.getElementById('saveSettingsButton');
    const blacklistInput = document.getElementById('blacklistInput');
    const addSiteButton = document.getElementById('addSiteButton');
    const blacklistList = document.getElementById('blacklistList');
    const timerDisplay = document.getElementById('timerDisplay');
    const modeDisplay = document.getElementById('modeDisplay');
    const timerCanvas = document.getElementById('timerCanvas');
    const ctx = timerCanvas.getContext('2d');
    const blockModeRedirect = document.getElementById('blockModeRedirect');
    const blockModeCover = document.getElementById('blockModeCover');

    let currentTimerState = {
        isRunning: false,
        isPaused: false,
        mode: 'work', // 'work' or 'break'
        remainingTime: 0, // in seconds (this will be locally decremented for display)
        workDuration: 25 * 60, // default 25 minutes in seconds
        breakDuration: 5 * 60, // default 5 minutes in seconds
        blacklist: [],
        blockingMode: 'cover' // 'redirect' or 'cover'
    };

    let popupTimerInterval; // Variable to hold the setInterval ID for the local popup timer

    // Function to update the UI based on the current timer state
    function updateUI() {
        const minutes = Math.floor(currentTimerState.remainingTime / 60);
        const seconds = currentTimerState.remainingTime % 60;
        timerDisplay.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        modeDisplay.textContent = `${currentTimerState.mode === 'work' ? 'Work Mode' : 'Break Mode'}`;

        startButton.disabled = currentTimerState.isRunning;
        stopButton.disabled = !currentTimerState.isRunning && !currentTimerState.isPaused;
        pauseResumeButton.disabled = !currentTimerState.isRunning && !currentTimerState.isPaused;

        if (currentTimerState.isRunning) {
            pauseResumeButton.textContent = currentTimerState.isPaused ? 'Resume' : 'Pause';
        } else {
            pauseResumeButton.textContent = 'Pause'; // Reset text when not running
        }

        // Update blocking mode radio buttons
        if (currentTimerState.blockingMode === 'redirect') {
            blockModeRedirect.checked = true;
        } else {
            blockModeCover.checked = true;
        }

        drawTimerRing();
    }

    // Function to draw the timer ring animation
    function drawTimerRing() {
        const centerX = timerCanvas.width / 2;
        const centerY = timerCanvas.height / 2;
        const radius = 90;
        const lineWidth = 10;

        ctx.clearRect(0, 0, timerCanvas.width, timerCanvas.height);

        // Background ring
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
        ctx.lineWidth = lineWidth;
        ctx.strokeStyle = '#e0e0e0';
        ctx.stroke();

        // Progress ring
        if (currentTimerState.isRunning || currentTimerState.isPaused) {
            let totalDuration = currentTimerState.mode === 'work' ? currentTimerState.workDuration : currentTimerState.breakDuration;
            // Ensure totalDuration is not zero to avoid division by zero
            if (totalDuration === 0) totalDuration = 1;

            const progress = (totalDuration - currentTimerState.remainingTime) / totalDuration;
            const endAngle = progress * 2 * Math.PI - Math.PI / 2; // Start from top (-PI/2)

            ctx.beginPath();
            ctx.arc(centerX, centerY, radius, -Math.PI / 2, endAngle);
            ctx.lineWidth = lineWidth;
            ctx.lineCap = 'round';
            ctx.strokeStyle = currentTimerState.mode === 'work' ? '#3498db' : '#2ecc71'; // Blue for work, green for break
            ctx.stroke();
        }
    }

    // Function to render the blacklist
    function renderBlacklist() {
        blacklistList.innerHTML = '';
        currentTimerState.blacklist.forEach((site, index) => {
            const li = document.createElement('li');
            li.textContent = site;
            const removeButton = document.createElement('button');
            removeButton.textContent = 'Remove';
            removeButton.className = 'remove-button';
            removeButton.addEventListener('click', () => {
                // Send message to background to remove site (no direct response expected, UI updates via broadcast)
                chrome.runtime.sendMessage({
                    action: 'removeBlacklistSite',
                    site: site
                }).catch(error => {
                    console.error("Pomodoro Popup: Error sending removeBlacklistSite message:", error);
                });
            });
            li.appendChild(removeButton);
            blacklistList.appendChild(li);
        });
    }

    // --- Local Popup Timer Functions ---
    function startPopupTimer() {
        // Clear any existing interval to prevent multiple timers running
        if (popupTimerInterval) {
            clearInterval(popupTimerInterval);
        }

        popupTimerInterval = setInterval(() => {
            if (currentTimerState.isRunning && !currentTimerState.isPaused) {
                if (currentTimerState.remainingTime > 0) {
                    currentTimerState.remainingTime--;
                    updateUI();
                } else {
                    // If local timer hits zero, it means the background alarm should have fired
                    // Request the latest state from background to sync and handle mode changes
                    console.log("Pomodoro Popup: Local timer hit zero, requesting state from background.");
                    chrome.runtime.sendMessage({ action: 'getTimerState' }, (response) => {
                        if (response) {
                            currentTimerState = { ...currentTimerState, ...response };
                            updateUI();
                            if (!response.isRunning) { // If background says timer stopped, clear local interval
                                stopPopupTimer();
                            }
                        } else {
                            console.error("Pomodoro Popup: No response from getTimerState after local timer hit zero.");
                        }
                        if (chrome.runtime.lastError) {
                            console.error("Pomodoro Popup: chrome.runtime.lastError for getTimerState after local timer hit zero:", chrome.runtime.lastError.message);
                        }
                    });
                }
            } else {
                // If timer is not running or is paused, stop the local interval
                stopPopupTimer();
            }
        }, 1000); // Update every second
    }

    function stopPopupTimer() {
        if (popupTimerInterval) {
            clearInterval(popupTimerInterval);
            popupTimerInterval = null;
        }
    }

    // Load initial state from background script
    chrome.runtime.sendMessage({ action: 'getTimerState' }, (response) => {
        if (response) {
            currentTimerState = { ...currentTimerState, ...response };
            workDurationInput.value = currentTimerState.workDuration / 60;
            breakDurationInput.value = currentTimerState.breakDuration / 60;
            updateUI();
            renderBlacklist(); // Render blacklist on initial load

            // Start local popup timer if the background timer is running and not paused
            if (currentTimerState.isRunning && !currentTimerState.isPaused) {
                startPopupTimer();
            }
        } else {
            console.error("Pomodoro Popup: Failed to get initial timer state from background.");
        }
        if (chrome.runtime.lastError) {
            console.error("Pomodoro Popup: chrome.runtime.lastError for initial getTimerState:", chrome.runtime.lastError.message);
        }
    });

    // Event Listeners - NO DIRECT RESPONSE EXPECTED FOR THESE COMMANDS
    // State updates will come from the background script's updatePopup broadcast
    startButton.addEventListener('click', () => {
        chrome.runtime.sendMessage({ action: 'startTimer' }).catch(error => {
            console.error("Pomodoro Popup: Error sending startTimer message:", error);
        });
    });

    pauseResumeButton.addEventListener('click', () => {
        const action = currentTimerState.isPaused ? 'resumeTimer' : 'pauseTimer';
        chrome.runtime.sendMessage({ action: action }).catch(error => {
            console.error("Pomodoro Popup: Error sending pause/resume message:", error);
        });
    });

    stopButton.addEventListener('click', () => {
        chrome.runtime.sendMessage({ action: 'stopTimer' }).catch(error => {
            console.error("Pomodoro Popup: Error sending stopTimer message:", error);
        });
    });

    saveSettingsButton.addEventListener('click', () => {
        const newWorkDuration = parseInt(workDurationInput.value, 10) * 60;
        const newBreakDuration = parseInt(breakDurationInput.value, 10) * 60;
        const newBlockingMode = document.querySelector('input[name="blockingMode"]:checked').value;

        if (newWorkDuration > 0 && newBreakDuration > 0) {
            chrome.runtime.sendMessage({
                action: 'saveSettings',
                workDuration: newWorkDuration,
                breakDuration: newBreakDuration,
                blockingMode: newBlockingMode
            }).then(() => {
                alert('Settings saved!'); // Optimistic UI update, actual update comes from broadcast
            }).catch(error => {
                console.error("Pomodoro Popup: Error sending saveSettings message:", error);
                alert("An error occurred while saving settings. Check console for details.");
            });
        } else {
            alert('Durations must be positive numbers.');
        }
    });

    addSiteButton.addEventListener('click', () => {
        const site = blacklistInput.value.trim();
        if (site) {
            // No direct response expected. UI will update via updatePopup broadcast from background.
            chrome.runtime.sendMessage({ action: 'addBlacklistSite', site: site })
                .catch(error => {
                    console.error("Pomodoro Popup: Error sending addBlacklistSite message:", error);
                });
            blacklistInput.value = ''; // Clear input immediately for better UX
        }
    });

    // Listen for state updates from the background script (THIS IS THE PRIMARY WAY UI UPDATES NOW)
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'updatePopup') {
            console.log("Pomodoro Popup: Received updatePopup message:", request.state);
            currentTimerState = { ...currentTimerState, ...request.state };
            updateUI();
            renderBlacklist(); // <-- CRITICAL FIX: Call renderBlacklist here to refresh UI

            // If the background script signals a running timer, ensure local timer is active
            if (currentTimerState.isRunning && !currentTimerState.isPaused) {
                startPopupTimer();
            } else {
                stopPopupTimer();
            }
            // Acknowledge receipt of the message
            if (sendResponse) sendResponse({ success: true });
        }
        // Removed the 'else if (request.action === 'updateBlacklist')' as it's now redundant
        return true; // Indicate that the response might be sent asynchronously
    });

    // Ensure the local timer is stopped when the popup is closed
    window.addEventListener('unload', () => {
        stopPopupTimer();
    });

    // Initial UI update and draw
    updateUI();
    drawTimerRing(); // Draw initial empty ring
});
