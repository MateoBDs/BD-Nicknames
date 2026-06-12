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
// COMANDOS PREFIX (,)
// ─────────────────────────────
client.on('messageCreate', async (message) => {

    console.log("MENSAJE:", message.content);

    if (message.author.bot) return;

    const prefix = ',';

    if (!message.content.startsWith(prefix)) return;

    const args = message.content.slice(prefix.length).trim().split(' ');
    const command = args.shift();

    // ─────────────────────────────
    // ADD ROLE NICKNAME
    // ─────────────────────────────
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

    // ─────────────────────────────
    // REFRESH NICKNAMES
    // ─────────────────────────────
    if (command === 'refresh-nicknames') {

        if (!message.member.permissions.has('Administrator')) {
            return message.reply('❌ No tienes permisos.');
        }

        const guildId = message.guild.id;

        if (!roleConfigs[guildId]) {
            return message.reply('❌ No hay configuraciones guardadas.');
        }

        await message.reply('⏳ Actualizando nicknames...');

        await message.guild.members.fetch();

        let updated = 0;

        for (const member of message.guild.members.cache.values()) {

            if (member.user.bot) continue;
            if (!member.manageable) continue;

            for (const roleId of Object.keys(roleConfigs[guildId])) {

                if (member.roles.cache.has(roleId)) {

                    const format = roleConfigs[guildId][roleId];
                    const newNick = format.replace('{uname}', member.user.username);

                    try {
                        await member.setNickname(newNick.slice(0, 32));
                        updated++;
                    } catch (err) {
                        console.error(err);
                    }

                    break;
                }
            }
        }

        return message.channel.send(`✅ Nicknames actualizados: ${updated}`);
    }
});

// ─────────────────────────────
// CAMBIO DE ROLES → CAMBIO NICK
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
