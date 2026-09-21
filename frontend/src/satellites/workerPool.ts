/**
 * Worker pool for satellite SGP4 propagation
 * Provides an async API over the Web Worker for position calculations
 */

export interface PositionResult {
  lat: number
  lon: number
  alt: number
}

type ResolveFunction = (value: Record<string, Array<PositionResult | null>>) => void

class PropagationWorkerPool {
  private worker: Worker | null = null
  private initialized = false
  private ready = false
  private pendingRequest: {
    resolve: ResolveFunction
    id: number
  } | null = null
  private requestId = 0
  private initResolve: (() => void) | null = null
  private initPromise: Promise<void> | null = null

  /**
   * Initialize the worker and pre-load satellite records
   */
  async initialize(
    satellites: Array<{ id: string; tle1: string; tle2: string }>
  ): Promise<void> {
    if (this.initialized) return

    this.initPromise = new Promise<void>((resolve) => {
      this.initResolve = resolve
    })

    this.worker = new Worker(
      new URL("./propagation.worker.ts", import.meta.url),
      { type: "module" }
    )

    this.worker.onmessage = (e) => {
      const msg = e.data

      if (msg.type === "ready") {
        // Worker is alive, now send the init data
        this.worker!.postMessage({ type: "init", satellites })
        return
      }

      if (msg.type === "initialized") {
        console.log(
          `[Worker] Loaded ${msg.count}/${msg.total} satellite records`
        )
        this.ready = true
        this.initialized = true
        this.initResolve?.()
        return
      }

      if (msg.type === "result") {
        this.pendingRequest?.resolve(msg.results)
        this.pendingRequest = null
      }
    }

    this.worker.onerror = (err) => {
      console.error("[Worker] Error:", err.message)
    }

    await this.initPromise
  }

  /**
   * Propagate positions for multiple satellites at given timestamps
   * Returns a map of satellite ID → array of positions (matching the timestamps order)
   */
  async propagate(
    jobs: Array<{ id: string; timestamps: number[] }>
  ): Promise<Record<string, Array<PositionResult | null>>> {
    if (!this.worker || !this.ready) {
      throw new Error("Worker not initialized. Call initialize() first.")
    }

    // Use a simple one-at-a-time request pattern (reliable, no race conditions)
    return new Promise((resolve) => {
      this.pendingRequest = { resolve, id: ++this.requestId }
      this.worker!.postMessage({ type: "propagate", jobs })
    })
  }

  /**
   * Check if worker is ready
   */
  isReady(): boolean {
    return this.ready
  }

  /**
   * Terminate the worker and free resources
   */
  dispose(): void {
    this.worker?.terminate()
    this.worker = null
    this.ready = false
    this.initialized = false
    this.pendingRequest = null
    this.initResolve = null
    this.initPromise = null
  }
}

// Singleton instance
export const propagationWorker = new PropagationWorkerPool()