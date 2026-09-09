import { spawn } from 'child_process';
import ffmpegPath from 'ffmpeg-static';
import { PassThrough } from 'stream';
import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  NoSubscriberBehavior,
  StreamType,
  VoiceConnectionStatus,
  entersState,
} from '@discordjs/voice';
import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import YouTube from 'youtube-sr';
import { getVideoInfo, getAudioUrl } from '../utils/ytdlp.js';

const PROGRESS_MS    = 6_000;   // تحديث لوحة التحكم في الشات الصوتي
const IDLE_LEAVE_MS  = 60_000;  // مغادرة القناة عند خلوّها من الأشخاص
const END_LEAVE_MS   = 30_000;  // مغادرة القناة بعد انتهاء القائمة

const LOOP_LABELS = { none: '🚫 بدون', track: '🔂 مقطع', queue: '🔁 قائمة' };

// ─────────────────────────────────────────────────────────────────────────────
//  FFmpeg streaming (يدعم التقديم/الإرجاع السريع -seek)
// ─────────────────────────────────────────────────────────────────────────────
function createFfmpegStream(audioUrl, seek = 0) {
  const pass = new PassThrough();
  const args = [
    '-reconnect',          '1',
    '-reconnect_streamed', '1',
    '-reconnect_delay_max','5',
  ];
  if (seek > 0) args.push('-ss', String(seek));
  args.push(
    '-i',                  audioUrl,
    '-vn',
    '-analyzeduration',    '0',
    '-loglevel',           '8',
    '-f',                  's16le',
    '-ar',                 '48000',
    '-ac',                 '2',
    'pipe:1',
  );

  const proc = spawn(ffmpegPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  proc.stdout.pipe(pass);
  proc.stderr.on('data', d => {
    const msg = d.toString().trim();
    if (msg) console.error('[FFmpeg]', msg);
  });
  proc.on('error', err => {
    console.error('[FFmpeg spawn]', err.message);
    pass.destroy(err);
  });
  proc.on('close', code => {
    if (code !== 0) pass.destroy(new Error(`FFmpeg exited with code ${code}`));
    else pass.end();
  });
  return pass;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Time / progress helpers
// ─────────────────────────────────────────────────────────────────────────────
export function formatTime(sec) {
  if (!sec || sec === Infinity || isNaN(sec)) return '🔴 Live';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function getElapsed(session) {
  if (!session._startTime) return 0;
  if (session._paused) return session._elapsedBefore;
  return session._elapsedBefore + Math.floor((Date.now() - session._startTime) / 1000);
}

function progressBar(cur, total, sz = 15) {
  if (!total || total === Infinity || isNaN(total)) return '▓'.repeat(sz);
  const f = Math.round(Math.min(cur / total, 1) * sz);
  return '▓'.repeat(f) + '░'.repeat(sz - f);
}

// ─────────────────────────────────────────────────────────────────────────────
//  Embeds + control panel buttons
// ─────────────────────────────────────────────────────────────────────────────
export function buildNowPlayingEmbed(session, elapsed = getElapsed(session)) {
  const t = session.current;
  const embed = new EmbedBuilder().setColor(0x1db954);
  if (!t) {
    return embed
      .setAuthor({ name: '🎵 FX9-VOICE — لوحة التحكم' })
      .setDescription('⏸️ لا يوجد تشغيل حالياً.\nأضف أغنيات من زر **➕ إضافة** أو عبر أمر `/play`.')
      .setTimestamp();
  }
  const bar = progressBar(elapsed, t.durationSec);
  const rem = t.durationSec ? formatTime(Math.max(0, t.durationSec - elapsed)) : '∞';
  embed
    .setAuthor({ name: '🎵 يُشغَّل الآن — FX9-VOICE' })
    .setTitle(t.title.length > 60 ? t.title.slice(0, 57) + '...' : t.title)
    .setURL(t.url)
    .addFields(
      { name: '👤 الفنان',    value: t.author || '—',             inline: true },
      { name: '⏱️ المدة',    value: formatTime(t.durationSec),   inline: true },
      { name: '⏳ المتبقي',  value: rem,                          inline: true },
      { name: '🔊 الصوت',   value: `${session.volume}%`,         inline: true },
      { name: '🔁 التكرار', value: LOOP_LABELS[session.loopMode], inline: true },
      { name: '📋 انتظار',  value: `${session.tracks.length} 🎵`, inline: true },
    )
    .setDescription(`\`${formatTime(elapsed)}\` ${bar} \`${formatTime(t.durationSec)}\``)
    .setFooter({ text: `طُلب من: ${t.requestedBy}` })
    .setTimestamp();
  if (t.thumbnail && t.thumbnail.startsWith('http')) embed.setThumbnail(t.thumbnail);
  return embed;
}

export function buildQueueEmbed(session, page = session.qPage) {
  const perPage = 10;
  const totalPages = Math.max(1, Math.ceil(session.tracks.length / perPage));
  if (page > totalPages - 1) page = totalPages - 1;
  if (page < 0) page = 0;

  const start = page * perPage;
  const pageTracks = session.tracks.slice(start, start + perPage);
  const desc = pageTracks.length
    ? pageTracks.map((t, i) =>
      `**${start + i + 1}.** [${t.title}](${t.url}) — ${formatTime(t.durationSec)}`
    ).join('\n')
    : '—';

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setAuthor({ name: '📋 قائمة التشغيل — FX9-VOICE' })
    .setDescription(desc)
    .setFooter({ text: `🎵 ${session.tracks.length} مقطع • صفحة ${page + 1}/${totalPages}` });

  if (session.current) {
    embed.addFields({ name: '▶️ الحالي', value: `[${session.current.title}](${session.current.url}) — ${formatTime(session.current.durationSec)}` });
  }
  return embed;
}

function buildControlRows(session) {
  const k = session.key;
  const rows = [];

  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`music:pause:${k}`).setLabel(session._paused ? '▶️ استكمال' : '⏸️ توقف').setStyle(session._paused ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`music:skip:${k}`).setLabel('⏭️ تخطي').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`music:stop:${k}`).setLabel('⏹️ إيقاف وخروج').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`music:loop:${k}`).setLabel(LOOP_LABELS[session.loopMode]).setStyle(session.loopMode === 'none' ? ButtonStyle.Secondary : ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`music:shuffle:${k}`).setLabel('🔀 خلط').setStyle(ButtonStyle.Secondary),
  ));

  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`music:voldown:${k}`).setLabel('🔉 -10').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`music:volup:${k}`).setLabel('🔊 +10').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`music:back:${k}`).setLabel('⏪ -10ث').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`music:fwd:${k}`).setLabel('⏩ +10ث').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`music:add:${k}`).setLabel('➕ إضافة').setStyle(ButtonStyle.Success),
  ));

  const row3 = new ActionRowBuilder();
  if (session.view === 'queue') {
    row3.addComponents(
      new ButtonBuilder().setCustomId(`music:qprev:${k}`).setLabel('◀️').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`music:now:${k}`).setLabel('🎵 الآن').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`music:qnext:${k}`).setLabel('▶️').setStyle(ButtonStyle.Secondary),
    );
  } else {
    row3.addComponents(new ButtonBuilder().setCustomId(`music:queue:${k}`).setLabel('📋 القائمة').setStyle(ButtonStyle.Secondary));
  }
  rows.push(row3);

  return rows;
}

// ─────────────────────────────────────────────────────────────────────────────
//  MusicSession — جلسة تشغيل واحدة لكل قناة صوتية
//  (يدعم عدة فويس في نفس الوقت: مفتاح = guildId_voiceChannelId)
// ─────────────────────────────────────────────────────────────────────────────
class MusicSession {
  constructor(manager, client, guildId, voiceChannel, fallbackTextChannelId) {
    this.manager              = manager;
    this.client               = client;
    this.guildId              = guildId;
    this.voiceChannelId       = voiceChannel.id;
    this.fallbackTextChannelId = fallbackTextChannelId;
    this.key                  = `${guildId}_${voiceChannel.id}`;
    this.control              = null; // { channelId, messageId }
    this.tracks               = [];
    this.current              = null;
    this.volume               = 80;
    this.loopMode             = 'none';
    this.view                 = 'now';   // 'now' | 'queue'
    this.qPage                = 0;
    this.isPlaying            = false;
    this.ended                = false;
    this._paused              = false;
    this._startTime           = null;
    this._elapsedBefore       = 0;
    this._idleTimer           = null;
    this._skipRequested       = false;
    this._resource            = null;
    this.connection           = null;
    this.player               = null;
  }

  // ── الاتصال بالقناة + إعداد المشغّل ────────────────────────────────────
  async connect(voiceChannel) {
    try {
      this.connection = joinVoiceChannel({
        channelId:     voiceChannel.id,
        guildId:       this.guildId,
        adapterCreator: voiceChannel.guild.voiceAdapterCreator,
        selfDeaf:      true,
      });
      await entersState(this.connection, VoiceConnectionStatus.Ready, 20_000);

      this.player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Pause } });
      this.player.on(AudioPlayerStatus.Idle, () => {
        if (this.ended || this._paused) return;
        this._elapsedBefore = 0;
        this.next();
      });
      this.player.on('error', err => {
        console.error(`[Player] ${err.message}`);
        setTimeout(() => this.next(), 1000);
      });
      this.connection.on(VoiceConnectionStatus.Destroyed, () => {
        if (!this.ended) { this.ended = true; this.manager.remove(this.key); }
      });
      this.connection.on('error', err => console.error('[Voice]', err.message));
      this.connection.subscribe(this.player);
      return null;
    } catch (err) {
      try { this.connection?.destroy(); } catch (_) {}
      this.connection = null;
      return `تعذر الاتصال بالقناة الصوتية — ${err.message}`;
    }
  }

  // ── لوحة التحكم (تُرسل إلى شات القناة الصوتية، مع بديل النصية) ─────────
  async ensureControl() {
    const candidates = [];
    const vc = this.client.channels.cache.get(this.voiceChannelId);
    if (vc) candidates.push(vc);
    if (this.fallbackTextChannelId) {
      const fc = this.client.channels.cache.get(this.fallbackTextChannelId);
      if (fc && fc.id !== vc?.id) candidates.push(fc);
    }
    for (const ch of candidates) {
      try {
        const msg = await ch.send({ embeds: [this.buildEmbed()], components: buildControlRows(this) });
        this.control = { channelId: ch.id, messageId: msg.id };
        return msg;
      } catch (_) { /* جرّب القناة التالية */ }
    }
    return null;
  }

  async refresh() {
    if (this.ended || !this.control) return;
    const ch = this.client.channels.cache.get(this.control.channelId);
    if (!ch) return;
    const msg = await ch.messages.fetch(this.control.messageId).catch(() => null);
    if (msg) {
      await msg.edit({ embeds: [this.buildEmbed()], components: buildControlRows(this) }).catch(() => {});
      return;
    }
    try { this.control = null; await this.ensureControl(); } catch (_) {}
  }

  buildEmbed() {
    return this.view === 'queue' ? buildQueueEmbed(this, this.qPage) : buildNowPlayingEmbed(this);
  }

  // ── التشغيل ─────────────────────────────────────────────────────────────
  async waitReady() {
    while (!this.ended && !this.player && this.connection) {
      await new Promise(r => setTimeout(r, 250));
    }
    return !!this.player && !this.ended;
  }

  async next() {
    if (this.ended) return;
    await this.waitReady();
    if (this.ended || !this.player) return;

    if (!this._skipRequested) {
      if (this.loopMode === 'track' && this.current) this.tracks.unshift({ ...this.current });
      else if (this.loopMode === 'queue' && this.current) this.tracks.push({ ...this.current });
    }
    this._skipRequested = false;

    if (!this.tracks.length) {
      this.current = null;
      this.isPlaying = false;
      this._elapsedBefore = 0;
      await this.sendQueueEnd();
      this.scheduleLeave(END_LEAVE_MS);
      return;
    }

    const track = this.tracks.shift();
    await this.playTrack(track);
  }

  async playTrack(track) {
    if (this.ended || !this.player) return;
    this.current = track;
    this.isPlaying = true;
    this._paused = false;
    this._startTime = Date.now();
    this._elapsedBefore = 0;
    this.cancelLeave();
    console.log(`[Music] 🔍 "${track.title}"`);

    try {
      const audioUrl = await getAudioUrl(track.url);
      console.log('[Music] ▶  Streaming via ffmpeg');

      const stream = createFfmpegStream(audioUrl);
      const resource = createAudioResource(stream, {
        inputType: StreamType.Raw,
        inlineVolume: true,
      });
      resource.volume?.setVolumeLogarithmic(this.volume / 100);

      this.player.play(resource);
      this._resource = resource;
      await this.refresh().catch(() => {});
    } catch (err) {
      console.error(`[Music] ❌ "${track.title}": ${err.message}`);
      await this.sendError(track, err.message);
      setTimeout(() => this.next(), 1500);
    }
  }

  async addTracks(tracks) {
    const list = Array.isArray(tracks) ? tracks : [tracks];
    this.tracks.push(...list);
    this.cancelLeave();
    if (!this.isPlaying) await this.next();
    await this.refresh().catch(() => {});
  }

  // ── التحكم ──────────────────────────────────────────────────────────────
  togglePause() {
    if (!this.isPlaying) return;
    if (this._paused) {
      try { this.player.unpause(); } catch (_) {}
      this._startTime = Date.now();
      this._paused = false;
    } else {
      this._elapsedBefore = getElapsed(this);
      try { this.player.pause(); } catch (_) {}
      this._paused = true;
    }
  }

  skip() {
    if (!this.isPlaying) return;
    this._skipRequested = true;
    try { this.player.stop(true); } catch (_) {}
  }

  setVolume(v) {
    this.volume = Math.min(150, Math.max(1, Math.round(v)));
    this._resource?.volume?.setVolumeLogarithmic(this.volume / 100);
  }

  cycleLoop() {
    const modes = ['none', 'track', 'queue'];
    this.loopMode = modes[(modes.indexOf(this.loopMode) + 1) % modes.length];
  }

  shuffle() {
    if (this.tracks.length < 2) return;
    for (let i = this.tracks.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.tracks[i], this.tracks[j]] = [this.tracks[j], this.tracks[i]];
    }
  }

  removeAt(pos) {
    if (pos < 1 || pos > this.tracks.length) return null;
    return this.tracks.splice(pos - 1, 1)[0] || null;
  }

  async seekBy(deltaSec) {
    if (!this.current || !this.isPlaying) return;
    const target = Math.max(0, getElapsed(this) + deltaSec);
    if (this.current.durationSec && target >= this.current.durationSec - 1) {
      this.skip();
      return;
    }
    this._elapsedBefore = target;
    this._startTime = Date.now();
    try {
      const audioUrl = await getAudioUrl(this.current.url);
      const stream = createFfmpegStream(audioUrl, target);
      const resource = createAudioResource(stream, { inputType: StreamType.Raw, inlineVolume: true });
      resource.volume?.setVolumeLogarithmic(this.volume / 100);
      this.player.play(resource);
      this._resource = resource;
    } catch (err) {
      console.error('[Music] seek:', err.message);
    }
  }

  // ── الحضور / مغادرة تلقائية ────────────────────────────────────────────
  checkHumans() {
    const ch = this.client.channels.cache.get(this.voiceChannelId);
    if (!ch || !ch.members) return 0;
    return [...ch.members.values()].filter(m => !m.user.bot).length;
  }

  scheduleLeave(ms = IDLE_LEAVE_MS) {
    if (this.ended) return;
    if (this._idleTimer) clearTimeout(this._idleTimer);
    this._idleTimer = setTimeout(() => {
      this._idleTimer = null;
      if (this.ended || this.checkHumans() > 0) return;
      this.stop(true).catch(() => {});
    }, ms);
  }

  cancelLeave() {
    if (this._idleTimer) { clearTimeout(this._idleTimer); this._idleTimer = null; }
  }

  maybeLeave() {
    if (this.ended) return;
    if (this.checkHumans() > 0) this.cancelLeave();
    else this.scheduleLeave(IDLE_LEAVE_MS);
  }

  // ── الإيقاف ─────────────────────────────────────────────────────────────
  async stop(leave = true) {
    if (this.ended) return;
    this.ended = true;
    if (this._idleTimer) clearTimeout(this._idleTimer);
    this.tracks = [];
    this.current = null;
    this.isPlaying = false;
    try { this.player?.stop(true); } catch (_) {}
    try { this.connection?.destroy(); } catch (_) {}
    this.connection = null;
    this.player = null;

    if (this.control) {
      const ch = this.client.channels.cache.get(this.control.channelId);
      const msg = await ch?.messages.fetch(this.control.messageId).catch(() => null);
      if (msg) {
        await msg.edit({
          embeds: [new EmbedBuilder()
            .setColor(0xed4245)
            .setDescription('⏹️ خرج البوت من القناة الصوتية.')],
          components: [],
        }).catch(() => {});
        setTimeout(() => msg.delete().catch(() => {}), 20_000);
      }
    }
    this.manager.remove(this.key);
  }

  async sendQueueEnd() {
    if (!this.control) return;
    const ch = this.client.channels.cache.get(this.control.channelId);
    const msg = await ch?.messages.fetch(this.control.messageId).catch(() => null);
    if (msg) {
      await msg.edit({
        embeds: [new EmbedBuilder()
          .setColor(0xfee75c)
          .setDescription('✅ انتهت قائمة التشغيل.\nسأغادر القناة بعد قليل.')],
        components: [],
      }).catch(() => {});
    }
  }

  async sendError(track, reason) {
    if (!this.control) return;
    const ch = this.client.channels.cache.get(this.control.channelId);
    const msg = await ch?.send({
      embeds: [new EmbedBuilder()
        .setDescription(`⚠️ **${track.title}**\n\`${reason.slice(0, 200)}\`\nجاري التخطي...`)
        .setColor(0xed4245)],
    }).catch(() => null);
    if (msg?.deletable) setTimeout(() => msg.delete().catch(() => {}), 15_000);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  MusicManager — يدير عدة جلسات في نفس الوقت + حلقة تحديث اللوحة
// ─────────────────────────────────────────────────────────────────────────────
function createMusicManager(client) {
  const sessions = new Map();

  const api = {
    sessions,
    getByKey(key)  { return sessions.get(key) || null; },
    getByGuild(g)  { for (const s of sessions.values()) if (s.guildId === g) return s; return null; },
    getByChannel(c){ for (const s of sessions.values()) if (s.voiceChannelId === c) return s; return null; },
    count()        { return sessions.size; },

    async ensure(interaction, voiceChannel) {
      const key = `${interaction.guildId}_${voiceChannel.id}`;
      const existing = sessions.get(key);
      if (existing) {
        if (!existing.fallbackTextChannelId && interaction.channelId) {
          existing.fallbackTextChannelId = interaction.channelId;
        }
        return existing;
      }

      const session = new MusicSession(api, client, interaction.guildId, voiceChannel, interaction.channelId);
      sessions.set(key, session); // تُسجَّل فوراً لمنع إنشاء جلسة مكررة أثناء الاتصال
      const err = await session.connect(voiceChannel);
      if (err) {
        sessions.delete(key);
        return { error: err };
      }
      try { await session.ensureControl(); } catch (e) { console.error('[Music] ensureControl:', e.message); }
      return session;
    },

    remove(key) {
      const s = sessions.get(key);
      if (s) {
        s.ended = true;
        if (s._idleTimer) clearTimeout(s._idleTimer);
        sessions.delete(key);
      }
    },

    refreshAll() {
      for (const s of sessions.values()) s.refresh().catch(() => {});
    },

    tick() {
      for (const s of [...sessions.values()]) {
        s.maybeLeave();
        if (!s.ended && !s.connection && sessions.get(s.key)) sessions.delete(s.key);
      }
    },
  };

  setInterval(() => {
    api.refreshAll();
    api.tick();
  }, PROGRESS_MS);

  return api;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Search helpers
// ─────────────────────────────────────────────────────────────────────────────
export async function searchTrack(query, requestedBy) {
  try {
    const ytUrl = /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)/.test(query);
    if (ytUrl) {
      if (query.includes('list=') && !query.includes('watch?v=')) {
        const pl = await YouTube.getPlaylist(query, { fetchAll: true });
        if (!pl) return null;
        return pl.videos.slice(0, 100).map(v => ({
          title: v.title || 'Unknown',
          url: `https://www.youtube.com/watch?v=${v.id}`,
          author: v.channel?.name || 'Unknown',
          durationSec: Math.floor((v.duration || 0) / 1000),
          thumbnail: v.thumbnail?.url || null,
          requestedBy,
        }));
      }
      const info = await getVideoInfo(query);
      return [{ ...info, requestedBy }];
    }
    const results = await YouTube.search(query, { limit: 5, type: 'video' });
    if (!results?.length) return null;
    const v = results[0];
    return [{
      title: v.title || 'Unknown',
      url: `https://www.youtube.com/watch?v=${v.id}`,
      author: v.channel?.name || 'Unknown',
      durationSec: Math.floor((v.duration || 0) / 1000),
      thumbnail: v.thumbnail?.url || null,
      requestedBy,
    }];
  } catch (err) {
    console.error('[Music] searchTrack:', err.message);
    return null;
  }
}

export async function searchMultiple(query, limit = 5) {
  try {
    return (await YouTube.search(query, { limit, type: 'video' }) || []).map(v => ({
      title: v.title || 'Unknown',
      url: `https://www.youtube.com/watch?v=${v.id}`,
      author: v.channel?.name || 'Unknown',
      durationSec: Math.floor((v.duration || 0) / 1000),
      thumbnail: v.thumbnail?.url || null,
    }));
  } catch { return []; }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Resolve a session for slash commands
// ─────────────────────────────────────────────────────────────────────────────
export function sessionFromInteraction(interaction) {
  const music = interaction.client?.music;
  if (!music) return null;
  const chId = interaction.member?.voice?.channelId;
  if (chId) {
    const s = music.getByChannel(chId);
    if (s) return s;
  }
  return music.getByGuild(interaction.guildId) || null;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Buttons + modal handlers (تديرها interactionCreate.js)
// ─────────────────────────────────────────────────────────────────────────────
export async function handleMusicButton(interaction) {
  const parts = interaction.customId.split(':');
  if (parts.length < 3 || parts[0] !== 'music') return;
  const action = parts[1];
  const key = parts.slice(2).join(':');

  const music = interaction.client.music;
  const session = music.getByKey(key);
  if (!session) {
    return interaction.reply({ content: '❌ لا توجد جلسة موسيقية نشطة في هذه القناة.', ephemeral: true });
  }

  const memberChId = interaction.member?.voice?.channelId;
  if (!memberChId || memberChId !== session.voiceChannelId) {
    return interaction.reply({ content: '❌ يجب أن تكون في نفس القناة الصوتية لاستخدام الأزرار.', ephemeral: true });
  }

  if (action === 'add') {
    const modal = new ModalBuilder()
      .setCustomId(`music_modal:add:${key}`)
      .setTitle('➕ إضافة مقطع للقائمة');
    modal.addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('track_query')
        .setLabel('اسم الأغنية أو رابط يوتيوب')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(300)
    ));
    return interaction.showModal(modal);
  }

  await interaction.deferUpdate();
  try {
    switch (action) {
      case 'pause':   session.togglePause();                    break;
      case 'skip':    session.skip();                           break;
      case 'stop':    await session.stop(true); return;
      case 'loop':    session.cycleLoop();                      break;
      case 'shuffle': session.shuffle();                        break;
      case 'voldown': session.setVolume(session.volume - 10);   break;
      case 'volup':   session.setVolume(session.volume + 10);   break;
      case 'back':    await session.seekBy(-10);                break;
      case 'fwd':     await session.seekBy(10);                 break;
      case 'queue':   session.view = 'queue'; session.qPage = 0; break;
      case 'qprev':   session.qPage = Math.max(0, session.qPage - 1); break;
      case 'qnext':   session.qPage++;                          break;
      case 'now':     session.view = 'now';                     break;
      default: break;
    }
    await session.refresh().catch(() => {});
  } catch (err) {
    console.error('[Music Button]', err.message);
  }
}

export async function handleMusicModal(interaction) {
  const parts = interaction.customId.split(':');
  if (parts.length < 3 || parts[0] !== 'music_modal') return;
  const key = parts.slice(2).join(':');

  const session = interaction.client.music.getByKey(key);
  await interaction.deferReply({ ephemeral: true });
  if (!session) return interaction.editReply({ content: '❌ لا توجد جلسة موسيقية نشطة.' });

  const query = interaction.fields.getTextInputValue('track_query');
  const results = await searchMultiple(query, 5);
  if (!results.length) return interaction.editReply({ content: '❌ لم يُعثر على نتائج.' });

  const tracks = results.map(r => ({ ...r, requestedBy: interaction.user.tag }));
  await session.addTracks(tracks);
  return interaction.editReply({ content: `✅ تمت إضافة **${tracks.length} مقاطع** إلى القائمة.\n🎛️ لوحة التحكم في شات القناة الصوتية.` });
}