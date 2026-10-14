# Auto Timesheet Chrome Extension

A modern Chrome Extension (Manifest V3) port of the Java `AutoTimesheet` desktop application. It automatically logs daily work hours upon browser launch, accounts for lunch breaks, lets you edit times and notes, displays worked hours on hover, and produces monthly CSV summaries.

---

## 📋 Requirements Mapping

| # | Requirement | Implementation in Chrome Extension |
|---|---|---|
| **1** | **Log to a directory in local filesystem** | Uses the **File System Access API** (`window.showDirectoryPicker()`). In the extension's Settings tab, click **"Select Local Folder"** once (pointing to your `.autotimesheet` or chosen directory). The folder handle is securely saved in IndexedDB, allowing the extension to create and update monthly CSV files. |
| **2** | **Start timing when user first launches Chrome** | `chrome.runtime.onStartup` in the background service worker records the start timestamp for today in `chrome.storage.local` and starts the heartbeat timer. |
| **3** | **Allow users to edit start time** | The popup provides an editable HTML time input (`HH:MM:SS`). Changing it immediately updates your session and recalculates elapsed worked time. |
| **4** | **Default lunch of 30 min & allow user to edit** | Includes a lunch input (default 30 min) and a **"Set as Default"** button that persists the preference in `chrome.storage.sync` for future days. |
| **5** | **Notes field kept with that entry** | A comments textarea in the popup auto-saves user notes to the daily entry and exports them in the CSV `Comments` column. |
| **6** | **Show worked hours when hovering over icon** | The service worker calls `chrome.action.setTitle({ title: "Auto Timesheet (Worked: hh:mm:ss)" })` periodically via a 1-minute alarm, updating the icon's hover tooltip. It also displays a live badge counter directly on the icon. |
| **7** | **Log CSV entry into monthly rollover file** | Emits `YYYY-MMM.csv` (e.g. `2026-Sep.csv`) matching the exact format of the Java application: `Login Time,Lunch Break (minutes),Logout Time, Total Time Worked (hh:mm:ss),Comments`. Uses the Heartbeat + Finalize pattern to capture the logout time reliably without depending on unsafe shutdown hooks. |
| **8** | **Recalculate monthly hours when entries are updated** | The **Monthly Log** tab provides a complete viewer for the current month. Editing any past entry's start time, lunch, or end time triggers automatic recalculation of total worked hours across the entire month, updating both storage and the local CSV file. |

---

## 🚀 How to Install and Run

1. Open Google Chrome.
2. Navigate to `chrome://extensions/` in the address bar.
3. Toggle on **Developer mode** in the top right corner.
4. Click **Load unpacked** in the top left corner.
5. Select this folder:
   ```
   c:\Users\anton\Git\auto-timesheet\chrome-extension
   ```
6. The **Auto Timesheet** icon (clock) will appear in your Chrome toolbar. (Pin it for easy access).

---

## 🛠️ Key Features Walkthrough

### 1. Daily Timer ("Today" Tab)
* Displays a live ticking worked time counter: `Current Time - Start Time - Lunch Break`.
* Shows whether the current balance is positive or negative (if lunch hasn't elapsed yet).
* Allows editing today's start time, lunch duration, and notes.
* Click **"Finalize / Clock Out"** to end your day and commit the record to the monthly log.

### 2. Monthly Log & Recalculation ("Monthly Log" Tab)
* Lists all logged days for the current month (`YYYY-MMM`), with month navigation dropdown and `◀`/`▶` buttons.
* Click **"➕ Add Entry"** to manually log work hours for a previous day (e.g. working away from the computer or forgot to open the browser).
* Click **"Edit"** on any row to adjust a past day's start, lunch, or end time.
* Click **"Delete"** (or use **"Delete Entry"** inside the Edit dialog) to remove an unwanted entry, automatically updating the monthly summary and synced CSV.
* Click **"Recalculate All"** to re-compute all total worked values.
* Click **"Download CSV"** to save an instant copy of the monthly timesheet.

### 3. Local Folder Linking ("Settings" Tab)
* Click **"Select Local Folder"** and choose any directory on your computer (e.g. `~/.autotimesheet` or `Documents/Timesheets`).
* Once linked, the extension automatically keeps the monthly CSV (`YYYY-MMM.csv`) synchronized on disk whenever you make changes.
