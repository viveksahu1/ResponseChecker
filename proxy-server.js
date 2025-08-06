const express = require('express');
const request = require('request');
const cors = require('cors');
const cheerio = require('cheerio');

const app = express();
app.use(cors());

app.get('/proxy', (req, res) => {
  const targetUrl = req.query.url;

  if (!targetUrl || !targetUrl.startsWith('http')) {
    return res.status(400).send('Invalid or missing URL');
  }

  request({
    url: targetUrl,
    encoding: null, // Handle binary too (images/fonts)
    headers: {
      'User-Agent': 'Mozilla/5.0'
    }
  }, (error, response, bodyBuffer) => {
    if (error) {
      return res.status(500).send('Error loading URL: ' + error.message);
    }

    const contentType = response.headers['content-type'] || '';
    const baseUrl = new URL(targetUrl).origin;

    // Remove headers that block embedding
    delete response.headers['x-frame-options'];
    delete response.headers['content-security-policy'];
    delete response.headers['content-security-policy-report-only'];

    // Set headers on the response
    Object.entries(response.headers).forEach(([key, value]) => {
      res.setHeader(key, value);
    });

    res.statusCode = response.statusCode;

    // Case 1: HTML
    if (contentType.includes('text/html')) {
      const body = bodyBuffer.toString('utf8');
      const $ = cheerio.load(body);

      $('a, link, script, img, iframe, form, source').each((_, el) => {
        const attribs = ['href', 'src', 'action', 'data-src'];
        attribs.forEach(attr => {
          const oldUrl = $(el).attr(attr);
          if (oldUrl && !oldUrl.startsWith('http') && !oldUrl.startsWith('data:') && !oldUrl.startsWith('//')) {
            const newUrl = new URL(oldUrl, baseUrl).href;
            $(el).attr(attr, newUrl);
          }
        });
      });

      res.setHeader('Content-Type', 'text/html');
      return res.send($.html());
    }

    // Case 2: CSS - rewrite url(...) references
    if (contentType.includes('text/css')) {
      let css = bodyBuffer.toString('utf8');

      css = css.replace(/url\((?!['"]?(?:https?:|data:|\/\/))(['"]?)([^'")]+)\1\)/g, (match, quote, relUrl) => {
        const absUrl = new URL(relUrl, baseUrl).href;
        return `url(${quote}${absUrl}${quote})`;
      });

      res.setHeader('Content-Type', 'text/css');
      return res.send(css);
    }

    // Case 3: Everything else - binary or not processed
    return res.send(bodyBuffer);
  });
});

app.listen(3000, () => {
  console.log('🚀 Proxy server running at http://localhost:3000');
});
