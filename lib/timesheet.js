/**
 * Timesheet Core Calculations & CSV Utilities
 * Replicates the calculations and formatting of the Java AutoTimesheet application.
 */

// Month abbreviation lookup
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Format date matching Java's: SimpleDateFormat("EEE dd MMM yyyy kk:mm:ss z")
 * e.g., "Sat 05 Sep 2026 12:00:00 AEST" or "Sat 05 Sep 2026 12:00:00 GMT+1000"
 */
function formatEntryDate(dateInput) {
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return "";

  const dayName = DAY_NAMES[d.getDay()];
  const day = String(d.getDate()).padStart(2, "0");
  const month = MONTH_NAMES[d.getMonth()];
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  const seconds = String(d.getSeconds()).padStart(2, "0");

  // Get time zone name or offset
  let tz = "";
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZoneName: "short" }).formatToParts(d);
    const tzPart = parts.find(p => p.type === "timeZoneName");
    tz = tzPart ? tzPart.value : "";
  } catch (e) {
    // fallback
  }
  if (!tz) {
    const offsetMin = -d.getTimezoneOffset();
    const sign = offsetMin >= 0 ? "+" : "-";
    const offH = String(Math.floor(Math.abs(offsetMin) / 60)).padStart(2, "0");
    const offM = String(Math.abs(offsetMin) % 60).padStart(2, "0");
    tz = `GMT${sign}${offH}${offM}`;
  }

  return `${dayName} ${day} ${month} ${year} ${hours}:${minutes}:${seconds} ${tz}`;
}

/**
 * Format month key matching Java's: SimpleDateFormat("yyyy-MMM")
 * e.g., "2026-Sep"
 */
function formatMonthKey(dateInput) {
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${MONTH_NAMES[d.getMonth()]}`;
}

/**
 * Parses entry date strings into Date objects.
 * Handles both Java AutoTimesheet format and ISO date strings.
 */
function parseEntryDate(dateStr) {
  if (!dateStr) return null;
  const direct = new Date(dateStr);
  if (!isNaN(direct.getTime())) return direct;

  // Try parsing "EEE dd MMM yyyy kk:mm:ss"
  const match = dateStr.match(/[A-Za-z]{3}\s+(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})/);
  if (match) {
    const day = parseInt(match[1], 10);
    const monthIdx = MONTH_NAMES.indexOf(match[2]);
    const year = parseInt(match[3], 10);
    const hours = parseInt(match[4], 10);
    const minutes = parseInt(match[5], 10);
    const seconds = parseInt(match[6], 10);
    if (monthIdx !== -1) {
      return new Date(year, monthIdx, day, hours, minutes, seconds);
    }
  }
  return null;
}

/**
 * Calculates worked time matching Java AutoTimesheet.getTimeWorked(now, start, lunchBreak)
 *
 * @param {Date|number|string} now - Current or logout time
 * @param {Date|number|string} start - Login/start time
 * @param {number} lunchBreakMinutes - Lunch break in minutes
 * @returns {string} Formatted duration "[-]hh:mm:ss"
 */
function getTimeWorked(now, start, lunchBreakMinutes) {
  const nowDate = now instanceof Date ? now : new Date(now);
  const startDate = start instanceof Date ? start : new Date(start);
  const lunchMinutes = Number(lunchBreakMinutes) || 0;

  if (isNaN(nowDate.getTime()) || isNaN(startDate.getTime())) {
    return "00:00:00";
  }

  let timeDiff = nowDate.getTime() - startDate.getTime() - (lunchMinutes * 60 * 1000);
  let isNegative = "";
  if (timeDiff < 0) {
    isNegative = "-";
    timeDiff = Math.abs(timeDiff);
  }

  const totalSeconds = Math.floor(timeDiff / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return `${isNegative}${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/**
 * Returns a compact badge label like "4h12m" or "-15m"
 */
function getBadgeTime(now, start, lunchBreakMinutes) {
  const nowDate = now instanceof Date ? now : new Date(now);
  const startDate = start instanceof Date ? start : new Date(start);
  const lunchMinutes = Number(lunchBreakMinutes) || 0;

  if (isNaN(nowDate.getTime()) || isNaN(startDate.getTime())) {
    return "";
  }

  let timeDiff = nowDate.getTime() - startDate.getTime() - (lunchMinutes * 60 * 1000);
  let isNegative = "";
  if (timeDiff < 0) {
    isNegative = "-";
    timeDiff = Math.abs(timeDiff);
  }

  const totalMinutes = Math.floor(timeDiff / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0) {
    return `${isNegative}${hours}h${minutes > 0 ? minutes + "m" : ""}`;
  }
  return `${isNegative}${minutes}m`;
}

/**
 * Standard CSV header matching original Java app
 */
const CSV_HEADER = "Login Time,Lunch Break (minutes),Logout Time, Total Time Worked (hh:mm:ss),Comments";

/**
 * Generates a full CSV file content from an array of entry objects.
 */
function generateCsv(entries) {
  const lines = [CSV_HEADER];
  for (const entry of entries) {
    const startTimeStr = entry.startTimeStr || (entry.startTime ? formatEntryDate(entry.startTime) : "");
    const lunchBreak = entry.lunchBreak ?? 30;
    const logoutTimeStr = entry.endTimeStr || (entry.endTime ? formatEntryDate(entry.endTime) : "");
    const totalTimeWorked = entry.totalTimeWorked || getTimeWorked(entry.endTime, entry.startTime, lunchBreak);
    const comment = (entry.comment || "").replace(/"/g, '""');
    lines.push(`${startTimeStr},${lunchBreak},${logoutTimeStr},${totalTimeWorked},"${comment}"`);
  }
  return lines.join("\n") + "\n";
}

/**
 * Parses an existing CSV string matching the original Java app format into entry objects.
 */
function parseCsv(csvText) {
  const entries = [];
  if (!csvText) return entries;

  const lines = csvText.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith("Login Time")) continue;

    // Pattern: (.*),(\d+),(.*),(.*),(.*)
    const match = line.match(/^(.*?),(\d+),(.*?),(.*?),(.*)$/);
    if (match) {
      let comment = match[5].trim();
      if (comment.startsWith('"') && comment.endsWith('"')) {
        comment = comment.slice(1, -1).replace(/""/g, '"');
      }
      const startTime = parseEntryDate(match[1].trim());
      const lunchBreak = parseInt(match[2].trim(), 10) || 0;
      const endTime = parseEntryDate(match[3].trim());

      entries.push({
        id: startTime ? startTime.toISOString().slice(0, 10) : `entry_${i}`,
        startTimeStr: match[1].trim(),
        startTime: startTime ? startTime.getTime() : null,
        lunchBreak,
        endTimeStr: match[3].trim(),
        endTime: endTime ? endTime.getTime() : null,
        totalTimeWorked: match[4].trim(),
        comment
      });
    }
  }
  return entries;
}

/**
 * Recalculates total worked time for all entries in a list,
 * matching Java TimeWorked.reCalculateFile.
 */
function recalculateEntries(entries) {
  return entries.map(entry => {
    const start = entry.startTime ? new Date(entry.startTime) : parseEntryDate(entry.startTimeStr);
    const end = entry.endTime ? new Date(entry.endTime) : parseEntryDate(entry.endTimeStr);
    const lunch = Number(entry.lunchBreak) || 0;

    let total = entry.totalTimeWorked;
    if (start && end) {
      total = getTimeWorked(end, start, lunch);
    }
    return {
      ...entry,
      startTime: start ? start.getTime() : entry.startTime,
      endTime: end ? end.getTime() : entry.endTime,
      totalTimeWorked: total
    };
  });
}

// Export for ES modules and window/global scope
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    MONTH_NAMES,
    DAY_NAMES,
    formatEntryDate,
    formatMonthKey,
    parseEntryDate,
    getTimeWorked,
    getBadgeTime,
    CSV_HEADER,
    generateCsv,
    parseCsv,
    recalculateEntries
  };
}
