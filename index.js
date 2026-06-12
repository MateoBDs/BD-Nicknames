import {
    Client,
    GatewayIntentBits
} from 'discord.js';

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
        const data = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
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
// FORMAT NICK
// ─────────────────────────────
function formatNick(format, member) {

    const uname = cleanText(member.user.username);

    // 🔥 GLOBAL NAME REAL DEL USUARIO
    const gname = cleanText(member.displayName);

    // opcional server name
    const server = cleanText(member.guild.name);

    let result = format
        .replaceAll('{uname}', uname)
        .replaceAll('{gname}', gname)
        .replaceAll('{server}', server)
        .replace(/\s+/g, ' ')
        .trim();

    return result.length > 32 ? result.slice(0, 32) : result;
}

// ─────────────────────────────
// GET BEST ROLE
// ─────────────────────────────
function getBestRole(member, guildId) {

    const configs = roleConfigs[guildId];
    if (!configs) return null;

    let bestRole = null;
    let bestPriority = -Infinity;

    for (const roleId of Object.keys(configs)) {

        if (!member.roles.cache.has(roleId)) continue;

        const priority = rolePriority[guildId]?.[roleId] ?? 0;

        if (priority > bestPriority) {
            bestPriority = priority;
            bestRole = roleId;
        }
    }

    return bestRole;
}

// ─────────────────────────────
// READY
// ─────────────────────────────
client.once('ready', () => {
    console.log(`✅ Bot listo como ${client.user.tag}`);
});

// ─────────────────────────────
// COMMANDS
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
        if (!role) return message.reply('❌ Menciona un rol válido.');

        const priority = parseInt(args[0]) || 1;

        const format = message.content
            .split(' ')
            .slice(3)
            .join(' ')
            .trim();

        if (!format) {
            return message.reply('❌ Uso: ,add-role-nickname 10 @rol BD {uname} | {gname}');
        }

        const guildId = message.guild.id;

        if (!roleConfigs[guildId]) roleConfigs[guildId] = {};
        if (!rolePriority[guildId]) rolePriority[guildId] = {};

        roleConfigs[guildId][role.id] = format;
        rolePriority[guildId][role.id] = priority;

        saveConfig();

        return message.reply(`✅ Guardado: ${role.name} (prio ${priority})`);
    }
});

// ─────────────────────────────
// ROLE UPDATE → ONLY ON CHANGE
// ─────────────────────────────
client.on('guildMemberUpdate', async (oldMember, newMember) => {

    const guildId = newMember.guild.id;
    if (!roleConfigs[guildId]) return;

    const oldRoles = new Set(oldMember.roles.cache.keys());
    const newRoles = new Set(newMember.roles.cache.keys());

    const changed =
        oldRoles.size !== newRoles.size ||
        [...oldRoles].some(r => !newRoles.has(r)) ||
        [...newRoles].some(r => !oldRoles.has(r));

    if (!changed) return;

    const roleId = getBestRole(newMember, guildId);
    if (!roleId) return;

    const format = roleConfigs[guildId][roleId];
    const newNick = formatNick(format, newMember);

    if (!newMember.manageable) return;

    const last = cooldown.get(newMember.id) || 0;
    if (Date.now() - last < 3000) return;

    try {

        if (newMember.nickname === newNick) return;

        await newMember.setNickname(newNick);
        cooldown.set(newMember.id, Date.now());

        console.log(`🏷️ Nick actualizado: ${newNick}`);

    } catch (err) {
        console.error('❌ Error nickname:', err);
    }
});

// ─────────────────────────────
// LOGIN
// ─────────────────────────────
client.login(token);
