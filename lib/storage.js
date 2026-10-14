/**
 * Storage Abstraction for AutoTimesheet Extension
 * Handles chrome.storage.local, chrome.storage.sync, and IndexedDB for FileSystemDirectoryHandle.
 */

const DEFAULT_SETTINGS = {
  defaultLunchBreak: 30,
  autoExportDownloads: false
};

/**
 * Get user settings (e.g. default lunch break)
 */
async function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(DEFAULT_SETTINGS, (items) => {
      if (chrome.runtime.lastError) {
        chrome.storage.local.get(DEFAULT_SETTINGS, resolve);
      } else {
        resolve(items);
      }
    });
  });
}

/**
 * Save user settings
 */
async function saveSettings(settings) {
  return new Promise((resolve) => {
    chrome.storage.sync.set(settings, () => {
      if (chrome.runtime.lastError) {
        chrome.storage.local.set(settings, resolve);
      } else {
        resolve();
      }
    });
  });
}

/**
 * Returns today's ISO date string: YYYY-MM-DD
 */
function getTodayDateKey(date = new Date()) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Get today's active session state
 */
async function getTodaySession() {
  const dateKey = getTodayDateKey();
  return new Promise((resolve) => {
    chrome.storage.local.get(["todaySession", "currentMonthEntries"], async (res) => {
      let session = res.todaySession;
      if (!session || session.dateKey !== dateKey) {
        // If previous session wasn't finalized, seal it into monthly entries
        if (session && !session.isFinalized) {
          await finalizeSession(session);
        }

        // Initialize new session for today
        const settings = await getSettings();
        const now = Date.now();
        session = {
          dateKey,
          startTime: now,
          lastActiveTime: now,
          lunchBreak: settings.defaultLunchBreak ?? 30,
          comment: "",
          isFinalized: false
        };
        await saveTodaySession(session);
      }
      resolve(session);
    });
  });
}

/**
 * Save today's session state
 */
async function saveTodaySession(session) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ todaySession: session }, resolve);
  });
}

/**
 * Finalize a session and commit it to the month's records
 */
async function finalizeSession(session) {
  if (!session) return;
  const monthKey = formatMonthKey(session.startTime);
  const entries = await getMonthlyEntries(monthKey);

  const endTime = session.lastActiveTime || Date.now();
  const totalWorked = getTimeWorked(endTime, session.startTime, session.lunchBreak);

  const existingIdx = entries.findIndex(e => e.dateKey === session.dateKey || e.id === session.dateKey);
  const entryRecord = {
    id: session.dateKey,
    dateKey: session.dateKey,
    startTime: session.startTime,
    startTimeStr: formatEntryDate(session.startTime),
    lunchBreak: session.lunchBreak,
    endTime: endTime,
    endTimeStr: formatEntryDate(endTime),
    totalTimeWorked: totalWorked,
    comment: session.comment || ""
  };

  if (existingIdx >= 0) {
    entries[existingIdx] = entryRecord;
  } else {
    entries.push(entryRecord);
  }

  // Sort by start time ascending
  entries.sort((a, b) => a.startTime - b.startTime);

  await saveMonthlyEntries(monthKey, entries);
  session.isFinalized = true;
  await saveTodaySession(session);
  return entryRecord;
}

/**
 * Get entries for a specific month (e.g. "2026-Sep")
 */
async function getMonthlyEntries(monthKey) {
  const key = `month_${monthKey}`;
  return new Promise((resolve) => {
    chrome.storage.local.get([key], (res) => {
      resolve(res[key] || []);
    });
  });
}

/**
 * Save entries for a specific month
 */
async function saveMonthlyEntries(monthKey, entries) {
  const key = `month_${monthKey}`;
  return new Promise((resolve) => {
    chrome.storage.local.set({ [key]: entries }, resolve);
  });
}

/**
 * Recalculate and update all entries in the month
 */
async function recalculateAndSaveMonth(monthKey) {
  const entries = await getMonthlyEntries(monthKey);
  const recalculated = recalculateEntries(entries);
  await saveMonthlyEntries(monthKey, recalculated);
  return recalculated;
}

/**
 * Get a list of all month keys currently stored in chrome.storage.local
 */
async function getAllRecordedMonths() {
  return new Promise((resolve) => {
    chrome.storage.local.get(null, (items) => {
      const months = new Set();
      for (const key of Object.keys(items)) {
        if (key.startsWith("month_")) {
          months.add(key.replace("month_", ""));
        }
      }
      resolve(Array.from(months));
    });
  });
}

// ---------------------------------------------------------------------------
// IndexedDB for storing FileSystemDirectoryHandle across extension sessions
// ---------------------------------------------------------------------------
const DB_NAME = "AutoTimesheetDB";
const DB_STORE = "directory_handles";

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DB_STORE)) {
        db.createObjectStore(DB_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveDirectoryHandle(handle) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, "readwrite");
    tx.objectStore(DB_STORE).put(handle, "timesheet_dir");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getDirectoryHandle() {
  try {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, "readonly");
      const req = tx.objectStore(DB_STORE).get("timesheet_dir");
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    return null;
  }
}

async function clearDirectoryHandle() {
  try {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, "readwrite");
      tx.objectStore(DB_STORE).delete("timesheet_dir");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    // ignore
  }
}
