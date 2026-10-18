/** Runs before the Queue mounts, so it opens in the Simple view with the crisis cards showing. */
export function prepareDemo(): void {
  localStorage.setItem('rung.queue.view', 'simple')
  localStorage.removeItem('rung.crisis.open')
}

export const demoRequested = () => new URLSearchParams(window.location.search).get('demo') === '1'
