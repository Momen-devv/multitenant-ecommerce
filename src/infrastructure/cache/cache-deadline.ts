export class CacheDeadlineExceeded extends Error {
  constructor() {
    super('Endpoint cache deadline exceeded');
  }
}

export async function beforeDeadline<T>(
  deadline: number,
  work: () => Promise<T>,
): Promise<T> {
  const remaining = deadline - performance.now();
  if (remaining <= 0) throw new CacheDeadlineExceeded();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(work),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new CacheDeadlineExceeded()),
          remaining,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
