# Mail Studio — Firebase + EmailJS

A responsive browser-based email campaign dashboard with plain-text/HTML composition, recipient management, CSV import/export, per-recipient sending, and Firebase campaign history.

## Files
- `index.html` — complete responsive UI
- `app.js` — Firebase Authentication, admin authorization, recipient tools, sending, and history
- `config.js` — the Firebase and EmailJS configuration supplied for this project
- `database.rules.json` — example Realtime Database rules
- `README.md` — setup and operational notes

## One-time setup

1. In Firebase Console for project `email-5e336`, open **Authentication → Sign-in method** and enable **Email/Password**.
2. Create the administrator user in **Authentication → Users**. Copy the user's UID.
3. In **Realtime Database → Data**, create `admins` as an object, then set `admins/YOUR_ADMIN_UID` to boolean `true`. Do this using the Firebase Console/project-owner access. The website intentionally cannot grant itself admin rights.
4. Review and merge `database.rules.json` into your existing Realtime Database rules. Do not overwrite unrelated paths or rules. Publish rules only after you have created the admin entry.
5. In EmailJS, check that service `service_3d59mw7` and template `template_8yupfkc` exist and are connected to a verified sending service. Configure template fields:
   - To Email: `{{to_email}}`
   - From Name: `{{from_name}}`
   - Reply To: `{{reply_to}}`
   - Subject: `{{subject}}`
   - For HTML body, use `{{{html_message}}}` in the template HTML editor if supported by your template.
   - For plain text, use `{{message}}` in the template's text editor.
   The browser sends both `message` and `html_message`; choose the appropriate field for each template body. Test with your own email address first.
6. Where available, restrict EmailJS allowed origins/domains to your production site and configure Firebase Authentication's authorized domains. Host on HTTPS.
7. Upload all files from this folder to the same directory on your host. Open `index.html`, sign in as the authorized admin, and send a test campaign to yourself.

## Features
- Plain text or HTML-source composition with live preview and HTML sanitization.
- `{{name}}` and `{{email}}` personalization for each recipient.
- Add one address, paste multiple addresses, import CSV (`email,name`), remove duplicates, export recipient CSV.
- Sends individually to avoid exposing recipients to one another.
- Stop control stops after the current provider request completes.
- Campaign history stores campaign content, recipient results, timestamps, and request status in Firebase; history view can export results CSV.
- Local draft persistence in this browser.

## Important security and production limits
- The Firebase browser API key and EmailJS public key are not server secrets. EmailJS public-key requests can be copied and invoked outside this UI. Domain restrictions and account limits help, but they do not replace server-side authorization/rate limiting.
- This browser sender is capped at 100 recipients per campaign and is not a durable high-volume mail queue. Closing the tab or losing connectivity can interrupt a campaign. For large or business-critical campaigns, use an authenticated backend/queue with provider-side rate limits, retries, bounce processing, suppression lists, and audit logging.
- “Accepted” means EmailJS accepted the request; it does not prove delivery or inbox placement.
- Contact only people who have consented. For marketing email, include sender identification and an unsubscribe method and comply with applicable privacy/anti-spam rules.
- Do not allow untrusted users to author HTML email. Sanitization protects preview/sending from common unsafe markup, but email clients render HTML differently and sanitized content must still be tested.
- Database rules protect Firebase data. Do not use permissive public read/write rules in production.
