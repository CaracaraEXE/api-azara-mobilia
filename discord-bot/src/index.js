/**
 * Bot de Discord - Azara
 * 
 * Comandos:
 * - /buscar [término] - Busca libros por título
 * - /libro [id] - Muestra un libro específico
 * - /categorias - Lista las categorías disponibles
 * 
 * Uso: npm start
 */

require('dotenv').config();
const { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes } = require('discord.js');

// Configuración
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const API_URL = process.env.API_URL || 'http://localhost:3000';

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// Cuando el bot esté listo
client.on('ready', () => {
  console.log(`🤖 Bot conectado como ${client.user.tag}`);
});

// Manejar interacciones (comandos slash)
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  
  const { commandName } = interaction;
  
  try {
    switch (commandName) {
      case 'buscar':
        await comandoBuscar(interaction);
        break;
      case 'libro':
        await comandoLibro(interaction);
        break;
      case 'categorias':
        await comandoCategorias(interaction);
        break;
      default:
        await interaction.reply('Comando no reconocido.');
    }
  } catch (error) {
    console.error(error);
    await interaction.reply('❌ Hubo un error al ejecutar el comando.');
  }
});

// Comando: /buscar
async function comandoBuscar(interaction) {
  const termino = interaction.options.getString('termino');
  
  await interaction.deferReply();
  
  try {
    const respuesta = await fetch(`${API_URL}/api/libros?busqueda=${encodeURIComponent(termino)}&limite=5`);
    const datos = await respuesta.json();
    
    if (!datos.success || datos.data.length === 0) {
      return interaction.editReply(`No encontré libros para "${termino}".`);
    }
    
    const embed = {
      title: `🔍 Resultados para "${termino}"`,
      color: 0x00AE86,
      fields: datos.data.map(libro => ({
        name: libro.titulo,
        value: `📁 ${libro.categoria}${libro.linkPdf ? '\n📄 [Descargar PDF](<' + libro.linkPdf + '>)' : ''}`
      }))
    };
    
    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    await interaction.editReply('❌ Error al conectar con la API.');
  }
}

// Comando: /libro
async function comandoLibro(interaction) {
  const id = interaction.options.getString('id');
  
  await interaction.deferReply();
  
  try {
    const respuesta = await fetch(`${API_URL}/api/libros/${id}`);
    const datos = await respuesta.json();
    
    if (!datos.success) {
      return interaction.editReply(`No encontré un libro con ID "${id}".`);
    }
    
    const libro = datos.data;
    const embed = {
      title: libro.titulo,
      color: 0x00AE86,
      fields: [
        { name: '📁 Categoría', value: libro.categoria, inline: true },
        { name: '✍️ Autor', value: libro.autor || 'Desconocido', inline: true },
        { name: '📅 Año', value: libro.anio || 'Desconocido', inline: true },
        { name: '📄 Descripción', value: libro.descripcion || 'Sin descripción' }
      ],
      image: libro.imagenPortada ? { url: libro.imagenPortada } : null
    };
    
    if (libro.linkPdf) {
      embed.url = libro.linkPdf;
    }
    
    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    await interaction.editReply('❌ Error al conectar con la API.');
  }
}

// Comando: /categorias
async function comandoCategorias(interaction) {
  await interaction.deferReply();
  
  try {
    const respuesta = await fetch(`${API_URL}/api/libros/categorias/lista`);
    const datos = await respuesta.json();
    
    if (!datos.success) {
      return interaction.editReply('Error al obtener las categorías.');
    }
    
    const embed = {
      title: '📚 Categorías de la Fundación Azara',
      color: 0x00AE86,
      fields: datos.data.map(cat => ({
        name: cat.nombre,
        value: `${cat.cantidad} libros`
      }))
    };
    
    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    await interaction.editReply('❌ Error al conectar con la API.');
  }
}

// Registrar comandos slash (solo ejecutar una vez para registrar)
async function registrarComandos() {
  const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
  
  const comandos = [
    new SlashCommandBuilder()
      .setName('buscar')
      .setDescription('Buscar libros por término')
      .addStringOption(option => 
        option.setName('termino')
          .setDescription('Término de búsqueda')
          .setRequired(true)
      ),
    new SlashCommandBuilder()
      .setName('libro')
      .setDescription('Ver detalles de un libro')
      .addStringOption(option => 
        option.setName('id')
          .setDescription('ID del libro')
          .setRequired(true)
      ),
    new SlashCommandBuilder()
      .setName('categorias')
      .setDescription('Ver categorías disponibles')
  ];
  
  try {
    await rest.put(
      Routes.applicationCommands(CLIENT_ID),
      { body: comandos.map(cmd => cmd.toJSON()) }
    );
    console.log('✅ Comandos registrados correctamente');
  } catch (error) {
    console.error('❌ Error al registrar comandos:', error);
  }
}

// Iniciar sesión
client.login(DESCORD_TOKEN);

// Registrar comandos al iniciar (descomentar para registrar por primera vez)
// registrarComandos();
