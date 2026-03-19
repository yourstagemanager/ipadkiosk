#!/bin/sh
# ============================================
# iPad Kiosk - Setup Script
# ============================================
# Run this on the iPad via SSH to set up the
# local content caching system.
#
# Prerequisites (install via Cydia):
#   - OpenSSH
#   - lighttpd (or python)
#   - curl (should be pre-installed)
# ============================================

echo "=== iPad Kiosk Setup ==="

# Create web root
mkdir -p /var/www
echo "<html><body style='background:#1a1a2e;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;font-family:Helvetica;font-size:48px;'><div>Setting up kiosk...</div></body></html>" > /var/www/index.html

# Copy lighttpd config
cp lighttpd.conf /etc/lighttpd.conf

# Copy fetch script
cp fetch-kiosk.sh /usr/local/bin/fetch-kiosk.sh
chmod +x /usr/local/bin/fetch-kiosk.sh

# Set up cron job to fetch content every 5 minutes
# (This adds the job if it doesn't already exist)
CRON_JOB="*/5 * * * * /usr/local/bin/fetch-kiosk.sh"
(crontab -l 2>/dev/null | grep -v "fetch-kiosk" ; echo "$CRON_JOB") | crontab -

# Create a launchdaemon plist for lighttpd to start on boot
cat > /Library/LaunchDaemons/com.kiosk.lighttpd.plist << 'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.kiosk.lighttpd</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/sbin/lighttpd</string>
        <string>-D</string>
        <string>-f</string>
        <string>/etc/lighttpd.conf</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
</dict>
</plist>
PLIST

# Load lighttpd daemon
launchctl load /Library/LaunchDaemons/com.kiosk.lighttpd.plist

# Do initial content fetch
echo "Fetching initial content..."
/usr/local/bin/fetch-kiosk.sh

echo ""
echo "=== Setup Complete ==="
echo "1. Open Safari on the iPad"
echo "2. Navigate to: http://127.0.0.1:8080"
echo "3. Add to Home Screen (for fullscreen mode)"
echo "4. Use IncarcerApp to lock to the web clip"
echo ""
echo "Content will refresh every 5 minutes."
echo "Edit your kiosk at: YOUR_APPS_SCRIPT_URL?page=editor"
