import './App.css';
import Provider from './provider';
import { AppRoutes } from './routes/AppRoutes';

function App() {
  return (
    <Provider>
      <AppRoutes />
    </Provider>
  );
}

export default App;
