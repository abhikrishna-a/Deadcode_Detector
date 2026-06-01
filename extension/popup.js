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

    // Inject content script to grab page source
    const [{ result: code }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => document.documentElement.outerHTML,
    });

    const filename = tab.url?.split('/').pop() || 'page.html';

    chrome.runtime.sendMessage(
      { type: 'ANALYZE_CODE', payload: { code, filename } },
      (response) => {
        if (chrome.runtime.lastError) {
          resultEl.textContent = `Error: ${chrome.runtime.lastError.message}`;
          resultEl.className = 'error';
        } else if (response?.success) {
          const data = response.data;
          const issues = data?.analysis?.issues?.length ?? 0;
          resultEl.textContent = `Analysis complete.\nFile: ${data.filename}\nIssues found: ${issues}`;
        } else {
          resultEl.textContent = `Error: ${response?.error || 'Unknown error'}`;
          resultEl.className = 'error';
        }
        btn.disabled = false;
        btn.textContent = 'Analyze Current Page';
      }
    );
  } catch (e) {
    resultEl.textContent = `Error: ${e.message}`;
    resultEl.className = 'error';
    btn.disabled = false;
    btn.textContent = 'Analyze Current Page';
  }
});
