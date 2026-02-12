/**
 * @fileoverview Slash Command Deployment Script for Baba Discord Bot
 *
 * Registers all slash commands with Discord's API for a specific guild.
 *
 * Process:
 * 1. Scans ./Commands directory for .js files
 * 2. Loads each command module
 * 3. Extracts command.data (SlashCommandBuilder) and converts to JSON
 * 4. Bulk uploads all commands to Discord API
 * 5. Commands become available in specified guild immediately
 *
 * Configuration:
 * - Reads clientId, guildId, and token from babotdata.json
 * - Uses Discord API v9 routes
 * - Registers to single guild (faster than global registration)
 *
 * Usage:
 * Run this script whenever you add/modify/remove slash commands:
 *   node deployCommands.js
 *
 * Command Structure:
 * Each command file exports:
 *   - data: SlashCommandBuilder instance (command definition)
 *   - execute: async function to handle command interaction
 *
 * Notes:
 * - Guild commands update instantly (global commands take up to 1 hour)
 * - This script only registers command definitions, not implementations
 * - Actual command execution happens in babot.js interactionCreate handler
 *
 * @module deployCommands
 */

const fs = require('fs');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v9');
const { clientId, guildId, token} = require('./babotdata.json');


const commands = [];
// Scan Commands directory for all JavaScript files
const commandFiles = fs.readdirSync('./Commands').filter(file => file.endsWith('.js'));

// Load each command and extract its definition
for(const file of commandFiles) {
    const command = require(`./Commands/${file}`);
    commands.push(command.data.toJSON()); // Convert SlashCommandBuilder to JSON
}

// Create REST client with Discord bot token
const rest = new REST({ version: '9' }).setToken(token);

// Register all commands to the specified guild
rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands })
	.then(() => console.log('Successfully registered application commands.'))
	.catch(console.error);

