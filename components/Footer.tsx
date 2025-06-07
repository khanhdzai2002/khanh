
import React from 'react';

export const Footer: React.FC = () => {
  const currentYear = new Date().getFullYear();
  return (
    <footer className="bg-slate-900/50 border-t border-slate-700 text-center py-6 mt-12">
      <p className="text-sm text-gray-400">
        &copy; {currentYear} Công Ty XYZ. Phát triển bởi Bộ Phận IT.
      </p>
      <p className="text-xs text-gray-500 mt-1">
        Ứng dụng Đặt Xe Nội Bộ v1.0.0
      </p>
    </footer>
  );
};
    