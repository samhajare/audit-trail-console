export function createTokenSession() {
  let provider: (() => Promise<string | undefined>) | undefined;
  let revision = 0;
  const listeners = new Set<() => void>();
  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setProvider(next: (() => Promise<string | undefined>) | undefined) {
      provider = next;
      revision += 1;
      listeners.forEach((listener) => listener());
    },
    suspend() {
      const previous = provider;
      provider = undefined;
      const suspendedRevision = ++revision;
      listeners.forEach((listener) => listener());
      return () => {
        // A failed logout may resume only the session that began it.
        if (revision === suspendedRevision) {
          provider = previous;
          revision += 1;
        }
      };
    },
    async getToken() {
      const currentRevision = revision;
      if (!provider) throw new Error('Sign in before requesting API data.');
      const token = await provider();
      if (currentRevision !== revision || !token) {
        throw new Error(
          'The authentication session changed. Please try again.',
        );
      }
      return token;
    },
  };
}

export type TokenSession = ReturnType<typeof createTokenSession>;
export const tokenSession = createTokenSession();
