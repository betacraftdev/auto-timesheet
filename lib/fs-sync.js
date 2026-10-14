/**
 * File System Access API & Local Directory Synchronization
 * Allows the extension to read and write monthly .csv files to a chosen local directory.
 */

/**
 * Prompt user to select their local timesheet directory.
 * Must be called from a user gesture (e.g. clicking a button in popup).
 */
async function selectLocalDirectory() {
  if (!("showDirectoryPicker" in window)) {
    throw new Error("File System Access API is not supported in this browser version.");
  }

  const handle = await window.showDirectoryPicker({
    id: "auto-timesheet-folder",
    mode: "readwrite",
    startIn: "documents"
  });

  if (handle) {
    await saveDirectoryHandle(handle);
    return handle;
  }
  return null;
}

/**
 * Verify or query read/write permission on stored directory handle.
 */
async function verifyHandlePermission(handle, readWrite = true) {
  if (!handle) return false;
  const options = { mode: readWrite ? "readwrite" : "read" };
  if ((await handle.queryPermission(options)) === "granted") {
    return true;
  }
  if ((await handle.requestPermission(options)) === "granted") {
    return true;
  }
  return false;
}

/**
 * Sync monthly entries into a local CSV file: <monthKey>.csv (e.g. "2026-Sep.csv")
 * Replicates the file structure and naming of the Java AutoTimesheet.
 */
async function writeMonthlyCsvToDirectory(monthKey, entries) {
  const dirHandle = await getDirectoryHandle();
  if (!dirHandle) return { success: false, reason: "no_directory_set" };

  const hasPermission = await verifyHandlePermission(dirHandle, true);
  if (!hasPermission) return { success: false, reason: "permission_denied" };

  try {
    const filename = `${monthKey}.csv`;
    const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();

    const csvContent = generateCsv(entries);
    await writable.write(csvContent);
    await writable.close();

    return { success: true, filename, dirName: dirHandle.name };
  } catch (err) {
    console.error("Failed writing timesheet to directory:", err);
    return { success: false, reason: err.message };
  }
}

/**
 * Reads an existing monthly CSV file from the selected directory and parses it.
 */
async function readMonthlyCsvFromDirectory(monthKey) {
  const dirHandle = await getDirectoryHandle();
  if (!dirHandle) return null;

  const hasPermission = await verifyHandlePermission(dirHandle, false);
  if (!hasPermission) return null;

  try {
    const filename = `${monthKey}.csv`;
    const fileHandle = await dirHandle.getFileHandle(filename, { create: false });
    const file = await fileHandle.getFile();
    const text = await file.text();
    return parseCsv(text);
  } catch (err) {
    // File may not exist yet for this month
    return null;
  }
}

/**
 * Download CSV via Blob URL as a fallback or explicit export
 */
function triggerCsvDownload(filename, csvContent) {
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
