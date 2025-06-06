// offscreen.js

// This script runs in an offscreen document, allowing access to DOM APIs like Audio.

const alarmSound = new Audio(chrome.runtime.getURL('alarm.mp3'));

// Listen for messages from the background script
chrome.runtime.onMessage.addListener(async (message) => {
    if (message.action === 'playAlarmSound') {
        try {
            alarmSound.currentTime = 0; // Rewind to start in case it was playing
            await alarmSound.play();
            console.log("Alarm sound played from offscreen document.");
        } catch (error) {
            console.error("Error playing alarm sound:", error);
        }
    }
});
