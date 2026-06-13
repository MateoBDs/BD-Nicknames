import { Client, GatewayIntentBits } from 'discord.js';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

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
// CONFIG
// ─────────────────────────────
const CONFIG_PATH = path.join(process.cwd(), 'config.json');

let roleConfigs = {};
let rolePriority = {};

if (fs.existsSync(CONFIG_PATH)) {
    try {
        const data = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
        roleConfigs = data.roleConfigs || {};
        rolePriority = data.rolePriority || {};
    } catch (err) {
        console.error('❌ Error config.json:', err);
    }
}

function saveConfig() {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify({
        roleConfigs,
        rolePriority
    }, null, 2));
}

// ─────────────────────────────
// COOLDOWN
// ─────────────────────────────
const cooldown = new Map();

// ─────────────────────────────
// CLEAN TEXT
// ─────────────────────────────
function cleanText(text) {
    return String(text)
        .replace(/<@!?&?\d+>/g, '')
        .replace(/[`<>@]/g, '')
        .trim();
}

// ─────────────────────────────
// FORMAT NICKNAME
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
// BEST ROLE (FIXED)
// ─────────────────────────────
function getBestRole(member, guildId) {

    const configs = roleConfigs[guildId];
    const priorities = rolePriority[guildId];

    if (!configs || !priorities) return null;

    let bestRole = null;
    let bestPriority = -Infinity;

    for (const roleId of Object.keys(configs)) {

        if (!member.roles.cache.has(roleId)) continue;

        const priority = Number(priorities[roleId]);

        if (isNaN(priority)) continue;

        if (priority > bestPriority) {
            bestPriority = priority;
            bestRole = roleId;
        }
    }

    return bestRole;
}

// ─────────────────────────────
// APPLY NICKNAME
// ─────────────────────────────
async function applyNickname(member) {

    if (member.user.bot) return;
    if (!member.manageable) return;

    const guildId = member.guild.id;

    const roleId = getBestRole(member, guildId);
    if (!roleId) return;

    const format = roleConfigs[guildId]?.[roleId];
    if (!format) return;

    const last = cooldown.get(member.id) || 0;
    if (Date.now() - last < 3000) return;

    const newNick = formatNick(format, member);

    if (member.nickname === newNick) return;

    try {
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
// MESSAGE COMMANDS
// ─────────────────────────────
client.on('messageCreate', async (message) => {

    if (message.author.bot) return;

    const prefix = ',';
    if (!message.content.startsWith(prefix)) return;

    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const command = args.shift();

    // ─────────────────────────────
    // ADD ROLE NICKNAME
    // ─────────────────────────────
    if (command === 'add-role-nickname') {

        if (!message.member.permissions.has('Administrator')) {
            return message.reply('❌ No tienes permisos.');
        }

        const role = message.mentions.roles.first();
        if (!role) return message.reply('❌ Menciona un rol.');

        const priority = Number(args[0]) || 1;

        const format = message.content
            .split(' ')
            .slice(3)
            .join(' ')
            .trim();

        if (!format) {
            return message.reply('❌ Uso: ,add-role-nickname 10 @rol BD {gname}');
        }

        const guildId = message.guild.id;

        if (!roleConfigs[guildId]) roleConfigs[guildId] = {};
        if (!rolePriority[guildId]) rolePriority[guildId] = {};

        roleConfigs[guildId][role.id] = format;
        rolePriority[guildId][role.id] = priority;

        saveConfig();

        await message.reply(`✅ Guardado: ${role.name} (prio ${priority})`);

        await message.guild.members.fetch();

        for (const member of message.guild.members.cache.values()) {
            await applyNickname(member);
        }
    }
});

// ─────────────────────────────
// ROLE UPDATE EVENT
// ─────────────────────────────
client.on('guildMemberUpdate', async (oldMember, newMember) => {

    const oldRoles = oldMember.roles.cache;
    const newRoles = newMember.roles.cache;

    const changed =
        oldRoles.size !== newRoles.size ||
        [...oldRoles.keys()].some(r => !newRoles.has(r)) ||
        [...newRoles.keys()].some(r => !oldRoles.has(r));

    if (!changed) return;

    await applyNickname(newMember);
});

// ─────────────────────────────
// LOGIN
// ─────────────────────────────
client.login(token);

