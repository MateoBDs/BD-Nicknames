import {
    Client,
    GatewayIntentBits,
    REST,
    Routes,
    SlashCommandBuilder,
    PermissionFlagsBits,
    Events
} from 'discord.js';

import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

// ─────────────────────────────
// VARIABLES DE ENTORNO
// ─────────────────────────────
const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;

if (!token) {
    console.error('❌ DISCORD_TOKEN no configurado');
    process.exit(1);
}

if (!clientId) {
    console.error('❌ CLIENT_ID no configurado');
    process.exit(1);
}

// ─────────────────────────────
// CLIENTE DISCORD
// ─────────────────────────────
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers
    ]
});

// ─────────────────────────────
// CONFIGURACIÓN PERSISTENTE
// ─────────────────────────────
const CONFIG_PATH = path.join(process.cwd(), 'config.json');
let roleConfigs = {};

if (fs.existsSync(CONFIG_PATH)) {
    try {
        roleConfigs = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    } catch (err) {
        console.error('❌ Error al cargar config.json:', err);
    }
}

function saveConfig() {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(roleConfigs, null, 2));
}

// ─────────────────────────────
// SLASH COMMANDS
// ─────────────────────────────
const commands = [
    new SlashCommandBuilder()
        .setName('add-role-nickname')
        .setDescription('Configura un prefijo de apodo para un rol')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addRoleOption(option =>
            option.setName('rol')
                .setDescription('Rol a configurar')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('formato')
                .setDescription('Ej: [VIP] {uname}')
                .setRequired(true))
].map(cmd => cmd.toJSON());

// ─────────────────────────────
// READY EVENT (REGISTRO COMANDOS)
// ─────────────────────────────
client.once(Events.ClientReady, async () => {
    console.log(`✅ Bot listo como ${client.user.tag}`);

    console.log("CLIENT_ID:", clientId);
    console.log("TOKEN OK:", !!token);
    console.log("COMMANDS:", commands);

    const rest = new REST({ version: '10' }).setToken(token);

    try {
        console.log('🔄 Registrando comandos de barra...');

        const result = await rest.put(
            Routes.applicationCommands(clientId),
            { body: commands }
        );

        console.log('📦 Respuesta Discord:', result);
        console.log('✅ Comandos registrados con éxito');

    } catch (error) {
        console.error('❌ Error al registrar comandos:');
        console.error(error);
    }
});

// ─────────────────────────────
// INTERACCIONES (SLASH COMMAND)
// ─────────────────────────────
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'add-role-nickname') {
        const role = interaction.options.getRole('rol');
        const format = interaction.options.getString('formato');

        const guildId = interaction.guildId;
        if (!roleConfigs[guildId]) roleConfigs[guildId] = {};

        roleConfigs[guildId][role.id] = format;
        saveConfig();

        await interaction.reply({
            content: `✅ Configuración guardada para **${role.name}** → \`${format}\``,
            ephemeral: true
        });
    }
});

// ─────────────────────────────
// CAMBIO DE APODO POR ROLES
// ─────────────────────────────
client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
    const guildId = newMember.guild.id;
    if (!roleConfigs[guildId]) return;

    const addedRoles = newMember.roles.cache.filter(
        role => !oldMember.roles.cache.has(role.id)
    );

    if (!addedRoles.size) return;

    for (const [roleId] of addedRoles) {
        const format = roleConfigs[guildId][roleId];

        if (format) {
            const newNickname = format.replace('{uname}', newMember.user.username);

            try {
                if (newMember.manageable) {
                    await newMember.setNickname(newNickname.slice(0, 32));
                    console.log(`🏷️ Nick cambiado: ${newMember.user.tag}`);
                }
            } catch (err) {
                console.error('❌ Error cambiando nick:', err);
            }

            break;
        }
    }
});

// ─────────────────────────────
// LOGIN BOT
// ─────────────────────────────
client.login(token);
