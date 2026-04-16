chrome.devtools.panels.create(
  "Fizz",
  "",
  `panel.html?tabId=${chrome.devtools.inspectedWindow.tabId}`,
  () => undefined,
)
