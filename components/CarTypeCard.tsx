
import React from 'react';
import { CarDetails } from '../types';

interface CarTypeCardProps {
  car: CarDetails;
  isSelected: boolean;
  onSelect: (carPlateNumber: string) => void;
}

export const CarTypeCard: React.FC<CarTypeCardProps> = ({ car, isSelected, onSelect }) => {
  return (
    <button
      type="button"
      onClick={() => onSelect(car.plateNumber)}
      className={`
        block w-full p-4 rounded-lg border-2 text-left transition-all duration-200 ease-in-out
        focus:outline-none focus:ring-2 focus:ring-opacity-50
        ${isSelected 
          ? 'bg-sky-600 border-sky-500 shadow-xl transform scale-105' 
          : 'bg-slate-700 border-slate-600 hover:border-sky-500 hover:bg-slate-600'
        }
      `}
    >
      <div className="flex flex-col sm:flex-row items-center sm:items-start">
        <img 
          src={car.imageUrl} 
          alt={car.name} 
          className="w-full sm:w-32 h-24 object-cover rounded-md mb-3 sm:mb-0 sm:mr-4"
        />
        <div className="flex-grow">
          <h3 className={`text-lg font-semibold ${isSelected ? 'text-white' : 'text-sky-400'}`}>{car.name} - {car.plateNumber}</h3>
          <p className={`text-xs ${isSelected ? 'text-sky-100' : 'text-gray-400'}`}>Sức chứa: {car.capacity} người</p>
          <p className={`mt-1 text-sm ${isSelected ? 'text-sky-50' : 'text-gray-300'}`}>{car.description}</p>
        </div>
      </div>
    </button>
  );
};
    