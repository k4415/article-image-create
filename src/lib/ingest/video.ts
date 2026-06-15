import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type VideoProbe = {
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  aspectRatio: number | null;
};

export function buildLastFrameFfmpegArgs(params: {
  inputPath: string;
  outputPath: string;
  durationSeconds: number | null;
}) {
  const commonArgs = [
    "-y",
    "-i",
    params.inputPath,
    "-vf",
    "scale='min(1280,iw)':-2",
    "-frames:v",
    "1",
    params.outputPath,
  ];

  if (typeof params.durationSeconds === "number" && Number.isFinite(params.durationSeconds)) {
    return [
      "-y",
      "-ss",
      Math.max(params.durationSeconds - 0.2, 0).toFixed(3),
      "-i",
      params.inputPath,
      "-vf",
      "scale='min(1280,iw)':-2",
      "-frames:v",
      "1",
      params.outputPath,
    ];
  }

  return ["-y", "-sseof", "-0.2", ...commonArgs.slice(1)];
}

export async function probeVideo(buffer: Buffer, extension: string): Promise<VideoProbe> {
  const dir = await mkdtemp(path.join(tmpdir(), "lp-asset-video-"));
  const inputPath = path.join(dir, `input.${extension}`);

  try {
    await writeFile(inputPath, buffer);
    const { stdout } = await execFileAsync("ffprobe", [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=width,height:format=duration",
      "-of",
      "json",
      inputPath,
    ]);
    const parsed = JSON.parse(stdout) as {
      streams?: Array<{ width?: number; height?: number }>;
      format?: { duration?: string };
    };
    const stream = parsed.streams?.[0];
    const width = stream?.width ?? null;
    const height = stream?.height ?? null;
    const durationSeconds = parsed.format?.duration ? Number(parsed.format.duration) : null;

    return {
      width,
      height,
      durationSeconds,
      aspectRatio: width && height ? Number((width / height).toFixed(4)) : null,
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function extractRepresentativeFrame(buffer: Buffer, extension: string): Promise<Buffer> {
  const dir = await mkdtemp(path.join(tmpdir(), "lp-asset-frame-"));
  const inputPath = path.join(dir, `input.${extension}`);
  const outputPath = path.join(dir, "frame.jpg");

  try {
    await writeFile(inputPath, buffer);
    await execFileAsync("ffmpeg", [
      "-y",
      "-i",
      inputPath,
      "-vf",
      "thumbnail,scale='min(1280,iw)':-2",
      "-frames:v",
      "1",
      outputPath,
    ]);
    return await readFile(outputPath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function extractLastFrame(buffer: Buffer, extension: string, durationSeconds: number | null): Promise<Buffer> {
  const dir = await mkdtemp(path.join(tmpdir(), "lp-asset-last-frame-"));
  const inputPath = path.join(dir, `input.${extension}`);
  const outputPath = path.join(dir, "frame.jpg");

  try {
    await writeFile(inputPath, buffer);
    await execFileAsync("ffmpeg", buildLastFrameFfmpegArgs({ inputPath, outputPath, durationSeconds }));
    return await readFile(outputPath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
