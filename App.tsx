import React, { useState, useCallback, useEffect } from 'react';
import { Header } from './components/Header';
import { BookingForm } from './components/BookingForm';
import { BookingList } from './components/BookingList';
import { CalendarView } from './components/CalendarView'; // Import CalendarView
import { type Booking, type ViewType, BookingStatus, type CarDetails } from './types';
import { DEPARTMENTS, CAR_TYPES_AVAILABLE, APP_NAME } from './constants';
import { Footer } from './components/Footer';

const App: React.FC = () => {
  const [bookings, setBookings] = useState<Booking[]>(() => {
    const savedBookings = localStorage.getItem('carBookings');
    return savedBookings ? JSON.parse(savedBookings) : [];
  });
  const [currentView, setCurrentView] = useState<ViewType>('form');
  const [notification, setNotification] = useState<string | null>(null);

  useEffect(() => {
    localStorage.setItem('carBookings', JSON.stringify(bookings));
  }, [bookings]);

  const showNotification = (message: string) => {
    setNotification(message);
    setTimeout(() => {
      setNotification(null);
    }, 3000);
  };

  const addBooking = useCallback((newBookingData: Omit<Booking, 'id' | 'status' | 'bookedAt'>) => {
    const newBooking: Booking = {
      ...newBookingData,
      id: Date.now().toString() + Math.random().toString(36).substring(2,7), // More unique ID
      status: BookingStatus.CONFIRMED,
      bookedAt: new Date().toISOString(),
    };
    
    const conflict = bookings.find(b => 
      b.carPlateNumber === newBooking.carPlateNumber &&
      b.status === BookingStatus.CONFIRMED &&
      (
        (new Date(newBooking.startTime) >= new Date(b.startTime) && new Date(newBooking.startTime) < new Date(b.endTime)) ||
        (new Date(newBooking.endTime) > new Date(b.startTime) && new Date(newBooking.endTime) <= new Date(b.endTime)) ||
        (new Date(newBooking.startTime) <= new Date(b.startTime) && new Date(newBooking.endTime) >= new Date(b.endTime))
      )
    );

    if (conflict) {
      showNotification(`Lỗi: Xe ${newBooking.carName} (${newBooking.carPlateNumber}) đã được đặt trong khoảng thời gian này.`);
      return;
    }

    setBookings(prevBookings => [...prevBookings, newBooking].sort((a,b) => new Date(b.bookedAt).getTime() - new Date(a.bookedAt).getTime()));
    showNotification(`Đặt xe ${newBooking.carName} (${newBooking.carPlateNumber}) thành công!`);
    setCurrentView('list');
  }, [bookings]);

  const cancelBooking = useCallback((bookingId: string) => {
    setBookings(prevBookings => 
      prevBookings.map(b => 
        b.id === bookingId ? { ...b, status: BookingStatus.CANCELLED } : b
      )
    );
    showNotification('Đã hủy lịch đặt xe.');
  }, []);

  const handleNavigate = (view: ViewType) => {
    setCurrentView(view);
  };

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-slate-900 via-slate-800 to-sky-900 text-gray-100">
      <Header appName={APP_NAME} currentView={currentView} onNavigate={handleNavigate} />
      
      {notification && (
        <div className="fixed top-20 left-1/2 transform -translate-x-1/2 bg-green-500 text-white p-3 rounded-lg shadow-lg z-50">
          {notification}
        </div>
      )}

      <main className="flex-grow container mx-auto px-4 py-8">
        {currentView === 'form' && (
          <BookingForm
            departments={DEPARTMENTS}
            carTypes={CAR_TYPES_AVAILABLE}
            onSubmit={addBooking}
            activeBookings={bookings.filter(b => b.status === BookingStatus.CONFIRMED)}
          />
        )}
        {currentView === 'list' && (
          <BookingList bookings={bookings} onCancelBooking={cancelBooking} />
        )}
        {currentView === 'calendar' && ( // Add CalendarView rendering
          <CalendarView bookings={bookings.filter(b => b.status === BookingStatus.CONFIRMED)} carTypes={CAR_TYPES_AVAILABLE as CarDetails[]} />
        )}
      </main>
      <Footer />
    </div>
  );
};

export default App;