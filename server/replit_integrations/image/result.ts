import { Buffer } from "node:buffer";

interface ImageResult {
  b64_json?: string;
  url?: string;
}

export function requireImageResult(response: { data?: ImageResult[] }): ImageResult {
  const image = response.data?.[0];
  if (!image || (!image.b64_json && !image.url)) {
    throw new Error("Image service returned no image.");
  }
  return image;
}

export function imageResponseBuffer(response: { data?: ImageResult[] }): Buffer {
  const image = requireImageResult(response);
  if (!image.b64_json) {
    throw new Error("Image service returned no base64 image.");
  }
  return Buffer.from(image.b64_json, "base64");
}
