import assert from "node:assert/strict";
import { batchProcess, batchProcessWithSSE } from "../server/replit_integrations/batch/utils";
import { imageResponseBuffer, requireImageResult } from "../server/replit_integrations/image/result";

async function main() {
  for (const response of [{}, { data: [] }, { data: [{}] }, { data: [{ b64_json: "" }] }]) {
    assert.throws(() => requireImageResult(response), /returned no image/);
    assert.throws(() => imageResponseBuffer(response), /returned no image/);
  }
  const urlOnly = { data: [{ url: "https://example.invalid/image.png" }] };
  assert.equal(requireImageResult(urlOnly).url, urlOnly.data[0].url);
  assert.throws(() => imageResponseBuffer(urlOnly), /returned no base64 image/);
  const bytes = Buffer.from("image response fixture");
  assert.deepEqual(imageResponseBuffer({ data: [{ b64_json: bytes.toString("base64") }] }), bytes);

  const options = { retries: 2, minTimeout: 1, maxTimeout: 1 };
  const fatal = new Error("Invalid request");
  let fatalAttempts = 0;
  await assert.rejects(batchProcess([1], async () => {
    fatalAttempts++;
    throw fatal;
  }, options), error => error === fatal);
  assert.equal(fatalAttempts, 1, "Non-rate-limit failures must abort immediately with their original error.");

  let retryAttempts = 0;
  assert.deepEqual(await batchProcess([2], async item => {
    if (++retryAttempts === 1) throw new Error("429 rate limit");
    return item * 2;
  }, options), [4]);
  assert.equal(retryAttempts, 2);

  let streamAttempts = 0;
  const events: { type: string; [key: string]: unknown }[] = [];
  await batchProcessWithSSE([1], async () => {
    streamAttempts++;
    throw fatal;
  }, event => events.push(event), options);
  assert.equal(streamAttempts, 1);
  assert.ok(events.some(event => event.type === "progress" && event.error === fatal.message));
  assert.ok(events.some(event => event.type === "complete" && event.errors === 1));
  let streamRetries = 0;
  assert.deepEqual(await batchProcessWithSSE([3], async item => {
    if (++streamRetries === 1) throw new Error("429 rate limit");
    return item;
  }, () => {}, options), [3]);
  assert.equal(streamRetries, 2, "The retry hook receives a context; inspect its error, not the context itself.");
  console.log("PASS integration utilities: fatal errors abort without retry, rate limits retry, SSE reports failures, and absent image payloads fail explicitly; no API calls or database access.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
