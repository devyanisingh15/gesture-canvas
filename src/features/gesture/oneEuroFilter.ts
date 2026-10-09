/**
 * One Euro filter (Casiez et al. 2012): smooths jitter when the finger is
 * still while keeping latency low when it moves fast.
 */
class LowPass {
  private value: number | null = null;
  filter(x: number, alpha: number): number {
    this.value = this.value === null ? x : alpha * x + (1 - alpha) * this.value;
    return this.value;
  }
  last(): number | null {
    return this.value;
  }
  reset(): void {
    this.value = null;
  }
}

const alphaFor = (cutoff: number, dt: number) => 1 / (1 + 1 / (2 * Math.PI * cutoff * dt));

export class OneEuroFilter {
  private x = new LowPass();
  private dx = new LowPass();
  private lastTime: number | null = null;

  constructor(
    private readonly minCutoff = 1.2,
    private readonly beta = 0.02,
    private readonly dCutoff = 1,
  ) {}

  /** @param timestamp milliseconds */
  filter(value: number, timestamp: number): number {
    const prev = this.x.last();
    const dt = this.lastTime === null ? 1 / 30 : Math.max(1e-3, (timestamp - this.lastTime) / 1000);
    this.lastTime = timestamp;
    const derivative = prev === null ? 0 : (value - prev) / dt;
    const edx = this.dx.filter(derivative, alphaFor(this.dCutoff, dt));
    const cutoff = this.minCutoff + this.beta * Math.abs(edx);
    return this.x.filter(value, alphaFor(cutoff, dt));
  }

  reset(): void {
    this.x.reset();
    this.dx.reset();
    this.lastTime = null;
  }
}

/** Smooths a 2D point with one filter per axis. */
export class PointFilter {
  private fx: OneEuroFilter;
  private fy: OneEuroFilter;
  constructor(minCutoff?: number, beta?: number) {
    this.fx = new OneEuroFilter(minCutoff, beta);
    this.fy = new OneEuroFilter(minCutoff, beta);
  }
  filter(p: { x: number; y: number }, timestamp: number): { x: number; y: number } {
    return { x: this.fx.filter(p.x, timestamp), y: this.fy.filter(p.y, timestamp) };
  }
  reset(): void {
    this.fx.reset();
    this.fy.reset();
  }
}
