// Minimal Chrome DevTools Protocol client on Node's built-in WebSocket / fetch
// (SPEC-0300-0017 R-995, SPEC-0200-0001 §3.8.14). No dependencies.

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export { sleep };

// Windows virtual-key codes for the keys the tests press.
const VK = {
  Tab: 9, Enter: 13, Escape: 27, Backspace: 8, Delete: 46, Space: 32,
  F5: 116, PageUp: 33, PageDown: 34, End: 35, Home: 36,
  ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40,
};
// Modifier bits of Input.dispatchKeyEvent.
export const MOD = { Alt: 1, Ctrl: 2, Meta: 4, Shift: 8 };

export async function listTargets(port) {
  const response = await fetch(`http://127.0.0.1:${port}/json`);
  return await response.json();
}

export class Cdp {
  #ws;
  #nextId = 0;
  #pending = new Map();
  /** Runtime exceptions and console errors seen since the last takeErrors(). */
  #errors = [];

  static async connect(webSocketDebuggerUrl) {
    const cdp = new Cdp();
    cdp.#ws = new WebSocket(webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      cdp.#ws.onopen = resolve;
      cdp.#ws.onerror = () => reject(new Error("CDP WebSocket error"));
    });
    cdp.#ws.onmessage = (event) => cdp.#onMessage(JSON.parse(event.data));
    await cdp.send("Runtime.enable");
    await cdp.send("Page.enable");
    return cdp;
  }

  #onMessage(message) {
    if (message.id !== undefined && this.#pending.has(message.id)) {
      const { resolve, reject } = this.#pending.get(message.id);
      this.#pending.delete(message.id);
      if (message.error) reject(new Error(`${message.error.message} (${JSON.stringify(message.error).slice(0, 200)})`));
      else resolve(message.result);
      return;
    }
    if (message.method === "Runtime.exceptionThrown") {
      const details = message.params.exceptionDetails;
      this.#errors.push("EXC " + (details.exception?.description || details.text || "").slice(0, 400));
    } else if (message.method === "Runtime.consoleAPICalled" && message.params.type === "error") {
      this.#errors.push("console.error " + JSON.stringify(message.params.args.map((a) => a.value ?? a.description)).slice(0, 300));
    }
  }

  takeErrors() {
    const errors = this.#errors;
    this.#errors = [];
    return errors;
  }

  send(method, params = {}) {
    const id = ++this.#nextId;
    return new Promise((resolve, reject) => {
      this.#pending.set(id, { resolve, reject });
      this.#ws.send(JSON.stringify({ id, method, params }));
    });
  }

  /** Evaluates an expression in the page and returns its JSON value (promises are awaited). */
  async ev(expression) {
    const result = await this.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) {
      throw new Error("evaluate failed: " + (result.exceptionDetails.exception?.description || result.exceptionDetails.text).slice(0, 400));
    }
    return result.result.value;
  }

  /** R-995: CSS px at 100% scale, whatever the OS display scale is. */
  setViewport(width, height) {
    return this.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
  }

  async key(key, modifiers = 0, code) {
    const down = {
      type: "keyDown",
      key,
      code: code ?? key,
      windowsVirtualKeyCode: VK[key] ?? (key.length === 1 ? key.toUpperCase().charCodeAt(0) : undefined),
      modifiers,
    };
    if (key === "Enter") down.text = "\r";
    else if (key.length === 1 && !(modifiers & (MOD.Ctrl | MOD.Alt | MOD.Meta))) down.text = key;
    await this.send("Input.dispatchKeyEvent", down);
    await this.send("Input.dispatchKeyEvent", { ...down, type: "keyUp", text: undefined });
  }

  type(text) {
    return this.send("Input.insertText", { text });
  }

  async click(x, y, { button = "left" } = {}) {
    await this.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
    await this.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button, buttons: 1, clickCount: 1 });
    await this.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button, buttons: 0, clickCount: 1 });
  }

  hover(x, y) {
    return this.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
  }

  wheel(x, y, deltaX, deltaY, modifiers = 0) {
    return this.send("Input.dispatchMouseEvent", { type: "mouseWheel", x, y, deltaX, deltaY, modifiers });
  }

  async screenshot() {
    const result = await this.send("Page.captureScreenshot", { format: "png" });
    return Buffer.from(result.data, "base64");
  }

  close() {
    try {
      this.#ws.close();
    } catch {
      /* already closed */
    }
  }
}
