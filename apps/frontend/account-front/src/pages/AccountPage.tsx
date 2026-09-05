import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import ProfileTab from '../components/tabs/ProfileTab';
import GroupsTab from '../components/tabs/GroupsTab';
import ApiKeysTab from '../components/tabs/ApiKeysTab';
import ConnectionsTab from '../components/tabs/ConnectionsTab';
import ToolUsageTab from '../components/tabs/ToolUsageTab';

const AccountPage: React.FC = () => {
  return (
    <Routes>
      <Route path="" element={<Navigate to="profile" replace />} />
      <Route path="profile" element={<ProfileTab />} />
      <Route path="groups" element={<GroupsTab />} />
      <Route path="api-keys" element={<ApiKeysTab />} />
      <Route path="connections" element={<ConnectionsTab />} />
      <Route path="activity" element={<ToolUsageTab />} />
    </Routes>
  );
};

export default AccountPage;
