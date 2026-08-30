type CustomerName = {
  first_name: string;
  last_name: string;
};

export function newJobTitleForCustomer(customer: CustomerName): string {
  return `${customer.first_name} ${customer.last_name}`.trim() + ' - ';
}

export function canReplaceNewJobTitle(title: string, previousAutoTitle: string): boolean {
  return title === '' || title === previousAutoTitle;
}
