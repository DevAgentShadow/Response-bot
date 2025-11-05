// index.js
// Entry point: loads config.json, validates config, initializes storage (MongoDB or local SQLite),
// dynamically loads command handlers from ./commands, and starts the Discord bot.

const fs = require('fs');
const path = require('path');
const { Client, IntentsBitField, EmbedBuilder, PermissionsBitField } = require('discord.js');

// load JSON config (config.json)
const config = require('./config.json');

if (!config.token || !config.clientId) {
  console.error('Missing token or clientId in config.json. Exiting.');
  process.exit(1);
}

const PREFIX = config.prefix || '!';
const MATCH_MODE = config.matchMode || 'exact';
const LOG_LEVEL = config.logLevel || 'info';

const log = {
  debug: (...a) => { if (LOG_LEVEL === 'debug') console.debug('[debug]', ...a); },
  info:  (...a) => { if (['debug','info'].includes(LOG_LEVEL)) console.info('[info]', ...a); },
  warn:  (...a) => { if (['debug','info','warn'].includes(LOG_LEVEL)) console.warn('[warn]', ...a); },
  error: (...a) => { console.error('[error]', ...a); }
};

let storageClient = null;
let storageType = null;

async function initStorage(storageConfig) {
  if (!storageConfig) throw new Error('storage is not configured in config.json');

  // Normalize strings: detect Mongo connection strings; else treat as local path
  if (typeof storageConfig === 'string' && (storageConfig.startsWith('mongodb://') || storageConfig.startsWith('mongodb+srv://'))) {
    storageType = 'mongo';
    log.info('Initializing MongoDB storage');
    const { MongoClient } = require('mongodb');
    const mongo = new MongoClient(storageConfig, { useNewUrlParser: true, useUnifiedTopology: true });
    await mongo.connect();
    const dbName = config.mongoDbName || (new URL(storageConfig).pathname || '').replace(/^\//, '') || 'discord_bot';
    const db = mongo.db(dbName);
    await db.createCollection('responses').catch(() => {});
    await db.collection('responses').createIndex({ guildId: 1, name: 1 }, { unique: true });
    storageClient = { type: 'mongo', client: mongo, db };
    log.info('MongoDB initialized for DB:', db.databaseName || dbName);
    return storageClient;
  }

  // Otherwise treat storage as local folder path (support Windows backslashes)
  storageType = 'local';
  // If user pasted a Windows path with backslashes, use it as-is; resolve will handle it.
  const storagePath = path.resolve(process.cwd(), String(storageConfig));
  log.info('Initializing local storage at', storagePath);
  if (!fs.existsSync(storagePath)) fs.mkdirSync(storagePath, { recursive: true });

  // Use SQLite (better-sqlite3) located at `${storagePath}/responses.sqlite`
  const dbFile = path.join(storagePath, 'responses.sqlite');
  const Database = require('better-sqlite3');
  const db = new Database(dbFile);
  db.pragma('journal_mode = WAL');
  db.prepare(`
    CREATE TABLE IF NOT EXISTS responses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      name TEXT NOT NULL,
      trigger TEXT NOT NULL,
      response TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )
  `).run();
  db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_guild_name ON responses(guild_id, name)`).run();
  storageClient = { type: 'local', db };
  log.info('Local SQLite initialized at', dbFile);
  return storageClient;
}

// ResponsesManager (same abstraction used by commands)
class ResponsesManager {
  constructor(store) {
    this.store = store;
    if (store.type === 'local') {
      this.db = store.db;
      this.insert = this.db.prepare('INSERT INTO responses (guild_id, name, trigger, response, created_at) VALUES (?, ?, ?, ?, ?)');
      this.getByName = this.db.prepare('SELECT * FROM responses WHERE guild_id = ? AND name = ?');
      this.deleteByName = this.db.prepare('DELETE FROM responses WHERE guild_id = ? AND name = ?');
      this.updateByName = this.db.prepare('UPDATE responses SET trigger = ?, response = ? WHERE guild_id = ? AND name = ?');
      this.listByGuild = this.db.prepare('SELECT * FROM responses WHERE guild_id = ? ORDER BY created_at DESC');
    } else {
      this.col = store.db.collection('responses');
    }
  }

  async add(guildId, name, trigger, response) {
    if (this.store.type === 'local') {
      const exists = this.getByName.get(guildId, name);
      if (exists) throw new Error('A response with that name already exists.');
      this.insert.run(guildId, name, trigger, response, Date.now());
      return;
    }
    const res = await this.col.findOne({ guildId, name });
    if (res) throw new Error('A response with that name already exists.');
    await this.col.insertOne({ guildId, name, trigger, response, createdAt: Date.now() });
  }

  async remove(guildId, name) {
    if (this.store.type === 'local') {
      const info = this.getByName.get(guildId, name);
      if (!info) throw new Error('No such response.');
      this.deleteByName.run(guildId, name);
      return;
    }
    const result = await this.col.deleteOne({ guildId, name });
    if (result.deletedCount === 0) throw new Error('No such response.');
  }

  async edit(guildId, name, trigger, response) {
    if (this.store.type === 'local') {
      const info = this.getByName.get(guildId, name);
      if (!info) throw new Error('No such response.');
      this.updateByName.run(trigger, response, guildId, name);
      return;
    }
    const result = await this.col.updateOne({ guildId, name }, { $set: { trigger, response } });
    if (result.matchedCount === 0) throw new Error('No such response.');
  }

  async list(guildId) {
    if (this.store.type === 'local') return this.listByGuild.all(guildId);
    return this.col.find({ guildId }).sort({ createdAt: -1 }).toArray();
  }

  async findMatch(guildId, content, mode = 'exact') {
    const rows = await this.list(guildId);
    for (const r of rows) {
      const trigger = String(r.trigger || '');
      if (mode === 'exact' && content === trigger) return r;
      if (mode === 'includes' && content.includes(trigger)) return r;
      if (mode === 'regex') {
        try {
          const re = new RegExp(trigger, 'i');
          if (re.test(content)) return r;
        } catch (e) {
          log.warn('Invalid regex for', r.name);
          continue;
        }
      }
    }
    return null;
  }
}

// Load commands dynamically from ./commands
function loadCommands(commandsPath = path.join(__dirname, 'commands')) {
  const commands = new Map();
  if (!fs.existsSync(commandsPath)) return commands;
  const files = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));
  for (const file of files) {
    try {
      const cmdPath = path.join(commandsPath, file);
      delete require.cache[require.resolve(cmdPath)];
      const mod = require(cmdPath);
      // Expect module.exports = { name: 'cmd', aliases: [...], description: '', execute: async (message,args,ctx)=>{} }
      if (!mod || !mod.name || typeof mod.execute !== 'function') {
        log.warn('Skipping invalid command file', file);
        continue;
      }
      commands.set(mod.name, mod);
      if (Array.isArray(mod.aliases)) {
        for (const a of mod.aliases) commands.set(a, mod);
      }
      log.info('Loaded command', mod.name);
    } catch (e) {
      log.error('Failed loading command', file, e);
    }
  }
  return commands;
}

(async () => {
  try {
    await initStorage(config.storage);
    const manager = new ResponsesManager(storageClient);
    const commands = loadCommands();

    const client = new Client({
      intents: [IntentsBitField.Flags.Guilds, IntentsBitField.Flags.GuildMessages, IntentsBitField.Flags.MessageContent]
    });

    function requireManageGuild(member) {
      return member && member.permissions && member.permissions.has(PermissionsBitField.Flags.ManageGuild);
    }

    client.on('ready', () => {
      log.info(`Logged in as ${client.user.tag}`);
    });

    client.on('messageCreate', async (message) => {
      try {
        if (message.author.bot) return;

        // Prefix command handling via commands map
        if (message.content.startsWith(PREFIX)) {
          const withoutPrefix = message.content.slice(PREFIX.length).trim();
          const split = withoutPrefix.split(/\s+/);
          const invoked = split.shift().toLowerCase();
          const args = split;

          const command = commands.get(invoked);
          if (command) {
            const ctx = { manager, config, client, requireManageGuild, PREFIX, MATCH_MODE, log };
            try {
              await command.execute(message, args, ctx);
            } catch (err) {
              log.error('Command execution error:', err);
              try { await message.reply(`Error: ${err.message}`); } catch {}
            }
            return;
          }
        }

        // Trigger matching for normal messages
        if (message.guild) {
          const matched = await manager.findMatch(message.guild.id, message.content, MATCH_MODE);
          if (matched) await message.channel.send(matched.response);
        }
      } catch (err) {
        log.error('Error in message handler:', err);
      }
    });

    // Watch commands folder and reload on change (optional)
    const cmdsDir = path.join(__dirname, 'commands');
    if (fs.existsSync(cmdsDir)) {
      fs.watch(cmdsDir, (eventType, filename) => {
        if (!filename.endsWith('.js')) return;
        log.info('Commands folder change detected, reloading commands');
        const reloaded = loadCommands();
        commands.clear();
        for (const [k, v] of reloaded) commands.set(k, v);
      });
    }

    process.on('SIGINT', async () => {
      log.info('Shutting down...');
      if (storageClient && storageClient.type === 'mongo' && storageClient.client) {
        await storageClient.client.close();
        log.info('MongoDB connection closed');
      }
      process.exit(0);
    });

    await client.login(config.token);
  } catch (err) {
    console.error('Startup error:', err);
    process.exit(1);
  }
})();
