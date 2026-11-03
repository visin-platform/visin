import { ConfigProvider } from '../config/ConfigProvider';
import { AuthProvider } from '../auth';
import Chat from '../Chat';
export default function RemotePanel() {
  return (
    <ConfigProvider>
      <AuthProvider>
        <Chat panel />
      </AuthProvider>
    </ConfigProvider>
  );
}
