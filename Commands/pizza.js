const { babaPizzaMenu } = require('../Functions/pizzaFunctions.js');
const { SlashCommandBuilder } = require('@discordjs/builders');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('pizza')
		.setDescription('Orders you pizza ;)'),
	async execute(interaction, bot) {
		await interaction.deferReply({ ephemeral: false });
		const menu = babaPizzaMenu();
		await interaction.editReply(menu);
	},
};