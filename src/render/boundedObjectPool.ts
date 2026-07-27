export interface BoundedObjectPoolSnapshot {
  available: number;
  created: number;
  reused: number;
  released: number;
  disposed: number;
  capacity: number;
}

export interface BoundedObjectPoolOptions<T> {
  capacity: number;
  create(): T;
  reset(value: T): void;
  dispose(value: T): void;
}

/** A deterministic, bounded LIFO pool for transient renderer resources. */
export class BoundedObjectPool<T> {
  private readonly available: T[] = [];
  private created = 0;
  private reused = 0;
  private released = 0;
  private disposed = 0;

  constructor(private readonly options: BoundedObjectPoolOptions<T>) {
    if (!Number.isInteger(options.capacity) || options.capacity < 0)
      throw new Error("Object-pool capacity must be a non-negative integer.");
  }

  acquire(): T {
    const reusable = this.available.pop();
    if (reusable !== undefined) {
      this.reused += 1;
      return reusable;
    }
    this.created += 1;
    return this.options.create();
  }

  release(value: T): boolean {
    this.options.reset(value);
    this.released += 1;
    if (this.available.length >= this.options.capacity) {
      this.options.dispose(value);
      this.disposed += 1;
      return false;
    }
    this.available.push(value);
    return true;
  }

  snapshot(): BoundedObjectPoolSnapshot {
    return {
      available: this.available.length,
      created: this.created,
      reused: this.reused,
      released: this.released,
      disposed: this.disposed,
      capacity: this.options.capacity,
    };
  }

  dispose(): void {
    for (const value of this.available) {
      this.options.dispose(value);
      this.disposed += 1;
    }
    this.available.length = 0;
  }
}
