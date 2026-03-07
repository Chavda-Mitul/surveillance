import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import "cesium/Build/Cesium/Widgets/widgets.css"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import App from './App';

const queryClient = new QueryClient();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
