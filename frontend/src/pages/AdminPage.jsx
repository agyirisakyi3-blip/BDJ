import { useEffect } from 'react';
import AdminDashboard from '../components/admin/AdminDashboard';

export default function AdminPage() {
  useEffect(() => {
    document.body.classList.add('admin-view');
    return () => document.body.classList.remove('admin-view');
  }, []);

  return <AdminDashboard />;
}
