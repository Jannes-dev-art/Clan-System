import "dotenv/config";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  Interaction,
  ModalBuilder,
  REST,
  Routes,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { getGuildConfig, MODULES, moduleLabel, updateGuildConfig, type GuildConfig, type ModuleName } from "./config.js";

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
if (!token || !clientId) throw new Error("DISCORD_TOKEN und DISCORD_CLIENT_ID müssen gesetzt sein.");

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const commands = [
  new SlashCommandBuilder().setName("admin").setDescription("Öffnet das ClanControl-Panel"),
  new SlashCommandBuilder().setName("setup").setDescription("Öffnet das ClanControl-Einrichtungsmenü"),
].map(command => command.toJSON());

function panel(config: GuildConfig) {
  const active = MODULES.filter(name => config.modules[name]).length;
  const minecraft = config.minecraft.status === "connected" ? "Verbunden" : config.minecraft.status === "pending" ? "Prüfung ausstehend" : "Nicht verbunden";
  const embed = new EmbedBuilder()
    .setColor(0x9b7cff)
    .setTitle("ClanControl · Admin Panel")
    .setDescription("Alle Bot-Systeme direkt in Discord verwalten. Wähle unten einen Bereich.")
    .addFields(
      { name: "Server", value: config.guildName ?? "Discord-Server", inline: true },
      { name: "Aktive Module", value: `${active}/${MODULES.length}`, inline: true },
      { name: "Minecraft", value: minecraft, inline: true },
    )
    .setFooter({ text: "ClanControl · Änderungen gelten nur für diesen Server" });

  const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("cc_modules").setLabel("Module").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("cc_minecraft").setLabel("Minecraft verbinden").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("cc_security").setLabel("Sicherheit").setStyle(ButtonStyle.Secondary),
  );
  return { embeds: [embed], components: [buttons] };
}

function modulePanel(config: GuildConfig) {
  const select = new StringSelectMenuBuilder()
    .setCustomId("cc_module_select")
    .setPlaceholder("Module auswählen oder deaktivieren")
    .setMinValues(0)
    .setMaxValues(MODULES.length)
    .addOptions(MODULES.map(name => ({ label: moduleLabel(name), value: name, default: config.modules[name] })));
  return {
    embeds: [new EmbedBuilder().setColor(0x9b7cff).setTitle("Module konfigurieren").setDescription("Wähle die Module aus, die in deinem Server aktiv sein sollen.")],
    components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select), new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId("cc_back").setLabel("Zurück").setStyle(ButtonStyle.Secondary))],
  };
}

async function showPanel(interaction: Interaction) {
  if (!interaction.isChatInputCommand() && !interaction.isButton() && !interaction.isStringSelectMenu() && !interaction.isModalSubmit()) return;
  if (!interaction.guild) {
    await interaction.reply({ content: "Dieses Panel kann nur auf einem Discord-Server geöffnet werden.", ephemeral: true });
    return;
  }
  const config = await getGuildConfig(interaction.guild.id, interaction.guild.name);
  if (interaction.isChatInputCommand()) {
    await interaction.reply({ ...panel(config), ephemeral: true });
    return;
  }
  if (interaction.isButton() && interaction.customId === "cc_modules") {
    await interaction.update(modulePanel(config));
    return;
  }
  if (interaction.isButton() && interaction.customId === "cc_back") {
    await interaction.update(panel(config));
    return;
  }
  if (interaction.isButton() && interaction.customId === "cc_security") {
    await interaction.reply({ content: "Sicherheitsstatus: Server-isolierte Konfiguration aktiv. Anti-Raid und Audit-Log werden über die nächsten Bot-Module ergänzt.", ephemeral: true });
    return;
  }
  if (interaction.isButton() && interaction.customId === "cc_minecraft") {
    const modal = new ModalBuilder().setCustomId("cc_minecraft_modal").setTitle("Minecraft-Verbindung");
    const host = new TextInputBuilder().setCustomId("host").setLabel("Server-Adresse").setPlaceholder("play.deinserver.net").setStyle(TextInputStyle.Short).setRequired(true).setValue(config.minecraft.host);
    const port = new TextInputBuilder().setCustomId("port").setLabel("Port").setStyle(TextInputStyle.Short).setRequired(true).setValue(String(config.minecraft.port));
    const account = new TextInputBuilder().setCustomId("account").setLabel("Minecraft-Account").setPlaceholder("Bot-Account / Alt-Account").setStyle(TextInputStyle.Short).setRequired(false).setValue(config.minecraft.accountName);
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(host), new ActionRowBuilder<TextInputBuilder>().addComponents(port), new ActionRowBuilder<TextInputBuilder>().addComponents(account));
    await interaction.showModal(modal);
    return;
  }
  if (interaction.isStringSelectMenu() && interaction.customId === "cc_module_select") {
    const selected = new Set(interaction.values as ModuleName[]);
    const modules = Object.fromEntries(MODULES.map(name => [name, selected.has(name)])) as Record<ModuleName, boolean>;
    const next = await updateGuildConfig(interaction.guild.id, { modules });
    await interaction.update(modulePanel(next));
    return;
  }
  if (interaction.isModalSubmit() && interaction.customId === "cc_minecraft_modal") {
    const host = interaction.fields.getTextInputValue("host").trim();
    const port = Number(interaction.fields.getTextInputValue("port"));
    const accountName = interaction.fields.getTextInputValue("account").trim();
    if (!host || !Number.isInteger(port) || port < 1 || port > 65535) {
      await interaction.reply({ content: "Bitte gib eine gültige Server-Adresse und einen Port zwischen 1 und 65535 ein.", ephemeral: true });
      return;
    }
    await updateGuildConfig(interaction.guild.id, { minecraft: { host, port, accountName, status: "pending" } });
    await interaction.reply({ content: `Minecraft-Verbindung für **${host}:${port}** vorgemerkt. Der Bot kann sie nach Einrichtung des Minecraft-Adapters prüfen.`, ephemeral: true });
  }
}

client.once(Events.ClientReady, async ready => {
  const rest = new REST({ version: "10" }).setToken(token);
  await rest.put(Routes.applicationCommands(clientId), { body: commands });
  console.log(`ClanControl online als ${ready.user.tag}`);
});
client.on(Events.InteractionCreate, interaction => showPanel(interaction).catch(error => console.error("Interaction error", error)));
client.login(token);
