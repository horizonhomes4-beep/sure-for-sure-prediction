# Mail Studio — Firebase + EmailJS

Responsive email campaign dashboard with plain-text/HTML composition, recipient management, CSV import/export, individual sending, and Firebase campaign history.

## Files
- `index.html` — main responsive app
- `app.js` — authentication, admin authorization, recipient tools, email sending, and history
- `config.js` — supplied Firebase and EmailJS configuration
- `setup.html` — one-time administrator bootstrap page
- `database.rules.json` — temporary bootstrap rules; replace with secure production rules after setup
- `README.md` — setup and operational notes

## One-time administrator setup

1. In Firebase Console for project `email-5e336`, open **Authentication → Sign-in method** and enable **Email/Password**.
2. Publish the rules in `database.rules.json` temporarily. They permit the first setup while `setupComplete` is not `true`. If you already have `admins` records, that does not by itself prevent setup; the setup lock is the deciding value.
3. Deploy `setup.html` beside `index.html` and `config.js`, then open `https://YOUR-DOMAIN/setup.html`.
4. Enter the administrator display name, email, and a strong password of at least 12 characters. The page creates the Firebase Authentication user, writes `admins/UID = true`, and locks setup at `setupComplete = true`.
5. **Immediately replace the temporary rules** with the secure production rules below. Then delete `setup.html` from your project and redeploy. Deleting the file alone is not sufficient; production rules must also be changed.
6. Open `index.html` and sign in with the administrator account.

If `setupComplete` is already `true`, setup will refuse to run. If an account with the chosen email already exists in Firebase Authentication, choose a different email for bootstrap or sign in with the existing authorized admin account through `index.html`.

## Secure production Realtime Database rules

After bootstrap, replace the temporary rules with the following. Merge any other application paths you need to preserve; do not overwrite unrelated rules blindly.

```json
{
  "rules": {
    "admins": {
      "$uid": {
        ".read": "auth != null && (auth.uid === $uid || root.child('admins').child(auth.uid).val() === true)",
        ".write": "auth != null && root.child('admins').child(auth.uid).val() === true"
      }
    },
    "campaigns": {
      ".read": "auth != null && root.child('admins').child(auth.uid).val() === true",
      ".write": "auth != null && root.child('admins').child(auth.uid).val() === true",
      ".indexOn": ["createdAt"]
    },
    "setupComplete": {
      ".read": false,
      ".write": false
    }
  }
}
```

The setup page's `setupComplete` flag remains in the database as a record that bootstrap was completed. Production rules make it immutable from the client.

## EmailJS template setup

Check that service `service_3d59mw7` and template `template_8yupfkc` exist and use a verified sending service. Configure the template:
- To Email: `{{to_email}}`
- From Name: `{{from_name}}`
- Reply To: `{{reply_to}}`
- Subject: `{{subject}}`
- HTML body: use `{{{html_message}}}` in the template HTML editor if supported.
- Plain text body: use `{{message}}` in the text editor.

The browser sends both `message` and `html_message`; choose the appropriate variable for the template body. Test with your own address first. Restrict EmailJS allowed origins/domains to your production host where available, and configure Firebase Authentication authorized domains. Host over HTTPS.

## Features
- Plain text or HTML-source composition with live preview and sanitization.
- `{{name}}` and `{{email}}` personalization.
- Add one address, paste a list, import CSV (`email,name`), skip duplicates/invalid entries, export recipient CSV.
- Sends individually so recipients do not see each other's addresses.
- Stop after the current request, campaign progress, accepted/failed results.
- Firebase campaign history including message content and recipient outcomes.
- Local draft persistence in the browser.

## Security and production limitations
- Firebase web API keys and EmailJS public keys are client-side identifiers, not server secrets. Database rules enforce access to Firebase data, but EmailJS public-key requests may be invoked outside this UI; domain restrictions and provider limits help.
- The browser sender is capped at 100 recipients per campaign. Closing the tab or losing connectivity can interrupt sending. High-volume or business-critical email should use a server-side queue with rate limits, retries, bounce handling, suppression lists, and audit logging.
- “Accepted” means EmailJS accepted the request, not that the email reached the inbox.
- Send only to people who have consented. Marketing email should identify the sender and provide an unsubscribe method as required by applicable rules.
- Do not allow untrusted users to author HTML email. Email clients render HTML differently, so test campaigns across clients.
