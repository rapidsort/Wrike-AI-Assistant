'use strict';

// Open the side panel when the user clicks the extension icon
chrome.action.onClicked.addListener(tab => {
  chrome.sidePanel.open({ tabId: tab.id });
});

// ── WAA Telemetry — install / update events ───────────────────────────────
const TELEMETRY_FOLDER_ID = 'MQAAAAELm2NX';

async function getTelemetryTaskIdBg(token, userName) {
  const storageKey = `waa_telemetry_task_${userName.replace(/\s+/g, '_')}`;
  const cached = await new Promise(r => chrome.storage.local.get([storageKey], d => r(d[storageKey] || '')));
  if (cached) return cached;
  const headers = { 'Authorization': `Bearer ${token}` };
  const res = await fetch(`https://www.wrike.com/api/v4/folders/${TELEMETRY_FOLDER_ID}/tasks`, { headers });
  if (res.ok) {
    const tasks = (await res.json()).data || [];
    const existing = tasks.find(t => t.title === `WAA Log — ${userName}`);
    if (existing) {
      chrome.storage.local.set({ [storageKey]: existing.id });
      return existing.id;
    }
  }
  const createRes = await fetch(`https://www.wrike.com/api/v4/folders/${TELEMETRY_FOLDER_ID}/tasks`, {
    method  : 'POST',
    headers : { ...headers, 'Content-Type': 'application/json' },
    body    : JSON.stringify({ title: `WAA Log — ${userName}` }),
  });
  if (!createRes.ok) return null;
  const newTask = ((await createRes.json()).data || [])[0];
  if (!newTask) return null;
  chrome.storage.local.set({ [storageKey]: newTask.id });
  return newTask.id;
}

async function logInstallEvent(reason) {
  try {
    const token = await new Promise(r =>
      chrome.storage.sync.get(['wrike_access_token'], d => r(d.wrike_access_token || ''))
    );
    if (!token) return;
    const profile  = await new Promise(r => chrome.storage.sync.get(['user_name'], d => r(d)));
    const userName = profile.user_name || 'Unknown User';
    const taskId   = await getTelemetryTaskIdBg(token, userName);
    if (!taskId) return;
    const version = chrome.runtime.getManifest().version;
    const now     = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const timeStr = now.toTimeString().slice(0, 5);
    const event   = reason === 'install' ? 'INSTALL' : 'UPDATE';
    const text    = `**${event}** | ${dateStr} ${timeStr} | v${version} | Reason: ${reason}`;
    await fetch(`https://www.wrike.com/api/v4/tasks/${taskId}/comments`, {
      method  : 'POST',
      headers : { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body    : JSON.stringify({ text }),
    });
  } catch (_) { /* telemetry must never break the extension */ }
}

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install' || reason === 'update') logInstallEvent(reason);
});
