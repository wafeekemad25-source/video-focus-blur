// Alt+B toggles the extension on/off everywhere.
chrome.commands.onCommand.addListener(async (cmd) => {
  if (cmd !== "toggle-focus") return;
  const { enabled = true } = await chrome.storage.sync.get("enabled");
  await chrome.storage.sync.set({ enabled: !enabled });
});

// After installing or updating, load the newest script into tabs that are
// already open, so nobody has to refresh their pages.
chrome.runtime.onInstalled.addListener(async () => {
  const tabs = await chrome.tabs.query({ url: ["http://*/*", "https://*/*"] });
  for (const tab of tabs) {
    chrome.scripting
      .executeScript({ target: { tabId: tab.id }, files: ["content.js"] })
      .catch(() => {}); // some pages (e.g. the Web Store) don't allow scripts
  }
});
