# Installing the CampusGuard extension (v3.1)

CampusGuard isn't in any extension store. You load it by hand ("unpacked"). It takes about two minutes.

## Chrome, Edge or Brave

1. Get `campusguard-extension-chromium.zip` (from `dist/` in the repo, or from a teammate) and **unzip it** into a folder you'll keep. Don't delete that folder afterwards: the browser runs the extension from it.
2. Open the extensions page:
   - Chrome: `chrome://extensions`
   - Edge: `edge://extensions`
   - Brave: `brave://extensions`
3. Turn on **Developer mode** (top right in Chrome and Brave, left side in Edge).
4. Click **Load unpacked** and choose the unzipped folder (the one that has `manifest.json` in it).
5. Pin it: click the puzzle-piece icon in the toolbar, then the pin next to CampusGuard. The shield now sits at the top right.

To update after a new version: replace the folder's contents, then click the reload arrow on CampusGuard's card in the extensions page.

## First use

1. Open your webmail (Gmail, Outlook, iCloud Mail, Yahoo, AOL, Proton, Zoho, Fastmail, Tuta, or any other).
2. Click the CampusGuard shield. It asks first: **Allow on [site]**, or **Check just this email** (one time, nothing kept).
3. Choose Allow. Your browser shows its own confirmation; accept it.
4. Open any email. The shield's badge shows the result:

   | Badge | Meaning |
   |---|---|
   | red **!** | High Risk |
   | amber **?** | Suspicious |
   | green **OK** | Looks fine |
   | nothing | No email open, or the site isn't allowed |

   When an email looks like a scam, the CampusGuard drop-down opens by itself from the icon: colour, score and why. High Risk stays until you click away; Suspicious fades after 8 seconds. Safe emails just get the green OK. Click the icon any time to see the result, and **See full breakdown** for the long report.

On a site CampusGuard doesn't know by name, click the shield while an email is open. If it finds one, it checks it and asks **Always check emails on this site?**

**Settings** (the gear in the drop-down): turn automatic checking off (then you click to check), turn the scam pop-up off, and switch off or remove any allowed site. To check a message from somewhere else, click **Check something else** at the bottom of the drop-down and paste it.

## What it reads

Only the email that's open: sender, subject, text and where its links go. Only on sites you allowed (or the one time you clicked). Everything runs inside the browser: no network requests, no email text saved, and links are never opened.

## Safari (stretch goal, needs a Mac)

Safari can run this extension after conversion with Apple's tools:

1. Install Xcode from the Mac App Store.
2. In Terminal: `xcrun safari-web-extension-converter /path/to/unzipped/campusguard --app-name CampusGuard`
3. Xcode opens the project. Choose **Product → Run**.
4. In Safari: **Settings → Advanced → Show features for web developers**, then **Develop → Allow Unsigned Extensions**, then turn on CampusGuard in **Settings → Extensions**.

Safari has no "light the icon on email sites" feature, so CampusGuard sets the icon per tab there instead. This path is untested so far.

## Troubleshooting

- **No badge after allowing:** reload the email tab once.
- **"This doesn't look like an email":** open a single email (not just the inbox list) and click again.
- **The Allow button does nothing:** check `chrome://extensions` → CampusGuard → Details → Site access. Choosing "On specific sites" there also works.
