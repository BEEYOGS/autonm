import "./globals.css";
import Script from "next/script";

export const metadata = {
  title: "Stikerin Studio — Studio Desain",
  description:
    "Studio desain Windows: generator stiker, pembesar gambar, penghapus latar manual, aset SVG, QR Code, dan pengubah ukuran gambar.",
  icons: {
    icon: "/icon.svg",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="id">
      <body>
        {children}
        <Script src="/assets/qrcode.min.js" strategy="beforeInteractive" />
      </body>
    </html>
  );
}
