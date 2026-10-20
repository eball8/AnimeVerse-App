// يحسب العمر بالسنوات من تاريخ بصيغة YYYY-MM-DD
export const calcAge = (birthDate: string): number => {
  const [y, m, d] = birthDate.split('-').map(Number);
  const now = new Date();
  let age = now.getFullYear() - y;
  if (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d)) age--;
  return age;
};
