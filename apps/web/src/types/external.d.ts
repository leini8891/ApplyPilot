declare module 'mammoth' {
  const mammoth: {
    extractRawText(input: { buffer: Buffer }): Promise<{ value: string }>;
  };

  export default mammoth;
}

declare module 'pdf-parse' {
  export default function pdfParse(buffer: Buffer): Promise<{ text: string }>;
}

