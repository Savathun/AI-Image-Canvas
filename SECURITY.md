# Security notes

- Never open an issue or commit containing an API Key, OAuth token, Google Client Secret, generated private image, prompt history, or Sites source credential.
- The CTMOAI API Key is entered per browser session and must not be persisted.
- Google Drive OAuth tokens stay in page memory. Only the public Web OAuth Client ID may be saved with workspace settings.
- Use a private Site and a private GitHub repository unless every intended user understands the provider, storage, and billing implications.
- If a credential is ever committed, revoke it at the provider first, then remove it from the entire Git history; deleting only the latest file is insufficient.
