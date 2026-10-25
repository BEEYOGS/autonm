import "./globals.css";

export const metadata = {
  title: "Stikerin — Generator Stiker Nama",
  description:
    "Buat stiker nama dan nomor siap cetak dari file Excel. Cepat, praktis, dan gratis.",
  icons: {
    icon: "/icon.svg",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
