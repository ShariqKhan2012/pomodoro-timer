# Pomodoro Timer

## About
This browser extension implements a simple and minimalistic Pomodoro timer.
Works on:
Chrome
Brave
And possibly other chrome derived browsers, though I didn't test on those.

## Motivation
It is a personal project, which I created because of 2 reasons:
1. I was looking for these features in a Pomodoro timer:
  a. An alarm AND a notification on the start and end of the timer
  b. Ability to blacklist sites i.e the websites that couldn't be opened in a new tab when the 'Work' mode is ON.
  If one of the blacklisted sites is already opned when the timer is off (or paused), and then you start (or resume) the timer, those existing tabs (with the blacklisted sites) would be blocked.
  This was a very important requirement for me.
  Non blacklisted websites continue to be accesible irrepective of whether the timer is on or off.
  c. Ability to adjust work and break durations. TBH, most extensions already had this feature.
  d. A decent looking UI

  I could not find any extension that had all of these features.

  2. When I settled for some extensions, they were asking for permissions that were something like 'This extension and READ and MODIFY the data on any website". I was not comfortable with this.
  Adding to my skeptism was the disclaimer on the web store that Chrome had ot verified these extensions.

### Disclaimer
I have never written a browser extension before, so I took a LOT of help from AI to write the code, and fix the bugs.
THerefore, there could still be some functional bugs. However, this extension DOES NOT contain any malicious code, to the best of my knowledge. The code is opne-source, anyone can have a look at it.

That said, this being a personal project, works fine for my requirement, and I dont intend to fix any bugs (unless critical) or add any features to it. So, this repository will not see much develoment. TO be frank, I dont think it needs further development anyways - it is just a simple extension.

### Installation
Since this extension is not available on the web store, you can not install it like a regular extension.
Follow these steps, instead:

1. Download the zipped code from GitHub, and extract to a folder location on your machine.
2. Open the 'Extension' page on your browser.
(On chrome you can open chrome://extension in a new tab alternatively. On Brave, open brave://extension)
3. Click on the button 'Load Unpacked' on the top left of the page
4. Select the folder conaining this extension.
5. Activate it

In the rare case you need to update it, folow these steps:
1. Download the new version from GitHub, and extract to the SAME folder location on your machine, where it is originally stored
2. Open the 'Extension' page
3. Go to the extension's 'Details' page
4. Click the 'Reload' icon on the top-right of the page

Alternatively, you could just remove the extension and reinstall it. But that will remove any settings (work/break durations, blackisted sites etc) that you may have saved