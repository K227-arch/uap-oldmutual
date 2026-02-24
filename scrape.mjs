import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';
import http from 'http';

puppeteer.use(StealthPlugin());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const url = 'https://www.oldmutual.co.ug/';
const outputDir = './puppeteer-clone';

// Helper function to download files
async function downloadFile(fileUrl, outputPath) {
  return new Promise((resolve, reject) => {
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const protocol = fileUrl.startsWith('https') ? https : http;
    const file = fs.createWriteStream(outputPath);
    
    protocol.get(fileUrl, (response) => {
      if (response.statusCode === 200) {
        response.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve();
        });
      } else {
        fs.unlink(outputPath, () => {});
        reject(new Error(`Failed to download: ${fileUrl}`));
      }
    }).on('error', (err) => {
      fs.unlink(outputPath, () => {});
      reject(err);
    });
  });
}

(async () => {
  const browser = await puppeteer.launch({
    headless: "new",
    defaultViewport: null,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled'
    ]
  });

  const page = await browser.newPage();
  
  // Set realistic user agent
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  
  // Set extra headers
  await page.setExtraHTTPHeaders({
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
  });
  
  // Track all resources
  const resources = new Set();
  
  page.on('response', async (response) => {
    const resourceUrl = response.url();
    const resourceType = response.request().resourceType();
    
    if (['stylesheet', 'script', 'image', 'font'].includes(resourceType)) {
      resources.add(resourceUrl);
    }
  });

  await page.goto(url, { waitUntil: 'networkidle2', timeout: 0 });

  // ensure folder exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  console.log('📥 Downloading resources...');
  
  // Download all resources
  let downloaded = 0;
  for (const resourceUrl of resources) {
    try {
      const urlObj = new URL(resourceUrl);
      let localPath = urlObj.pathname;
      
      // Handle root path
      if (localPath === '/') localPath = '/index';
      
      // Create local file path
      const filePath = path.join(outputDir, localPath);
      
      await downloadFile(resourceUrl, filePath);
      downloaded++;
      process.stdout.write(`\r   Downloaded: ${downloaded}/${resources.size}`);
    } catch (err) {
      // Skip failed downloads
    }
  }
  
  console.log('\n');

  // Get and modify HTML to use local paths
  let html = await page.content();
  
  // Replace absolute URLs with relative paths
  const baseUrl = new URL(url);
  html = html.replace(new RegExp(baseUrl.origin, 'g'), '');
  
  // Remove all content after footer
  const footerEndRegex = /<\/footer>[\s\S]*?(?=<\/body>|$)/i;
  html = html.replace(footerEndRegex, '</footer>\n');
  
  // Add fixed navbar and help text CSS
  const fixedNavbarCSS = `
  <style>
    /* Fixed help text bar at the very top - only the click-to-call component */
    om-click-to-call {
      position: fixed !important;
      top: 0 !important;
      left: 0 !important;
      right: 0 !important;
      z-index: 10000 !important;
      width: 100% !important;
      background: #fff !important;
    }
    
    /* Fixed navbar below the help text */
    om-main-navigation {
      position: fixed !important;
      top: 40px !important;
      left: 0 !important;
      right: 0 !important;
      z-index: 9999 !important;
      width: 100% !important;
      background: inherit !important;
    }
    
    /* Add padding to body to prevent content from hiding under fixed elements */
    body {
      padding-top: 120px !important;
    }
  </style>
  `;
  
  html = html.replace('</head>', `${fixedNavbarCSS}</head>`);
  
  fs.writeFileSync(path.join(outputDir, 'index.html'), html);

  // screenshot
  await page.screenshot({
    path: path.join(outputDir, 'fullpage.png'),
    fullPage: true
  });

  await browser.close();
  console.log('✅ Clone saved with all assets!');
  console.log(`📁 Location: ${path.resolve(outputDir)}`);
})();
