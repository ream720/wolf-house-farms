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
  applePayPhone: '209-404-9891',
  cashMailAddress: {
    recipient: 'Wolf House Farms',
    poBox: '1700 McHenry Ave Ste 65B PMB166',
    city: 'Modesto',
    state: 'CA',
    zip: '95350',
  } as CashMailAddress | null,
};

export function isCashByMailReady(address = paymentDestinations.cashMailAddress) {
  return !!(address && address.recipient.trim() && address.poBox.trim() && address.city.trim()
    && /^[A-Z]{2}$/.test(address.state) && /^\d{5}(-\d{4})?$/.test(address.zip));
}
