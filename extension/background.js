// GhostCode extension — background service worker
// All async onMessage listeners use async IIFE + return true
// to prevent "message channel closed before response received".

const GHOSTCODE_ORIGIN = 'http://localhost:5173';

async function fetchAnalysis(fileContent, filename) {
  const token = await getAuthToken();
  const formData = new FormData();
  formData.append('file', new File([fileContent], filename, { type: 'text/plain' }));

  const res = await fetch(`${GHOSTCODE_ORIGIN}/api/analyzer/analyze`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Analysis failed (HTTP ${res.status}): ${text}`);
  }
  return res.json();
}

async function getAuthToken() {
  const { token } = await chrome.storage.local.get('token');
  return token || '';
}

// ---------- Message router ----------

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      switch (msg.type) {
        case 'ANALYZE_CODE': {
          const result = await fetchAnalysis(msg.payload.code, msg.payload.filename);
          sendResponse({ success: true, data: result });
          break;
        }
        case 'GET_STATUS':
          sendResponse({ success: true, data: { status: 'ready', version: '1.0.0' } });
          break;
        default:
          sendResponse({ success: false, error: `Unknown message type: ${msg.type}` });
      }
    } catch (e) {
      sendResponse({ success: false, error: e.message });
    }
  })();
  return true; // keep message channel open for async response
});
