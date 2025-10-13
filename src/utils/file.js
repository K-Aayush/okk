export const getContentTypeFromBase64 = (base64String) => {
  // Example: data:image/png;base64,....
  const match = /^data:(.+);base64,/.exec(base64String);
  return match ? match[1] : null;
};

export const base64ToBuffer = (base64String) => {
  // Remove data URL prefix if present
  const matches = base64String.match(/^data:([A-Za-z-+/]+);base64,(.+)$/);
  const base64 = matches ? matches[2] : base64String;
  return Buffer.from(base64, 'base64');
};
