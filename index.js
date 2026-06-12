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
// CLIENTE
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
let rolePriority = {}; // 🔥 prioridad de roles

if (fs.existsSync(CONFIG_PATH)) {
    try {
        const data = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
        roleConfigs = data.roleConfigs || {};
        rolePriority = data.rolePriority || {};
    } catch (err) {
        console.error('❌ Error cargando config.json:', err);
    }
}

function saveConfig() {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify({
        roleConfigs,
        rolePriority
    }, null, 2));
}

// ─────────────────────────────
// COOLDOWN ANTI RATE LIMIT
// ─────────────────────────────
const cooldown = new Map();

// ─────────────────────────────
// LIMPIEZA
// ─────────────────────────────
function cleanText(text) {
    return String(text)
        .replace(/<@!?&?\d+>/g, '')
        .replace(/[`<>@]/g, '')
        .trim();
}

// ─────────────────────────────
// FORMATO
// ─────────────────────────────
function formatNick(format, member) {

    const uname = cleanText(member.user.username);
    const gname = cleanText(member.guild.name);

    return format
        .replaceAll('{uname}', uname)
        .replaceAll('{gname}', gname)
        .slice(0, 32);
}

// ─────────────────────────────
// OBTENER MEJOR ROL (PRIORIDAD)
// ─────────────────────────────
function getBestRole(member, guildId) {

    const configs = roleConfigs[guildId];
    if (!configs) return null;

    let bestRole = null;
    let bestPriority = -1;

    for (const roleId of Object.keys(configs)) {

        if (member.roles.cache.has(roleId)) {

            const priority = rolePriority[guildId]?.[roleId] ?? 0;

            if (priority > bestPriority) {
                bestPriority = priority;
                bestRole = roleId;
            }
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
// COMANDOS
// ─────────────────────────────
client.on('messageCreate', async (message) => {

    if (message.author.bot) return;

    const prefix = ',';
    if (!message.content.startsWith(prefix)) return;

    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const command = args.shift();

    // ─────────────────────────────
    // ADD ROLE FORMAT
    // ─────────────────────────────
    if (command === 'add-role-nickname') {

        if (!message.member.permissions.has('Administrator')) {
            return message.reply('❌ No tienes permisos.');
        }

        const role = message.mentions.roles.first();

        if (!role) {
            return message.reply('❌ Debes mencionar un rol válido.');
        }

        const format = message.content
            .split(' ')
            .slice(2)
            .join(' ')
            .trim();

        if (!format) {
            return message.reply('❌ Uso: ,add-role-nickname @rol BD {uname} | {gname}');
        }

        const guildId = message.guild.id;

        if (!roleConfigs[guildId]) roleConfigs[guildId] = {};
        if (!rolePriority[guildId]) rolePriority[guildId] = {};

        roleConfigs[guildId][role.id] = format;

        // prioridad automática (si no existe)
        if (!rolePriority[guildId][role.id]) {
            rolePriority[guildId][role.id] = Object.keys(roleConfigs[guildId]).length;
        }

        saveConfig();

        return message.reply(`✅ Guardado para ${role.name}: ${format}`);
    }

    // ─────────────────────────────
    // REFRESH
    // ─────────────────────────────
    if (command === 'refresh-nicknames') {

        if (!message.member.permissions.has('Administrator')) {
            return message.reply('❌ No tienes permisos.');
        }

        const guildId = message.guild.id;

        if (!roleConfigs[guildId]) {
            return message.reply('❌ No hay configuraciones.');
        }

        await message.reply('⏳ Actualizando nicknames...');

        await message.guild.members.fetch();

        let updated = 0;

        for (const member of message.guild.members.cache.values()) {

            if (member.user.bot || !member.manageable) continue;

            const roleId = getBestRole(member, guildId);
            if (!roleId) continue;

            const format = roleConfigs[guildId][roleId];
            const newNick = formatNick(format, member);

            // 🔥 evita rate limit
            const last = cooldown.get(member.id) || 0;
            if (Date.now() - last < 3000) continue;

            try {
                if (member.nickname === newNick) continue; // 🔥 evita cambios inútiles

                await member.setNickname(newNick);
                cooldown.set(member.id, Date.now());
                updated++;

            } catch (err) {
                console.error(err);
            }
        }

        return message.channel.send(`✅ Nicknames actualizados: ${updated}`);
    }
});

// ─────────────────────────────
// UPDATE ROLES
// ─────────────────────────────
client.on('guildMemberUpdate', async (oldMember, newMember) => {

    const guildId = newMember.guild.id;
    if (!roleConfigs[guildId]) return;

    const roleId = getBestRole(newMember, guildId);
    if (!roleId) return;

    const format = roleConfigs[guildId][roleId];
    const newNick = formatNick(format, newMember);

    if (!newMember.manageable) return;

    // 🔥 anti rate limit
    const last = cooldown.get(newMember.id) || 0;
    if (Date.now() - last < 3000) return;

    try {
        if (newMember.nickname === newNick) return; // 🔥 evita spam

        await newMember.setNickname(newNick);
        cooldown.set(newMember.id, Date.now());

        console.log(`🏷️ Nick actualizado: ${newNick}`);

    } catch (err) {
        console.error(err);
    }
});

// ─────────────────────────────
// LOGIN
// ─────────────────────────────
client.login(token);
