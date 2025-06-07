
import React from 'react';
import { type Booking, BookingStatus } from '../types';

interface BookingListProps {
  bookings: Booking[];
  onCancelBooking: (bookingId: string) => void;
}

const BookingCard: React.FC<{ booking: Booking; onCancel: () => void }> = ({ booking, onCancel }) => {
  const formatDateTime = (isoString: string) => {
    if (!isoString) return 'N/A';
    const date = new Date(isoString);
    return `${date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} ${date.toLocaleDateString('vi-VN')}`;
  };

  const isPastBooking = new Date(booking.endTime) < new Date();
  const cardBgColor = booking.status === BookingStatus.CANCELLED 
    ? 'bg-slate-700 opacity-60' 
    : isPastBooking ? 'bg-slate-600' : 'bg-slate-700';
  
  const statusColor = booking.status === BookingStatus.CONFIRMED ? 'text-green-400' : 'text-red-400';

  return (
    <div className={`p-5 rounded-lg shadow-lg ${cardBgColor} border border-slate-600 transition-all hover:shadow-sky-500/30`}>
      <div className="flex justify-between items-start mb-3">
        <h3 className="text-xl font-semibold text-sky-400">{booking.carName} - {booking.carPlateNumber}</h3>
        <span className={`px-3 py-1 text-xs font-semibold rounded-full ${statusColor} bg-opacity-20 ${booking.status === BookingStatus.CONFIRMED ? 'bg-green-500/30' : 'bg-red-500/30'}`}>
          {booking.status}
        </span>
      </div>
      <p className="text-sm text-gray-300"><span className="font-medium">Phòng Ban:</span> {booking.department}</p>
      <p className="text-sm text-gray-300"><span className="font-medium">Điểm Đến:</span> {booking.destination}</p>
      <p className="text-sm text-gray-300"><span className="font-medium">Số Khách:</span> {booking.passengers}</p>
      {booking.purpose && <p className="text-sm text-gray-300"><span className="font-medium">Mục Đích:</span> {booking.purpose}</p>}
      <div className="mt-2 pt-2 border-t border-slate-600">
        <p className="text-xs text-gray-400">Từ: {formatDateTime(booking.startTime)}</p>
        <p className="text-xs text-gray-400">Đến: {formatDateTime(booking.endTime)}</p>
        <p className="text-xs text-gray-400 mt-1">Đặt lúc: {formatDateTime(booking.bookedAt)}</p>
      </div>
      {booking.status === BookingStatus.CONFIRMED && !isPastBooking && (
         <button 
          onClick={onCancel}
          className="mt-4 w-full px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-sm font-medium rounded-md transition-colors duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-opacity-50"
        >
          Hủy Đặt Xe
        </button>
      )}
    </div>
  );
};


export const BookingList: React.FC<BookingListProps> = ({ bookings, onCancelBooking }) => {
  if (bookings.length === 0) {
    return <div className="text-center py-10">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-16 h-16 mx-auto text-slate-500 mb-4">
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 7.5V6.108c0-1.135.845-2.098 1.976-2.192.373-.03.748-.03 1.123 0 1.131.094 1.976 1.057 1.976 2.192V7.5M12 18.75v-5.25A2.25 2.25 0 0 0 9.75 11.25H7.5A2.25 2.25 0 0 0 5.25 13.5v5.25a2.25 2.25 0 0 0 2.25 2.25h9A2.25 2.25 0 0 0 18.75 18.75v-5.25a2.25 2.25 0 0 0-2.25-2.25H14.25M9 18.75h6" />
      </svg>
      <p className="text-xl text-gray-400">Chưa có lịch đặt xe nào.</p>
      <p className="text-gray-500">Hãy tạo một lịch đặt xe mới!</p>
    </div>;
  }

  const upcomingBookings = bookings.filter(b => new Date(b.endTime) >= new Date() && b.status === BookingStatus.CONFIRMED);
  const pastOrCancelledBookings = bookings.filter(b => new Date(b.endTime) < new Date() || b.status === BookingStatus.CANCELLED);


  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-bold text-sky-400 mb-6 pb-2 border-b-2 border-sky-600">Lịch Đặt Xe Sắp Tới</h2>
        {upcomingBookings.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {upcomingBookings.map((booking) => (
              <BookingCard key={booking.id} booking={booking} onCancel={() => onCancelBooking(booking.id)} />
            ))}
          </div>
        ) : (
          <p className="text-gray-400">Không có lịch đặt xe nào sắp tới.</p>
        )}
      </div>
      
      {pastOrCancelledBookings.length > 0 && (
        <div>
          <h2 className="text-2xl font-semibold text-sky-500 mb-6 mt-10 pb-2 border-b border-sky-700">Lịch Sử Đặt Xe (Đã Qua & Đã Hủy)</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {pastOrCancelledBookings.map((booking) => (
              <BookingCard key={booking.id} booking={booking} onCancel={() => onCancelBooking(booking.id)} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
    