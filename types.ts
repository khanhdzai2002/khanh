export enum BookingStatus {
  CONFIRMED = 'Đã Xác Nhận',
  CANCELLED = 'Đã Hủy',
}

export interface CarDetails {
  name: string; // Changed from CarName enum to string
  imageUrl: string;
  capacity: number;
  description: string;
  plateNumber: string; // Biển số xe
}

export interface Booking {
  id: string;
  department: string;
  carName: string; // Changed from CarName enum to string
  carPlateNumber: string;
  startTime: string; // ISO string
  endTime: string; // ISO string
  destination: string;
  passengers: number;
  purpose?: string;
  status: BookingStatus;
  bookedAt: string; // ISO string of booking time
}

export type Department = string;

export type ViewType = 'form' | 'list' | 'calendar'; // Added 'calendar'

// Props for components that need className
export interface TailwindStylable {
  className?: string;
}