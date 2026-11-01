import WebSocket from "ws";

export async function openTestTab(port = 9222) {
  const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`,
    { method: "PUT", signal: AbortSignal.timeout(3000) })).json() as { id: string; webSocketDebuggerUrl: string };
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise<void>((resolve, reject) => { ws.once("open", resolve); ws.once("error", reject); });
  let sequence = 0, loads = 0;
  const exceptions: string[] = [];
  const pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  ws.on("message", data => {
    const message = JSON.parse(data.toString());
    if (message.method === "Page.loadEventFired") loads++;
    if (message.method === "Runtime.exceptionThrown") exceptions.push(message.params.exceptionDetails.text);
    const item = pending.get(message.id);
    if (!item) return;
    pending.delete(message.id); clearTimeout(item.timer);
    if (message.error) item.reject(new Error(JSON.stringify(message.error))); else item.resolve(message.result);
  });
  function call(method: string, params: object = {}): Promise<any> {
    const id = ++sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 15_000);
      pending.set(id, { resolve, reject, timer });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async function evaluate(expression: string) {
    const result = await call("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  }
  async function wait(expression: string) {
    for (let i = 0; i < 180; i++) {
      try { if (await evaluate(`Boolean(${expression})`)) return; } catch { /* document navigation */ }
      await new Promise(resolve => setTimeout(resolve, 80));
    }
    throw new Error(`Browser condition not met: ${expression}`);
  }
  async function navigate(url: string) {
    const previous = loads;
    await call("Page.navigate", { url });
    for (let i = 0; i < 180 && loads <= previous; i++) await new Promise(resolve => setTimeout(resolve, 80));
    if (loads <= previous) throw new Error("Browser navigation did not finish.");
    await wait("document.readyState==='complete'");
  }
  async function close() {
    for (const item of pending.values()) clearTimeout(item.timer);
    ws.close();
    await fetch(`http://127.0.0.1:9222/json/close/${target.id}`, { signal: AbortSignal.timeout(2000) }).catch(() => {});
  }
  await call("Page.enable"); await call("Runtime.enable"); await call("Page.bringToFront");
  return { call, evaluate, wait, navigate, close, exceptions };
}
