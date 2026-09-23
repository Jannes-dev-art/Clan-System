import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

export const MODULES = [
  "tickets",
  "verification",
  "applications",
  "moderation",
  "antiRaid",
  "giveaways",
  "tempVoice",
  "economy",
] as const;

export type ModuleName = (typeof MODULES)[number];
export type GuildConfig = {
  guildId: string;
  guildName?: string;
  modules: Record<ModuleName, boolean>;
  minecraft: {
    host: string;
    port: number;
    accountName: string;
    status: "not_configured" | "pending" | "connected" | "error";
  };
};

type Store = { guilds: Record<string, GuildConfig> };
const filePath = resolve(process.env.DATA_FILE ?? "./data/guilds.json");

const defaults: Record<ModuleName, boolean> = {
  tickets: true,
  verification: true,
  applications: true,
  moderation: true,
  antiRaid: false,
  giveaways: false,
  tempVoice: false,
  economy: false,
};

export function defaultGuildConfig(guildId: string, guildName?: string): GuildConfig {
  return {
    guildId,
    guildName,
    modules: { ...defaults },
    minecraft: { host: "", port: 25565, accountName: "", status: "not_configured" },
  };
}

async function readStore(): Promise<Store> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as Store;
  } catch {
    return { guilds: {} };
  }
}

async function writeStore(store: Store) {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(store, null, 2));
}

export async function getGuildConfig(guildId: string, guildName?: string) {
  const store = await readStore();
  const existing = store.guilds[guildId];
  if (existing) return existing;
  const created = defaultGuildConfig(guildId, guildName);
  store.guilds[guildId] = created;
  await writeStore(store);
  return created;
}

export async function updateGuildConfig(guildId: string, patch: Partial<GuildConfig>) {
  const store = await readStore();
  const current = store.guilds[guildId] ?? defaultGuildConfig(guildId);
  const next: GuildConfig = {
    ...current,
    ...patch,
    modules: { ...current.modules, ...(patch.modules ?? {}) },
    minecraft: { ...current.minecraft, ...(patch.minecraft ?? {}) },
  };
  store.guilds[guildId] = next;
  await writeStore(store);
  return next;
}

export function moduleLabel(name: ModuleName) {
  return {
    tickets: "Support-Tickets",
    verification: "Verifizierung",
    applications: "Bewerbungen",
    moderation: "Moderation",
    antiRaid: "Anti-Raid",
    giveaways: "Giveaways",
    tempVoice: "Temporäre Voice",
    economy: "Economy",
  }[name];
}
