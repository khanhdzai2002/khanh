import React, { useState, useMemo } from 'react';
import { type Booking, type CarDetails, BookingStatus } from '../types';

interface CalendarViewProps {
  bookings: Booking[];
  carTypes: CarDetails[];
}

const DAYS_OF_WEEK = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']; // Chủ Nhật là ngày đầu tiên (index 0)

const formatTime = (isoString: string): string => {
  const date = new Date(isoString);
  return date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
};

export const CalendarView: React.FC<CalendarViewProps> = ({ bookings, carTypes }) => {
  const [viewDate, setViewDate] = useState(new Date());
  const [selectedCarPlate, setSelectedCarPlate] = useState<string>('all');

  const currentMonth = viewDate.getMonth();
  const currentYear = viewDate.getFullYear();

  const handlePrevMonth = () => {
    setViewDate(new Date(currentYear, currentMonth - 1, 1));
  };

  const handleNextMonth = () => {
    setViewDate(new Date(currentYear, currentMonth + 1, 1));
  };

  const handleCarFilterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedCarPlate(e.target.value);
  };

  const filteredBookings = useMemo(() => {
    return bookings.filter(booking => {
      if (booking.status !== BookingStatus.CONFIRMED) return false;
      if (selectedCarPlate === 'all') return true;
      return booking.carPlateNumber === selectedCarPlate;
    });
  }, [bookings, selectedCarPlate]);

  const getBookingsForDay = (day: Date): Booking[] => {
    const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, 0, 0, 0);
    const dayEnd = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 23, 59, 59, 999);
    
    return filteredBookings.filter(booking => {
      const bookingStart = new Date(booking.startTime);
      const bookingEnd = new Date(booking.endTime);
      return bookingStart < dayEnd && bookingEnd > dayStart;
    }).sort((a,b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  };

  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const firstDayOfMonth = new Date(currentYear, currentMonth, 1).getDay(); // 0 for Sunday, 1 for Monday...

  const calendarGrid: (Date | null)[] = [];
  for (let i = 0; i < firstDayOfMonth; i++) {
    calendarGrid.push(null); // Blank cells for days before the start of the month
  }
  for (let i = 1; i <= daysInMonth; i++) {
    calendarGrid.push(new Date(currentYear, currentMonth, i));
  }
  // Add blank cells for days after the end of the month to fill the grid (optional, for consistent row number)
  // const remainingCells = (7 - (calendarGrid.length % 7)) % 7;
  // for (let i = 0; i < remainingCells; i++) {
  //   calendarGrid.push(null);
  // }


  const today = new Date();
  const isToday = (date: Date | null): boolean => {
    if (!date) return false;
    return date.getDate() === today.getDate() &&
           date.getMonth() === today.getMonth() &&
           date.getFullYear() === today.getFullYear();
  };

  return (
    <div className="bg-slate-800 p-6 sm:p-8 rounded-xl shadow-2xl max-w-full mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-center mb-6">
        <div className="flex items-center space-x-4">
          <button 
            onClick={handlePrevMonth}
            className="p-2 rounded-md bg-slate-700 hover:bg-sky-600 transition-colors"
            aria-label="Tháng trước"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 text-gray-300">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>
          </button>
          <h2 className="text-2xl sm:text-3xl font-bold text-sky-400">
            {viewDate.toLocaleDateString('vi-VN', { month: 'long', year: 'numeric' })}
          </h2>
          <button 
            onClick={handleNextMonth}
            className="p-2 rounded-md bg-slate-700 hover:bg-sky-600 transition-colors"
            aria-label="Tháng sau"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 text-gray-300">
              <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
            </svg>
          </button>
        </div>
        <div className="mt-4 sm:mt-0">
          <label htmlFor="carFilter" className="sr-only">Lọc theo xe</label>
          <select
            id="carFilter"
            value={selectedCarPlate}
            onChange={handleCarFilterChange}
            className="p-3 bg-slate-700 border border-slate-600 rounded-lg text-gray-200 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition-colors"
          >
            <option value="all">Tất cả xe</option>
            {carTypes.map(car => (
              <option key={car.plateNumber} value={car.plateNumber}>
                {car.name} ({car.plateNumber})
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center font-medium text-gray-400 mb-2">
        {DAYS_OF_WEEK.map(day => (
          <div key={day} className="py-2">{day}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {calendarGrid.map((date, index) => {
          if (!date) {
            return <div key={`blank-${index}`} className="border border-slate-700 h-32 sm:h-36"></div>;
          }
          const dailyBookings = getBookingsForDay(date);
          return (
            <div 
              key={date.toISOString()} 
              className={`border border-slate-600 p-2 h-32 sm:h-36 flex flex-col overflow-y-auto scrollbar-thin scrollbar-thumb-slate-500 scrollbar-track-slate-700
                ${isToday(date) ? 'bg-sky-900/50' : 'bg-slate-700/50 hover:bg-slate-600/50'}
                ${dailyBookings.length > 0 && !isToday(date) ? 'bg-sky-800/30' : ''}
              `}
            >
              <span className={`font-semibold ${isToday(date) ? 'text-sky-300' : 'text-gray-200'}`}>
                {date.getDate()}
              </span>
              <div className="mt-1 space-y-1 text-xs">
                {dailyBookings.map(booking => (
                  <div key={booking.id} className="bg-sky-700/70 p-1 rounded text-sky-100">
                    <p className="font-semibold truncate">
                      {selectedCarPlate === 'all' ? `${booking.carName.split(' ')[0]} (${booking.carPlateNumber.slice(-3)}): ` : ''}
                      {formatTime(booking.startTime)} - {formatTime(booking.endTime)}
                    </p>
                    {selectedCarPlate === 'all' && <p className="truncate text-sky-200 text-[0.65rem]">{booking.department}</p>}
                  </div>
                ))}
                {dailyBookings.length === 0 && <div className="text-slate-500 text-xs italic mt-2">Trống</div>}
              </div>
            </div>
          );
        })}
      </div>
       {filteredBookings.length === 0 && selectedCarPlate !== 'all' && (
          <p className="text-center text-gray-400 mt-6">Không có lịch đặt cho xe {carTypes.find(c=>c.plateNumber === selectedCarPlate)?.name} trong tháng này.</p>
        )}
        {bookings.filter(b => b.status === BookingStatus.CONFIRMED).length === 0 && (
           <p className="text-center text-gray-400 mt-6">Hiện chưa có xe nào được đặt trong hệ thống.</p>
        )}
    </div>
  );
};
