import React from 'react';
import { ViewType } from '../types';

interface HeaderProps {
  appName: string;
  currentView: ViewType;
  onNavigate: (view: ViewType) => void;
}

const NavButton: React.FC<{
  text: string;
  isActive: boolean;
  onClick: () => void;
  icon?: React.ReactNode;
}> = ({ text, isActive, onClick, icon }) => (
  <button
    onClick={onClick}
    className={`flex items-center px-4 py-2 rounded-md text-sm font-medium transition-colors duration-150 ease-in-out
      ${isActive 
        ? 'bg-sky-500 text-white shadow-md' 
        : 'text-gray-300 hover:bg-sky-700 hover:text-white focus:bg-sky-700 focus:text-white'
      }
    `}
  >
    {icon && <span className="mr-2">{icon}</span>}
    {text}
  </button>
);

const CalendarDaysIcon: React.FC<{className?: string}> = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className || "w-5 h-5"}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5m-9-3.75h.008v.008H12v-.008ZM12 15h.008v.008H12v-.008Zm0 2.25h.008v.008H12v-.008ZM9.75 15h.008v.008H9.75v-.008Zm0 2.25h.008v.008H9.75v-.008Zm0-4.5h.008v.008H9.75v-.008Zm2.25-4.5H12v.008H12V9Zm3.75 0h.008v.008H15V9Zm-3.75 2.25H12v.008H12v-.008Zm0 2.25H12v.008H12v-.008Zm3.75-2.25h.008v.008H15v-.008Zm0 2.25h.008v.008H15v-.008Z" />
  </svg>
);

const PencilSquareIcon: React.FC<{className?: string}> = ({ className }) => (
 <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className || "w-5 h-5"}>
  <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
</svg>
);

const ClipboardDocumentListIcon: React.FC<{className?: string}> = ({ className }) => ( // Icon for Calendar View
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className || "w-5 h-5"}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75c0-.231-.035-.454-.1-.664M6.75 7.5H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H10.5m.384-1.116A.996.996 0 0 0 10.5 6h-5.25a.996.996 0 0 0-.884.534M16.5 18.75h-5.25a.75.75 0 0 0 0 1.5h5.25a.75.75 0 0 0 0-1.5Z" />
  </svg>
);


export const Header: React.FC<HeaderProps> = ({ appName, currentView, onNavigate }) => {
  return (
    <header className="bg-slate-900/80 backdrop-blur-md shadow-lg sticky top-0 z-40">
      <div className="container mx-auto px-4 py-4 flex flex-col sm:flex-row justify-between items-center">
        <div className="flex items-center space-x-2 mb-4 sm:mb-0">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-10 h-10 text-sky-400">
            <path d="M1.5 8.67v8.58a3 3 0 0 0 3 3h15a3 3 0 0 0 3-3V8.67l-8.928 5.493a3 3 0 0 1-3.144 0L1.5 8.67Z" />
            <path d="M22.5 6.908V6.75a3 3 0 0 0-3-3h-15a3 3 0 0 0-3 3v.158l9.714 5.978a1.5 1.5 0 0 0 1.572 0L22.5 6.908Z" />
          </svg>
          <h1 className="text-2xl font-bold text-sky-400 tracking-tight">{appName}</h1>
        </div>
        <nav className="flex space-x-2">
          <NavButton 
            text="Đặt Xe Mới" 
            isActive={currentView === 'form'} 
            onClick={() => onNavigate('form')}
            icon={<PencilSquareIcon />}
          />
          <NavButton 
            text="Lịch Sử Đặt Xe" 
            isActive={currentView === 'list'} 
            onClick={() => onNavigate('list')}
            icon={<CalendarDaysIcon />}
          />
          <NavButton 
            text="Lịch Xe"
            isActive={currentView === 'calendar'}
            onClick={() => onNavigate('calendar')}
            icon={<ClipboardDocumentListIcon />}
          />
        </nav>
      </div>
    </header>
  );
};