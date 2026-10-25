import "./globals.css";

export const metadata = {
  title: "Stikerin Studio — Studio Desain",
  description:
    "Studio desain Windows: generator stiker, pembesar gambar, penghapus latar manual, dan aset SVG berlisensi.",
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
