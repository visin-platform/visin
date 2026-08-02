import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import ProfileTab from '../components/tabs/ProfileTab';
import GroupsTab from '../components/tabs/GroupsTab';

const AccountPage: React.FC = () => {
  return (
    <Routes>
      <Route path="" element={<Navigate to="profile" replace />} />
      <Route path="profile" element={<ProfileTab />} />
      <Route path="groups" element={<GroupsTab />} />
    </Routes>
  );
};

export default AccountPage;
