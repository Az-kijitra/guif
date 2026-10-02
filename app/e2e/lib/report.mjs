// Result bookkeeping and output: `PASS|FAIL|SKIP  AC-921  <title>  (<ms>)`, a summary line,
// and the exit code (1 when any test failed or the run was aborted).

export class Skip extends Error {
  constructor(reason, manual = false) {
    super(reason);
    this.manual = manual;
  }
}

/** Collects the checks of one test; a test fails when any check failed. */
export class Checks {
  failures = [];
  count = 0;

  #fmt(value) {
    return typeof value === "string" ? JSON.stringify(value) : JSON.stringify(value) ?? String(value);
  }

  eq(actual, expected, label) {
    this.count++;
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      this.failures.push(`${label}: expected ${this.#fmt(expected)}, got ${this.#fmt(actual)}`);
    }
  }

  /** Numbers within +/- tol (default 0.5 px, SPEC-0300-0017 §16.0). */
  approx(actual, expected, label, tol = 0.5) {
    this.count++;
    if (typeof actual !== "number" || Number.isNaN(actual) || Math.abs(actual - expected) > tol) {
      this.failures.push(`${label}: expected ${expected} (+/-${tol}), got ${this.#fmt(actual)}`);
    }
  }

  ok(condition, label, detail = "") {
    this.count++;
    if (!condition) this.failures.push(`${label}${detail ? ": " + detail : ""}`);
  }

  fail(label) {
    this.count++;
    this.failures.push(label);
  }
}

export class Report {
  #lines = [];
  results = { PASS: 0, FAIL: 0, SKIP: 0 };
  aborted = false;

  record(status, id, title, ms, details = []) {
    this.results[status]++;
    const head = `${status}  ${id}  ${title}  (${ms}ms)`;
    console.log(head);
    for (const detail of details) console.log(`        ${detail}`);
    this.#lines.push({ status, id, title, details });
  }

  summary(extra = []) {
    for (const line of extra) console.log(line);
    const { PASS, FAIL, SKIP } = this.results;
    console.log(`\n${PASS} passed, ${FAIL} failed, ${SKIP} skipped${this.aborted ? "  (RUN ABORTED)" : ""}`);
    const skipped = this.#lines.filter((l) => l.status === "SKIP");
    if (skipped.length > 0) {
      console.log("skipped:");
      for (const s of skipped) console.log(`  ${s.id}  ${s.details.join(" / ")}`);
    }
  }

  get exitCode() {
    return this.results.FAIL > 0 || this.aborted ? 1 : 0;
  }
}
