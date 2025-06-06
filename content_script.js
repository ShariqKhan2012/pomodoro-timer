// content_script.js

// Use a global variable to ensure the script's main logic runs only once per tab's isolated world.
// This prevents re-declaration errors if the script is injected multiple times.
if (window.pomodoroContentScriptInitialized) {
    console.log("Pomodoro: Content script already initialized for this tab, skipping re-initialization.");
} else {
    window.pomodoroContentScriptInitialized = true; // Set the flag

    const OVERLAY_ID = 'pomodoro-block-overlay';

    /**
     * Creates and displays a full-page overlay to block access to the site.
     */
    function createOverlay() {
        let overlay = document.getElementById(OVERLAY_ID);
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = OVERLAY_ID;
            // Apply inline styles for immediate effect and high z-index
            overlay.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100vw;
                height: 100vh;
                background-color: rgba(231, 76, 60, 0.95); /* Reddish overlay with transparency */
                color: white;
                font-family: 'Inter', sans-serif;
                display: flex;
                flex-direction: column;
                justify-content: center;
                align-items: center;
                font-size: 2em;
                text-align: center;
                z-index: 2147483647; /* Max possible z-index to ensure it's on top */
                opacity: 0; /* Start hidden for animation */
                animation: fadeIn 0.5s ease-out forwards; /* Apply fade-in animation */
            `;
            // Add inner HTML for content, including embedded styles for animations
            overlay.innerHTML = `
                <style>
                    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap');
                    @keyframes fadeIn {
                        from { opacity: 0; }
                        to { opacity: 1; }
                    }
                    @keyframes fadeOut {
                        from { opacity: 1; }
                        to { opacity: 0; }
                    }
                    #${OVERLAY_ID} h1 {
                        font-size: 3em;
                        margin-bottom: 20px;
                    }
                    #${OVERLAY_ID} p {
                        font-size: 1.2em;
                        line-height: 1.6;
                        margin-bottom: 10px;
                    }
                    #${OVERLAY_ID} .icon {
                        font-size: 5em;
                        margin-bottom: 20px;
                    }
                </style>
                <div class="icon">🚫</div>
                <h1>Access Denied!</h1>
                <p>You are currently in Pomodoro Work Mode.</p>
                <p>This site is on your blacklist to help you stay focused.</p>
                <p>Please return to your work or take a break!</p>
            `;
            document.body.appendChild(overlay);
            console.log("Pomodoro: Overlay created.");
        }
    }

    /**
     * Removes the full-page overlay from the DOM.
     */
    function removeOverlay() {
        const overlay = document.getElementById(OVERLAY_ID);
        if (overlay) {
            overlay.style.animation = 'fadeOut 0.5s ease-out forwards'; // Apply fade-out animation
            overlay.addEventListener('animationend', () => {
                overlay.remove(); // Remove after animation completes
                console.log("Pomodoro: Overlay removed.");
            }, { once: true });
        }
    }

    /**
     * Pauses all audio and video elements on the page.
     * Stores a flag to indicate which media elements were paused by the extension.
     */
    function pauseMedia() {
        document.querySelectorAll('audio, video').forEach(media => {
            if (!media.paused) {
                // Use a dataset attribute to mark media paused by this extension
                media.dataset.pomodoroWasPlaying = 'true';
                media.pause();
                console.log("Pomodoro: Media paused:", media);
            }
        });
    }

    /**
     * Resumes media elements that were previously paused by the extension.
     */
    function resumeMedia() {
        document.querySelectorAll('audio, video').forEach(media => {
            if (media.dataset.pomodoroWasPlaying === 'true') {
                media.play().catch(e => console.error("Pomodoro: Error resuming media:", e));
                delete media.dataset.pomodoroWasPlaying; // Clean up the flag
                console.log("Pomodoro: Media resumed:", media);
            }
        });
    }

    // Listen for messages from the background script
    chrome.runtime.onMessage.addListener((message) => {
      console.log('OverlayMessage => ', message);
        if (message.action === 'applyBlockOverlay') {
            createOverlay();
            pauseMedia();
        } else if (message.action === 'removeBlockOverlay') {
            removeOverlay();
            resumeMedia();
        }
    });

    console.log("Pomodoro: Content script loaded and initialized.");
}
