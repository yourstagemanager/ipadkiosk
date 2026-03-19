# iPad Kiosk - Setup Guide

## Architecture

```
[Your Phone]                [Google Cloud]              [iPad]
     |                           |                        |
  PWA Editor  ----->  Google Apps Script  <-----  curl (cron)
                           |                        |
                     Google Sheets             lighttpd
                     (stores content)      (serves cached HTML)
                                                    |
                                              Safari (kiosk)
                                                    |
                                             IncarcerApp (lock)
```

- **Google Sheets** = your CMS (content database)
- **Google Apps Script** = free web server + API
- **iPad** = runs a local web server + cron fetcher to work around TLS limitations
- **Phone** = PWA editor to update content from anywhere

---

## Step 1: Set Up Google Sheets + Apps Script

1. Go to [Google Sheets](https://sheets.google.com) and create a new spreadsheet
2. Name it "iPad Kiosk" (or whatever you like)
3. Go to **Extensions > Apps Script**
4. Delete any default code in `Code.gs`
5. Paste the contents of `apps-script/Code.gs`
6. Create two new HTML files in Apps Script:
   - Click **+** next to Files > **HTML** > name it `kiosk` > paste contents of `apps-script/kiosk.html`
   - Click **+** next to Files > **HTML** > name it `editor` > paste contents of `apps-script/editor.html`
7. Click **Deploy > New deployment**
8. Choose **Web app**
9. Set:
   - Execute as: **Me**
   - Who has access: **Anyone**
10. Click **Deploy** and authorize when prompted
11. Copy the deployment URL (looks like `https://script.google.com/macros/s/.../exec`)

**Test it:**
- Visit `YOUR_URL` in your phone browser — you should see the kiosk display
- Visit `YOUR_URL?page=editor` — you should see the editor

**Save the editor to your phone's home screen** for a PWA-like experience.

---

## Step 2: Set Up the iPad

### Option A: Direct Load (try this first)

If your iPad can load the Apps Script URL directly:

1. Open Safari on the iPad
2. Navigate to your Apps Script URL
3. Tap the share button > **Add to Home Screen**
4. Open the home screen web clip (should be fullscreen)
5. Use **IncarcerApp** to lock to the web clip
6. Done!

### Option B: Local Caching (if TLS fails)

If Safari can't load the HTTPS URL (likely on iOS 5.1.1):

**Install packages via Cydia:**
- OpenSSH (if not already installed)
- lighttpd (search for it in Cydia)

**From your computer, SSH into the iPad:**

```bash
# Find your iPad's IP in Settings > Wi-Fi > tap your network
ssh root@IPAD_IP_ADDRESS
# Default password is usually: alpine (CHANGE THIS!)
```

**Transfer the setup files:**

```bash
# From your computer
scp -r ipad-setup/* root@IPAD_IP_ADDRESS:/tmp/kiosk-setup/
```

**On the iPad (via SSH):**

```bash
cd /tmp/kiosk-setup

# Edit fetch-kiosk.sh to add your Apps Script URL
# Replace YOUR_APPS_SCRIPT_URL_HERE with your actual URL
vi fetch-kiosk.sh

# Run the installer
sh install.sh
```

**Then on the iPad:**

1. Open Safari
2. Go to `http://127.0.0.1:8080`
3. Add to Home Screen
4. Lock with IncarcerApp

---

## Step 3: Using the Editor

From your phone, open the editor (your Apps Script URL + `?page=editor`).

### Content Tab
- Type your display message
- Supports multi-line text
- Hit **Save & Publish** to update

### Style Tab
- Font size, family, colors
- Background color
- Refresh interval (how often the iPad checks for updates)

### Image Tab
- Upload images from your phone (stored in Google Drive)
- Or paste any image URL
- Choose position: above/below/left/right of text, or as background

### Preview Tab
- Approximate preview of how the kiosk will look

### Activity Tab
- Proof of play log showing every time the iPad refreshed
- Timestamps for each load

---

## Kiosk Lockdown Tips

### IncarcerApp
- Lock the iPad to the kiosk web clip
- Set a passcode so only you can exit

### Activator
- Disable hardware buttons (home, volume, etc.)
- Prevents accidental exits

### Prevent Sleep
- Settings > General > Auto-Lock > **Never**
- Keep connected to power at all times

### Hide Status Bar
- Install **SBSettings** from Cydia and toggle the status bar off
- Or use a WinterBoard theme that hides it

---

## Troubleshooting

**iPad shows "Setting up kiosk..."**
- The fetch script hasn't run yet, or your Apps Script URL is wrong
- SSH in and run: `/usr/local/bin/fetch-kiosk.sh`
- Check the URL in the script

**Images not loading on iPad**
- Google Drive image URLs may also need TLS 1.2
- Alternative: host images on a local HTTP server or use the base64 embedding approach

**Editor shows "Failed to load"**
- Make sure the Apps Script is deployed with "Anyone" access
- Re-deploy if you made changes (each deployment gets a new URL, or use "Deploy > Manage deployments" to update the existing one)

**curl on iPad doesn't support HTTPS**
- Install a newer curl from Cydia, or
- Set up a simple HTTP proxy/relay on your local network

**Content not updating**
- Check that cron is running: `crontab -l`
- Manually run the fetch script to test
- Check the refresh interval in the editor (Style tab)
