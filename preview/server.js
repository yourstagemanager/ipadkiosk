// Local preview server for iPad Kiosk
// Mocks Google Apps Script backend using a JSON file for storage
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const DATA_FILE = path.join(__dirname, 'kiosk-data.json');
const LOG_FILE = path.join(__dirname, 'play-log.json');
const PIN_FILE = path.join(__dirname, 'editor-pin.txt');

// --- Auth ---
// PIN is stored in preview/editor-pin.txt — change it there.
// Default PIN is 1234 if file doesn't exist.
function getPin() {
  try { return fs.readFileSync(PIN_FILE, 'utf8').trim(); } catch (e) { return '1234'; }
}

var sessions = new Set();

function generateToken() {
  var chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  var token = '';
  for (var i = 0; i < 32; i++) token += chars[Math.floor(Math.random() * chars.length)];
  return token;
}

function getSessionToken(req) {
  var cookie = req.headers['cookie'] || '';
  var match = cookie.match(/kiosk_session=([^;]+)/);
  return match ? match[1] : null;
}

function isAuthenticated(req) {
  var token = getSessionToken(req);
  return token && sessions.has(token);
}

function getLoginPage(error) {
  return '<!DOCTYPE html><html><head>' +
    '<meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">' +
    '<meta name="apple-mobile-web-app-capable" content="yes">' +
    '<title>Kiosk Editor</title>' +
    '<style>' +
    '* { margin: 0; padding: 0; box-sizing: border-box; }' +
    'body { background: #0f0f23; color: #eee; font-family: -apple-system, Helvetica, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; }' +
    '.box { background: #1a1a2e; border-radius: 16px; padding: 40px 32px; width: 320px; text-align: center; box-shadow: 0 8px 32px rgba(0,0,0,0.4); }' +
    'h2 { font-size: 22px; font-weight: 600; margin-bottom: 8px; }' +
    'p { font-size: 14px; color: #aaa; margin-bottom: 28px; }' +
    'input[type=password] { width: 100%; padding: 14px 16px; border-radius: 10px; border: 1px solid #333; background: #0f0f23; color: #fff; font-size: 24px; text-align: center; letter-spacing: 8px; outline: none; margin-bottom: 16px; }' +
    'button { width: 100%; padding: 14px; border-radius: 10px; border: none; background: #e94560; color: #fff; font-size: 16px; font-weight: 600; cursor: pointer; }' +
    '.error { color: #e94560; font-size: 13px; margin-top: 12px; }' +
    '</style></head><body>' +
    '<div class="box">' +
    '<h2>Kiosk Editor</h2>' +
    '<p>Enter your PIN to continue</p>' +
    '<form method="POST" action="/api/auth">' +
    '<input type="password" name="pin" inputmode="numeric" pattern="[0-9]*" autofocus placeholder="••••">' +
    '<button type="submit">Unlock</button>' +
    (error ? '<div class="error">Incorrect PIN. Try again.</div>' : '') +
    '</form>' +
    '</div></body></html>';
}

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
  watermarkOpacity: '0.30',
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

function addLog(event, detail) {
  var log = getLog();
  var entry = { timestamp: new Date().toISOString(), event: event };
  if (detail) entry.detail = detail;
  log.unshift(entry);
  if (log.length > 500) log = log.slice(0, 500);
  fs.writeFileSync(LOG_FILE, JSON.stringify(log, null, 2));
}

function stripHtml(str) {
  return (str || '').replace(/<[^>]*>/g, '').trim();
}

function diffSave(oldData, newData) {
  var trackFields = ['message','headerText','footerText','bgColor','fontFamily','imageUrl','watermarkOpacity','refreshInterval'];
  var labels = { message:'message', headerText:'header', footerText:'footer', bgColor:'bg color', fontFamily:'font', imageUrl:'image', watermarkOpacity:'watermark opacity', refreshInterval:'refresh interval' };
  var changes = [];
  for (var i = 0; i < trackFields.length; i++) {
    var f = trackFields[i];
    var ov = stripHtml(String(oldData[f] || ''));
    var nv = stripHtml(String(newData[f] || ''));
    if (ov !== nv) {
      if (f === 'message' || f === 'headerText' || f === 'footerText') {
        changes.push(labels[f] + ': "' + nv.slice(0, 40) + (nv.length > 40 ? '…' : '') + '"');
      } else {
        changes.push(labels[f] + ': ' + (nv || '(removed)'));
      }
    }
  }
  return changes.length ? changes.join(' | ') : 'no changes';
}

// Render kiosk.html with data substituted
function renderKiosk(data, isPreview) {
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
    '<meta name="format-detection" content="telephone=no, email=no, address=no">\n' +
    (isPreview ? '' : '<meta http-equiv="refresh" content="' + (d.refreshInterval || '300') + '">\n') +
    '<style>\n' +
    '* { margin: 0; padding: 0; box-sizing: border-box; }\n' +
    'html, body { width: 100%; height: 100%; overflow: hidden; }\n' +
    'body { background-color: ' + (d.bgColor || '#000000') + '; color: ' + (d.fontColor || '#FFFFFF') + '; font-family: ' + (d.fontFamily || 'Helvetica, Arial, sans-serif') + '; }\n' +
    '.watermark-wrap { position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 0; }\n' +
    '.watermark-pos { position: absolute; left: 0; width: 100%; text-align: center; pointer-events: none; }\n' +
    '.watermark-pos-1 { top: 18%; }\n' +
    '.watermark-pos-1 .watermark { max-width: 60%; }\n' +
    '.watermark-pos-2 { top: 58%; }\n' +
    '.watermark { max-width: 70%; max-height: 35%; opacity: ' + (d.watermarkOpacity || '0.30') + '; filter: grayscale(100%); -webkit-filter: grayscale(100%); pointer-events: none; }\n' +
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
    (isPreview ? '' :
    '<script>\n' +
    'function ping(){var x=new XMLHttpRequest();x.open("GET","/api/ping",true);x.send();}\n' +
    'ping();\n' +
    'setInterval(ping,60000);\n' +
    '</script>\n') +
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
    if (method === 'clientGetMessages') {
      return fetch('/api/messages').then(function(r) { return r.json(); });
    }
    if (method === 'clientSaveMessage') {
      return fetch('/api/messages/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(args[0]) }).then(function(r) { return r.json(); });
    }
    if (method === 'clientDeleteMessage') {
      return fetch('/api/messages/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: args[0] }) }).then(function(r) { return r.json(); });
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

  // Auth endpoints
  if (url === '/api/auth' && method === 'POST') {
    var body = '';
    req.on('data', function(chunk) { body += chunk; });
    req.on('end', function() {
      var pin = '';
      // Parse form POST (application/x-www-form-urlencoded)
      var match = body.match(/pin=([^&]*)/);
      if (match) pin = decodeURIComponent(match[1]);
      if (pin === getPin()) {
        var token = generateToken();
        sessions.add(token);
        res.writeHead(302, {
          'Set-Cookie': 'kiosk_session=' + token + '; Path=/; HttpOnly',
          'Location': '/editor'
        });
        res.end();
      } else {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(getLoginPage(true));
      }
    });
    return;
  }

  if (url === '/api/logout') {
    var token = getSessionToken(req);
    if (token) sessions.delete(token);
    res.writeHead(302, { 'Set-Cookie': 'kiosk_session=; Path=/; Max-Age=0', 'Location': '/editor' });
    res.end();
    return;
  }

  // API endpoints
  if (url === '/api/data' && method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(getData()));
    return;
  }

  if (url === '/api/data' && method === 'POST') {
    if (!isAuthenticated(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }
    var body = '';
    req.on('data', function(chunk) { body += chunk; });
    req.on('end', function() {
      try {
        var fields = JSON.parse(body);
        var oldData = getData();
        var diff = diffSave(oldData, fields);
        saveData(fields);
        addLog('editor-save', diff);
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

  if (url === '/api/ping' && method === 'GET') {
    addLog('heartbeat');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (url === '/api/messages' && method === 'GET') {
    var d = getData();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(d.savedMessages || []));
    return;
  }

  if (url === '/api/messages/save' && method === 'POST') {
    if (!isAuthenticated(req)) { res.writeHead(401); res.end('Unauthorized'); return; }
    var body = '';
    req.on('data', function(chunk) { body += chunk; });
    req.on('end', function() {
      try {
        var msg = JSON.parse(body);
        var d = getData();
        if (!d.savedMessages) d.savedMessages = [];
        d.savedMessages.push({ id: Date.now().toString(), label: msg.label, content: msg.content, savedAt: new Date().toISOString() });
        fs.writeFileSync(DATA_FILE, JSON.stringify(d, null, 2));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, messages: d.savedMessages }));
      } catch(e) { res.writeHead(400); res.end(e.message); }
    });
    return;
  }

  if (url === '/api/messages/delete' && method === 'POST') {
    if (!isAuthenticated(req)) { res.writeHead(401); res.end('Unauthorized'); return; }
    var body = '';
    req.on('data', function(chunk) { body += chunk; });
    req.on('end', function() {
      try {
        var parsed = JSON.parse(body);
        var d = getData();
        d.savedMessages = (d.savedMessages || []).filter(function(m) { return m.id !== parsed.id; });
        fs.writeFileSync(DATA_FILE, JSON.stringify(d, null, 2));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, messages: d.savedMessages }));
      } catch(e) { res.writeHead(400); res.end(e.message); }
    });
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
    var isPreview = req.url.indexOf('preview=1') !== -1;
    if (!isPreview) addLog('preview-load');
    var data = getData();
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(renderKiosk(data, isPreview));
    return;
  }

  if (url === '/editor') {
    if (!isAuthenticated(req)) {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(getLoginPage(false));
      return;
    }
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
