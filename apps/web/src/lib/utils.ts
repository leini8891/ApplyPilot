export const cn = (...values: Array<string | false | null | undefined>) =>
  values.filter(Boolean).join(' ');

export const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

export const asArray = (value: string) =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

export const formatDateTime = (value: string | null | undefined) => {
  if (!value) {
    return 'Not set';
  }

  return new Intl.DateTimeFormat('en-SG', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
};

export const shortId = () => Math.random().toString(36).slice(2, 10);

