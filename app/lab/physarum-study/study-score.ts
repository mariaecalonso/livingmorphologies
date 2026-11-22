/** Short score for the growth study. The 43-second film score stays untouched. */

const STUDY_SECONDS = 15;

const DRONE = [
  [0, 0.02],
  [0.4, 0.05],
  [2, 0.058],
  [7, 0.05],
  [10, 0.04],
  [12.5, 0.046],
  [STUDY_SECONDS, 0.03],
] as const;

const NOISE = [
  [0, 0.008],
  [2, 0.018],
  [5, 0.02],
  [7, 0.018],
  [8.2, 0.008],
  [STUDY_SECONDS, 0.007],
] as const;

const REVEAL = [
  [0, 0],
  [7.5, 0],
  [8.6, 0.018],
  [12, 0.016],
  [STUDY_SECONDS, 0.015],
] as const;

const PULSES: Array<[number, number, number, number]> = [
  [2.2, 164, 0.55, 0.01],
  [4.8, 174, 0.5, 0.009],
];

function valueAt(points: readonly (readonly [number, number])[], time: number) {
  if (time <= points[0][0]) return points[0][1];
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const next = points[index];
    if (time <= next[0]) {
      const span = next[0] - previous[0];
      const amount = span <= 0 ? 1 : (time - previous[0]) / span;
      return previous[1] + (next[1] - previous[1]) * amount;
    }
  }
  return points[points.length - 1][1];
}

function applyCurve(param: AudioParam, origin: number, from: number, points: readonly (readonly [number, number])[]) {
  param.setValueAtTime(Math.max(0.0001, valueAt(points, from)), origin);
  for (let index = 1; index < points.length; index += 1) {
    const [time, value] = points[index];
    if (time <= from) continue;
    param.linearRampToValueAtTime(Math.max(0.0001, value), origin + (time - from));
  }
}

function tone(ctx: BaseAudioContext, destination: AudioNode, when: number, frequency: number, duration: number, peak: number) {
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.value = frequency;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), when + 0.04);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
  osc.connect(gain);
  gain.connect(destination);
  osc.start(when);
  osc.stop(when + duration + 0.02);
}

function noiseBuffer(ctx: BaseAudioContext) {
  const length = ctx.sampleRate * 2;
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let index = 0; index < length; index += 1) {
    last = last * 0.98 + (Math.random() * 2 - 1) * 0.02;
    data[index] = last * 4.2;
  }
  return buffer;
}

export function scheduleStudy(ctx: BaseAudioContext, destination: AudioNode, origin: number, from = 0, seconds = 6) {
  const at = (film: number) => origin + (film - from);
  const bus = ctx.createGain();
  bus.gain.value = 1;
  bus.connect(destination);

  const low = ctx.createOscillator();
  low.type = "sine";
  low.frequency.value = 52;
  const lowGain = ctx.createGain();
  applyCurve(lowGain.gain, origin, from, DRONE);
  low.connect(lowGain);
  lowGain.connect(bus);
  low.start(origin);
  low.stop(at(seconds) + 0.05);

  const fifth = ctx.createOscillator();
  fifth.type = "sine";
  fifth.frequency.value = 78;
  const fifthGain = ctx.createGain();
  applyCurve(fifthGain.gain, origin, from, DRONE.map(([time, value]) => [time, value * 0.38] as const));
  fifth.connect(fifthGain);
  fifthGain.connect(bus);
  fifth.start(origin);
  fifth.stop(at(seconds) + 0.05);

  const reveal = ctx.createOscillator();
  reveal.type = "sine";
  reveal.frequency.value = 196;
  const revealGain = ctx.createGain();
  applyCurve(revealGain.gain, origin, from, REVEAL);
  reveal.connect(revealGain);
  revealGain.connect(bus);
  reveal.start(origin);
  reveal.stop(at(seconds) + 0.05);

  const source = ctx.createBufferSource();
  source.buffer = noiseBuffer(ctx);
  source.loop = true;
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.Q.value = 0.65;
  filter.frequency.setValueAtTime(from < 7 ? 360 : 720, origin);
  if (from < 7) filter.frequency.linearRampToValueAtTime(420, at(7));
  if (from < 9) filter.frequency.linearRampToValueAtTime(880, at(9));
  const noiseGain = ctx.createGain();
  applyCurve(noiseGain.gain, origin, from, NOISE);
  source.connect(filter);
  filter.connect(noiseGain);
  noiseGain.connect(bus);
  source.start(origin);
  source.stop(at(seconds) + 0.05);

  PULSES.forEach(([film, frequency, duration, peak]) => {
    if (film < from || film >= seconds) return;
    tone(ctx, bus, at(film), frequency, duration, peak);
  });
}

export async function renderStudy(from = 0, length = 6) {
  const seconds = Math.max(0.05, length - from);
  const context = new OfflineAudioContext(2, Math.ceil(seconds * 48000), 48000);
  const volume = context.createGain();
  volume.gain.value = 0.9;
  const compressor = context.createDynamicsCompressor();
  compressor.threshold.value = -18;
  compressor.knee.value = 18;
  compressor.ratio.value = 3;
  compressor.attack.value = 0.01;
  compressor.release.value = 0.3;
  volume.connect(compressor);
  compressor.connect(context.destination);
  scheduleStudy(context, volume, 0, from, length);
  return context.startRendering();
}

export class StudyScore {
  level = 0.85;
  muted = false;
  private token = 0;
  private ctx: AudioContext | null = null;
  private volume: GainNode | null = null;
  seconds = 6;
  private from = 0;
  private origin = 0;

  filmTime() {
    if (!this.ctx) return null;
    return this.from + (this.ctx.currentTime - this.origin);
  }

  async start(from: number) {
    const token = ++this.token;
    const previous = this.ctx;
    this.ctx = null;
    this.volume = null;
    if (previous) await previous.close();
    if (token !== this.token) return;
    const ctx = new AudioContext();
    const volume = ctx.createGain();
    volume.gain.value = this.muted ? 0 : this.level;
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -18;
    compressor.knee.value = 18;
    compressor.ratio.value = 3;
    compressor.attack.value = 0.01;
    compressor.release.value = 0.3;
    volume.connect(compressor);
    compressor.connect(ctx.destination);
    this.ctx = ctx;
    this.volume = volume;
    this.from = from;
    this.origin = ctx.currentTime;
    scheduleStudy(ctx, volume, ctx.currentTime, from, this.seconds);
    await ctx.resume();
  }

  async stop() {
    this.token += 1;
    const previous = this.ctx;
    this.ctx = null;
    this.volume = null;
    if (previous) await previous.close();
  }

  setLevel(level: number) {
    this.level = level;
    const ctx = this.ctx;
    if (!ctx || !this.volume) return;
    this.volume.gain.setTargetAtTime(this.muted ? 0 : level, ctx.currentTime, 0.04);
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    const ctx = this.ctx;
    if (!ctx || !this.volume) return;
    this.volume.gain.setTargetAtTime(muted ? 0 : this.level, ctx.currentTime, 0.04);
  }
}
