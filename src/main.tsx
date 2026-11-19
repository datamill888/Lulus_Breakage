import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

// `?embedded` previews the section the way it sits inside the close platform.
const embedded = new URLSearchParams(location.search).has('embedded')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App embedded={embedded} />
  </StrictMode>,
)
