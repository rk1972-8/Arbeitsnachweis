export type Customer = {
  id: string;
  number: string;
  company: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  phone: string;
  street: string;
  houseNumber: string;
  zip: string;
  city: string;
  gender?: string;
  formOfAddress?: string;
  title?: string;
  plentyId?: number;
  billingAddressId?: string;
  deliveryAddressId?: string;
};

export type NewCustomerInput = {
  company: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  street: string;
  houseNumber: string;
  zip: string;
  city: string;
};

export type PersonnelRow = {
  id: string;
  name: string;
  role: string;
  hours: number;
};

export type PositionRow = {
  id: string;
  quantity: number;
  unit: string;
  name: string;
  itemId?: string;
  variationId?: string;
  sourceType?: 'route' | 'labor' | 'material';
  sourceKey?: string;
};

export type ArticleMatch = {
  variationId: string;
  itemId: string;
  title: string;
  variationName: string;
  model: string;
  isActive: boolean;
  priceGross?: number;
  currency?: string;
  salesPriceId?: string;
};

export type OrderAddress = {
  company: string;
  firstName: string;
  lastName: string;
  street: string;
  houseNumber: string;
  zip: string;
  city: string;
  countryId: number;
  addressId?: string;
};

export type PlentyOrderPosition = {
  id: string;
  quantity: number;
  unit: string;
  title: string;
  itemId: string;
  variationId: string;
  priceGross: number | null;
  currency: string;
  sourceType?: PositionRow['sourceType'] | 'addition';
};

export type PlentyOrderDraft = {
  reportId: string;
  reportNumber: string;
  status: 'draft' | 'created';
  customerId: string;
  customerLabel: string;
  customerReference: string;
  billingAddress: OrderAddress;
  deliverySameAsBilling: boolean;
  deliveryAddress: OrderAddress;
  positions: PlentyOrderPosition[];
  plentyOrderId?: string;
};

export type WorkReportDraft = {
  id?: string;
  customer: Customer;
  workDate: string;
  workAddress: string;
  workEmail: string;
  dictation: string;
  workMinutes: number;
  driveMinutes: number;
  distanceKm: number;
  personnel: PersonnelRow[];
  positions: PositionRow[];
  workDescription: string;
  findings: string;
  complaints: string;
  recommendations: string;
  internalNotes: string;
  signerName: string;
  signatureDataUrl?: string;
};

export type AnalysisResult = {
  workMinutes: number;
  driveMinutes: number;
  workDescription: string;
  materials: Array<{ quantity: number; unit: string; name: string; searchTerm: string }>;
  findings: string;
  complaints: string;
  recommendations: string;
  internalNotes: string;
  notes: string[];
};
