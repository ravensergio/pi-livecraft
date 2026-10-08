import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { keyboardInset } from './keyboard-inset.ts'

// Mobile keyboard: expose the covered height as --kb on :root so fixed
// overlays (modal backdrops) stop above the on-screen keyboard. The composer
// needs no help — it is in normal flow and the browser scrolls the focused
// textarea into view.
const visualViewport = window.visualViewport
if (visualViewport) {
  const updateKeyboardInset = () => {
    const kb = keyboardInset(
      document.documentElement.clientHeight,
      visualViewport.offsetTop,
      visualViewport.height,
    )
    document.documentElement.style.setProperty('--kb', `${kb}px`)
  }
  visualViewport.addEventListener('resize', updateKeyboardInset)
  visualViewport.addEventListener('scroll', updateKeyboardInset)
  updateKeyboardInset()
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
