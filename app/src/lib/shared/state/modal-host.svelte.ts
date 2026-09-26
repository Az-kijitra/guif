// Sole owner of the modal dialog state (SPEC-0200-0001 §3.3.3, §3.3.13-4/5,
// §3.3.14-1: approved shared state). Single slot: opening a modal while one
// is shown throws. DOM-free; features call confirm/form/showProgress with
// generic descriptors, routes read `top`/`topId` and forward user intents
// through `dispatch`.

export interface ConfirmSpec {
  title: string;
  lines: string[];
  note?: string;
  tone?: "normal" | "danger";
  buttons: { id: string; label: string }[];
  defaultButtonId: string;
  cancelButtonId: string;
  checkbox?: { label: string; checked: boolean };
}

export type FormField = { id: string; label: string } & (
  | { type: "text"; value: string; selection?: [number, number] }
  | { type: "select"; value: string; options: { value: string; label: string }[] }
);

export interface FormSpec {
  title: string;
  fields: FormField[];
  submitLabel: string;
  cancelLabel: string;
  // null = success (dialog closes); a string is shown inline and the dialog stays open.
  onSubmit: (values: Record<string, string>) => Promise<string | null>;
}

export interface ProgressSpec {
  title: string;
  cancelLabel: string;
  onCancel: () => void;
}

export interface ProgressHandle {
  update(v: { label: string; index: number; total: number }): void;
  close(): void;
}

export type ModalIntent = { type: "cancel" } | { type: "submit" } | { type: "pressButton"; id: string };

export interface ModalTop {
  id: number;
  kind: "confirm" | "form" | "progress";
  spec: ConfirmSpec | FormSpec | ProgressSpec;
  values?: Record<string, string>;
  error?: string | null;
  submitting?: boolean;
  checked?: boolean;
  label?: string;
  index?: number;
  total?: number;
  canCancel?: boolean;
}

function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function createModalHost() {
  let top = $state<ModalTop | null>(null);
  let nextId = 1;
  // Non-reactive: the promise resolver of the currently shown modal.
  let settle: ((value: never) => void) | null = null;

  function assertFree(): void {
    if (top !== null) throw new Error("modal-host: a modal is already open (single slot)");
  }

  function open<T>(entry: Omit<ModalTop, "id">): Promise<T> {
    assertFree();
    return new Promise<T>((resolve) => {
      settle = resolve as (value: never) => void;
      top = { id: nextId++, ...entry };
    });
  }

  function closeWith(value: unknown): void {
    const resolve = settle;
    settle = null;
    top = null;
    resolve?.(value as never);
  }

  function confirm(spec: ConfirmSpec): Promise<{ buttonId: string; checked: boolean }> {
    return open({ kind: "confirm", spec, checked: spec.checkbox?.checked ?? false });
  }

  function form(spec: FormSpec): Promise<"submitted" | "cancelled"> {
    const values: Record<string, string> = {};
    for (const f of spec.fields) values[f.id] = f.value;
    return open({ kind: "form", spec, values, error: null, submitting: false });
  }

  function showProgress(spec: ProgressSpec): ProgressHandle {
    assertFree();
    const id = nextId++;
    top = { id, kind: "progress", spec, label: "", index: 0, total: 0, canCancel: true };
    return {
      update(v) {
        if (top === null || top.id !== id) return;
        top.label = v.label;
        top.index = v.index;
        top.total = v.total;
      },
      close() {
        if (top === null || top.id !== id) return;
        top = null;
      },
    };
  }

  function submitForm(current: ModalTop): void {
    if (current.submitting) return; // double-submit guard
    const spec = current.spec as FormSpec;
    const id = current.id;
    current.submitting = true;
    current.error = null;
    let pending: Promise<string | null>;
    try {
      pending = Promise.resolve(spec.onSubmit({ ...(current.values ?? {}) }));
    } catch (e) {
      pending = Promise.reject(e);
    }
    pending.then(
      (result) => {
        if (top === null || top.id !== id) return;
        if (result === null) {
          closeWith("submitted");
        } else {
          top.error = result;
          top.submitting = false;
        }
      },
      (e) => {
        if (top === null || top.id !== id) return;
        top.error = messageOf(e);
        top.submitting = false;
      },
    );
  }

  function dispatch(intent: ModalIntent): void {
    const current = top;
    if (current === null) return;
    switch (intent.type) {
      case "cancel":
        if (current.kind === "confirm") {
          closeWith({ buttonId: (current.spec as ConfirmSpec).cancelButtonId, checked: current.checked ?? false });
        } else if (current.kind === "form") {
          if (current.submitting) return; // MUST-63
          closeWith("cancelled");
        } else if (current.canCancel) {
          current.canCancel = false; // R-43: onCancel fires only once
          (current.spec as ProgressSpec).onCancel();
        }
        return;
      case "submit":
        if (current.kind === "form") submitForm(current);
        return;
      case "pressButton":
        if (current.kind !== "confirm") return;
        if (!(current.spec as ConfirmSpec).buttons.some((b) => b.id === intent.id)) return;
        closeWith({ buttonId: intent.id, checked: current.checked ?? false });
        return;
    }
  }

  function setFieldValue(fieldId: string, value: string): void {
    if (top === null || top.kind !== "form" || top.values === undefined) return;
    top.values[fieldId] = value;
  }

  function setChecked(checked: boolean): void {
    if (top === null || top.kind !== "confirm") return;
    top.checked = checked;
  }

  return {
    get isOpen() {
      return top !== null;
    },
    get depth(): 0 | 1 {
      return top === null ? 0 : 1;
    },
    get topId(): number | null {
      return top === null ? null : top.id;
    },
    get top(): ModalTop | null {
      return top;
    },
    confirm,
    form,
    showProgress,
    dispatch,
    setFieldValue,
    setChecked,
  };
}

export const modalHost = createModalHost();
