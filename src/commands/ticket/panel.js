import { SlashCommandBuilder, PermissionsBitField } from "discord.js";
import { EPHEMERAL } from '../../utils/embeds.js';
import { panelPayload } from "../../utils/embeds.js";

export const data = new SlashCommandBuilder()
  .setName("panel")
  .setDescription("📋 Post the ticket panel in this channel")
  .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator);

export async function execute(interaction) {
  await interaction.deferReply({ flags: EPHEMERAL });
  await interaction.channel.send(panelPayload(interaction.guildId));
  await interaction.editReply({ content: "✅ Ticket panel posted." });
}
