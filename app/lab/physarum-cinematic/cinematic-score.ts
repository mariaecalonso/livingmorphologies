import { FILM_SECONDS, FILM_WORDS } from "@/lib/cinematic-intro";

const DRONE = [
  [0, 0],
  [1.4, 0.055],
  [5, 0.07],
  [11, 0.062],
  [18, 0.08],
  [25.4, 0.09],
  [26.85, 0.062],
  [27.25, 0.01],
  [27.85, 0.05],
  [28.6, 0.1],
  [33, 0.072],
  [36.4, 0.05],
  [40.5, 0.04],
  [FILM_SECONDS, 0.006],
] as const;

const AIR = [
  [0, 0],
  [11, 0],
  [12.2, 0.016],
  [18, 0.012],
  [20, 0],
  [FILM_SECONDS, 0],
] as const;

const NOISE = [
  [0, 0],
  [0.9, 0.012],
  [5, 0.026],
  [11, 0.018],
  [18, 0.02],
  [26.8, 0.016],
  [27.3, 0.006],
  [29, 0.024],
  [36, 0.014],
  [FILM_SECONDS, 0.003],
] as const;

const RESOLVE = [
  [0, 0],
  [36, 0],
  [37.4, 0.04],
  [41, 0.032],
  [FILM_SECONDS, 0.004],
] as const;

const BELLS: Array<[number, number, number, number]> = [
  [1.35, 146, 0.7, 0.035],
  [2.7, 164, 0.55, 0.028],
  [4.15, 130, 0.6, 0.03],
  [6.35, 880, 0.28, 0.026],
  [7.45, 988, 0.24, 0.022],
  [8.6, 740, 0.3, 0.02],
  [9.5, 880, 0.22, 0.018],
  ...FILM_WORDS.map((word) => [word.at, word.tone, 0.62, 0.07] as [number, number, number, number]),
  [27.55, 46, 1.8, 0.16],
  [27.55, 92, 1.15, 0.05],
];

const lerp = (from: number, to: number, amount: number) => from + (to - from) * amount;

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
  points.forEach(([time, value]) => {
    if (time <= from) return;
    param.linearRampToValueAtTime(Math.max(0.0001, value), origin + (time - from));
  });
}

function tone(ctx: BaseAudioContext, destination: AudioNode, when: number, frequency: number, duration: number, peak: number, type: OscillatorType = "sine") {
  if (when < 0 || peak <= 0) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, when);
  osc.frequency.exponentialRampToValueAtTime(Math.max(32, frequency * 0.72), when + duration);
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), when + Math.min(0.03, duration * 0.2));
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

/** Original synthesized score. `origin` is the audio-context time at film time `from`. */
export function scheduleScore(ctx: BaseAudioContext, destination: AudioNode, origin: number, from = 0) {
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
  low.stop(at(FILM_SECONDS) + 0.05);

  const fifth = ctx.createOscillator();
  fifth.type = "sine";
  fifth.frequency.value = 78;
  const fifthGain = ctx.createGain();
  applyCurve(fifthGain.gain, origin, from, DRONE.map(([time, value]) => [time, value * 0.45] as const));
  fifth.connect(fifthGain);
  fifthGain.connect(bus);
  fifth.start(origin);
  fifth.stop(at(FILM_SECONDS) + 0.05);

  const air = ctx.createOscillator();
  air.type = "triangle";
  air.frequency.value = 311;
  const airGain = ctx.createGain();
  applyCurve(airGain.gain, origin, from, AIR);
  air.connect(airGain);
  airGain.connect(bus);
  air.start(origin);
  air.stop(at(FILM_SECONDS) + 0.05);

  const resolve = ctx.createOscillator();
  resolve.type = "sine";
  resolve.frequency.value = 196;
  const resolveGain = ctx.createGain();
  applyCurve(resolveGain.gain, origin, from, RESOLVE);
  resolve.connect(resolveGain);
  resolveGain.connect(bus);
  resolve.start(origin);
  resolve.stop(at(FILM_SECONDS) + 0.05);

  const source = ctx.createBufferSource();
  source.buffer = noiseBuffer(ctx);
  source.loop = true;
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.Q.value = 0.7;
  const freqAt = (film: number) => {
    if (film <= 11) return lerp(420, 720, film / 11);
    if (film <= 27) return lerp(720, 540, (film - 11) / 16);
    return lerp(540, 360, Math.min(1, (film - 27) / (FILM_SECONDS - 27)));
  };
  filter.frequency.setValueAtTime(freqAt(from), origin);
  [11, 27, FILM_SECONDS].forEach((film) => {
    if (film > from) filter.frequency.linearRampToValueAtTime(freqAt(film), at(film));
  });
  const noiseGain = ctx.createGain();
  applyCurve(noiseGain.gain, origin, from, NOISE);
  source.connect(filter);
  filter.connect(noiseGain);
  noiseGain.connect(bus);
  source.start(origin);
  source.stop(at(FILM_SECONDS) + 0.05);

  BELLS.forEach(([film, frequency, duration, peak]) => {
    if (film < from) return;
    tone(ctx, bus, at(film), frequency, duration, peak, frequency < 80 ? "sine" : "sine");
  });

  for (let film = 18.15; film <= 26.6; film += 0.9) {
    if (film < from) continue;
    tone(ctx, bus, at(film), 118, 0.09, 0.022);
  }
}

export async function renderScore(from = 0) {
  const seconds = Math.max(0.05, FILM_SECONDS - from);
  const context = new OfflineAudioContext(2, Math.ceil(seconds * 48000), 48000);
  const volume = context.createGain();
  volume.gain.value = 0.9;
  const compressor = context.createDynamicsCompressor();
  compressor.threshold.value = -16;
  compressor.knee.value = 16;
  compressor.ratio.value = 3.2;
  compressor.attack.value = 0.008;
  compressor.release.value = 0.28;
  volume.connect(compressor);
  compressor.connect(context.destination);
  scheduleScore(context, volume, 0, from);
  return context.startRendering();
}

export class FilmScore {
  level = 0.85;
  muted = false;
  private token = 0;
  private ctx: AudioContext | null = null;
  private volume: GainNode | null = null;
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
    compressor.threshold.value = -16;
    compressor.knee.value = 16;
    compressor.ratio.value = 3.2;
    compressor.attack.value = 0.008;
    compressor.release.value = 0.28;
    volume.connect(compressor);
    compressor.connect(ctx.destination);
    this.ctx = ctx;
    this.volume = volume;
    this.from = from;
    this.origin = ctx.currentTime;
    scheduleScore(ctx, volume, ctx.currentTime, from);
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
