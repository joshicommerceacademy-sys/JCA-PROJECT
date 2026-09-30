import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import App from './App.tsx'
import { AdminAuthProvider } from '@/context/AdminAuthContext'
import { StudentAuthProvider } from '@/context/StudentAuthContext'
import { Toaster } from '@/components/ui/sonner'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AdminAuthProvider>
          <StudentAuthProvider>
            <App />
            <Toaster position="top-right" richColors closeButton />
          </StudentAuthProvider>
        </AdminAuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
