
import { type CarDetails, type Department } from './types';

export const APP_NAME = "Đặt Xe Nội Bộ - TICO";

export const DEPARTMENTS: Department[] = [
  "Phòng Marketing",
  "Phòng HCNS",
  "Phòng Thi Công",
  "Phòng Kênh Phân Phối",
  "Phòng Kênh Dự Án",
];

export const CAR_TYPES_AVAILABLE: CarDetails[] = [
  {
    name: "VinFast VF7",
    imageUrl: 'https://cdn.project-hosting.now.sh/images/cf4451f8-929f-432f-a402-859f91df840a', // User provided image
    capacity: 5,
    description: 'VinFast VF7 5 chỗ, xe điện hiện đại, lý tưởng cho di chuyển trong thành phố và các tỉnh lân cận.',
    plateNumber: '88A-VF701'
  },
  {
    name: "Ford Ranger",
    imageUrl: 'https://source.unsplash.com/400x250/?Ford,Ranger,pickup', // Updated image URL for Ford Ranger
    capacity: 5,
    description: 'Ford Ranger bán tải 5 chỗ, động cơ mạnh mẽ, phù hợp cho công tác xa và địa hình đa dạng.',
    plateNumber: '29C-RGR02'
  }
];

export const MIN_PASSENGERS = 1;
export const MAX_PASSENGERS = 5; // Updated to reflect new car capacities
