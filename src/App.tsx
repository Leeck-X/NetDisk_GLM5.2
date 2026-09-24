import { useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AppBackground } from '@/components/AppBackground'
import { ToastContainer } from '@/components/ui/Toast'
import { ConfirmProvider } from '@/components/ui/Confirm'
import { useAuthStore } from '@/store/auth'
import { useSiteStore } from '@/store/site'
import Login from '@/pages/Login'
import ChangePassword from '@/pages/ChangePassword'
import Workbench from '@/pages/Workbench'
import Trash from '@/pages/Trash'
import ShareManage from '@/pages/ShareManage'
import Admin from '@/pages/Admin'
import ShareView from '@/pages/ShareView'
import { LoadingSpinner } from '@/components/ui/Glass'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, initialized } = useAuthStore()
  const location = useLocation()
  useEffect(() => {
    if (!initialized) useAuthStore.getState().initialize()
  }, [initialized])

  if (!initialized) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <LoadingSpinner size={40} />
      </div>
    )
  }
  if (!user) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />
  }
  return <>{children}</>
}

function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { user } = useAuthStore()
  if (user?.role !== 'admin') return <Navigate to="/" replace />
  return <>{children}</>
}

export default function App() {
  // 站点名称/描述来自后台配置，启动时拉取一次并同步浏览器标题
  useEffect(() => {
    useSiteStore.getState().load()
  }, [])

  return (
    <Router>
      <AppBackground />
      <ConfirmProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/s/:token" element={<ShareView />} />
          <Route path="/change-password" element={<RequireAuth><ChangePassword /></RequireAuth>} />
          <Route path="/" element={<RequireAuth><Workbench /></RequireAuth>} />
          <Route path="/recent" element={<RequireAuth><Workbench view="recent" /></RequireAuth>} />
          <Route path="/category/:type" element={<RequireAuth><Workbench view="category" /></RequireAuth>} />
          <Route path="/share" element={<RequireAuth><ShareManage /></RequireAuth>} />
          <Route path="/trash" element={<RequireAuth><Trash /></RequireAuth>} />
          <Route path="/admin/*" element={<RequireAuth><RequireAdmin><Admin /></RequireAdmin></RequireAuth>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ConfirmProvider>
      <ToastContainer />
    </Router>
  )
}
