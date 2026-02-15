import { auth } from "@colyseus/auth";
import { upsertUser } from "../db/index.js";

const COLYSEUS_CLOUD_URL = "https://us-ord-23ba76a6.colyseus.cloud";
auth.backend_url =
  process.env.AUTH_BACKEND_URL ||
  (process.env.NODE_ENV === "production" ? COLYSEUS_CLOUD_URL : "http://localhost:2567");
auth.oauth.defaults.origin = auth.backend_url;

auth.settings.onRegisterAnonymously = async (options) => {
  const name = (options?.name as string) || `Pilot_${Math.floor(Math.random() * 9999)}`;
  const entry = upsertUser({ name, anonymous: true });
  return { id: entry.id, name: entry.name, anonymous: true };
};

if (process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET) {
  auth.oauth.addProvider("discord", {
    key: process.env.DISCORD_CLIENT_ID.trim(),
    secret: process.env.DISCORD_CLIENT_SECRET.trim(),
    scope: ["identify", "email"],
    redirect_uri: `${auth.backend_url}/auth/provider/discord/callback`,
    token_endpoint_auth_method: "client_secret_basic",
  });
  console.log("[Auth] Discord OAuth configured (client_id:", process.env.DISCORD_CLIENT_ID.slice(0, 8) + "...)");
}

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  auth.oauth.addProvider("google", {
    key: process.env.GOOGLE_CLIENT_ID.trim(),
    secret: process.env.GOOGLE_CLIENT_SECRET.trim(),
    scope: ["email", "profile"],
  });
}

if (process.env.APPLE_CLIENT_ID && process.env.APPLE_CLIENT_SECRET) {
  auth.oauth.addProvider("apple", {
    key: process.env.APPLE_CLIENT_ID,
    secret: process.env.APPLE_CLIENT_SECRET,
    scope: ["name", "email"],
    custom_params: { response_mode: "form_post" },
  });
}

auth.oauth.onCallback(async (data, provider) => {
  if ((data as { error?: string }).error) {
    const err = data as { error?: string; error_description?: string; raw?: unknown };
    console.error("[Auth] OAuth callback error:", err.error, err.error_description || "", err.raw || "");
  }
  const profile = data.profile as Record<string, unknown>;
  const id = String(profile.id ?? profile.sub ?? "");
  const email = (profile.email as string) || undefined;
  let name = (profile.username as string) || (profile.name as string) || "";
  if (typeof name === "object" && name !== null && "givenName" in name) {
    const n = name as { givenName?: string; familyName?: string };
    name = [n.givenName, n.familyName].filter(Boolean).join(" ") || "Player";
  }

  const payload: {
    discordId?: string;
    googleId?: string;
    appleId?: string;
    email?: string;
    name: string;
  } = { name: name || "Player" };

  if (provider === "discord") {
    payload.discordId = id;
    payload.name = (profile.global_name as string) || (profile.username as string) || payload.name;
  } else if (provider === "google") {
    payload.googleId = id;
  } else if (provider === "apple") {
    payload.appleId = id;
  }
  payload.email = email;

  const user = upsertUser(payload);
  return { id: user.id, name: user.name, email: user.email };
});
