"use client";

import { useEffect, useRef, useState } from "react";
import { useFramed } from "@/components/view-mode";

type CaptureOptions = DisplayMediaStreamOptions & {
  preferCurrentTab?: boolean;
  selfBrowserSurface?: "include" | "exclude";
  surfaceSwitching?: "include" | "exclude";
  monitorTypeSurfaces?: "include" | "exclude";
};

function stamp() {
  const now = new Date();
  const part = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${part(now.getMonth() + 1)}-${part(now.getDate())}-${part(now.getHours())}${part(now.getMinutes())}${part(now.getSeconds())}`;
}

function clock(ms: number) {
  const total = Math.floor(ms / 1000);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

async function capturePage() {
  const video = { frameRate: 30 };
  const preferred: CaptureOptions = {
    video,
    audio: true,
    preferCurrentTab: true,
    selfBrowserSurface: "include",
    surfaceSwitching: "exclude",
    monitorTypeSurfaces: "exclude",
  };
  try {
    return await navigator.mediaDevices.getDisplayMedia(preferred);
  } catch (error) {
    if (error instanceof DOMException && (error.name === "NotAllowedError" || error.name === "AbortError")) throw error;
    return navigator.mediaDevices.getDisplayMedia({ video, audio: false });
  }
}

/** Records the browser tab: the website and any lab open in it. Hidden inside a framed lab so the outer page keeps the one control. */
export function ScreenRecord() {
  const framed = useFramed();
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const started = useRef(0);

  useEffect(() => {
    if (!recording) return;
    const id = window.setInterval(() => setElapsed(Date.now() - started.current), 250);
    return () => window.clearInterval(id);
  }, [recording]);

  useEffect(() => () => {
    recorder.current?.stream.getTracks().forEach((track) => track.stop());
    if (recorder.current && recorder.current.state !== "inactive") recorder.current.stop();
  }, []);

  if (framed?.framed) return null;

  const start = async () => {
    setNote(null);
    if (!navigator.mediaDevices?.getDisplayMedia || typeof MediaRecorder === "undefined") {
      setNote("This browser cannot record the page.");
      return;
    }
    let stream: MediaStream;
    try {
      stream = await capturePage();
    } catch (error) {
      if (error instanceof DOMException && (error.name === "NotAllowedError" || error.name === "AbortError")) return;
      setNote("The page could not be recorded.");
      return;
    }
    const mimeType = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"].find((type) => MediaRecorder.isTypeSupported(type));
    const media = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const chunks: Blob[] = [];
    media.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    media.onstop = () => {
      stream.getTracks().forEach((track) => track.stop());
      recorder.current = null;
      setRecording(false);
      if (chunks.length === 0) return;
      const blob = new Blob(chunks, { type: media.mimeType || "video/webm" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `living-morphologies-${stamp()}.webm`;
      link.click();
      URL.revokeObjectURL(url);
    };
    stream.getVideoTracks()[0]?.addEventListener("ended", () => {
      if (media.state !== "inactive") media.stop();
    });
    recorder.current = media;
    started.current = Date.now();
    setElapsed(0);
    setRecording(true);
    media.start();
  };

  const stop = () => {
    if (recorder.current && recorder.current.state !== "inactive") recorder.current.stop();
  };

  return (
    <div className="screen-record">
      <button
        type="button"
        className="site-edit-toggle"
        aria-pressed={recording}
        title={note ?? "Record this tab, including the open lab"}
        aria-label={recording ? "Stop recording and save" : "Record the page"}
        onClick={() => (recording ? stop() : void start())}
      >
        {recording ? `Stop ${clock(elapsed)}` : "Record"}
      </button>
    </div>
  );
}
