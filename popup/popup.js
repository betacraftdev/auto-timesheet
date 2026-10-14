/**
 * Auto Timesheet Popup Controller
 * Coordinates UI state, live timer updates, local folder sync, and monthly recalculation.
 */

let currentSession = null;
let currentMonthKey = "";
let selectedMonthKey = "";
let timerInterval = null;
let activeTab = "today-tab";

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------
document.addEventListener("DOMContentLoaded", async () => {
  initTabs();
  initDateDisplay();
  await populateMonthSelector();
  await loadSessionData();
  await checkDirectoryStatus();
  await loadMonthlyHistory();
  startLiveClock();
  attachEventListeners();
});

function initTabs() {
  const tabBtns = document.querySelectorAll(".tab-btn");
  tabBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      tabBtns.forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".tab-content").forEach(tc => tc.classList.remove("active"));

      btn.classList.add("active");
      const targetId = btn.dataset.tab;
      document.getElementById(targetId)?.classList.add("active");
      activeTab = targetId;

      if (targetId === "history-tab") {
        populateMonthSelector().then(() => loadMonthlyHistory());
      }
    });
  });
}

function initDateDisplay() {
  const now = new Date();
  const options = { weekday: "long", year: "numeric", month: "long", day: "numeric" };
  document.getElementById("today-date-str").textContent = now.toLocaleDateString("en-US", options);

  currentMonthKey = formatMonthKey(now);
  selectedMonthKey = currentMonthKey;
  document.getElementById("tab-month-name").textContent = currentMonthKey;
}

// ---------------------------------------------------------------------------
// Session Data & Form Controls
// ---------------------------------------------------------------------------
async function loadSessionData() {
  currentSession = await getTodaySession();

  // Populate form controls
  const startDate = new Date(currentSession.startTime);
  const startHH = String(startDate.getHours()).padStart(2, "0");
  const startMM = String(startDate.getMinutes()).padStart(2, "0");
  const startSS = String(startDate.getSeconds()).padStart(2, "0");
  document.getElementById("start-time-input").value = `${startHH}:${startMM}:${startSS}`;
  document.getElementById("start-time-hint").textContent = `(Started ${startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`;

  document.getElementById("lunch-break-input").value = currentSession.lunchBreak ?? 30;
  document.getElementById("comments-input").value = currentSession.comment || "";

  if (currentSession.isFinalized) {
    document.getElementById("session-status").textContent = "Finalized / Clocked Out";
    document.getElementById("session-status").style.color = "#10b981";
    document.getElementById("finalize-btn").textContent = "Re-Open Session";
  } else {
    document.getElementById("session-status").textContent = "Timing Active";
    document.getElementById("session-status").style.color = "#2563eb";
    document.getElementById("finalize-btn").textContent = "Finalize / Clock Out";
  }

  updateLiveTimer();
}

/**
 * Ticks every second to update worked time display and clock
 */
function startLiveClock() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    const now = new Date();
    document.getElementById("live-clock").textContent = now.toLocaleTimeString();

    if (currentSession && !currentSession.isFinalized) {
      updateLiveTimer();
    }
  }, 1000);
}

function updateLiveTimer() {
  if (!currentSession) return;
  const now = currentSession.isFinalized ? currentSession.lastActiveTime : Date.now();
  const workedStr = getTimeWorked(now, currentSession.startTime, currentSession.lunchBreak);
  const displayEl = document.getElementById("live-worked-time");
  if (displayEl) {
    displayEl.textContent = workedStr;
    displayEl.style.color = workedStr.startsWith("-") ? "#fda4af" : "#ffffff";
  }
}

// ---------------------------------------------------------------------------
// Event Handlers (Start time, lunch break, comments)
// ---------------------------------------------------------------------------
function attachEventListeners() {
  // Requirement 3: Allow users to edit start time
  const startTimeInput = document.getElementById("start-time-input");
  startTimeInput.addEventListener("change", async () => {
    const timeVal = startTimeInput.value;
    if (!timeVal) return;

    const parts = timeVal.split(":");
    const hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);
    const seconds = parts[2] ? parseInt(parts[2], 10) : 0;

    const newStart = new Date(currentSession.startTime);
    newStart.setHours(hours, minutes, seconds, 0);

    currentSession.startTime = newStart.getTime();
    await saveTodaySession(currentSession);
    updateLiveTimer();
    showStatusMessage("Start time updated");
    syncIfLinked();
  });

  // Reset start time to now
  document.getElementById("reset-start-btn").addEventListener("click", async () => {
    const now = Date.now();
    currentSession.startTime = now;
    await saveTodaySession(currentSession);
    await loadSessionData();
    showStatusMessage("Start time reset to current time");
    syncIfLinked();
  });

  // Requirement 4: Lunch break edit & save default
  const lunchInput = document.getElementById("lunch-break-input");
  lunchInput.addEventListener("input", async () => {
    const val = parseInt(lunchInput.value, 10) || 0;
    currentSession.lunchBreak = val;
    await saveTodaySession(currentSession);
    updateLiveTimer();
    syncIfLinked();
  });

  document.getElementById("save-default-lunch-btn").addEventListener("click", async () => {
    const val = parseInt(lunchInput.value, 10) || 0;
    await saveSettings({ defaultLunchBreak: val });
    showStatusMessage(`Default lunch break saved (${val} min)`);
  });

  // Requirement 5: Notes/comments field
  const commentsInput = document.getElementById("comments-input");
  commentsInput.addEventListener("input", async () => {
    currentSession.comment = commentsInput.value;
    await saveTodaySession(currentSession);
  });

  commentsInput.addEventListener("blur", async () => {
    currentSession.comment = commentsInput.value;
    await saveTodaySession(currentSession);
    showStatusMessage("Notes saved");
    syncIfLinked();
  });

  // Save changes button
  document.getElementById("save-session-btn").addEventListener("click", async () => {
    await saveTodaySession(currentSession);
    showStatusMessage("Today's changes saved successfully!");
    syncIfLinked();
  });

  // Finalize / Clock Out button
  document.getElementById("finalize-btn").addEventListener("click", async () => {
    if (currentSession.isFinalized) {
      // Re-open
      currentSession.isFinalized = false;
      currentSession.lastActiveTime = Date.now();
      await saveTodaySession(currentSession);
      await loadSessionData();
      showStatusMessage("Session re-opened");
    } else {
      currentSession.lastActiveTime = Date.now();
      await finalizeSession(currentSession);
      await loadSessionData();
      await loadMonthlyHistory();
      await syncIfLinked();
      showStatusMessage("Day finalized & logged!");
    }
  });

  // Directory Sync Buttons
  document.getElementById("select-folder-btn").addEventListener("click", handleSelectDirectory);
  document.getElementById("sync-folder-btn")?.addEventListener("click", handleManualSync);
  document.getElementById("disconnect-folder-btn")?.addEventListener("click", handleDisconnectDirectory);

  // Monthly Log Toolbar Buttons
  document.getElementById("add-entry-btn")?.addEventListener("click", openAddModal);
  document.getElementById("recalc-month-btn")?.addEventListener("click", handleRecalculateMonth);
  document.getElementById("export-csv-btn")?.addEventListener("click", handleExportCsv);

  // Month navigation & selection
  const monthSelect = document.getElementById("month-select");
  monthSelect?.addEventListener("change", async (e) => {
    selectedMonthKey = e.target.value;
    await loadMonthlyHistory();
  });

  document.getElementById("prev-month-btn")?.addEventListener("click", async () => {
    if (monthSelect && monthSelect.selectedIndex > 0) {
      monthSelect.selectedIndex -= 1;
      selectedMonthKey = monthSelect.value;
      await loadMonthlyHistory();
    } else {
      const parts = selectedMonthKey.split("-");
      const y = parseInt(parts[0], 10);
      const mIdx = MONTH_NAMES.indexOf(parts[1]);
      const prevDate = new Date(y, mIdx - 1, 1);
      selectedMonthKey = formatMonthKey(prevDate);
      await populateMonthSelector();
      await loadMonthlyHistory();
    }
  });

  document.getElementById("next-month-btn")?.addEventListener("click", async () => {
    if (monthSelect && monthSelect.selectedIndex < monthSelect.options.length - 1) {
      monthSelect.selectedIndex += 1;
      selectedMonthKey = monthSelect.value;
      await loadMonthlyHistory();
    } else {
      const parts = selectedMonthKey.split("-");
      const y = parseInt(parts[0], 10);
      const mIdx = MONTH_NAMES.indexOf(parts[1]);
      const nextDate = new Date(y, mIdx + 1, 1);
      selectedMonthKey = formatMonthKey(nextDate);
      await populateMonthSelector();
      await loadMonthlyHistory();
    }
  });

  // Settings
  document.getElementById("save-preferences-btn").addEventListener("click", async () => {
    const val = parseInt(document.getElementById("pref-default-lunch").value, 10) || 30;
    await saveSettings({ defaultLunchBreak: val });
    showStatusMessage("Preferences saved");
  });

  // Modal Cancel
  document.getElementById("modal-cancel-btn").addEventListener("click", () => {
    document.getElementById("edit-entry-modal").classList.add("hidden");
  });
}

function showStatusMessage(msg) {
  const el = document.getElementById("today-status-msg");
  if (el) {
    el.textContent = msg;
    setTimeout(() => {
      if (el.textContent === msg) el.textContent = "";
    }, 3000);
  }
}

// ---------------------------------------------------------------------------
// File System Directory Handling (Req 1 & 7)
// ---------------------------------------------------------------------------
async function checkDirectoryStatus() {
  const dirHandle = await getDirectoryHandle();
  const badge = document.getElementById("sync-badge");
  const nameEl = document.getElementById("selected-dir-name");
  const subEl = document.getElementById("selected-dir-path");
  const syncBtn = document.getElementById("sync-folder-btn");
  const disconnectBtn = document.getElementById("disconnect-folder-btn");

  if (dirHandle) {
    badge.textContent = `📁 ${dirHandle.name}`;
    badge.classList.add("synced");
    nameEl.textContent = `Linked Folder: ${dirHandle.name}`;
    subEl.textContent = `Syncing monthly CSV files (${currentMonthKey}.csv)`;
    syncBtn?.classList.remove("hidden");
    disconnectBtn?.classList.remove("hidden");
  } else {
    badge.textContent = "No Folder";
    badge.classList.remove("synced");
    nameEl.textContent = "No local folder linked";
    subEl.textContent = "Click below to select a folder on your computer.";
    syncBtn?.classList.add("hidden");
    disconnectBtn?.classList.add("hidden");
  }
}

async function handleSelectDirectory() {
  try {
    const handle = await selectLocalDirectory();
    if (handle) {
      await checkDirectoryStatus();
      await syncIfLinked();
      showStatusMessage("Folder connected and synced!");
    }
  } catch (err) {
    alert("Could not link folder: " + err.message);
  }
}

async function handleDisconnectDirectory() {
  await clearDirectoryHandle();
  await checkDirectoryStatus();
  showStatusMessage("Folder disconnected");
}

async function handleManualSync() {
  const res = await syncIfLinked(selectedMonthKey || currentMonthKey);
  if (res && res.success) {
    showStatusMessage(`Synced ${res.filename} to local directory!`);
  } else {
    showStatusMessage("Sync failed or no folder connected");
  }
}

async function syncIfLinked(monthKey = selectedMonthKey || currentMonthKey) {
  const entries = await getMonthlyEntries(monthKey);
  const result = await writeMonthlyCsvToDirectory(monthKey, entries);
  return result;
}

/**
 * Populate the month dropdown with all available months in storage
 */
async function populateMonthSelector() {
  const recorded = await getAllRecordedMonths();
  const monthSet = new Set(recorded);
  monthSet.add(currentMonthKey);
  if (selectedMonthKey) monthSet.add(selectedMonthKey);

  const months = Array.from(monthSet);
  // Sort chronologically (earliest to latest)
  months.sort((a, b) => {
    const parse = (str) => {
      const parts = str.split("-");
      const y = parseInt(parts[0], 10);
      const mIdx = MONTH_NAMES.indexOf(parts[1]);
      return new Date(y, mIdx >= 0 ? mIdx : 0, 1).getTime();
    };
    return parse(a) - parse(b);
  });

  const select = document.getElementById("month-select");
  if (!select) return;
  select.innerHTML = "";
  months.forEach(m => {
    const opt = document.createElement("option");
    opt.value = m;
    opt.textContent = m + (m === currentMonthKey ? " (Current)" : "");
    if (m === selectedMonthKey) opt.selected = true;
    select.appendChild(opt);
  });

  document.getElementById("tab-month-name").textContent = selectedMonthKey;
}

// ---------------------------------------------------------------------------
// Monthly History & Recalculation (Req 8)
// ---------------------------------------------------------------------------
async function loadMonthlyHistory() {
  const monthKey = selectedMonthKey || currentMonthKey;
  const entries = await getMonthlyEntries(monthKey);
  const tbody = document.getElementById("history-table-body");
  const countBadge = document.getElementById("entry-count-badge");

  countBadge.textContent = `${entries.length} ${entries.length === 1 ? "entry" : "entries"}`;

  if (entries.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty-state">No entries logged for ${monthKey} yet.</td></tr>`;
    return;
  }

  tbody.innerHTML = "";
  entries.forEach((entry, idx) => {
    const tr = document.createElement("tr");

    const startDate = entry.startTime ? new Date(entry.startTime) : parseEntryDate(entry.startTimeStr);
    const endDate = entry.endTime ? new Date(entry.endTime) : parseEntryDate(entry.endTimeStr);

    const dateDisplay = startDate ? startDate.toLocaleDateString([], { month: "short", day: "numeric" }) : entry.id;
    const startDisplay = startDate ? startDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : entry.startTimeStr;
    const endDisplay = endDate ? endDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : entry.endTimeStr;

    tr.innerHTML = `
      <td><strong>${dateDisplay}</strong></td>
      <td>${startDisplay || "--"}</td>
      <td>${entry.lunchBreak ?? 0}m</td>
      <td>${endDisplay || "--"}</td>
      <td><code>${entry.totalTimeWorked || "--"}</code></td>
      <td title="${escapeHtml(entry.comment || "")}">${escapeHtml(truncate(entry.comment || "", 18))}</td>
      <td>
        <div class="table-actions">
          <button class="btn-text edit-row-btn" data-index="${idx}">Edit</button>
          <button class="btn-text btn-text-danger delete-row-btn" data-index="${idx}" title="Delete this entry">Delete</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  // Attach edit row buttons
  document.querySelectorAll(".edit-row-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const idx = parseInt(btn.dataset.index, 10);
      openEditModal(entries[idx], idx);
    });
  });

  // Attach delete row buttons
  document.querySelectorAll(".delete-row-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const idx = parseInt(btn.dataset.index, 10);
      handleDeleteEntry(idx);
    });
  });
}

function openAddModal() {
  const modal = document.getElementById("edit-entry-modal");
  document.getElementById("modal-title").textContent = "Add Timesheet Entry (Past Day)";

  // Default to yesterday's date
  const defaultDate = new Date();
  defaultDate.setDate(defaultDate.getDate() - 1);
  const yyyy = defaultDate.getFullYear();
  const mm = String(defaultDate.getMonth() + 1).padStart(2, "0");
  const dd = String(defaultDate.getDate()).padStart(2, "0");
  const dateInput = document.getElementById("modal-entry-date");
  dateInput.value = `${yyyy}-${mm}-${dd}`;
  dateInput.disabled = false;

  document.getElementById("modal-start-time").value = "09:00:00";
  document.getElementById("modal-lunch").value = currentSession?.lunchBreak ?? 30;
  document.getElementById("modal-end-time").value = "17:00:00";
  document.getElementById("modal-comment").value = "";

  const deleteBtn = document.getElementById("modal-delete-btn");
  deleteBtn.classList.add("hidden");

  const saveBtn = document.getElementById("modal-save-btn");
  saveBtn.textContent = "Add Entry";
  saveBtn.onclick = async () => {
    const chosenDateStr = dateInput.value;
    if (!chosenDateStr) {
      alert("Please select a date.");
      return;
    }

    const [yStr, mStr, dStr] = chosenDateStr.split("-");
    const year = parseInt(yStr, 10);
    const month = parseInt(mStr, 10);
    const day = parseInt(dStr, 10);

    const startParts = document.getElementById("modal-start-time").value.split(":");
    const endParts = document.getElementById("modal-end-time").value.split(":");

    const startH = parseInt(startParts[0], 10) || 9;
    const startM = parseInt(startParts[1], 10) || 0;
    const startS = startParts[2] ? parseInt(startParts[2], 10) : 0;

    const endH = parseInt(endParts[0], 10) || 17;
    const endM = parseInt(endParts[1], 10) || 0;
    const endS = endParts[2] ? parseInt(endParts[2], 10) : 0;

    const startDate = new Date(year, month - 1, day, startH, startM, startS, 0);
    const endDate = new Date(year, month - 1, day, endH, endM, endS, 0);

    if (endDate.getTime() <= startDate.getTime()) {
      alert("End time must be after start time.");
      return;
    }

    const targetMonthKey = formatMonthKey(startDate);
    const entries = await getMonthlyEntries(targetMonthKey);
    const dateKey = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

    const existingIdx = entries.findIndex(e => e.id === dateKey || e.dateKey === dateKey);
    if (existingIdx >= 0) {
      const overwrite = confirm(`An entry already exists for ${dateKey}. Do you want to update it?`);
      if (!overwrite) return;
    }

    const lunch = parseInt(document.getElementById("modal-lunch").value, 10) || 0;
    const totalWorked = getTimeWorked(endDate, startDate, lunch);
    const comment = document.getElementById("modal-comment").value.trim();

    const entryRecord = {
      id: dateKey,
      dateKey: dateKey,
      startTime: startDate.getTime(),
      startTimeStr: formatEntryDate(startDate),
      lunchBreak: lunch,
      endTime: endDate.getTime(),
      endTimeStr: formatEntryDate(endDate),
      totalTimeWorked: totalWorked,
      comment
    };

    if (existingIdx >= 0) {
      entries[existingIdx] = entryRecord;
    } else {
      entries.push(entryRecord);
    }

    entries.sort((a, b) => a.startTime - b.startTime);
    const recalculated = recalculateEntries(entries);
    await saveMonthlyEntries(targetMonthKey, recalculated);
    await syncIfLinked(targetMonthKey);

    selectedMonthKey = targetMonthKey;
    await populateMonthSelector();
    await loadMonthlyHistory();

    modal.classList.add("hidden");
    showStatusMessage(`Added timesheet entry for ${dateKey}!`);
  };

  modal.classList.remove("hidden");
}

function openEditModal(entry, index) {
  const modal = document.getElementById("edit-entry-modal");
  document.getElementById("modal-title").textContent = "Edit Timesheet Entry";

  const monthKey = selectedMonthKey || currentMonthKey;
  const startDate = entry.startTime ? new Date(entry.startTime) : parseEntryDate(entry.startTimeStr);
  const endDate = entry.endTime ? new Date(entry.endTime) : parseEntryDate(entry.endTimeStr);

  const dateInput = document.getElementById("modal-entry-date");
  if (startDate) {
    const yyyy = startDate.getFullYear();
    const mm = String(startDate.getMonth() + 1).padStart(2, "0");
    const dd = String(startDate.getDate()).padStart(2, "0");
    dateInput.value = `${yyyy}-${mm}-${dd}`;
  }
  dateInput.disabled = true;

  const startHH = startDate ? String(startDate.getHours()).padStart(2, "0") : "09";
  const startMM = startDate ? String(startDate.getMinutes()).padStart(2, "0") : "00";
  const startSS = startDate ? String(startDate.getSeconds()).padStart(2, "0") : "00";
  document.getElementById("modal-start-time").value = `${startHH}:${startMM}:${startSS}`;

  document.getElementById("modal-lunch").value = entry.lunchBreak ?? 30;

  const endHH = endDate ? String(endDate.getHours()).padStart(2, "0") : "17";
  const endMM = endDate ? String(endDate.getMinutes()).padStart(2, "0") : "00";
  const endSS = endDate ? String(endDate.getSeconds()).padStart(2, "0") : "00";
  document.getElementById("modal-end-time").value = `${endHH}:${endMM}:${endSS}`;

  document.getElementById("modal-comment").value = entry.comment || "";

  // Show delete button in edit mode
  const deleteBtn = document.getElementById("modal-delete-btn");
  deleteBtn.classList.remove("hidden");
  deleteBtn.onclick = async () => {
    modal.classList.add("hidden");
    await handleDeleteEntry(index);
  };

  // Modal Save button handler (Req 8: recalculate worked hours!)
  const saveBtn = document.getElementById("modal-save-btn");
  saveBtn.textContent = "Save & Recalculate";
  saveBtn.onclick = async () => {
    const entries = await getMonthlyEntries(monthKey);
    const target = entries[index];
    if (!target) return;

    // Parse updated start time
    const startParts = document.getElementById("modal-start-time").value.split(":");
    const newStart = startDate ? new Date(startDate) : new Date();
    newStart.setHours(parseInt(startParts[0], 10), parseInt(startParts[1], 10), startParts[2] ? parseInt(startParts[2], 10) : 0);

    // Parse updated end time
    const endParts = document.getElementById("modal-end-time").value.split(":");
    const newEnd = endDate ? new Date(endDate) : new Date();
    newEnd.setHours(parseInt(endParts[0], 10), parseInt(endParts[1], 10), endParts[2] ? parseInt(endParts[2], 10) : 0);

    target.startTime = newStart.getTime();
    target.startTimeStr = formatEntryDate(newStart);
    target.lunchBreak = parseInt(document.getElementById("modal-lunch").value, 10) || 0;
    target.endTime = newEnd.getTime();
    target.endTimeStr = formatEntryDate(newEnd);
    target.comment = document.getElementById("modal-comment").value;

    // Requirement 8: Recalculate all entries in current month
    const recalculated = recalculateEntries(entries);
    await saveMonthlyEntries(monthKey, recalculated);

    // Sync to local directory file
    await syncIfLinked(monthKey);

    modal.classList.add("hidden");
    await loadMonthlyHistory();
    showStatusMessage("Entry updated and all hours recalculated!");
  };

  modal.classList.remove("hidden");
}

/**
 * Delete a timesheet entry and recalculate month
 */
async function handleDeleteEntry(index) {
  const monthKey = selectedMonthKey || currentMonthKey;
  const entries = await getMonthlyEntries(monthKey);
  const target = entries[index];
  if (!target) return;

  const startDate = target.startTime ? new Date(target.startTime) : parseEntryDate(target.startTimeStr);
  const dateLabel = startDate ? startDate.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" }) : (target.id || "this entry");

  const confirmed = confirm(`Are you sure you want to delete the timesheet entry for ${dateLabel}?`);
  if (!confirmed) return;

  entries.splice(index, 1);
  const recalculated = recalculateEntries(entries);
  await saveMonthlyEntries(monthKey, recalculated);

  // Sync to local directory file
  await syncIfLinked(monthKey);

  // If deleted entry was today's session, re-open today's active session
  if (currentSession && (target.id === currentSession.dateKey || target.dateKey === currentSession.dateKey)) {
    currentSession.isFinalized = false;
    await saveTodaySession(currentSession);
    await loadSessionData();
  }

  await loadMonthlyHistory();
  showStatusMessage("Entry deleted and monthly log updated!");
}

/**
 * Requirement 8: Recalculate worked hours for all entries in the month
 */
async function handleRecalculateMonth() {
  const monthKey = selectedMonthKey || currentMonthKey;
  const recalculated = await recalculateAndSaveMonth(monthKey);
  await syncIfLinked(monthKey);
  await loadMonthlyHistory();
  showStatusMessage(`Recalculated ${recalculated.length} entries for ${monthKey}`);
}

/**
 * Export CSV download
 */
async function handleExportCsv() {
  const monthKey = selectedMonthKey || currentMonthKey;
  const entries = await getMonthlyEntries(monthKey);
  const csvContent = generateCsv(entries);
  triggerCsvDownload(`${monthKey}.csv`, csvContent);
}

// Helpers
function escapeHtml(str) {
  return (str || "").replace(/[&<>"']/g, (m) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[m]));
}

function truncate(str, maxLen) {
  if (!str) return "";
  return str.length > maxLen ? str.slice(0, maxLen) + "…" : str;
}
