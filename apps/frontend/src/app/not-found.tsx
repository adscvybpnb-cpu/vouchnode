import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
      <h1 className="text-6xl font-bold text-primary mb-4">404</h1>
      <h2 className="text-2xl font-semibold mb-4 text-foreground">Page Not Found</h2>
      <p className="text-secondary-foreground mb-8 max-w-md">
        The page you are looking for doesn&apos;t exist or has been moved.
      </p>
      <div className="flex gap-4">
        <Link href="/" className="px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary-hover transition-colors font-medium">
          Go Home
        </Link>
        <Link href="/products" className="px-6 py-3 bg-accent text-accent-foreground rounded-lg hover:bg-secondary transition-colors border border-border font-medium">
          Browse Market
        </Link>
      </div>
    </div>
  );
}
