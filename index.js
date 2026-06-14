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
// CONFIG ROLES
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
// TICKETS SYSTEM
// ─────────────────────────────
const activeTickets = new Map();
const closedTickets = new Set();

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
// BEST ROLE
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

        if (!Number.isFinite(priority)) continue;

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

    const guildId = member.guild.id;
   if (!ALLOWED_GUILD_IDS.includes(guildId)) return;

    const roleId = getBestRole(member, guildId);
    if (!roleId) return;

    const format = roleConfigs[guildId]?.[roleId];
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

        const priority = Number(args[0]) || 1;

        const format = message.content
            .split(' ')
            .slice(3)
            .join(' ')
            .trim();

        const guildId = message.guild.id;

        if (!roleConfigs[guildId]) roleConfigs[guildId] = {};
        if (!rolePriority[guildId]) rolePriority[guildId] = {};

        roleConfigs[guildId][role.id] = format;
        rolePriority[guildId][role.id] = priority;

        saveConfig();

        await message.reply(`✅ Guardado: ${role.name}`);

// await message.guild.members.fetch();
// for (const member of message.guild.members.cache.values()) {
//     await applyNickname(member);
// }
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

    // ─────────────────────────────
    // RECLAMAR
    // ─────────────────────────────
    if (command === 'reclamar') {

        const channel = message.channel;

        if (!channel.name.includes('ticket')) {
            return message.reply('❌ Esto solo funciona en tickets.');
        }

        await channel.setTopic(`🟢 Reclamado por ${message.author.tag}`);
        await channel.send(`🎫 Reclamado por ${message.author}`);
    }

    // ─────────────────────────────
    // CERRAR
    // ─────────────────────────────
    if (command === 'cerrar') {

        const key = [...activeTickets.entries()]
            .find(([k, id]) => id === message.channel.id);

        if (key) {
            activeTickets.delete(key[0]);
        }

        closedTickets.add(message.author.id);

        await message.reply('🔒 Cerrando ticket...');
        await message.channel.delete().catch(() => {});
    }

    // ─────────────────────────────
    // RESET TICKETS
    // ─────────────────────────────
    if (command === 'reset-tickets') {

        if (!message.member.permissions.has('Administrator')) {
            return message.reply('❌ Sin permisos.');
        }

        activeTickets.clear();
        closedTickets.clear();

        message.reply('🧹 Tickets reseteados.');
    }

    // ─────────────────────────────
    // REVIEW ⭐
    // ─────────────────────────────
    if (command === 'review') {

        const stars = parseInt(args[0]);
        const comment = args.slice(1).join(' ') || 'Sin comentario';

        if (!stars || stars < 1 || stars > 5) {
            return message.reply('❌ Usa: .review 1-5 comentario');
        }

        const channel = message.guild.channels.cache.get(REVIEW_CHANNEL_ID);
        if (!channel) return message.reply('❌ Canal de reviews no configurado.');

        const starText = '⭐'.repeat(stars);

        const embed = {
            color: 0xffd700,
            title: "⭐ Nueva valoración de ticket",
            fields: [
                { name: "Usuario", value: message.author.tag, inline: true },
                { name: "Estrellas", value: starText, inline: true },
                { name: "Comentario", value: comment }
            ],
            timestamp: new Date()
        };

        channel.send({ embeds: [embed] });

        message.reply('✅ Gracias por tu valoración!');
    }
});

// ─────────────────────────────
// ROLE UPDATE
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

    for (const member of newMember.guild.members.cache.values()) {

        await applyNickname(member);

        // Pequeña pausa para evitar rate limits
        await new Promise(resolve => setTimeout(resolve, 100));
    }
});
// ─────────────────────────────
// ANTI ERROR
// ─────────────────────────────
client.on('error', console.error);

process.on('unhandledRejection', error => {
    console.error('Unhandled promise rejection:', error);
});

// ─────────────────────────────
// LOGIN
// ─────────────────────────────
client.login(token);
