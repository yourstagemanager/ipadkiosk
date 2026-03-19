#!/bin/sh
# ============================================
# iPad Kiosk - Content Fetcher
# ============================================
# Runs on the jailbroken iPad via cron.
# Fetches the rendered kiosk HTML from Google
# Apps Script and saves it locally for lighttpd
# to serve. This bypasses the TLS issue where
# old Safari can't connect to Google directly.
#
# The iPad's curl (or a newer one from Cydia)
# handles the HTTPS connection instead of Safari.
# ============================================

# Your Google Apps Script web app URL (replace with yours)
SCRIPT_URL="YOUR_APPS_SCRIPT_URL_HERE"

# Local web root
WEB_ROOT="/var/www"
OUTPUT="${WEB_ROOT}/index.html"
TEMP="${WEB_ROOT}/.index.html.tmp"

# Fetch rendered kiosk HTML
/usr/bin/curl -sL -o "${TEMP}" "${SCRIPT_URL}?page=render" 2>/dev/null

# Only update if fetch succeeded (file is non-empty)
if [ -s "${TEMP}" ]; then
    mv "${TEMP}" "${OUTPUT}"
    # Also ping the proof-of-play endpoint
    /usr/bin/curl -sL "${SCRIPT_URL}?page=ping" >/dev/null 2>&1
else
    rm -f "${TEMP}"
fi
