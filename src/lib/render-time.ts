/**
 * The moment a server page is drawn, in ms, for the client clocks that count from it.
 *
 * A component that prints "waiting 35m" or "held since 10:42 AM" is drawn twice: on the server and again in the
 * browser as it hydrates, and if each reads its own clock a minute can turn between the two and the texts disagree
 * (React's hydration error). So the page reads the time once, here, and hands it down as the first value of the
 * client's clock (the console's handling chips and their countdowns); the browser takes over after that.
 */
export function renderTime(): number {
  return Date.now();
}
