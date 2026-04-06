// bot/index.js
require('dotenv').config();
const { Client, GatewayIntentBits, Partials, Collection } = require('discord.js');
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const { getGuildSettings, checkBlacklist, getExpiredPunishments, removeTempPunishment } = require('./database');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildModeration,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.GuildMember],
});

client.slashCommands  = new Collection();
client.prefixCommands = new Collection();

// Load commands
const cmdPath = path.join(__dirname, 'commands');
for (const file of fs.readdirSync(cmdPath).filter(f => f.endsWith('.js'))) {
  const cmd = require(path.join(cmdPath, file));
  if (cmd.data)  client.slashCommands.set(cmd.data.name, cmd);
  if (cmd.name)  client.prefixCommands.set(cmd.name, cmd);
  if (cmd.aliases) cmd.aliases.forEach(a => client.prefixCommands.set(a, cmd));
}
console.log(`[Lumora] Loaded ${client.slashCommands.size} slash / ${client.prefixCommands.size} prefix commands`);

// Load events
const evtPath = path.join(__dirname, 'events');
for (const file of fs.readdirSync(evtPath).filter(f => f.endsWith('.js'))) {
  const evt = require(path.join(evtPath, file));
  evt.once ? client.once(evt.name, (...a) => evt.execute(...a, client))
           : client.on(evt.name,   (...a) => evt.execute(...a, client));
}

// Slash command handler
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  const cmd = client.slashCommands.get(interaction.commandName);
  if (!cmd) return;
  const bl = checkBlacklist(interaction.user.id);
  if (bl) return interaction.reply({ content: `❌ You are globally blacklisted from Lumora Bot.\n**Reason:** ${bl.reason || 'No reason'}`, ephemeral: true });
  try { await cmd.execute(interaction, client); }
  catch (e) {
    console.error('[Slash error]', e);
    const m = { content: '❌ An error occurred.', ephemeral: true };
    interaction.replied || interaction.deferred ? interaction.followUp(m).catch(() => {}) : interaction.reply(m).catch(() => {});
  }
});

// Prefix command handler
client.on('messageCreate', async message => {
  if (message.author.bot || !message.guild) return;
  const settings = getGuildSettings(message.guild.id);
  const prefix = settings.prefix || '!';
  if (!message.content.startsWith(prefix)) return;
  const bl = checkBlacklist(message.author.id);
  if (bl) return message.reply(`❌ You are globally blacklisted. **Reason:** ${bl.reason || 'No reason'}`);
  const args = message.content.slice(prefix.length).trim().split(/\s+/);
  const cmdName = args.shift().toLowerCase();
  const cmd = client.prefixCommands.get(cmdName);
  if (!cmd) return;
  try { await cmd.executePrefix(message, args, client); }
  catch (e) { console.error('[Prefix error]', e); message.reply('❌ An error occurred.').catch(() => {}); }
});

// Temp punishment expiry
cron.schedule('* * * * *', async () => {
  for (const p of getExpiredPunishments()) {
    try {
      const guild = await client.guilds.fetch(p.guild_id).catch(() => null);
      if (!guild) { removeTempPunishment(p.id); continue; }
      if (p.type === 'mute' && p.role_id) {
        const member = await guild.members.fetch(p.user_id).catch(() => null);
        if (member) await member.roles.remove(p.role_id).catch(() => {});
      } else if (p.type === 'ban') {
        await guild.members.unban(p.user_id, 'Temp ban expired').catch(() => {});
      }
      removeTempPunishment(p.id);
    } catch {}
  }
});

client.login(process.env.DISCORD_TOKEN)
  .then(() => console.log(`[Lumora] ✅ Logged in as ${client.user.tag}`))
  .catch(e => { console.error('[Lumora] Login failed:', e.message); process.exit(1); });

module.exports = client;
