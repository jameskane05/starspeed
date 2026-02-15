# OAuth redirect URIs – add these in each provider’s console

Discord and Google require these callbacks to be listed exactly as below. Copy each line and add it in the provider’s OAuth2 settings.

## Discord (Developer Portal → your app → OAuth2 → Redirects)

### Local dev
```
http://localhost:2567/auth/provider/discord/callback
```

### Production (Colyseus Cloud)
```
https://us-ord-23ba76a6.colyseus.cloud/auth/provider/discord/callback
```

## Google (Cloud Console → APIs & Services → Credentials → your OAuth client → Authorized redirect URIs)

### Local dev
```
http://localhost:2567/auth/provider/google/callback
```

### Production (Colyseus Cloud)
```
https://us-ord-23ba76a6.colyseus.cloud/auth/provider/google/callback
```

---

**Important:** No trailing slash. Use `http` for localhost, `https` for production.
