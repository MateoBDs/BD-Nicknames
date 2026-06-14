import { Client, GatewayIntentBits } from 'discord.js';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

// ─────────────────────────────
// PRIVADO
// ─────────────────────────────
const ALLOWED_GUILD_IDS = [
    "1511755312162668815",
    "1515342135636004977"
];

const REVIEW_CHANNEL_ID = "1515299796414369883";

// ─────────────────────────────
// TOKEN
// ─────────────────────────────
const token = process.env.DISCORD_TOKEN;

if (!token) {
    console.error('❌ DISCORD_TOKEN no configurado');
    process.exit(1);
}

// ─────────────────────────────
// CLIENT
// ─────────────────────────────
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// ─────────────────────────────
// CONFIG ROLES (SOLO FORMATOS)
// ─────────────────────────────
const CONFIG_PATH = path.join(process.cwd(), 'config.json');

let roleConfigs = {};

if (fs.existsSync(CONFIG_PATH)) {
    try {
        const data = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
        roleConfigs = data.roleConfigs || {};
    } catch (err) {
        console.error('❌ Error config.json:', err);
    }
}

function saveConfig() {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify({
        roleConfigs
    }, null, 2));
}

// ─────────────────────────────
// TICKETS SYSTEM
// ─────────────────────────────
const activeTickets = new Map();

function getTicketKey(guildId, userId) {
    return `${guildId}-${userId}`;
}

// ─────────────────────────────
// COOLDOWN
// ─────────────────────────────
const cooldown = new Map();

// ─────────────────────────────
// CLEAN
// ─────────────────────────────
function cleanText(text) {
    return String(text)
        .replace(/<@!?&?\d+>/g, '')
        .replace(/[`<>@]/g, '')
        .trim();
}

// ─────────────────────────────
// FORMAT NICK
// ─────────────────────────────
function formatNick(format, member) {

    const uname = cleanText(member.user.username);
    const gname = cleanText(member.user.globalName ?? member.user.username);
    const server = cleanText(member.guild.name);

    return format
        .replaceAll('{uname}', uname)
        .replaceAll('{gname}', gname)
        .replaceAll('{server}', server)
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 32);
}

// ─────────────────────────────
// BEST ROLE (POR POSICIÓN REAL)
// ─────────────────────────────
function getBestRole(member, guildId) {

    let bestRole = null;
    let highestPosition = -1;

    for (const role of member.roles.cache.values()) {

        if (role.id === guildId) continue; // @everyone

        if (!roleConfigs[guildId]?.[role.id]) continue;

        if (role.position > highestPosition) {
            highestPosition = role.position;
            bestRole = role.id;
        }
    }

    return bestRole;
}

// ─────────────────────────────
// APPLY NICKNAME
// ─────────────────────────────
async function applyNickname(member) {

    if (member.user.bot) return;
    if (!ALLOWED_GUILD_IDS.includes(member.guild.id)) return;

    const roleId = getBestRole(member, member.guild.id);
    if (!roleId) return;

    const format = roleConfigs[member.guild.id]?.[roleId];
    if (!format) return;

    const last = cooldown.get(member.id) || 0;
    if (Date.now() - last < 3000) return;

    const newNick = formatNick(format, member);

    if (member.nickname === newNick) return;

    try {
        if (!member.manageable) return;
        await member.setNickname(newNick);
        cooldown.set(member.id, Date.now());
    } catch (err) {
        console.error('❌ Nick error:', err.message);
    }
}

// ─────────────────────────────
// READY
// ─────────────────────────────
client.once('ready', () => {
    console.log(`✅ Bot listo como ${client.user.tag}`);
});

// ─────────────────────────────
// AUTO LEAVE
// ─────────────────────────────
client.on('guildCreate', guild => {
    if (!ALLOWED_GUILD_IDS.includes(guild.id)) {
        guild.leave();
    }
});

// ─────────────────────────────
// MESSAGE COMMANDS
// ─────────────────────────────
client.on('messageCreate', async (message) => {

    if (message.author.bot) return;
    if (!ALLOWED_GUILD_IDS.includes(message.guild?.id)) return;

    const prefix = '.';
    if (!message.content.startsWith(prefix)) return;

    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const command = args.shift();

    // ─────────────────────────────
    // ROLES
    // ─────────────────────────────
    if (command === 'add-role-nickname') {

        const role = message.mentions.roles.first();
        if (!role) return message.reply('❌ Menciona un rol.');

        const format = message.content
            .split(' ')
            .slice(2)
            .join(' ')
            .trim();

        const guildId = message.guild.id;

        if (!roleConfigs[guildId]) roleConfigs[guildId] = {};

        roleConfigs[guildId][role.id] = format;

        saveConfig();

        await message.reply(`✅ Guardado: ${role.name}`);

        // opcional: aplicar a todos
        await message.guild.members.fetch();
        for (const member of message.guild.members.cache.values()) {
            await applyNickname(member);
            await new Promise(r => setTimeout(r, 100));
        }
    }

    // ─────────────────────────────
    // TICKET CREATE
    // ─────────────────────────────
    if (command === 'ticket') {

        const key = getTicketKey(message.guild.id, message.author.id);

        if (activeTickets.has(key)) {
            return message.reply('❌ Ya tienes un ticket abierto.');
        }

        const channel = await message.guild.channels.create({
            name: `ticket-${message.author.username}`,
            topic: `Ticket de ${message.author.tag}`
        });

        activeTickets.set(key, channel.id);

        await channel.send(`🎫 Ticket creado por ${message.author}`);
    }
});

// ─────────────────────────────
// ROLE UPDATE (OPTIMIZADO)
// ─────────────────────────────
client.on('guildMemberUpdate', async (oldMember, newMember) => {

    if (!ALLOWED_GUILD_IDS.includes(newMember.guild.id)) return;

    const oldRoles = oldMember.roles.cache;
    const newRoles = newMember.roles.cache;

    const changed =
        oldRoles.size !== newRoles.size ||
        [...oldRoles.keys()].some(r => !newRoles.has(r)) ||
        [...newRoles.keys()].some(r => !oldRoles.has(r));

    if (!changed) return;

    console.log(`🔄 Roles actualizados en ${newMember.guild.name}`);

    await applyNickname(newMember);
});

// ─────────────────────────────
// LOGIN
// ─────────────────────────────
client.login(token);
