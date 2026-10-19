// 중요 쓰기 명령의 멱등 키(UUID v4)
// Idempotency key (UUID v4) for important write commands

const HEX_RADIX = 16;
const UUID_TEMPLATE = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx';

export function newRequestId(): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') {
    return cryptoApi.randomUUID();
  }
  // randomUUID 미지원 런타임 대체 경로 (충돌 확률만 낮으면 충분)
  // Fallback for runtimes without randomUUID (low collision probability is enough)
  return UUID_TEMPLATE.replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * HEX_RADIX);
    const value = char === 'x' ? random : (random % 4) + 8;
    return value.toString(HEX_RADIX);
  });
}
