import { ConfigProvider } from '../config/ConfigProvider';
import { AuthProvider } from '../contexts/AuthContext';
import Chat from '../pages/ChatPage';
export default function RemotePanel() {
  return (
    <ConfigProvider>
      <AuthProvider>
        <Chat panel />
      </AuthProvider>
    </ConfigProvider>
  );
}
