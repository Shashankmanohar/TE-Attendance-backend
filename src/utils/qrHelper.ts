import QRCode from 'qrcode';

export const generateQRCode = async (text: string): Promise<string> => {
  try {
    // Generate QR code as a Data URL (Base64 PNG)
    // Using high error correction capability (H) to ensure scanning speed is very high
    const dataUrl = await QRCode.toDataURL(text, {
      errorCorrectionLevel: 'H',
      margin: 2,
      width: 400 // Nice large size for high quality printing/display
    });
    return dataUrl;
  } catch (error: any) {
    console.error('Error generating QR Code:', error.message);
    throw new Error('QR Code generation failed');
  }
};
