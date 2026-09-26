import { ChatInputCommandInteraction, SlashCommandBuilder, PermissionsBitField, TextChannel } from "discord.js";
import { panelPayload } from "../../utils/embeds.js";

export const data = new SlashCommandBuilder()
  .setName("panel")
  .setDescription("📋 إرسال بنل التكتات في القناة الحالية")
  .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator);

export async function execute(interaction) {
  await interaction.deferReply({ ephemeral: true });
  await interaction.channel.send(panelPayload());
  await interaction.editReply({ content: "✅ تم إرسال البنل بنجاح!" });
}
