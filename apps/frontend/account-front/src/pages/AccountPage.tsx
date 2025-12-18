import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import ProfileTab from '../components/tabs/ProfileTab';
import SecurityTab from '../components/tabs/SecurityTab';
import DataTab from '../components/tabs/DataTab';

const AccountPage: React.FC = () => {
  return (
    <Routes>
      <Route path="" element={<Navigate to="profile" replace />} />
      <Route path="profile" element={<ProfileTab />} />
      <Route path="security" element={<SecurityTab />} />
      <Route path="data" element={<DataTab />} />
    </Routes>
  );
};

export default AccountPage;
