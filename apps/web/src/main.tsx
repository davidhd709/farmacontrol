import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { CssBaseline, ThemeProvider } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './features/auth/context/AuthContext';
import { AlertModalProvider } from './context/AlertModalContext';
import { appTheme } from './theme/app-theme';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});

const rootElement = document.getElementById('root');
if (rootElement) {
  createRoot(rootElement).render(
    <StrictMode>
      <ThemeProvider theme={appTheme}>
        <CssBaseline />
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <AuthProvider>
              <AlertModalProvider>
                <App />
              </AlertModalProvider>
            </AuthProvider>
          </BrowserRouter>
        </QueryClientProvider>
      </ThemeProvider>
    </StrictMode>,
  );
}
