// Local preview server for iPad Kiosk
// Mocks Google Apps Script backend using a JSON file for storage
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const DATA_FILE = path.join(__dirname, 'kiosk-data.json');
const LOG_FILE = path.join(__dirname, 'play-log.json');

// Default kiosk data
const DEFAULTS = {
  message: 'Welcome',
  fontSize: '64',
  fontColor: '#FFFFFF',
  bgColor: '#000000',
  fontFamily: 'Helvetica, Arial, sans-serif',
  imageUrl: '',
  imagePosition: 'above',
  imageMaxWidth: '60',
  watermarkUrl: '',
  refreshInterval: '300',
  lastUpdated: new Date().toISOString()
};

function getData() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (e) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(DEFAULTS, null, 2));
    return { ...DEFAULTS };
  }
}

function saveData(fields) {
  var data = getData();
  for (var key in fields) {
    data[key] = fields[key];
  }
  data.lastUpdated = new Date().toISOString();
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  return data;
}

function getLog() {
  try {
    return JSON.parse(fs.readFileSync(LOG_FILE, 'utf8'));
  } catch (e) {
    return [];
  }
}

function addLog(event) {
  var log = getLog();
  log.unshift({ timestamp: new Date().toISOString(), event: event });
  if (log.length > 100) log = log.slice(0, 100);
  fs.writeFileSync(LOG_FILE, JSON.stringify(log, null, 2));
}

// Render kiosk.html with data substituted
function renderKiosk(data) {
  var d = data;
  var isHorizontal = d.imageUrl && (d.imagePosition === 'left' || d.imagePosition === 'right');

  var imageHtml = '';
  if (d.imageUrl) {
    imageHtml = '<img class="kiosk-image" src="' + escapeHtml(d.imageUrl) + '" alt="">';
  }

  var messageHtml = '<div class="message">' + (d.message || 'Welcome') + '</div>';

  var contentHtml = '';

  if (d.imageUrl && isHorizontal) {
    var leftCell = d.imagePosition === 'left'
      ? '<div class="image-cell">' + imageHtml + '</div><div class="text-cell">' + messageHtml + '</div>'
      : '<div class="text-cell">' + messageHtml + '</div><div class="image-cell">' + imageHtml + '</div>';
    contentHtml = '<div class="content-wrap">' + leftCell + '</div>';
  } else if (d.imageUrl && d.imagePosition === 'background') {
    contentHtml = '<div class="message" style="background-image:url(\'' + escapeHtml(d.imageUrl) + '\');background-size:cover;background-position:center;padding:40px;min-height:100%;">' + (d.message || 'Welcome') + '</div>';
  } else {
    if (d.imageUrl && d.imagePosition === 'above') {
      contentHtml = imageHtml + messageHtml;
    } else if (d.imageUrl) {
      contentHtml = messageHtml + imageHtml;
    } else {
      contentHtml = messageHtml;
    }
  }

  var watermarkHtml = '';
  if (d.watermarkUrl || d.watermarkUrl2) {
    watermarkHtml = '<div class="watermark-wrap">\n';
    if (d.watermarkUrl) {
      watermarkHtml += '<div class="watermark-pos watermark-pos-1"><img class="watermark" src="' + escapeHtml(d.watermarkUrl) + '" alt=""></div>\n';
    }
    if (d.watermarkUrl2) {
      watermarkHtml += '<div class="watermark-pos watermark-pos-2"><img class="watermark" src="' + escapeHtml(d.watermarkUrl2) + '" alt=""></div>\n';
    }
    watermarkHtml += '</div>\n';
  }

  return '<!DOCTYPE html>\n<html>\n<head>\n' +
    '<meta charset="utf-8">\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">\n' +
    '<meta name="apple-mobile-web-app-capable" content="yes">\n' +
    '<meta name="apple-mobile-web-app-status-bar-style" content="black">\n' +
    '<meta http-equiv="refresh" content="' + (d.refreshInterval || '300') + '">\n' +
    '<style>\n' +
    '* { margin: 0; padding: 0; box-sizing: border-box; }\n' +
    'html, body { width: 100%; height: 100%; overflow: hidden; }\n' +
    'body { background-color: ' + (d.bgColor || '#000000') + '; color: ' + (d.fontColor || '#FFFFFF') + '; font-family: ' + (d.fontFamily || 'Helvetica, Arial, sans-serif') + '; }\n' +
    '.watermark-wrap { position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 0; }\n' +
    '.watermark-pos { position: absolute; left: 0; width: 100%; text-align: center; pointer-events: none; }\n' +
    '.watermark-pos-1 { top: 18%; }\n' +
    '.watermark-pos-1 .watermark { max-width: 60%; }\n' +
    '.watermark-pos-2 { top: 58%; }\n' +
    '.watermark { max-width: 70%; max-height: 35%; opacity: 0.30; filter: grayscale(100%); -webkit-filter: grayscale(100%); pointer-events: none; }\n' +
    '.header-bar { position: absolute; top: 0; left: 0; width: 100%; text-align: center; font-size: 22px; font-weight: 300; letter-spacing: 1px; line-height: 1.4; padding: 20px 40px; z-index: 2; }\n' +
    '.footer-bar { position: absolute; bottom: 0; left: 0; width: 100%; text-align: center; font-size: 18px; font-weight: 300; letter-spacing: 1px; line-height: 1.4; padding: 20px 40px; z-index: 2; }\n' +
    '.outer { display: table; width: 100%; height: 100%; position: relative; z-index: 1; }\n' +
    '.inner { display: table-cell; vertical-align: middle; text-align: center; padding: 80px 40px 80px; }\n' +
    '.message { font-size: ' + (d.fontSize || '64') + 'px; line-height: 1.3; word-wrap: break-word; position: relative; z-index: 1; }\n' +
    '.kiosk-image { max-width: ' + (d.imageMaxWidth || '60') + '%; max-height: 50%; margin: 20px auto; display: block; }\n' +
    (isHorizontal ? '.content-wrap { display: table; width: 100%; } .image-cell, .text-cell { display: table-cell; vertical-align: middle; width: 50%; padding: 20px; } .kiosk-image { max-width: 90%; max-height: 80%; }\n' : '') +
    '</style>\n</head>\n' +
    '<body class="' + (isHorizontal ? 'layout-horizontal' : '') + '">\n' +
    watermarkHtml +
    (d.headerText ? '<div class="header-bar">' + d.headerText + '</div>\n' : '') +
    '<div class="outer"><div class="inner">\n' +
    contentHtml + '\n' +
    '</div></div>\n' +
    (d.footerText ? '<div class="footer-bar">' + d.footerText + '</div>\n' : '') +
    '</body>\n</html>';
}

function escapeHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Build editor HTML with google.script.run mocked to use fetch API
function getEditorHtml() {
  var editorSrc = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'editor.html'), 'utf8');

  // Inject a mock for google.script.run before </head>
  var mockScript = `
<script>
// Mock google.script.run for local preview
// Mimics the chaining pattern: google.script.run.withSuccessHandler(fn).withFailureHandler(fn).methodName(args)
(function() {
  function callApi(method, args) {
    if (method === 'clientGetData') {
      return fetch('/api/data').then(function(r) { return r.json(); });
    }
    if (method === 'clientSaveData') {
      return fetch('/api/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(args[0])
      }).then(function(r) { return r.json(); });
    }
    if (method === 'clientUploadImage') {
      return Promise.resolve('data:image/jpeg;base64,' + args[0]);
    }
    if (method === 'clientGetLog') {
      return fetch('/api/log').then(function(r) { return r.json(); });
    }
    return Promise.reject(new Error('Unknown method: ' + method));
  }

  function createChain() {
    var handlers = { success: function(){}, failure: function(){} };

    // The proxy intercepts ALL property access
    var proxy = new Proxy({}, {
      get: function(target, prop) {
        if (prop === 'withSuccessHandler') {
          return function(h) { handlers.success = h; return proxy; };
        }
        if (prop === 'withFailureHandler') {
          return function(h) { handlers.failure = h; return proxy; };
        }
        // Anything else is a server function call
        return function() {
          var args = Array.prototype.slice.call(arguments);
          callApi(prop, args)
            .then(function(r) { handlers.success(r); })
            .catch(function(e) { handlers.failure({ message: e.message || String(e) }); });
        };
      }
    });

    return proxy;
  }

  // google.script.run itself is a chain starter
  window.google = {
    script: {
      run: new Proxy({}, {
        get: function(target, prop) {
          var c = createChain();
          // If they start with withSuccessHandler/withFailureHandler, call it
          var val = c[prop];
          return val;
        }
      })
    }
  };
})();
</script>
`;

  editorSrc = editorSrc.replace('</head>', mockScript + '\n</head>');
  return editorSrc;
}

// --- HTTP Server ---
var server = http.createServer(function(req, res) {
  var url = req.url.split('?')[0];
  var method = req.method;

  // API endpoints
  if (url === '/api/data' && method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(getData()));
    return;
  }

  if (url === '/api/data' && method === 'POST') {
    var body = '';
    req.on('data', function(chunk) { body += chunk; });
    req.on('end', function() {
      try {
        var fields = JSON.parse(body);
        saveData(fields);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  if (url === '/api/log' && method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(getLog()));
    return;
  }

  // Static assets
  if (url.startsWith('/assets/')) {
    var filePath = path.join(__dirname, '..', decodeURIComponent(url));
    var ext = path.extname(filePath).toLowerCase();
    var mimeTypes = {
      '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
      '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
      '.webp': 'image/webp'
    };
    var contentType = mimeTypes[ext] || 'application/octet-stream';
    try {
      var fileData = fs.readFileSync(filePath);
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(fileData);
    } catch (e) {
      res.writeHead(404);
      res.end('Not found');
    }
    return;
  }

  // Pages
  if (url === '/' || url === '/kiosk') {
    addLog('preview-load');
    var data = getData();
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(renderKiosk(data));
    return;
  }

  if (url === '/editor') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(getEditorHtml());
    return;
  }

  // 404
  res.writeHead(404, { 'Content-Type': 'text/html' });
  res.end('<html><body style="background:#0f0f23;color:#eee;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;flex-direction:column;">' +
    '<h1>iPad Kiosk Preview</h1>' +
    '<p style="margin-top:20px;"><a href="/kiosk" style="color:#e94560;">Kiosk Display</a> &nbsp; | &nbsp; <a href="/editor" style="color:#e94560;">Editor</a></p>' +
    '</body></html>');
});

server.listen(PORT, '0.0.0.0', function() {
  var os = require('os');
  var interfaces = os.networkInterfaces();
  var localIP = 'localhost';
  for (var name in interfaces) {
    for (var i = 0; i < interfaces[name].length; i++) {
      var iface = interfaces[name][i];
      if (iface.family === 'IPv4' && !iface.internal) {
        localIP = iface.address;
        break;
      }
    }
    if (localIP !== 'localhost') break;
  }
  console.log('');
  console.log('  iPad Kiosk Preview Server');
  console.log('  ========================');
  console.log('');
  console.log('  Local:    http://localhost:' + PORT + '/kiosk');
  console.log('  Network:  http://' + localIP + ':' + PORT + '/kiosk');
  console.log('  Editor:   http://' + localIP + ':' + PORT + '/editor');
  console.log('');
  console.log('  Use the Network URL on your iPad!');
  console.log('');
});
