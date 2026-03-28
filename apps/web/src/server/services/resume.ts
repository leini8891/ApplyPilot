import mammoth from 'mammoth';
import pdfParse from 'pdf-parse';

export const extractResumeText = async ({
  fileName,
  contentType,
  bytes,
}: {
  fileName: string;
  contentType: string;
  bytes: Buffer;
}) => {
  const normalizedName = fileName.toLowerCase();

  if (
    contentType ===
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    normalizedName.endsWith('.docx')
  ) {
    const result = await mammoth.extractRawText({ buffer: bytes });
    return result.value.trim();
  }

  if (contentType === 'application/pdf' || normalizedName.endsWith('.pdf')) {
    const result = await pdfParse(bytes);
    return result.text.trim();
  }

  return bytes.toString('utf8').trim();
};

