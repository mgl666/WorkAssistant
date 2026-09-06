import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import Layout from '@/components/Layout';
import SyncManager from '@/components/SyncManager';
import { ToastProvider } from '@/components/ui';
import Dashboard from '@/pages/Dashboard';
import CalendarPage from '@/pages/CalendarPage';
import Pomodoro from '@/pages/Pomodoro';
import Todos from '@/pages/Todos';
import Notes from '@/pages/Notes';
import Weekly from '@/pages/Weekly';
import Tools from '@/pages/Tools';
import SettingsPage from '@/pages/SettingsPage';
import Daily from '@/pages/Daily';
import LongTermGoals from '@/pages/LongTermGoals';

export default function App() {
  return (
    <HashRouter>
      <ToastProvider>
        <SyncManager />
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/calendar" element={<CalendarPage />} />
            <Route path="/pomodoro" element={<Pomodoro />} />
            <Route path="/todos" element={<Todos />} />
            <Route path="/daily" element={<Daily />} />
            <Route path="/goals" element={<LongTermGoals />} />
            <Route path="/notes" element={<Notes />} />
            <Route path="/weekly" element={<Weekly />} />
            <Route path="/tools" element={<Tools />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </ToastProvider>
    </HashRouter>
  );
}
