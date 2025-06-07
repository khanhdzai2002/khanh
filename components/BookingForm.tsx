
import React, { useState, useEffect, useCallback } from 'react';
import { type Department, type CarDetails, type Booking, BookingStatus } from '../types';
import { CAR_TYPES_AVAILABLE, MIN_PASSENGERS, MAX_PASSENGERS } from '../constants';
import { CarTypeCard } from './CarTypeCard';

interface BookingFormProps {
  departments: Department[];
  carTypes: CarDetails[]; // Now using the full car details for selection
  onSubmit: (booking: Omit<Booking, 'id' | 'status' | 'bookedAt'>) => void;
  activeBookings: Booking[]; // For displaying availability hints
}

const ErrorMessage: React.FC<{ message: string }> = ({ message }) => (
  <p className="text-red-400 text-sm mt-1">{message}</p>
);

export const BookingForm: React.FC<BookingFormProps> = ({ departments, carTypes, onSubmit, activeBookings }) => {
  const [department, setDepartment] = useState<Department>(departments[0] || '');
  const [selectedCarPlate, setSelectedCarPlate] = useState<string>(carTypes[0]?.plateNumber || '');
  const [startTime, setStartTime] = useState<string>('');
  const [endTime, setEndTime] = useState<string>('');
  const [destination, setDestination] = useState<string>('');
  const [passengers, setPassengers] = useState<number>(MIN_PASSENGERS);
  const [purpose, setPurpose] = useState<string>('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const selectedCarDetails = carTypes.find(car => car.plateNumber === selectedCarPlate);

  const validateForm = useCallback(() => {
    const newErrors: Record<string, string> = {};
    if (!department) newErrors.department = "Vui lòng chọn phòng ban.";
    if (!selectedCarPlate) newErrors.carType = "Vui lòng chọn loại xe.";
    if (!startTime) newErrors.startTime = "Vui lòng chọn thời gian bắt đầu.";
    if (!endTime) newErrors.endTime = "Vui lòng chọn thời gian kết thúc.";
    if (startTime && endTime && new Date(endTime) <= new Date(startTime)) {
      newErrors.endTime = "Thời gian kết thúc phải sau thời gian bắt đầu.";
    }
    if (!destination.trim()) newErrors.destination = "Vui lòng nhập điểm đến.";
    if (passengers < MIN_PASSENGERS) newErrors.passengers = `Số hành khách phải ít nhất là ${MIN_PASSENGERS}.`;
    if (selectedCarDetails && passengers > selectedCarDetails.capacity) {
      newErrors.passengers = `Số hành khách vượt quá sức chứa của xe (${selectedCarDetails.capacity} người).`;
    }
    if (passengers > MAX_PASSENGERS) newErrors.passengers = `Số hành khách tối đa là ${MAX_PASSENGERS}.`;

    // Basic conflict check hint (not a full validation, full check is in App.tsx)
    if (startTime && endTime && selectedCarPlate) {
        const conflict = activeBookings.find(b => 
          b.carPlateNumber === selectedCarPlate &&
          b.status === BookingStatus.CONFIRMED &&
          (
            (new Date(startTime) >= new Date(b.startTime) && new Date(startTime) < new Date(b.endTime)) ||
            (new Date(endTime) > new Date(b.startTime) && new Date(endTime) <= new Date(b.endTime)) ||
            (new Date(startTime) <= new Date(b.startTime) && new Date(endTime) >= new Date(b.endTime))
          )
        );
        if (conflict) {
            newErrors.timeConflict = `Xe này đã được đặt từ ${new Date(conflict.startTime).toLocaleString('vi-VN')} đến ${new Date(conflict.endTime).toLocaleString('vi-VN')}.`;
        }
    }


    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [department, selectedCarPlate, startTime, endTime, destination, passengers, selectedCarDetails, activeBookings]);

  useEffect(() => {
    // Re-validate if relevant fields change
    if (Object.keys(errors).length > 0) {
        validateForm();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [department, selectedCarPlate, startTime, endTime, destination, passengers, selectedCarDetails]);


  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (validateForm() && selectedCarDetails) {
      onSubmit({
        department,
        carName: selectedCarDetails.name,
        carPlateNumber: selectedCarDetails.plateNumber,
        startTime,
        endTime,
        destination,
        passengers,
        purpose,
      });
      // Reset form (optional, depends on desired UX)
      // setDepartment(departments[0] || '');
      // setSelectedCarPlate(carTypes[0]?.plateNumber || '');
      // setStartTime('');
      // setEndTime('');
      // setDestination('');
      // setPassengers(MIN_PASSENGERS);
      // setPurpose('');
      // setErrors({});
    }
  };
  
  const today = new Date();
  today.setHours(0,0,0,0); // Start of today
  const minDateTime = today.toISOString().slice(0, 16);


  return (
    <div className="bg-slate-800 p-6 sm:p-8 rounded-xl shadow-2xl max-w-3xl mx-auto">
      <h2 className="text-3xl font-bold text-sky-400 mb-8 text-center">Tạo Lịch Đặt Xe Mới</h2>
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label htmlFor="department" className="block text-sm font-medium text-gray-300 mb-1">Phòng Ban</label>
          <select
            id="department"
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            className="w-full p-3 bg-slate-700 border border-slate-600 rounded-lg text-gray-200 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition-colors"
          >
            {departments.map((dept) => (
              <option key={dept} value={dept}>{dept}</option>
            ))}
          </select>
          {errors.department && <ErrorMessage message={errors.department} />}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Chọn Xe</label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {carTypes.map((car) => (
              <CarTypeCard
                key={car.plateNumber}
                car={car}
                isSelected={selectedCarPlate === car.plateNumber}
                onSelect={() => setSelectedCarPlate(car.plateNumber)}
              />
            ))}
          </div>
          {errors.carType && <ErrorMessage message={errors.carType} />}
        </div>
        
        {selectedCarDetails && (
             <div className="bg-slate-700 p-4 rounded-lg my-4">
                <h4 className="text-lg font-semibold text-sky-400">Thông tin xe đã chọn:</h4>
                <p className="text-gray-300">Tên xe: {selectedCarDetails.name}</p>
                <p className="text-gray-300">Biển số: {selectedCarDetails.plateNumber}</p>
                <p className="text-gray-300">Sức chứa: {selectedCarDetails.capacity} người</p>
                <p className="text-gray-300 text-sm italic">{selectedCarDetails.description}</p>
            </div>
        )}


        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label htmlFor="startTime" className="block text-sm font-medium text-gray-300 mb-1">Thời Gian Bắt Đầu</label>
            <input
              type="datetime-local"
              id="startTime"
              value={startTime}
              min={minDateTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="w-full p-3 bg-slate-700 border border-slate-600 rounded-lg text-gray-200 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition-colors"
            />
            {errors.startTime && <ErrorMessage message={errors.startTime} />}
          </div>
          <div>
            <label htmlFor="endTime" className="block text-sm font-medium text-gray-300 mb-1">Thời Gian Kết Thúc</label>
            <input
              type="datetime-local"
              id="endTime"
              value={endTime}
              min={startTime || minDateTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="w-full p-3 bg-slate-700 border border-slate-600 rounded-lg text-gray-200 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition-colors"
            />
            {errors.endTime && <ErrorMessage message={errors.endTime} />}
          </div>
        </div>
        {errors.timeConflict && <ErrorMessage message={errors.timeConflict} />}


        <div>
          <label htmlFor="destination" className="block text-sm font-medium text-gray-300 mb-1">Điểm Đến (Tỉnh/Thành phố)</label>
          <input
            type="text"
            id="destination"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            placeholder="Ví dụ: Bắc Ninh, Hải Phòng"
            className="w-full p-3 bg-slate-700 border border-slate-600 rounded-lg text-gray-200 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition-colors"
          />
          {errors.destination && <ErrorMessage message={errors.destination} />}
        </div>

        <div>
          <label htmlFor="passengers" className="block text-sm font-medium text-gray-300 mb-1">Số Hành Khách</label>
          <input
            type="number"
            id="passengers"
            value={passengers}
            onChange={(e) => setPassengers(parseInt(e.target.value, 10) || MIN_PASSENGERS)}
            min={MIN_PASSENGERS}
            max={selectedCarDetails ? selectedCarDetails.capacity : MAX_PASSENGERS}
            className="w-full p-3 bg-slate-700 border border-slate-600 rounded-lg text-gray-200 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition-colors"
          />
          {errors.passengers && <ErrorMessage message={errors.passengers} />}
        </div>

        <div>
          <label htmlFor="purpose" className="block text-sm font-medium text-gray-300 mb-1">Mục Đích Chuyến Đi (Không bắt buộc)</label>
          <textarea
            id="purpose"
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            rows={3}
            placeholder="Ví dụ: Gặp gỡ đối tác A, Khảo sát thị trường B..."
            className="w-full p-3 bg-slate-700 border border-slate-600 rounded-lg text-gray-200 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition-colors"
          />
        </div>

        <div>
          <button
            type="submit"
            className="w-full flex items-center justify-center p-3 bg-sky-600 hover:bg-sky-500 text-white font-semibold rounded-lg shadow-md hover:shadow-lg transition-all duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-opacity-50 disabled:opacity-50"
            disabled={Object.keys(errors).some(key => key === 'timeConflict' && errors[key])} // Disable if there is a time conflict error
          >
             <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 mr-2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 10.5v6m3-3H9m4.06-7.19-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" />
            </svg>
            Đặt Xe
          </button>
        </div>
      </form>
    </div>
  );
};
