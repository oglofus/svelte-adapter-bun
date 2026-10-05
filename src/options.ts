export function parseInteger(
  name: string,
  value: string,
  min: number,
  max: number
) {
  const number = Number(value);
  if (
    !/^\d+$/.test(value) ||
    !Number.isSafeInteger(number) ||
    number < min ||
    number > max
  ) {
    throw new Error(
      `${name} must be an integer between ${min} and ${max}; received '${value}'`
    );
  }
  return number;
}

export function parseBytes(value: string) {
  const match = /^(\d+(?:\.\d+)?)\s*([BKMG]?)$/i.exec(value);
  const multiplier = { B: 1, K: 1024, M: 1024 ** 2, G: 1024 ** 3 }[
    match?.[2]?.toUpperCase() || 'B'
  ];
  const bytes = match && Number(match[1]) * multiplier!;
  if (bytes === null || !Number.isSafeInteger(bytes) || bytes < 0) {
    throw new Error(
      `Invalid BODY_SIZE_LIMIT: '${value}'. Use bytes or a B, K, M, G suffix.`
    );
  }
  return bytes;
}
