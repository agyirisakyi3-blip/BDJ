import { StrictMode, Component, lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './index.css'

class Safe extends Component {
  state = { ok: true };
  static getDerivedStateFromError() { return { ok: false }; }
  render() { return this.state.ok ? this.props.children : null; }
}

const SpeedInsights = lazy(() =>
  import('@vercel/speed-insights/react').then(m => ({ default: m.SpeedInsights }))
);

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
    <Safe><Suspense fallback={null}><SpeedInsights /></Suspense></Safe>
  </StrictMode>,
)
