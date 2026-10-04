import { SlashCommandBuilder, ChannelType } from 'discord.js';
import { setGuildSetup, buildStatusPanel, updatePanelMessageId } from '../../handlers/tempVoice.js';
import { notice, field, C } from '../../utils/embeds.js';

export const data = new SlashCommandBuilder()
  .setName('setup-voice')
  .setDescription('Set up the temporary voice channel system')
  .addChannelOption((o) => o
    .setName('category')
    .setDescription('Category the temporary channels are created in')
    .addChannelTypes(ChannelType.GuildCategory)
    .setRequired(true))
  .addChannelOption((o) => o
    .setName('join_channel')
    .setDescription('The "Join to create" voice channel')
    .addChannelTypes(ChannelType.GuildVoice)
    .setRequired(true))
  .addChannelOption((o) => o
    .setName('text_channel')
    .setDescription('Text channel that holds the permanent control panel')
    .addChannelTypes(ChannelType.GuildText)
    .setRequired(true));

export async function execute(interaction) {
  await interaction.deferReply({ flags: 64 });

  const category = interaction.options.getChannel('category');
  const joinCh   = interaction.options.getChannel('join_channel');
  const textCh   = interaction.options.getChannel('text_channel');

  if (joinCh.parentId !== category.id) {
    await interaction.editReply({ content: '❌ The join channel must sit inside the selected category.' });
    return;
  }

  const config = {
    categoryId: category.id,
    joinChannelId: joinCh.id,
    textChannelId: textCh.id,
    panelMessageId: null,
  };

  await setGuildSetup(interaction.guildId, config);

  // Clear the previous panel so re-running the command never stacks panels.
  try {
    const oldMsgs = await textCh.messages.fetch({ limit: 20 });
    for (const msg of oldMsgs.values()) {
      if (msg.author.id === interaction.client.user.id && msg.embeds.length > 0) {
        await msg.delete().catch(() => {});
      }
    }
  } catch { /* the channel may have just become unreadable */ }

  const panel = buildStatusPanel(interaction.guildId, config, 0);
  const msg = await textCh.send(panel);
  await updatePanelMessageId(interaction.guildId, msg.id);

  // The setup is saved to the database, so this reply reports what is now
  // live rather than what the user typed.
  await interaction.editReply({
    embeds: [notice({
      title: '✅ Voice channels are set up',
      color: C.ok,
      description: 'The configuration is saved — it survives bot restarts, so '
        + '`/setup-voice` does not need to be run again.\n'
        + 'The control panel stays in the selected text channel.',
      fields: [
        field('Category', `${category}`, false),
        field('Join channel', `${joinCh}`),
        field('Control panel', `${textCh}`),
      ],
      footer: 'KRS-VOICE v3.0',
      timestamp: true,
    })],
  });
}