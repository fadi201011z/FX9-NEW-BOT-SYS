import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { requireRole, getLogChannel } from '../../utils/permissions.js';
import { modAction, logEntry, field, C, userTag } from '../../utils/embeds.js';
import { getConfig } from '../../database.js';
import { COMMAND_ROLES } from '../../config/roles.js';

export const data = new SlashCommandBuilder()
  .setName('clear')
  .setDescription('Bulk-delete messages, with optional filters')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
  .addIntegerOption(opt =>
    opt.setName('amount').setDescription('How many messages to delete (1-100)').setRequired(true).setMinValue(1).setMaxValue(100)
  )
  .addUserOption(opt => opt.setName('user').setDescription('Only delete messages from this member'))
  .addBooleanOption(opt => opt.setName('bots_only').setDescription('Only delete bot messages'));

export async function execute(interaction) {
  if (!await requireRole(interaction, COMMAND_ROLES.clear)) return;

  // Deferred publicly, and therefore finished publicly: Discord does not let a
  // deferred message change ephemeralness. Purging can take several fetches, so
  // both the "nothing matched" outcome and the result have to live in the
  // channel — staff should see that a purge was attempted, and what it removed.
  await interaction.deferReply();

  const amount     = interaction.options.getInteger('amount');
  const filterUser = interaction.options.getUser('user');
  const botsOnly   = interaction.options.getBoolean('bots_only') ?? false;

  const collected = [];
  let lastId;

  while (collected.length < amount) {
    const opts = { limit: 100 };
    if (lastId) opts.before = lastId;

    let batch;
    try { batch = await interaction.channel.messages.fetch(opts); } catch { break; }
    if (batch.size === 0) break;

    for (const [, msg] of batch) {
      if (filterUser && msg.author.id !== filterUser.id) continue;
      if (botsOnly && !msg.author.bot) continue;
      collected.push(msg);
      if (collected.length >= amount) break;
    }

    lastId = batch.last()?.id;
    if (!lastId) break;
  }

  if (collected.length === 0) {
    return interaction.editReply({
      embeds: [modAction({
        kind: 'clear',
        description: 'Nothing matched, so nothing was deleted.',
        color: C.warn,
        target: interaction.channel.toString(),
        actor: userTag(interaction.user),
        fields: [field('Requested', `${amount} message${amount === 1 ? '' : 's'}`)],
      })],
    });
  }

  const twoWeeksAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
  const fresh = collected.filter(m => m.createdTimestamp > twoWeeksAgo);
  const old   = collected.filter(m => m.createdTimestamp <= twoWeeksAgo);

  let deletedCount = 0;
  if (fresh.length > 0) {
    const deleted = await interaction.channel.bulkDelete(fresh, true);
    deletedCount += deleted.size;
  }
  for (const msg of old) {
    await msg.delete().catch(() => {});
    deletedCount++;
  }

  const filters = [];
  if (filterUser) filters.push(field('Member filter', userTag(filterUser)));
  if (botsOnly)   filters.push(field('Message source', 'Bots only'));

  const summary = deletedCount === 1 ? '1 message' : `${deletedCount} messages`;

  await interaction.editReply({
    embeds: [modAction({
      kind: 'clear',
      description: `${summary} removed from this channel.`,
      target: interaction.channel.toString(),
      actor: userTag(interaction.user),
      fields: [field('Deleted', summary), ...filters],
    })],
  });

  const modLogCh = await getLogChannel(interaction.guild, getConfig(interaction.guildId, 'modlog_channel'));
  if (modLogCh) {
    await modLogCh.send({
      embeds: [logEntry({
        kind: 'clear',
        target: interaction.channel.toString(),
        actor: userTag(interaction.user),
        fields: [field('Deleted', summary), ...filters],
      })],
    }).catch(() => {});
  }
}
