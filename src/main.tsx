import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { rememberReferral } from './lib/api'
import './index.css'

rememberReferral()
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
