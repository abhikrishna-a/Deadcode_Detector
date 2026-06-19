const GHOSTCODE_ORIGIN = 'http://localhost:5173';

async function fetchAnalysis(fileContent, filename, token) {
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

function createResponder(sendResponse) {
  let responded = false;
  return (data) => {
    if (responded) return;
    responded = true;
    try { sendResponse(data); } catch { }
  };
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'ghostcode-popup') return;

  port.onMessage.addListener(async (msg) => {
    const respond = createResponder((data) => port.postMessage(data));

    try {
      switch (msg.type) {
        case 'ANALYZE_CODE': {
          const result = await fetchAnalysis(msg.payload.code, msg.payload.filename, msg.payload.token);
          respond({ success: true, data: result });
          break;
        }
        default:
          respond({ success: false, error: `Unknown message type: ${msg.type}` });
      }
    } catch (e) {
      respond({ success: false, error: e.message });
    }
  });
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    const respond = createResponder(sendResponse);

    try {
      switch (msg.type) {
        case 'ANALYZE_CODE': {
          const result = await fetchAnalysis(msg.payload.code, msg.payload.filename, msg.payload.token);
          respond({ success: true, data: result });
          break;
        }
        case 'GET_STATUS':
          respond({ success: true, data: { status: 'ready', version: '1.0.0' } });
          break;
        default:
          respond({ success: false, error: `Unknown message type: ${msg.type}` });
      }
    } catch (e) {
      respond({ success: false, error: e.message });
    }
  })().catch(err => console.error('[GhostCode] onMessage unhandled:', err));
  return true;
});
