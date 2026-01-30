export function isIOSSafari(): boolean {
  if (typeof window === "undefined" || !window.navigator) {
    return false;
  }

  const ua = window.navigator.userAgent;
  const iOS = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
  const webkit = /WebKit/.test(ua);
  const isSafari = /Safari/.test(ua) && !/Chrome/.test(ua) && !/CriOS/.test(ua);

  return iOS && webkit && isSafari;
}
