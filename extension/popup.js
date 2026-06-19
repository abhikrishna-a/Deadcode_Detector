let port;

function connectBackground() {
  try {
    port = chrome.runtime.connect({ name: 'ghostcode-popup' });
    port.onDisconnect.addListener(() => {
      port = null;
    });
  } catch {
    port = null;
  }
}

connectBackground();

function sendMessage(msg) {
  return new Promise((resolve, reject) => {
    if (port) {
      port.postMessage(msg);
      port.onMessage.addListener(function onResponse(response) {
        port.onMessage.removeListener(onResponse);
        resolve(response);
      });
    } else {
      chrome.runtime.sendMessage(msg, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    }
  });
}

document.getElementById('analyzeBtn').addEventListener('click', async () => {
  const btn = document.getElementById('analyzeBtn');
  const resultEl = document.getElementById('result');
  btn.disabled = true;
  btn.textContent = 'Analyzing...';
  resultEl.textContent = '';

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) {
      resultEl.textContent = 'No active tab found.';
      return;
    }

    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => ({
        code: document.documentElement.outerHTML,
        token: document.cookie.split('; ').find(r => r.startsWith('ghostcode_access='))?.split('=')[1] || '',
      }),
    });

    const { code, token } = result;
    const filename = tab.url?.split('/').pop() || 'page.html';

    if (!port) connectBackground();

    const response = await sendMessage({ type: 'ANALYZE_CODE', payload: { code, filename, token } });

    if (response?.success) {
      const data = response.data;
      const issues = data?.analysis?.issues?.length ?? 0;
      resultEl.textContent = `Analysis complete.\nFile: ${data.filename}\nIssues found: ${issues}`;
    } else {
      resultEl.textContent = `Error: ${response?.error || 'Unknown error'}`;
      resultEl.className = 'error';
    }
    btn.disabled = false;
    btn.textContent = 'Analyze Current Page';
  } catch (e) {
    resultEl.textContent = `Error: ${e.message}`;
    resultEl.className = 'error';
    btn.disabled = false;
    btn.textContent = 'Analyze Current Page';
  }
});
