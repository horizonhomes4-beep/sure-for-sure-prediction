# Mail Studio — setup

This static site uses EmailJS for sending and Firebase Authentication + Cloud Firestore for campaign history. It does **not** send until you configure Firebase and the EmailJS template. Never place Firebase admin credentials or EmailJS private keys in frontend code.

1. In Firebase Console, create a Firebase web app. Enable **Authentication > Email/Password**. Create one administrator account manually and copy its UID.
2. Enable **Cloud Firestore** (not Realtime Database). Copy the web app config into `config.js`, and set `adminUid` to the administrator's UID.
3. In `firestore.rules`, replace `REPLACE_WITH_ADMIN_UID` with the **same** UID (keep quotes). Publish these rules under Firestore Database > Rules. They only allow the admin to read/write campaigns. If your Firestore already has other collections, merge the campaign match block into your existing rules rather than replacing unrelated rules.
4. In EmailJS, configure service `service_3d59mw7`, template `template_8yupfkc`, and public key `mXo_xLhEcgelld3IC`. Set **To Email** to `{{to_email}}`, **To Name** to `{{to_name}}`, **From Name** to `{{from_name}}`, **Reply To** to `{{reply_to}}`, and **Subject** to `{{subject}}`. For the HTML content use `{{{html_message}}}` if your template engine supports unescaped HTML, or use `{{message}}` for plain-text mode. Verify exact syntax in EmailJS template editor. If both HTML and text are needed, create separate templates and route by mode.
5. Add your deployment domain to EmailJS allowlist/security settings and Firebase Authentication authorized domains. Deploy the folder to GitHub Pages or Vercel as a static site.
6. Sign in, add opted-in recipients, compose, preview, and send. The sender display name is configurable; the actual sender address is controlled by the EmailJS-connected email provider.

## Important production limitations

This is a **small-campaign client-side sender**, not a high-volume bulk email server. EmailJS browser requests can be throttled, blocked, interrupted, or exceed account limits. This site enforces 100 recipients per campaign and at least 1 second between requests; your provider may have stricter limits. For reliable large-scale campaigns, use a backend/Cloud Functions queue and a reputable transactional or marketing email provider, with verified domains, unsubscribe processing, suppression lists, consent records, and provider webhooks. A successful EmailJS API response means accepted for processing, not delivered to the inbox. Browser HTML preview is sanitized. Only send messages to people who consented; include a working unsubscribe method in marketing emails. Campaign body and recipients are stored in Firestore; limit admin access appropriately.

## Files
- `index.html`: responsive interface
- `app.js`: composing, importing, sending, history
- `config.js`: EmailJS IDs and Firebase web config
- `firestore.rules`: administrator-only campaign permissions
