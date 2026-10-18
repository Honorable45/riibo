/** Formes des réponses du backend (relevées sur l'API réelle). */

export interface Me {
  id: string;
  firstName: string;
  lastName: string;
  role: string;
  phone: string | null;
  email: string | null;
}

export interface Person {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
}

export interface OrderRow {
  id: string;
  orderNumber: number;
  status: string;
  deliveryType: string;
  subtotal: number;
  deliveryFee: number;
  discountAmount: number;
  total: number;
  paymentMethod: string;
  paymentStatus: string;
  createdAt: string;
  itemCount: number;
  client: Person;
  restaurant: { id: string; name: string };
  delivery: { status: string; driver: { id: string; userId: string; name: string; phone: string | null } | null } | null;
}

export interface OrderDetail extends Omit<OrderRow, 'itemCount' | 'delivery' | 'client'> {
  client: Person & { email: string | null; isActive: boolean };
  restaurant: { id: string; name: string; slug: string; phone: string | null; address: string };
  deliveryAddress: string | null;
  deliveryLandmark: string | null;
  latitude: number | null;
  longitude: number | null;
  contactPhone: string | null;
  notes: string | null;
  rejectionReason: string | null;
  cancelReason: string | null;
  promoCode: { id: string; code: string } | null;
  review: { rating: number; comment: string | null; isHidden: boolean } | null;
  items: Array<{
    id: string;
    name: string;
    unitPrice: number;
    quantity: number;
    lineTotal: number;
    note: string | null;
    options: Array<{ name: string; priceDelta?: number }>;
  }>;
  payments: Array<{
    id: string;
    provider: string;
    method: string;
    amount: number;
    currency: string;
    status: string;
    providerRef: string | null;
    paidAt: string | null;
    failedAt: string | null;
    createdAt: string;
  }>;
  delivery: {
    id: string;
    status: string;
    deliveryFee: number;
    distanceKm: number | null;
    searchAttempts: number;
    assignedAt: string | null;
    pickedUpAt: string | null;
    deliveredAt: string | null;
    driver: { id: string; userId: string; name: string; phone: string | null; vehicleType: string; plateNumber: string | null } | null;
  } | null;
  timeline: Array<{ at: string; label: string; actor?: string | null; detail?: string | null }>;
}

export interface Overview {
  date: string;
  orders: { today: number; delivered: number; inProgress: number; cancelled: number; total: number };
  revenueToday: number;
  restaurants: Record<string, number>;
  drivers: Record<string, number> & { online: number };
  clients: number;
}

export interface Finance {
  period: { from: string; to: string };
  orders: {
    total: number;
    byStatus: Record<string, number>;
    inProgress: number;
    delivered: number;
    cancelled: number;
    rejected: number;
  };
  delivered: {
    count: number;
    orderValue: number;
    meals: number;
    discounts: number;
    mealsAfterDiscount: number;
    deliveryFees: number;
    averageOrder: number;
  };
  payments: {
    paid: number;
    pending: number;
    pendingOnCancelled: { count: number; amount: number };
    failed: number;
    refunded: number;
    cancelled: number;
    breakdown: Array<{ status: string; method: string; provider: string; count: number; amount: number }>;
  };
  promoRedemptions: number;
  commission: { configured: boolean };
  series: Array<{ date: string; orders: number; delivered: number; value: number }>;
  topRestaurants: Array<{ id: string; name: string; orders: number; meals: number }>;
}

export interface PaymentRow {
  id: string;
  provider: string;
  method: string;
  amount: number;
  status: string;
  providerRef: string | null;
  paidAt: string | null;
  createdAt: string;
  order: {
    id: string;
    orderNumber: number;
    status: string;
    restaurant: { id: string; name: string };
    client: { id: string; firstName: string; lastName: string };
  };
}

export interface RestaurantRow {
  id: string;
  slug: string;
  name: string;
  city: string;
  quarter: string | null;
  status: string;
  statusReason: string | null;
  createdAt: string;
  approvedAt: string | null;
  owner: Person | null;
}

export interface RestaurantDetail {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  phone: string | null;
  address: string;
  city: string;
  quarter: string | null;
  latitude: number | null;
  longitude: number | null;
  logoUrl: string | null;
  coverUrl: string | null;
  status: string;
  statusReason: string | null;
  approvedAt: string | null;
  deliveryFee: number;
  minOrderAmount: number;
  prepTimeMin: number;
  prepTimeMax: number;
  isPaused: boolean;
  rating: number;
  reviewCount: number;
  createdAt: string;
  paymentAccountNumber: string | null;
  categories: Array<{ slug: string; name: string }>;
  hours: Array<{ dayOfWeek: number; opensAt: string; closesAt: string }>;
  members: Array<{ role: string; user: Person & { email: string | null; isActive: boolean } }>;
  documents: Record<string, boolean>;
}

export interface RestaurantInsights {
  orders: { total: number; byStatus: Record<string, number> };
  rejectionRate: number | null;
  last30Days: { delivered: number; meals: number };
  menu: { available: number; unavailable: number };
  recentOrders: Array<{ id: string; orderNumber: number; status: string; total: number; createdAt: string; deliveryType: string }>;
}

export interface MenuItemRow {
  id: string;
  name: string;
  description: string | null;
  price: number;
  imageUrl: string | null;
  isAvailable: boolean;
  stock: number | null;
  maxQuantity: number | null;
  rating: number;
  reviewCount: number;
  createdAt: string;
  updatedAt: string;
  restaurant: { id: string; name: string; status: string };
  category: { id: string; name: string } | null;
  optionGroupCount: number;
  issues: string[];
}

export interface MenuItemDetail extends MenuItemRow {
  optionGroups: Array<{
    id: string;
    name: string;
    minSelect: number;
    maxSelect: number;
    options: Array<{ id: string; name: string; priceDelta: number; isAvailable: boolean }>;
  }>;
}

export interface MenuSummary {
  total: number;
  noImage: number;
  unavailable: number;
  noDescription: number;
  soldOut: number;
}

export interface RestaurantMenu {
  categories: Array<{ id: string; name: string; items: MenuItemRow[] }>;
  uncategorized: MenuItemRow[];
}

export interface DriverRow {
  id: string;
  status: string;
  statusReason: string | null;
  vehicleType: string;
  plateNumber: string | null;
  isOnline: boolean;
  totalDeliveries: number;
  rating: number;
  createdAt: string;
  user: Person;
}

export interface DriverDetail extends DriverRow {
  vehicleBrand: string | null;
  vehicleColor: string | null;
  isAvailable: boolean;
  ratingCount: number;
  totalOffers: number;
  acceptedOffers: number;
  mobileMoneyNumber: string | null;
  user: Person & { email: string | null; isActive: boolean };
  documents: Record<string, boolean>;
}

export interface DriverInsights {
  deliveries: Record<string, number>;
  acceptanceRate: number | null;
  current: {
    id: string;
    status: string;
    assignedAt: string | null;
    order: { id: string; orderNumber: number; restaurant: { name: string } };
  } | null;
  recent: Array<{
    id: string;
    status: string;
    deliveryFee: number;
    deliveredAt: string | null;
    createdAt: string;
    order: { id: string; orderNumber: number; restaurant: { name: string } };
  }>;
  position: { latitude: number; longitude: number; at: string } | null;
  positionTtlSeconds: number;
}

export interface UserRow {
  id: string;
  username: string;
  email: string | null;
  firstName: string;
  lastName: string;
  phone: string | null;
  role: string;
  isActive: boolean;
  createdAt: string;
  lastSeenAt: string | null;
}

export interface UserDetail extends UserRow {
  driverProfile: { id: string; status: string } | null;
  restaurantMemberships: Array<{ role: string; restaurant: { id: string; name: string; status: string } }>;
  addresses: number;
  favorites: number;
  orders: {
    byStatus: Record<string, number>;
    deliveredValue: number;
    recent: Array<{ id: string; orderNumber: number; status: string; total: number; createdAt: string; restaurant: { id: string; name: string } }>;
  };
  reportsAgainst: number;
}

export interface Promo {
  id: string;
  code: string;
  description: string | null;
  discountType: 'PERCENT' | 'FIXED';
  discountValue: number;
  maxDiscount: number | null;
  minOrderAmount: number | null;
  maxUses: number | null;
  maxUsesPerUser: number | null;
  usedCount: number;
  isActive: boolean;
  startsAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  restaurantId: string | null;
  restaurant: { id: string; name: string } | null;
}

export interface Report {
  id: string;
  targetType: string;
  targetId: string;
  reason: string;
  details?: string | null;
  status: string;
  createdAt: string;
  resolvedAt: string | null;
  reporter: { id: string; username: string; firstName: string; lastName: string } | null;
  targetPreview: string | null;
}

export interface AuditRow {
  id: string;
  action: string;
  targetType: string;
  targetId: string;
  metadata: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: string;
  actor: { id: string; firstName: string; lastName: string; role: string } | null;
}

export interface PlatformConfig {
  environment: string;
  payments: { provider: string; methods: Record<string, boolean> };
  sms: { provider: string; configured: boolean };
  registrationOtp: boolean;
  mail: { provider: string };
  media: { cloudinary: boolean; storage: string };
  push: { webPush: boolean; fcm: boolean };
  realtime: { redis: boolean };
  calls: { turn: boolean };
  commission: { configured: boolean };
}
