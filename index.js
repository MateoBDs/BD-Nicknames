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
        GatewayIntentBits.GuildMembers
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
// ANTI SPAM COOLDOWN
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
    const gname = cleanText(member.guild.name);

    let result = format
        .replaceAll('{uname}', uname)
        .replaceAll('{gname}', gname)
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
    let bestPriority = -1;

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
// ROLE UPDATE ONLY (AQUÍ ESTÁ TODO EL SISTEMA)
// ─────────────────────────────
client.on('guildMemberUpdate', async (oldMember, newMember) => {

    const guildId = newMember.guild.id;
    if (!roleConfigs[guildId]) return;

    const oldRoles = oldMember.roles.cache;
    const newRoles = newMember.roles.cache;

    const added = newRoles.filter(r => !oldRoles.has(r.id));
    const removed = oldRoles.filter(r => !newRoles.has(r.id));

    // si no hay cambios de roles → no hacer nada
    if (!added.size && !removed.size) return;

    const roleId = getBestRole(newMember, guildId);
    if (!roleId) return;

    const format = roleConfigs[guildId][roleId];
    if (!format) return;

    const newNick = formatNick(format, newMember);

    // anti spam
    const last = cooldown.get(newMember.id) || 0;
    if (Date.now() - last < 3000) return;

    try {

        if (!newMember.manageable) return;

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
