import App, { type AppProps } from './App'
import './index.css'

/**
 * Drop-in for the close platform:
 *   <BreakageSection period="2026-05" user={session.user.name} />
 * Hides the standalone Lulus header, strip and footer; the platform supplies month and user.
 */
export function BreakageSection(props: Omit<AppProps, 'embedded'>) {
  return <App embedded {...props} />
}
