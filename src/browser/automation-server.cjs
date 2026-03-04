const express = require('express');
const cors = require('cors');
const { chromium } = require('playwright');

const app = express();
app.use(cors());
app.use(express.json());

let browser = null;
let page = null;

async function ensureBrowser() {
  console.log('[Browser] Ensuring browser is ready...');
  if (!browser) {
    console.log('[Browser] Launching Chromium...');
    try {
      browser = await chromium.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
        ],
      });
      console.log('[Browser] Chromium launched successfully');
    } catch (err) {
      console.error('[Browser] Failed to launch:', err.message);
      throw err;
    }
  }
  if (!page) {
    console.log('[Browser] Creating new page...');
    page = await browser.newPage({
      viewport: { width: 1920, height: 1080 },
    });
    console.log('[Browser] Page created');
  }
  return page;
}

app.post('/api/launch', async (req, res) => {
  try {
    console.log('[API] Launch request received');
    await ensureBrowser();
    res.json({ success: true, message: 'Browser launched' });
  } catch (error) {
    console.error('[API] Launch error:', error.message);
    res.json({ success: false, error: error.message });
  }
});

app.post('/api/navigate', async (req, res) => {
  try {
    console.log('[API] Navigate request received');
    const p = await ensureBrowser();
    const { url } = req.body;
    console.log('[API] Navigating to:', url);
    await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    const title = await p.title();
    console.log('[API] Navigated successfully, title:', title);
    res.json({ success: true, title, url });
  } catch (error) {
    console.error('[API] Navigate error:', error.message);
    res.json({ success: false, error: error.message });
  }
});

app.post('/api/execute', async (req, res) => {
  try {
    const p = await ensureBrowser();
    const { action, params } = req.body;

    console.log('[API] Execute action:', action, params);

    let result = { success: true };

    switch (action) {
      case 'click':
        await p.click(params.selector);
        break;
      case 'type':
        await p.fill(params.selector, params.value);
        break;
      case 'scroll':
        await p.evaluate(
          (x, y) => window.scrollTo(x || 0, y || 0),
          params.x,
          params.y
        );
        break;
      case 'wait':
        await p.waitForTimeout(params.ms || 1000);
        break;
      case 'evaluate':
        result.data = await p.evaluate(params.script);
        break;
      default:
        result = { success: false, error: `Unknown action: ${action}` };
    }

    res.json(result);
  } catch (error) {
    console.error('[API] Execute error:', error.message);
    res.json({ success: false, error: error.message });
  }
});

app.post('/api/screenshot', async (req, res) => {
  try {
    console.log('[API] Screenshot request');
    const p = await ensureBrowser();
    const screenshot = await p.screenshot({
      encoding: 'base64',
      fullPage: true,
    });
    console.log('[API] Screenshot captured, length:', screenshot.length);
    res.json({ success: true, screenshot, format: 'base64' });
  } catch (error) {
    console.error('[API] Screenshot error:', error.message);
    res.json({ success: false, error: error.message });
  }
});

app.post('/api/fill-form', async (req, res) => {
  try {
    const p = await ensureBrowser();
    const { formData } = req.body;

    for (const field of formData) {
      await p.fill(field.selector, field.value);
    }

    res.json({ success: true, filled: formData.length });
  } catch (error) {
    console.error('[API] Fill form error:', error.message);
    res.json({ success: false, error: error.message });
  }
});

app.get('/api/status', async (req, res) => {
  res.json({
    success: true,
    browserOpen: !!browser,
    pageOpen: !!page,
  });
});

app.post('/api/close', async (req, res) => {
  try {
    if (page) {
      await page.close();
      page = null;
    }
    if (browser) {
      await browser.close();
      browser = null;
    }
    res.json({ success: true });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

const PORT = process.env.PORT || 9222;

app.listen(PORT, () => {
  console.log(`[Browser Automation Server] Running on port ${PORT}`);
});

process.on('SIGINT', async () => {
  if (browser) await browser.close();
  process.exit();
});
