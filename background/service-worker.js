/**
 * AutoTimesheet Background Service Worker (Manifest V3)
 * Manages browser startup detection, heartbeat, and action icon hover/badge updates.
 */

importScripts("../lib/timesheet.js", "../lib/storage.js");

const ALARM_NAME = "autoTimesheetHeartbeat";

/**
 * Update the extension icon hover title and badge with worked hours
 */
async function updateExtensionIconAndState() {
  const session = await getTodaySession();
  const now = Date.now();

  // Update heartbeat
  session.lastActiveTime = now;
  await saveTodaySession(session);

  const workedDuration = getTimeWorked(now, session.startTime, session.lunchBreak);
  const badgeText = getBadgeTime(now, session.startTime, session.lunchBreak);

  // Requirement 6: Show worked hours when hovering over the extension icon
  // Replicates: trayIcon.setToolTip("Auto Timesheet (" + getTimeWorked(...) + ")");
  chrome.action.setTitle({
    title: `Auto Timesheet (${workedDuration})`
  });

  // Also display compact time directly on badge
  chrome.action.setBadgeText({ text: badgeText });
  chrome.action.setBadgeBackgroundColor({ color: workedDuration.startsWith("-") ? "#e11d48" : "#2563eb" });
}

/**
 * Setup alarms for recurring heartbeat (every 1 minute)
 */
async function ensureAlarm() {
  const alarm = await chrome.alarms.get(ALARM_NAME);
  if (!alarm) {
    chrome.alarms.create(ALARM_NAME, {
      periodInMinutes: 1,
      delayInMinutes: 0.1
    });
  }
}

// Requirement 2: Start timing when the user first launches Chrome
chrome.runtime.onStartup.addListener(async () => {
  console.log("[AutoTimesheet] Chrome launched: Initializing session and heartbeat.");
  await getTodaySession();
  await ensureAlarm();
  await updateExtensionIconAndState();
});

// Extension installed or updated
chrome.runtime.onInstalled.addListener(async () => {
  console.log("[AutoTimesheet] Extension installed/updated.");
  await getTodaySession();
  await ensureAlarm();
  await updateExtensionIconAndState();
});

// Periodic alarm handler
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === ALARM_NAME) {
    await updateExtensionIconAndState();
  }
});

// React immediately when the user changes start time, lunch, or settings in popup
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && changes.todaySession) {
    updateExtensionIconAndState();
  }
});

// Handle custom messages from UI
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "REFRESH_STATUS") {
    updateExtensionIconAndState().then(() => sendResponse({ success: true }));
    return true; // Keep channel open for async response
  }
});
