import './styles/index.css';
import { initializeApiUrl } from './constant/ApiConstant';

// Resolve the BE URL (via /api/discover) BEFORE importing App. Axios is created
// inside App's transitive imports and captures API_URL at that moment, so we
// must finish discovery first or it'll snapshot the fallback.
(async () => {
  await initializeApiUrl();

  const [{ StrictMode }, { createRoot }, { default: App }] = await Promise.all([
    import('react'),
    import('react-dom/client'),
    import('./App.tsx'),
  ]);

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
})();
