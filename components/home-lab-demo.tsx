"use client";

import { useEffect, useRef, useState } from "react";
import { LAB_DEMO_CHAPTERS, labDemoChapterAt, labDemoLinesVisible, type LabDemoMedia } from "@/lib/home-lab-demo-chapters";

export function HomeLabDemo({ src, poster }: LabDemoMedia) {
  const frameRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [chapter, setChapter] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [time, setTime] = useState(0);
  const [revealed, setRevealed] = useState(1);
  const active = LAB_DEMO_CHAPTERS[chapter] ?? LAB_DEMO_CHAPTERS[0];
  const visible = src ? labDemoLinesVisible(time, active.lines) : revealed;

  useEffect(() => {
    if (src) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setRevealed(active.lines.length);
      return;
    }
    setRevealed(1);
    let count = 1;
    const timer = window.setInterval(() => {
      count += 1;
      setRevealed(count);
      if (count >= active.lines.length) window.clearInterval(timer);
    }, 2400);
    return () => window.clearInterval(timer);
  }, [src, chapter, active.lines.length]);

  useEffect(() => {
    const frame = frameRef.current;
    const video = videoRef.current;
    if (!frame || !video) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting && !video.paused) video.pause();
      },
      { threshold: 0.35 },
    );
    observer.observe(frame);
    return () => observer.disconnect();
  }, [src]);

  const seek = (index: number) => {
    setChapter(index);
    const video = videoRef.current;
    const start = LAB_DEMO_CHAPTERS[index]?.start ?? 0;
    if (!video || !src || !Number.isFinite(video.duration) || video.duration <= 0) return;
    video.currentTime = start;
    setTime(start);
    setProgress(start / video.duration);
  };

  const toggle = () => {
    const video = videoRef.current;
    if (!video || !src) return;
    if (video.paused) void video.play();
    else video.pause();
  };

  const onTime = () => {
    const video = videoRef.current;
    if (!video || !Number.isFinite(video.duration) || video.duration <= 0) return;
    const ratio = video.currentTime / video.duration;
    setTime(video.currentTime);
    setProgress(Math.min(1, ratio));
    setChapter(labDemoChapterAt(video.currentTime));
  };

  return (
    <div className="home-lab-demo">
      <div className="home-lab-demo-stage">
      <div className={playing ? "home-lab-demo-frame is-playing" : "home-lab-demo-frame"} ref={frameRef}>
        {src ? (
          <video
            ref={videoRef}
            src={src}
            poster={poster ?? undefined}
            playsInline
            preload="metadata"
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onEnded={() => setPlaying(false)}
            onTimeUpdate={onTime}
          />
        ) : poster ? (
          <img src={poster} alt="" />
        ) : null}
        <button
          type="button"
          className="home-lab-demo-play"
          aria-label={playing ? "Pause lab demo" : "Play lab demo"}
          disabled={!src}
          onClick={toggle}
        >
          <span className={playing ? "is-pause" : "is-play"} aria-hidden="true" />
        </button>
        <span className="home-lab-demo-progress" aria-hidden="true" style={{ transform: `scaleX(${progress})` }} />
      </div>
      <div className="home-lab-demo-notes" aria-live="polite">
        {active.lines.map((line, index) => (
          <p key={`${active.id}-${line.text}`} className={index < visible ? "is-in" : undefined}>
            {line.text}
          </p>
        ))}
      </div>
      </div>
      <div className="home-lab-demo-chapters" role="tablist" aria-label="Lab demo chapters">
        {LAB_DEMO_CHAPTERS.map((item, index) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={index === chapter}
            className={index === chapter ? "is-current" : undefined}
            onClick={() => seek(index)}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}
