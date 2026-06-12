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

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers
    ]
});

if (!token) {
    console.error('❌ DISCORD_TOKEN no configurado');
    process.exit(1);
}

const CONFIG_PATH = path.join(process.cwd(), 'config.json');
let roleConfigs = {};

// Cargar configuración persistente
if (fs.existsSync(CONFIG_PATH)) {
    try {
    await rest.put(
        Routes.applicationCommands(clientId),
        { body: commands }
    );

    console.log('✅ Comandos registrados con éxito');

} catch (error) {
    console.error('❌ Error:', error);
}

function saveConfig() {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(roleConfigs, null, 2));
}

// Registrar comandos
const commands = [
    new SlashCommandBuilder()
        .setName('add-role-nickname')
        .setDescription('Configura un prefijo de apodo para un rol')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addRoleOption(option => 
            option.setName('rol')
                .setDescription('El rol al que aplicar el formato')
                .setRequired(true))
        .addStringOption(option => 
            option.setName('formato')
                .setDescription('Formato del apodo (ej: [VIP] {uname})')
                .setRequired(true))
].map(command => command.toJSON());

client.once(Events.ClientReady, async () => {
    console.log(`✅ Bot listo como ${client.user.tag}`);
    
    if (clientId) {
        const rest = new REST({ version: '10' }).setToken(token);
        try {
            console.log('🔄 Registrando comandos de barra...');
            
            await rest.put(
                Routes.applicationCommands(clientId),
                { body: commands }
            );

            console.log('✅ Comandos registrados con éxito');
        } catch (error) {
            console.error('❌ Error al registrar comandos:', error);
        }
    } else {
        console.warn('⚠️ CLIENT_ID no configurado');
    }
});
            console.log('✅ Comandos registrados con éxito');
        } catch (error) {
            console.error('❌ Error al registrar comandos:', error);
        }
    } else {
        console.warn('⚠️ CLIENT_ID no configurado, no se registraron comandos automáticamente.');
    }
});

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
            content: `✅ Configuración guardada para el rol **${role.name}**. Formato: \`${format}\``,
            ephemeral: true 
        });
    }
});

// Evento cuando cambian los roles de un miembro
client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
    const guildId = newMember.guild.id;
    if (!roleConfigs[guildId]) return;

    const addedRoles = newMember.roles.cache.filter(role => !oldMember.roles.cache.has(role.id));
    
    if (addedRoles.size > 0) {
        for (const [roleId, role] of addedRoles) {
            const format = roleConfigs[guildId][roleId];
            if (format) {
                const newNickname = format.replace('{uname}', newMember.user.username);
                
                try {
                    // Solo intentar si el bot tiene permisos y el rol es menor al del bot
                    if (newMember.manageable) {
                        await newMember.setNickname(newNickname.slice(0, 32));
                        console.log(`🏷️ Apodo cambiado a ${newNickname} para ${newMember.user.tag}`);
                    } else {
                        console.warn(`⚠️ No puedo cambiar el apodo de ${newMember.user.tag} (permisos insuficientes o jerarquía)`);
                    }
                } catch (err) {
                    console.error(`❌ Error al cambiar apodo para ${newMember.user.tag}:`, err);
                }
                break; // Aplicar solo el primer formato encontrado de los roles añadidos
            }
        }
    }
});

client.login(token);
