declare module 'qrcode-terminal' {
  interface QRCodeOptions {
    small?: boolean;
  }
  
  function generate(text: string, options?: QRCodeOptions): void;
  
  export default { generate };
}
