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
// CLIENTE DISCORD
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

if (fs.existsSync(CONFIG_PATH)) {
    try {
        roleConfigs = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    } catch (err) {
        console.error('❌ Error cargando config.json:', err);
    }
}

function saveConfig() {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(roleConfigs, null, 2));
}

// ─────────────────────────────
// READY
// ─────────────────────────────
client.once('ready', () => {
    console.log(`✅ Bot listo como ${client.user.tag}`);
});

// ─────────────────────────────
// COMANDO PREFIJO ( , )
// ─────────────────────────────
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    const prefix = ','; // 👈 PREFIJO CAMBIADO A COMA
    if (!message.content.startsWith(prefix)) return;

    const args = message.content.slice(prefix.length).trim().split(' ');
    const command = args.shift();

    if (command === 'add-role-nickname') {

        if (!message.member.permissions.has('Administrator')) {
            return message.reply('❌ No tienes permisos.');
        }

        const role = message.mentions.roles.first();
        const format = args.slice(1).join(' ');

        if (!role || !format) {
            return message.reply('❌ Uso: ,add-role-nickname @rol [VIP] {uname}');
        }

        const guildId = message.guild.id;
        if (!roleConfigs[guildId]) roleConfigs[guildId] = {};

        roleConfigs[guildId][role.id] = format;
        saveConfig();

        return message.reply(`✅ Guardado para ${role.name}: ${format}`);
    }
});

// ─────────────────────────────
// CAMBIO DE NICKNAME
// ─────────────────────────────
client.on('guildMemberUpdate', async (oldMember, newMember) => {

    const guildId = newMember.guild.id;
    if (!roleConfigs[guildId]) return;

    const addedRoles = newMember.roles.cache.filter(
        role => !oldMember.roles.cache.has(role.id)
    );

    if (!addedRoles.size) return;

    for (const [roleId] of addedRoles) {
        const format = roleConfigs[guildId][roleId];

        if (format) {
            const newNick = format.replace('{uname}', newMember.user.username);

            try {
                if (newMember.manageable) {
                    await newMember.setNickname(newNick.slice(0, 32));
                    console.log(`🏷️ Nick cambiado a ${newNick}`);
                }
            } catch (err) {
                console.error('❌ Error cambiando nick:', err);
            }

            break;
        }
    }
});

client.login(token);
