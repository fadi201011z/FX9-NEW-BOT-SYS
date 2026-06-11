import { ChatInputCommandInteraction, SlashCommandBuilder, PermissionsBitField, TextChannel } from "discord.js";
import { panelEmbed, panelMenu } from "../../utils/embeds.js";

export const data = new SlashCommandBuilder()
  .setName("panel")
  .setDescription("📋 إرسال بنل التكتات في القناة الحالية")
  .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator);

export async function execute(interaction) {
  await interaction.deferReply({ ephemeral: true });
  await interaction.channel.send({ embeds: [panelEmbed()], components: [panelMenu()] });
  await interaction.editReply({ content: "✅ تم إرسال البنل بنجاح!" });
}
