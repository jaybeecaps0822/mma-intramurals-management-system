import { readFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { fail } from "@/lib/validation";
import type { InferenceSession, Tensor } from "onnxruntime-web";

export const FACE_VERSION = "yunet-sface-int8-v1";
const DETECT_SIZE = 640, CROP_SIZE = 112;
const template = [[38.2946, 51.6963], [73.5318, 51.5014], [56.0252, 71.7366], [41.5493, 92.3655], [70.7299, 92.2041]];
type Face = { x: number; y: number; w: number; h: number; score: number; points: number[][] };
type Runtime = { create: typeof Tensor; detect: InferenceSession; recognize: InferenceSession };
let runtime: Promise<Runtime> | undefined;
let running = 0;

function getModels() {
  if (runtime) return runtime;
  runtime = (async () => {
    const ort = await import("onnxruntime-web");
    ort.env.wasm.numThreads = 1;
    ort.env.logLevel = "error";
    const root = process.env.MMA_FACE_MODEL_DIR || join(process.cwd(), "models");
    const options = { executionProviders: ["wasm"], logSeverityLevel: 3 as const };
    const detector = await readFile(join(root, "face_detection_yunet_2023mar.onnx"));
    const encoder = await readFile(join(root, "face_recognition_sface_2021dec_int8.onnx"));
    const detect = await ort.InferenceSession.create(new Uint8Array(detector), options);
    try {
      const recognize = await ort.InferenceSession.create(new Uint8Array(encoder), options);
      return { create: ort.Tensor, detect, recognize };
    } catch (error) { await detect.release(); throw error; }
  })();
  return runtime;
}

function channels(rgb: Uint8Array, size: number, bgr: boolean) {
  const plane = size * size;
  const result = new Float32Array(plane * 3);
  for (let i = 0; i < plane; i++) {
    result[i] = rgb[3 * i + (bgr ? 2 : 0)];
    result[plane + i] = rgb[3 * i + 1];
    result[2 * plane + i] = rgb[3 * i + (bgr ? 0 : 2)];
  }
  return result;
}

function overlap(a: Face, b: Face) {
  const width = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const height = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const common = width * height;
  return common / (a.w * a.h + b.w * b.h - common);
}
function detectFaces(tensors: Record<string, Tensor>) {
  const faces: Face[] = [];
  for (const stride of [8, 16, 32]) {
    const cls = tensors[`cls_${stride}`].data as Float32Array, obj = tensors[`obj_${stride}`].data as Float32Array;
    const landmarks = tensors[`kps_${stride}`].data as Float32Array, rect = tensors[`bbox_${stride}`].data as Float32Array;
    const cols = DETECT_SIZE / stride;
    for (let i = 0; i < cls.length; i++) {
      const score = Math.sqrt(Math.min(1, Math.max(0, cls[i])) * Math.min(1, Math.max(0, obj[i])));
      if (score < .72 || !Number.isFinite(score)) continue;
      const row = Math.floor(i / cols), col = i % cols;
      const w = Math.exp(rect[i * 4 + 2]) * stride, h = Math.exp(rect[i * 4 + 3]) * stride;
      if (w < 32 || h < 32 || w > 850 || h > 850) continue;
      const x = (col + rect[i * 4]) * stride - w / 2, y = (row + rect[i * 4 + 1]) * stride - h / 2;
      const points = Array.from({ length: 5 }, (_, n) => [(col + landmarks[i * 10 + n * 2]) * stride, (row + landmarks[i * 10 + n * 2 + 1]) * stride]);
      faces.push({ x, y, w, h, score, points });
    }
  }
  const kept: Face[] = [];
  for (const f of faces.sort((x, y) => y.score - x.score).slice(0, 100)) {
    if (!kept.some((k) => overlap(k, f) > .3)) kept.push(f);
    if (kept.length > 1) break;
  }
  return kept;
}

function align(rgb: Uint8Array, p: number[][]) {
  // Least-squares similarity transform from target pixels back to the detected landmarks.
  const mean = (points: number[][], dim: number) => points.reduce((n, x) => n + x[dim], 0) / points.length;
  const xm = mean(template, 0), ym = mean(template, 1), um = mean(p, 0), vm = mean(p, 1);
  let a = 0, b = 0, d = 0;
  template.forEach(([x0, y0], i) => {
    const x = x0 - xm, y = y0 - ym, u = p[i][0] - um, v = p[i][1] - vm;
    a += x * u + y * v; b += x * v - y * u; d += x * x + y * y;
  });
  a /= d; b /= d;
  const crop = new Uint8Array(CROP_SIZE * CROP_SIZE * 3);
  for (let j = 0; j < CROP_SIZE; j++) for (let i = 0; i < CROP_SIZE; i++) {
    const x = um + a * (i - xm) - b * (j - ym), y = vm + b * (i - xm) + a * (j - ym);
    const left = Math.floor(x), top = Math.floor(y);
    if (left < 0 || left + 1 >= DETECT_SIZE || top < 0 || top + 1 >= DETECT_SIZE) continue;
    const p1 = (top * DETECT_SIZE + left) * 3, p2 = p1 + DETECT_SIZE * 3, dx = x - left, dy = y - top;
    for (let c = 0; c < 3; c++) crop[(j * CROP_SIZE + i) * 3 + c] = Math.round((rgb[p1 + c] * (1 - dx) + rgb[p1 + c + 3] * dx) * (1 - dy) + (rgb[p2 + c] * (1 - dx) + rgb[p2 + c + 3] * dx) * dy);
  }
  return crop;
}

export async function makeFaceTemplate(file: File) {
  if (!file.size || file.size > 512 * 1024) return fail("Capture a new camera frame (maximum 512 KB).");
  if (running >= 2) return fail("Face verification is busy. Try again or use QR or RFID.", 503);
  running++;
  try {
    const rgb = await (async () => {
      const pipe = sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 2_500_000, failOn: "warning" });
      const meta = await pipe.metadata();
      if (!meta.format || !["jpeg", "png", "webp"].includes(meta.format) || (meta.pages || 1) !== 1 || (meta.width || 0) < 192 || (meta.height || 0) < 192) throw new Error("Invalid frame");
      return pipe.rotate().resize(DETECT_SIZE, DETECT_SIZE, { fit: "contain", background: "black" }).flatten({ background: "black" }).toColourspace("srgb").removeAlpha().raw().toBuffer();
    })().catch(() => fail("The camera image could not be read. Capture a new frame.", 422));
    const models = await getModels().catch(() => fail("Face verification is unavailable. Please use QR or RFID and notify staff.", 503));
    const { create: OrtTensor, detect, recognize } = models;
    const detectorInput = new OrtTensor("float32", channels(rgb, DETECT_SIZE, true), [1, 3, DETECT_SIZE, DETECT_SIZE]);
    const detections = await detect.run({ [detect.inputNames[0]]: detectorInput });
    let faces: Face[];
    try { faces = detectFaces(detections); }
    finally { for (const tensor of Object.values(detections)) tensor.dispose(); detectorInput.dispose(); }
    if (faces.length !== 1) return fail(faces.length ? "More than one face is visible. Frame only your face." : "No clear face was detected. Face the camera in good lighting.", 422);
    const face = faces[0];
    if (face.w < 94 || face.h < 100 || face.w > 545 || face.h > 555 || face.points.some(([x,y]) => !Number.isFinite(x+y) || x < 4 || y < 4 || x >= DETECT_SIZE - 4 || y >= DETECT_SIZE - 4)) return fail("Center your whole face in the guide and adjust your distance from the camera.", 422);
    const input = new OrtTensor("float32", channels(align(rgb, face.points), CROP_SIZE, false), [1, 3, CROP_SIZE, CROP_SIZE]);
    const recognition = await recognize.run({ [recognize.inputNames[0]]: input });
    try {
      const vector = recognition[recognize.outputNames[0]].data as Float32Array;
      const magnitude = Math.hypot(...vector);
      if (vector.length !== 128 || !Number.isFinite(magnitude) || magnitude <= 0) return fail("The face template could not be calculated. Retake the photo.", 422);
      return Float32Array.from(vector, (value) => value / magnitude);
    } finally { for (const tensor of Object.values(recognition)) tensor.dispose(); input.dispose(); }
  } finally { running--; }
}
