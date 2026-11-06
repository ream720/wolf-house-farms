export interface CashMailAddress {
  recipient: string;
  poBox: string;
  city: string;
  state: string;
  zip: string;
}

// Public business payment details. Leave unconfirmed destinations empty rather
// than publishing a sample phone number or a fictional mailing address.
export const paymentDestinations = {
  cashAppCashtag: '$Wolfhousegenetics',
  applePayPhone: '',
  cashMailAddress: null as CashMailAddress | null,
};

export function isCashByMailReady(address = paymentDestinations.cashMailAddress) {
  return !!(address && address.recipient.trim() && address.poBox.trim() && address.city.trim()
    && /^[A-Z]{2}$/.test(address.state) && /^\d{5}(-\d{4})?$/.test(address.zip));
}
