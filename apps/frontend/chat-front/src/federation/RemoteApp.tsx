import { ConfigProvider } from '../config/ConfigProvider';
import { AuthProvider } from '../auth';
import Chat from '../Chat';
export default function RemoteApp() {
  return (
    <ConfigProvider>
      <AuthProvider>
        <Chat />
      </AuthProvider>
    </ConfigProvider>
  );
}
