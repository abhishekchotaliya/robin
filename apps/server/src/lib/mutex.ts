// Per-key async mutex. Without this, two overlapping PATCH requests for the
// same project (autosave firing while a user is still typing, Phase 2) do a
// read-modify-write race and the loser's edit is silently dropped.
export class KeyedMutex {
  private tails = new Map<string, Promise<unknown>>();

  async run<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const tail = this.tails.get(key) ?? Promise.resolve();
    const result = tail.then(fn, fn);
    // Swallow errors in the stored tail only, so one failed write doesn't
    // permanently jam the queue for this key — the real error/value still
    // propagates to the caller via the returned `result`.
    this.tails.set(
      key,
      result.catch(() => undefined),
    );
    return result;
  }
}

export const projectMutex = new KeyedMutex();

// Deliberately a SEPARATE instance from projectMutex, not the same one keyed
// differently: deleting an asset has to update project.json to clear scene
// references, and a nested run() on the same instance and key would wait on
// its own tail forever.
export const assetMutex = new KeyedMutex();
