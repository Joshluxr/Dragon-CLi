export default function NoSidebarLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <main className="w-full">{children}</main>;
}
