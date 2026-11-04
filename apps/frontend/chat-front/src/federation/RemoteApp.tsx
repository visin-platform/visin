import { ConfigProvider } from '../config/ConfigProvider';
import { AuthProvider } from '../contexts/AuthContext';
import Chat from '../pages/ChatPage';
export default function RemoteApp() {
  return (
    <ConfigProvider>
      <AuthProvider>
        <Chat />
      </AuthProvider>
    </ConfigProvider>
  );
}
